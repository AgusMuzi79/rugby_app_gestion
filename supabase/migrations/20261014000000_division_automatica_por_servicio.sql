-- División automática por servicio deportivo.
--
-- Un socio con el servicio Rugby o Hockey queda asignado a la división que le
-- corresponde por deporte (servicio) + edad en la temporada + sexo (rama):
--   - al agregarle el servicio (trigger AFTER INSERT en socio_servicios),
--   - al cambiarle sexo o fecha de nacimiento (trigger en socios),
--   - y por backfill manual (asignar_divisiones_pendientes, dry-run por defecto).
--
-- Reglas fijas:
--   - Sólo los servicios llamados exactamente 'Rugby' / 'Hockey'. Los
--     Inclusivos y el resto se ignoran (se asignan a mano).
--   - Quitar el servicio NO saca de la división: eso lo decide el coordinador.
--   - Nunca rompe el alta del servicio (fail-open): si la asignación falla,
--     sólo se emite un WARNING y el servicio queda cargado igual.
--   - Edad en la temporada = año actual (hora Argentina) - año de nacimiento,
--     la misma expresión que pase_de_temporada().

-- ─── socios.sexo ────────────────────────────────────────────────────────────

alter table socios
  add column if not exists sexo text;

alter table socios
  drop constraint if exists socios_sexo_check,
  add constraint socios_sexo_check check (sexo is null or sexo in ('M', 'F'));

comment on column socios.sexo is
  'M | F. Lo llena importar-socios desde la columna Sexo del Padrón Extendido. Null = desconocido. Define la rama (F = damas, M = caballeros) para la división automática.';

-- El socio puede actualizar su propia fila (foto) y guard_socio_update no
-- conoce esta columna: sin este guard podría cambiarse el sexo y, vía el
-- trigger de abajo, autoasignarse a otra división. Sólo staff o service_role.
create or replace function guard_socio_sexo_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sexo is distinct from old.sexo
     and auth.uid() is not null
     and coalesce(get_rol(), '') not in ('secretaria', 'subcomision', 'admin')
  then
    raise exception 'No autorizado para modificar ese campo del socio';
  end if;
  return new;
end;
$$;

revoke execute on function guard_socio_sexo_update() from public, anon, authenticated;

drop trigger if exists guard_socios_sexo_update on socios;
create trigger guard_socios_sexo_update
  before update of sexo on socios
  for each row execute function guard_socio_sexo_update();

-- ─── divisiones.recibe_adultos ──────────────────────────────────────────────

alter table divisiones
  add column if not exists recibe_adultos boolean not null default false;

comment on column divisiones.recibe_adultos is
  'División donde caen automáticamente quienes superan la edad máxima de todas las divisiones con rango de su deporte + rama (p. ej. rugby caballeros -> Mayores, hockey damas -> Intermedia y Primera Damas). Debe haber una sola activa por deporte + rama.';

-- ─── Helper: deporte de un servicio ─────────────────────────────────────────
-- 'Rugby' -> 'rugby', 'Hockey' -> 'hockey' (sin distinguir mayúsculas ni
-- espacios en los bordes). Cualquier otro (Rugby Inclusivo, Gimnasio...) -> null.

create or replace function _deporte_de_servicio(p_servicio_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case lower(btrim(nombre))
           when 'rugby'  then 'rugby'
           when 'hockey' then 'hockey'
         end
  from servicios_opcionales
  where id = p_servicio_id
$$;

revoke execute on function _deporte_de_servicio(uuid) from public, anon, authenticated;
grant execute on function _deporte_de_servicio(uuid) to service_role;

-- ─── Decisión: a dónde va un socio en un deporte ────────────────────────────
-- Sólo lee, no escribe. Devuelve una fila (accion, division_id, jugador_id, motivo):
--   accion 'nada'     -> no hay que hacer nada (motivo explica por qué).
--   accion 'vincular' -> ya existe un jugador con su DNI y sin socio: vincularlo.
--   accion 'alta'     -> crear (o reactivar) el jugador en division_id.
-- Motivos: socio_inexistente | ya_asignado | vinculado_por_dni |
--   sin_fecha_nacimiento | sexo_desconocido | por_rango | adulto |
--   sin_division_adultos | adultos_ambiguo | sin_destino.
--
-- Rama del socio: F -> damas, M -> caballeros, null -> desconocida. Las
-- divisiones 'mixto' (Inclusivas) nunca son destino automático. Con rama
-- conocida sólo se consideran divisiones con esa misma rama (una división
-- con rango y rama null no recibe a nadie automáticamente).
--
-- Umbral de adulto: edad > máximo edad_max de las divisiones activas con
-- rango del deporte + rama. Si la rama no tiene ninguna división con rango
-- (rugby damas), se usa el máximo del deporte (sin mixto): así las rugby F
-- adultas van a Mayores Femenino y las menores no se asignan (sin_destino).

create or replace function _destino_division_por_servicio(
  p_socio_id  uuid,
  p_deporte   text,
  p_temporada int default extract(year from (now() at time zone 'America/Argentina/Buenos_Aires'))::int
)
returns table (accion text, division_id uuid, jugador_id uuid, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_socio      socios%rowtype;
  v_rama       text;
  v_edad       int;
  v_dni_norm   text;
  v_id         uuid;
  v_jug        uuid;
  v_ramas      int;
  v_max        int;
  v_n          int;
begin
  select * into v_socio from socios where id = p_socio_id;
  if not found then
    return query select 'nada'::text, null::uuid, null::uuid, 'socio_inexistente'::text;
    return;
  end if;

  -- Ya está activo en una división activa del deporte.
  select j.id, j.division_id into v_jug, v_id
  from jugadores j
  join divisiones d on d.id = j.division_id
  where j.socio_id = p_socio_id
    and j.activo
    and d.activa
    and d.deporte = p_deporte
  order by d.nombre
  limit 1;

  if v_jug is not null then
    return query select 'nada'::text, v_id, v_jug, 'ya_asignado'::text;
    return;
  end if;

  -- Tuvo división en el deporte y quedó inactivo (baja del coordinador o del
  -- manager): no se lo vuelve a meter. Dar de baja es decisión de ellos, y un
  -- cambio de sexo/fecha o un re-alta del servicio no la revierte.
  -- También una fila inactiva sin socio con su mismo DNI (si no, el alta la
  -- reactivaría por el upsert on conflict (dni, division_id)).
  v_dni_norm := regexp_replace(coalesce(v_socio.dni, ''), '\D', '', 'g');
  if upper(coalesce(v_socio.dni, '')) like 'SD%' then
    v_dni_norm := '';
  end if;

  select j.id, j.division_id into v_jug, v_id
  from jugadores j
  join divisiones d on d.id = j.division_id
  where not j.activo
    and d.activa
    and d.deporte = p_deporte
    and (j.socio_id = p_socio_id
         or (j.socio_id is null and v_dni_norm <> ''
             and regexp_replace(j.dni, '\D', '', 'g') = v_dni_norm))
  order by j.updated_at desc
  limit 1;

  if v_jug is not null then
    return query select 'nada'::text, v_id, v_jug, 'dado_de_baja'::text;
    return;
  end if;

  -- Jugador cargado antes (fichaje / carga masiva) con su DNI y sin socio.
  -- Los DNIs sintéticos (SD...) no se usan para matchear.
  if v_dni_norm <> '' then
    select j.id, j.division_id into v_jug, v_id
    from jugadores j
    join divisiones d on d.id = j.division_id
    where j.socio_id is null
      and j.activo  -- una fila dada de baja no se reactiva al vincular
      and d.activa
      and d.deporte = p_deporte
      and regexp_replace(j.dni, '\D', '', 'g') = v_dni_norm
    order by j.updated_at desc
    limit 1;

    if v_jug is not null then
      return query select 'vincular'::text, v_id, v_jug, 'vinculado_por_dni'::text;
      return;
    end if;
  end if;

  if v_socio.fecha_nacimiento is null then
    return query select 'nada'::text, null::uuid, null::uuid, 'sin_fecha_nacimiento'::text;
    return;
  end if;

  v_edad := p_temporada - extract(year from v_socio.fecha_nacimiento)::int;
  v_rama := case v_socio.sexo when 'F' then 'damas' when 'M' then 'caballeros' end;

  -- Candidatas por rango.
  if v_rama is not null then
    select d.id into v_id
    from divisiones d
    where d.activa
      and d.deporte = p_deporte
      and d.rama = v_rama
      and d.edad_min is not null
      and v_edad between d.edad_min and d.edad_max
    order by case when d.linea = 'A' then 1 when d.linea is null then 2 else 3 end, d.nombre
    limit 1;
  else
    select count(distinct coalesce(d.rama, '-')) into v_ramas
    from divisiones d
    where d.activa
      and d.deporte = p_deporte
      and d.rama is distinct from 'mixto'
      and d.edad_min is not null
      and v_edad between d.edad_min and d.edad_max;

    if v_ramas > 1 then
      return query select 'nada'::text, null::uuid, null::uuid, 'sexo_desconocido'::text;
      return;
    end if;

    select d.id into v_id
    from divisiones d
    where d.activa
      and d.deporte = p_deporte
      and d.rama is distinct from 'mixto'
      and d.edad_min is not null
      and v_edad between d.edad_min and d.edad_max
    order by case when d.linea = 'A' then 1 when d.linea is null then 2 else 3 end, d.nombre
    limit 1;
  end if;

  if v_id is not null then
    return query select 'alta'::text, v_id, null::uuid, 'por_rango'::text;
    return;
  end if;

  -- Sin rango que lo contenga: ¿supera todos los rangos? -> división de adultos.
  select coalesce(
           (select max(d.edad_max) from divisiones d
             where d.activa and d.deporte = p_deporte and d.edad_min is not null
               and v_rama is not null and d.rama = v_rama),
           (select max(d.edad_max) from divisiones d
             where d.activa and d.deporte = p_deporte and d.edad_min is not null
               and d.rama is distinct from 'mixto')
         )
    into v_max;

  if v_max is null or v_edad <= v_max then
    return query select 'nada'::text, null::uuid, null::uuid, 'sin_destino'::text;
    return;
  end if;

  select count(*), min(d.id::text)::uuid into v_n, v_id
  from divisiones d
  where d.activa
    and d.deporte = p_deporte
    and d.recibe_adultos
    and d.rama is distinct from 'mixto'
    and (v_rama is null or d.rama = v_rama);

  if v_n = 0 then
    return query select 'nada'::text, null::uuid, null::uuid, 'sin_division_adultos'::text;
  elsif v_n > 1 then
    return query select 'nada'::text, null::uuid, null::uuid,
      (case when v_rama is null then 'sexo_desconocido' else 'adultos_ambiguo' end)::text;
  else
    return query select 'alta'::text, v_id, null::uuid, 'adulto'::text;
  end if;
end;
$$;

revoke execute on function _destino_division_por_servicio(uuid, text, int) from public, anon, authenticated;
grant execute on function _destino_division_por_servicio(uuid, text, int) to service_role;

-- ─── Asignar (o simular) la división de un socio en un deporte ──────────────
-- p_aplicar = false -> sólo informa qué haría. Devuelve
-- {socio_id, deporte, accion, motivo, division, division_id, jugador_id, aplicado}.
-- 'alta' usa el mismo upsert sobre unique (dni, division_id) que
-- _mover_jugador_division: si ya había una fila de ese DNI en la división
-- (p. ej. dada de baja) se reactiva en vez de duplicarla.

create or replace function asignar_division_por_servicio(
  p_socio_id  uuid,
  p_deporte   text,
  p_aplicar   boolean default true,
  p_temporada int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temporada int := coalesce(
    p_temporada,
    extract(year from (now() at time zone 'America/Argentina/Buenos_Aires'))::int
  );
  v_dest     record;
  v_jugador  uuid;
  v_aplicado boolean := false;
begin
  select * into v_dest
  from _destino_division_por_servicio(p_socio_id, p_deporte, v_temporada);

  v_jugador := v_dest.jugador_id;

  if p_aplicar and v_dest.accion = 'vincular' then
    update jugadores
       set socio_id = p_socio_id,
           activo   = true
     where id = v_dest.jugador_id
       and socio_id is null;
    v_aplicado := found;

  elsif p_aplicar and v_dest.accion = 'alta' then
    insert into jugadores (
      nombre_completo, dni, fecha_nacimiento, division_id, activo,
      socio_id, fichado_temporada_actual
    )
    select
      coalesce(nullif(btrim(p.nombre), ''), s.dni),
      s.dni, s.fecha_nacimiento, v_dest.division_id, true,
      s.id, false
    from socios s
    left join profiles p on p.id = s.profile_id
    where s.id = p_socio_id
    on conflict (dni, division_id) do update set
      activo   = true,
      socio_id = coalesce(jugadores.socio_id, excluded.socio_id)
    returning id into v_jugador;
    v_aplicado := v_jugador is not null;
  end if;

  return jsonb_build_object(
    'socio_id',    p_socio_id,
    'deporte',     p_deporte,
    'accion',      v_dest.accion,
    'motivo',      v_dest.motivo,
    'division',    (select nombre from divisiones where id = v_dest.division_id),
    'division_id', v_dest.division_id,
    'jugador_id',  v_jugador,
    'aplicado',    v_aplicado
  );
end;
$$;

revoke execute on function asignar_division_por_servicio(uuid, text, boolean, int) from public, anon, authenticated;
grant execute on function asignar_division_por_servicio(uuid, text, boolean, int) to service_role;

-- ─── Interruptor de la asignación automática ────────────────────────────────
-- Arranca APAGADO: el re-import del padrón que llena socios.sexo dispararía
-- trg_socios_asignar_division para todos los socios con servicio deportivo,
-- antes de revisar el dry-run del backfill. Se prende a mano después de aplicar
-- el backfill:
--   update division_automatica_config set activa = true;
-- El backfill (asignar_divisiones_pendientes) no depende de este interruptor.

create table if not exists division_automatica_config (
  id     boolean primary key default true check (id),
  activa boolean not null default false
);
insert into division_automatica_config (id) values (true) on conflict (id) do nothing;
alter table division_automatica_config enable row level security;
-- Sin policies: sólo service_role / funciones SECURITY DEFINER la leen o cambian.

create or replace function _division_automatica_activa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select activa from division_automatica_config where id), false)
$$;

revoke execute on function _division_automatica_activa() from public, anon, authenticated;

-- ─── Trigger: al agregar un servicio deportivo ──────────────────────────────
-- SECURITY DEFINER: secretaría inserta en socio_servicios bajo RLS y no tiene
-- permiso de escritura sobre jugadores de todas las divisiones.
-- Sin trigger de DELETE a propósito: quitar el servicio no saca al jugador de
-- su división (lo decide el coordinador, puede ser una baja temporal de cuota).

create or replace function trg_socio_servicios_asignar_division()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deporte text;
begin
  if not _division_automatica_activa() then
    return null;
  end if;
  begin
    v_deporte := _deporte_de_servicio(new.servicio_id);
    if v_deporte is not null then
      perform asignar_division_por_servicio(new.socio_id, v_deporte, true);
    end if;
  exception when others then
    -- Fail-open: el alta del servicio nunca falla por la asignación.
    raise warning 'asignar_division_por_servicio falló (socio %, servicio %): %',
      new.socio_id, new.servicio_id, sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function trg_socio_servicios_asignar_division() from public, anon, authenticated;

drop trigger if exists trg_socio_servicios_asignar_division on socio_servicios;
create trigger trg_socio_servicios_asignar_division
  after insert on socio_servicios
  for each row execute function trg_socio_servicios_asignar_division();

-- ─── Trigger: al cambiar sexo o fecha de nacimiento ─────────────────────────
-- Reintenta la asignación en cada deporte del socio (p. ej. un socio que
-- quedó en sexo_desconocido o sin_fecha_nacimiento). Si ya está asignado no
-- hace nada: un cambio de fecha no lo mueve de división (eso es del
-- coordinador o del pase de temporada).

create or replace function trg_socios_asignar_division()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deporte text;
begin
  if not _division_automatica_activa() then
    return null;
  end if;
  for v_deporte in
    select distinct _deporte_de_servicio(ss.servicio_id)
    from socio_servicios ss
    where ss.socio_id = new.id
  loop
    continue when v_deporte is null;
    begin
      perform asignar_division_por_servicio(new.id, v_deporte, true);
    exception when others then
      raise warning 'asignar_division_por_servicio falló (socio %, deporte %): %',
        new.id, v_deporte, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

revoke execute on function trg_socios_asignar_division() from public, anon, authenticated;

drop trigger if exists trg_socios_asignar_division on socios;
create trigger trg_socios_asignar_division
  after update of sexo, fecha_nacimiento on socios
  for each row
  when (new.sexo is distinct from old.sexo
        or new.fecha_nacimiento is distinct from old.fecha_nacimiento)
  execute function trg_socios_asignar_division();

-- ─── Backfill: socios con servicio deportivo sin división ───────────────────
-- p_aplicar = false (por defecto) -> dry-run, no escribe nada.
-- Devuelve {temporada, aplicado, totales {accion: {motivo: n}},
--   por_division {nombre: n} (altas + vinculaciones), detalle [...]}.
-- detalle omite los 'ya_asignado' (que sí cuentan en totales) y se corta en
-- 500 filas. Un error en un socio no corta el resto: cuenta como
-- accion 'error' con el mensaje en motivo.
-- Idempotente: una segunda corrida aplicada da todo 'ya_asignado' (salvo los
-- que siguen sin destino).

create or replace function asignar_divisiones_pendientes(p_aplicar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_temporada int := extract(year from (now() at time zone 'America/Argentina/Buenos_Aires'))::int;
  r           record;
  v_res       jsonb;
  v_totales   jsonb := '{}'::jsonb;
  v_por_div   jsonb := '{}'::jsonb;
  v_detalle   jsonb := '[]'::jsonb;
  v_accion    text;
  v_motivo    text;
begin
  for r in
    select distinct ss.socio_id, _deporte_de_servicio(ss.servicio_id) as deporte
    from socio_servicios ss
    where _deporte_de_servicio(ss.servicio_id) is not null
    order by 2, 1
  loop
    begin
      v_res := asignar_division_por_servicio(r.socio_id, r.deporte, p_aplicar, v_temporada);
    exception when others then
      v_res := jsonb_build_object(
        'socio_id', r.socio_id, 'deporte', r.deporte,
        'accion', 'error', 'motivo', sqlerrm, 'division', null
      );
    end;

    v_accion := v_res->>'accion';
    v_motivo := v_res->>'motivo';

    v_totales := jsonb_set(
      v_totales, array[v_accion],
      coalesce(v_totales->v_accion, '{}'::jsonb)
        || jsonb_build_object(v_motivo, coalesce((v_totales->v_accion->>v_motivo)::int, 0) + 1)
    );

    if v_accion in ('alta', 'vincular') and v_res->>'division' is not null then
      v_por_div := v_por_div || jsonb_build_object(
        v_res->>'division', coalesce((v_por_div->>(v_res->>'division'))::int, 0) + 1
      );
    end if;

    if v_motivo is distinct from 'ya_asignado' and jsonb_array_length(v_detalle) < 500 then
      v_detalle := v_detalle || jsonb_build_object(
        'socio_id', r.socio_id,
        'deporte',  r.deporte,
        'accion',   v_accion,
        'motivo',   v_motivo,
        'division', v_res->>'division'
      );
    end if;
  end loop;

  return jsonb_build_object(
    'temporada',    v_temporada,
    'aplicado',     p_aplicar,
    'totales',      v_totales,
    'por_division', v_por_div,
    'detalle',      v_detalle
  );
end;
$$;

revoke execute on function asignar_divisiones_pendientes(boolean) from public, anon, authenticated;
grant execute on function asignar_divisiones_pendientes(boolean) to service_role;
