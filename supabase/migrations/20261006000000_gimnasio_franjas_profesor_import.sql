-- Migration: 20261006000000_gimnasio_franjas_profesor_import
--
-- Dos cambios sobre el turnero del gimnasio (20261005000000, ya aplicada en producción):
--   1. `profesor` por franja: texto libre opcional (hasta 80 caracteres). Si hay dos
--      profesores en el mismo horario se escriben juntos en el mismo texto ('Ana / Luis').
--   2. Importación de un calendario completo: RPC atómica `gimnasio_importar_franjas`
--      con vista previa (p_aplicar = false) y aplicación (p_aplicar = true).
--
-- Esta migración NO edita la anterior: `gimnasio_disponibilidad` devuelve un tipo de tabla,
-- así que para agregarle la columna hay que borrarla y recrearla (y volver a dar los
-- permisos: el DROP los pierde).

-- ─── Profesor ─────────────────────────────────────────────────────────────────

alter table gimnasio_franjas add column profesor text;

-- Sin espacios en los bordes lo garantiza quien escribe (Edge Function / RPC); acá se exige
-- que, si hay valor, no esté vacío ni en blanco y no pase de 80 caracteres.
alter table gimnasio_franjas
  add constraint gimnasio_franjas_profesor_check
  check (profesor is null or (char_length(profesor) <= 80 and length(btrim(profesor)) > 0));

-- ─── Disponibilidad (ahora con profesor) ──────────────────────────────────────
-- Igual que antes: franjas ACTIVAS entre p_desde y p_hasta (acotado a 31 días desde p_desde),
-- capacidad efectiva, ocupados, cerrado y mensaje de cierre; se agrega `profesor` al final.

drop function gimnasio_disponibilidad(date, date);

create function gimnasio_disponibilidad(p_desde date, p_hasta date)
returns table (
  franja_id      uuid,
  fecha          date,
  dia_semana     smallint,
  hora_desde     time,
  hora_hasta     time,
  cupo_base      integer,
  capacidad      integer,
  ocupados       integer,
  ocupados_fijos integer,
  cerrado        boolean,
  motivo_cierre  text,
  profesor       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    d.fecha,
    f.dia_semana,
    f.hora_desde,
    f.hora_hasta,
    f.cupo,
    e.capacidad,
    coalesce(r.ocupados, 0),
    coalesce(r.fijos, 0),
    e.cerrado,
    e.motivo,
    f.profesor
  from (
    select p_desde + i as fecha
    from generate_series(0, least(p_hasta - p_desde, 30)) as i
  ) d
  join gimnasio_franjas f
    on f.activa and f.dia_semana = extract(isodow from d.fecha)::int
  cross join lateral gimnasio_estado_franja(f.id, d.fecha) e
  left join lateral (
    select
      count(*)::int as ocupados,
      (count(*) filter (where rr.origen = 'fijo'))::int as fijos
    from gimnasio_reservas rr
    where rr.franja_id = f.id and rr.fecha = d.fecha and rr.estado <> 'cancelada'
  ) r on true
  order by d.fecha, f.hora_desde
$$;

-- ─── Importación de calendario ────────────────────────────────────────────────
-- p_filas: array de { dia_semana 1..7, hora_desde 'HH:MM', hora_hasta 'HH:MM', cupo 1..500,
--          profesor text|null } (máximo 300).
-- p_modo:  'agregar'    -> las franjas actuales que no están en el archivo siguen como están.
--          'reemplazar' -> las franjas ACTIVAS que no están en el archivo se desactivan
--                          (baja lógica: nunca se borran; sus reservas futuras se cuentan
--                          y se informan, pero no se tocan).
-- p_aplicar: false = vista previa, no escribe nada; true = aplica (todo o nada).
--
-- Coincidencia por (dia_semana, hora_desde, hora_hasta) contra franjas ACTIVAS O INACTIVAS:
--   · coincide  -> se actualizan cupo y profesor y se reactiva; la franja conserva su id, así
--                  que sus reservas y turnos fijos siguen valiendo;
--   · no coincide -> se crea.
--
-- Valida TODO y devuelve todos los errores juntos ([{fila, motivo}], fila = posición 1-based
-- en p_filas): día, horas, cupo, profesor, filas repetidas, filas solapadas entre sí, y filas
-- que se solapan con una franja que sigue activa (en 'agregar': las existentes que el archivo
-- no menciona; en 'reemplazar' ninguna sigue activa fuera del archivo). Con un solo error no
-- se escribe nada, aunque p_aplicar sea true.
--
-- Concurrencia: un advisory lock transaccional serializa dos importaciones, y al aplicar se
-- toman con `for update` todas las franjas (tabla chica) para que no cambie nada a mitad.
--
-- Devuelve {ok:false, codigo, motivo[, errores]} o
--   {ok:true, aplicado, modo, resumen:{...}, detalle:{crear, actualizar, desactivar}}.
create or replace function gimnasio_importar_franjas(p_filas jsonb, p_modo text, p_aplicar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_filas  constant integer := 300;
  c_cupo_max   constant integer := 500;
  c_prof_max   constant integer := 80;
  c_lock_key   constant bigint  := 7261006001;
  c_dias       constant text[]  := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  v_el          jsonb;
  v_fila        integer;
  v_ok          boolean;
  v_num         numeric;
  v_raw         jsonb;
  v_dia         integer;
  v_desde       time;
  v_hasta       time;
  v_cupo        integer;
  v_prof        text;

  v_errores     jsonb := '[]'::jsonb;
  v_nuevos      jsonb;
  v_validas     jsonb := '[]'::jsonb;

  v_crear       jsonb;
  v_actualizar  jsonb;
  v_desactivar  jsonb;
  v_upd         jsonb;
  v_des_ids     uuid[];
  v_total       integer;
  v_n_crear     integer;
  v_n_upd       integer;
  v_n_des       integer;
  v_res_fut     integer;
  v_fijos       integer;
begin
  if p_modo is null or p_modo not in ('agregar', 'reemplazar') then
    return gimnasio_fallo('modo_invalido', 'El modo debe ser "agregar" o "reemplazar".');
  end if;
  if p_aplicar is null then
    return gimnasio_fallo('parametros', 'Indicá si se aplica o es una vista previa.');
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    return gimnasio_fallo('parametros', 'El calendario debe ser una lista de filas.');
  end if;
  if jsonb_array_length(p_filas) = 0 then
    return gimnasio_fallo('sin_filas', 'El calendario no tiene filas.');
  end if;
  if jsonb_array_length(p_filas) > c_max_filas then
    return gimnasio_fallo(
      'demasiadas_filas',
      'El calendario no puede tener más de ' || c_max_filas || ' filas.',
      jsonb_build_object('max_filas', c_max_filas)
    );
  end if;

  if p_aplicar then
    perform pg_advisory_xact_lock(c_lock_key);
    perform 1 from gimnasio_franjas order by id for update;
  end if;

  -- 1) Validación fila por fila: se acumulan todos los errores, no sólo el primero.
  for v_el, v_fila in
    select e.value, e.ordinality::integer from jsonb_array_elements(p_filas) with ordinality as e
  loop
    if jsonb_typeof(v_el) <> 'object' then
      v_errores := v_errores || jsonb_build_object('fila', v_fila, 'motivo', 'La fila no es válida.');
      continue;
    end if;
    v_ok := true;

    v_dia := null;
    if jsonb_typeof(v_el -> 'dia_semana') = 'number' then
      v_num := (v_el ->> 'dia_semana')::numeric;
      if v_num = trunc(v_num) and v_num between 1 and 7 then v_dia := v_num::integer; end if;
    end if;
    if v_dia is null then
      v_ok := false;
      v_errores := v_errores || jsonb_build_object(
        'fila', v_fila, 'motivo', 'El día debe ser de 1 (lunes) a 7 (domingo).');
    end if;

    v_desde := null;
    if jsonb_typeof(v_el -> 'hora_desde') = 'string'
       and (v_el ->> 'hora_desde') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
      v_desde := (v_el ->> 'hora_desde')::time;
    end if;
    if v_desde is null then
      v_ok := false;
      v_errores := v_errores || jsonb_build_object(
        'fila', v_fila, 'motivo', 'La hora de inicio debe tener formato HH:MM.');
    end if;

    v_hasta := null;
    if jsonb_typeof(v_el -> 'hora_hasta') = 'string'
       and (v_el ->> 'hora_hasta') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
      v_hasta := (v_el ->> 'hora_hasta')::time;
    end if;
    if v_hasta is null then
      v_ok := false;
      v_errores := v_errores || jsonb_build_object(
        'fila', v_fila, 'motivo', 'La hora de fin debe tener formato HH:MM.');
    end if;

    if v_desde is not null and v_hasta is not null and v_hasta <= v_desde then
      v_ok := false;
      v_errores := v_errores || jsonb_build_object(
        'fila', v_fila, 'motivo', 'La hora de inicio debe ser anterior a la de fin.');
    end if;

    v_cupo := null;
    if jsonb_typeof(v_el -> 'cupo') = 'number' then
      v_num := (v_el ->> 'cupo')::numeric;
      if v_num = trunc(v_num) and v_num between 1 and c_cupo_max then v_cupo := v_num::integer; end if;
    end if;
    if v_cupo is null then
      v_ok := false;
      v_errores := v_errores || jsonb_build_object(
        'fila', v_fila, 'motivo', 'El cupo debe ser un número entero entre 1 y ' || c_cupo_max || '.');
    end if;

    v_prof := null;
    v_raw := v_el -> 'profesor';
    if v_raw is null or jsonb_typeof(v_raw) = 'null' then
      v_prof := null;
    elsif jsonb_typeof(v_raw) = 'string' then
      v_prof := nullif(btrim(v_raw #>> '{}', E' \t\r\n'), '');
      if v_prof is not null and char_length(v_prof) > c_prof_max then
        v_ok := false;
        v_errores := v_errores || jsonb_build_object(
          'fila', v_fila, 'motivo', 'El profesor no puede superar ' || c_prof_max || ' caracteres.');
      end if;
    else
      v_ok := false;
      v_errores := v_errores || jsonb_build_object(
        'fila', v_fila, 'motivo', 'El profesor debe ser un texto.');
    end if;

    if v_ok then
      v_validas := v_validas || jsonb_build_object(
        'fila', v_fila, 'dia', v_dia, 'desde', v_desde::text, 'hasta', v_hasta::text,
        'cupo', v_cupo, 'profesor', v_prof);
    end if;
  end loop;

  -- 2) Filas repetidas dentro del archivo (misma franja exacta): se reporta cada repetida
  --    contra la primera aparición.
  select coalesce(jsonb_agg(jsonb_build_object(
           'fila', t.fila,
           'motivo', 'Repite la franja de la fila ' || t.primera || ' (' || c_dias[t.dia] || ' ' ||
                     to_char(t.desde, 'HH24:MI') || '–' || to_char(t.hasta, 'HH24:MI') || ').')
         ), '[]'::jsonb)
    into v_nuevos
  from (
    select x.fila, x.dia, x.desde, x.hasta,
           min(x.fila) over (partition by x.dia, x.desde, x.hasta) as primera
    from jsonb_to_recordset(v_validas)
         as x(fila integer, dia integer, desde time, hasta time, cupo integer, profesor text)
  ) t
  where t.fila <> t.primera;
  v_errores := v_errores || v_nuevos;

  -- 3) Franjas del archivo que se solapan entre sí (las idénticas ya se reportaron arriba).
  select coalesce(jsonb_agg(jsonb_build_object(
           'fila', b.fila,
           'motivo', 'Se solapa con la fila ' || a.fila || ' (' || c_dias[a.dia] || ' ' ||
                     to_char(a.desde, 'HH24:MI') || '–' || to_char(a.hasta, 'HH24:MI') || ').')
         ), '[]'::jsonb)
    into v_nuevos
  from jsonb_to_recordset(v_validas)
         as a(fila integer, dia integer, desde time, hasta time, cupo integer, profesor text)
  join jsonb_to_recordset(v_validas)
         as b(fila integer, dia integer, desde time, hasta time, cupo integer, profesor text)
    on a.dia = b.dia and a.fila < b.fila
   and a.desde < b.hasta and a.hasta > b.desde
   and not (a.desde = b.desde and a.hasta = b.hasta);
  v_errores := v_errores || v_nuevos;

  -- 4) Filas que se solapan con una franja que SIGUE activa. En 'agregar' siguen activas las
  --    existentes que el archivo no menciona (coincidencia exacta); en 'reemplazar' ninguna.
  if p_modo = 'agregar' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'fila', v.fila,
             'motivo', 'Se solapa con la franja existente ' || c_dias[f.dia_semana] || ' ' ||
                       to_char(f.hora_desde, 'HH24:MI') || '–' || to_char(f.hora_hasta, 'HH24:MI') ||
                       ', que no está en el archivo.')
           ), '[]'::jsonb)
      into v_nuevos
    from jsonb_to_recordset(v_validas)
           as v(fila integer, dia integer, desde time, hasta time, cupo integer, profesor text)
    join gimnasio_franjas f
      on f.activa and f.dia_semana = v.dia
     and f.hora_desde < v.hasta and f.hora_hasta > v.desde
    where not exists (
      select 1
      from jsonb_to_recordset(v_validas)
             as w(fila integer, dia integer, desde time, hasta time, cupo integer, profesor text)
      where w.dia = f.dia_semana and w.desde = f.hora_desde and w.hasta = f.hora_hasta
    );
    v_errores := v_errores || v_nuevos;
  end if;

  if jsonb_array_length(v_errores) > 0 then
    return gimnasio_fallo(
      'errores', 'El calendario tiene errores; no se importó nada.',
      jsonb_build_object('errores', (
        select jsonb_agg(t.e order by (t.e ->> 'fila')::integer, t.n)
        from jsonb_array_elements(v_errores) with ordinality as t(e, n)
      ))
    );
  end if;

  -- 5) Plan: qué se crea, qué se actualiza (incluye reactivar), qué se desactiva.
  with v as (
    select * from jsonb_to_recordset(v_validas)
      as x(fila integer, dia integer, desde time, hasta time, cupo integer, profesor text)
  ), m as (
    -- Si hubiera dos franjas con el mismo horario (una inactiva), se prefiere la activa y la más nueva.
    select distinct on (v.fila) v.fila, f.id, f.activa, f.cupo as cupo_antes, f.profesor as profesor_antes
    from v
    join gimnasio_franjas f
      on f.dia_semana = v.dia and f.hora_desde = v.desde and f.hora_hasta = v.hasta
    order by v.fila, f.activa desc, f.created_at desc, f.id
  ), nuevas as (
    select v.* from v where not exists (select 1 from m where m.fila = v.fila)
  ), cambian as (
    select v.fila, v.dia, v.desde, v.hasta, v.cupo, v.profesor,
           m.id, m.activa, m.cupo_antes, m.profesor_antes
    from v
    join m on m.fila = v.fila
    where not (m.activa and m.cupo_antes = v.cupo and m.profesor_antes is not distinct from v.profesor)
  ), baja as (
    select f.id, f.dia_semana, f.hora_desde, f.hora_hasta, f.cupo, f.profesor,
           (select count(*)::integer from gimnasio_reservas r
             where r.franja_id = f.id and r.estado = 'reservada'
               and r.fecha >= gimnasio_ahora()::date) as reservas_futuras,
           (select count(*)::integer from gimnasio_turnos_fijos t
             where t.franja_id = f.id and t.activo) as turnos_fijos
    from gimnasio_franjas f
    where p_modo = 'reemplazar' and f.activa
      and not exists (select 1 from m where m.id = f.id)
  )
  select
    (select count(*)::integer from v),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'dia_semana', n.dia, 'hora_desde', to_char(n.desde, 'HH24:MI'),
        'hora_hasta', to_char(n.hasta, 'HH24:MI'), 'cupo', n.cupo, 'profesor', n.profesor
      ) order by n.dia, n.desde), '[]'::jsonb) from nuevas n),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'dia_semana', c.dia, 'hora_desde', to_char(c.desde, 'HH24:MI'),
        'hora_hasta', to_char(c.hasta, 'HH24:MI'),
        'cupo_antes', c.cupo_antes, 'cupo', c.cupo,
        'profesor_antes', c.profesor_antes, 'profesor', c.profesor,
        'reactivada', not c.activa
      ) order by c.dia, c.desde), '[]'::jsonb) from cambian c),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'cupo', c.cupo, 'profesor', c.profesor)), '[]'::jsonb) from cambian c),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'dia_semana', b.dia_semana, 'hora_desde', to_char(b.hora_desde, 'HH24:MI'),
        'hora_hasta', to_char(b.hora_hasta, 'HH24:MI'), 'cupo', b.cupo, 'profesor', b.profesor,
        'reservas_futuras', b.reservas_futuras, 'turnos_fijos', b.turnos_fijos
      ) order by b.dia_semana, b.hora_desde), '[]'::jsonb) from baja b),
    (select coalesce(array_agg(b.id), '{}'::uuid[]) from baja b),
    (select coalesce(sum(b.reservas_futuras), 0)::integer from baja b),
    (select coalesce(sum(b.turnos_fijos), 0)::integer from baja b)
  into v_total, v_crear, v_actualizar, v_upd, v_desactivar, v_des_ids, v_res_fut, v_fijos;

  v_n_crear := jsonb_array_length(v_crear);
  v_n_upd   := jsonb_array_length(v_actualizar);
  v_n_des   := jsonb_array_length(v_desactivar);

  -- 6) Aplicar (todo o nada: es una sola transacción).
  if p_aplicar then
    insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo, profesor, activa)
    select x.dia_semana, x.hora_desde, x.hora_hasta, x.cupo, x.profesor, true
    from jsonb_to_recordset(v_crear)
      as x(dia_semana smallint, hora_desde time, hora_hasta time, cupo integer, profesor text);

    update gimnasio_franjas f
       set cupo = x.cupo, profesor = x.profesor, activa = true
      from jsonb_to_recordset(v_upd) as x(id uuid, cupo integer, profesor text)
     where f.id = x.id;

    update gimnasio_franjas set activa = false where id = any(v_des_ids);
  end if;

  return jsonb_build_object(
    'ok', true,
    'aplicado', p_aplicar,
    'modo', p_modo,
    'resumen', jsonb_build_object(
      'crear', v_n_crear,
      'actualizar', v_n_upd,
      'sin_cambios', v_total - v_n_crear - v_n_upd,
      'desactivar', v_n_des,
      'reservas_futuras_afectadas', v_res_fut,
      'turnos_fijos_afectados', v_fijos
    ),
    'detalle', jsonb_build_object(
      'crear', v_crear,
      'actualizar', v_actualizar,
      'desactivar', v_desactivar
    )
  );
end;
$$;

-- Execute sólo para service_role (como el resto del módulo). El DROP de la disponibilidad
-- perdió sus permisos, así que se vuelven a dar acá.
revoke execute on function gimnasio_disponibilidad(date, date)            from public, anon, authenticated;
revoke execute on function gimnasio_importar_franjas(jsonb, text, boolean) from public, anon, authenticated;

grant execute on function gimnasio_disponibilidad(date, date)             to service_role;
grant execute on function gimnasio_importar_franjas(jsonb, text, boolean) to service_role;
