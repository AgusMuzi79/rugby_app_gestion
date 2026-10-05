-- Migration: 20261005000000_gimnasio_turnos
--
-- Turnero del gimnasio: franjas semanales con cupo, reservas de socios y turnos
-- fijos recurrentes. NO hay tope de días por semana ni por servicio (decisión
-- 2026-10-05): el socio reserva libremente dentro de la ventana configurada.
--
-- Convenciones de este módulo:
--   · Día de semana ISO: 1 = lunes … 7 = domingo (extract(isodow ...)), explícito en todos lados.
--   · Zona horaria: UTC-3 fijo, igual que socios-qr (ver gimnasio_ahora()).
--   · Escritura SOLO por service_role (Edge Functions `gimnasio-turnos` y
--     `gimnasio-turnos-admin`) o por las RPC de abajo. Ninguna tabla tiene policy de
--     INSERT/UPDATE/DELETE para clientes.
--   · Lectura directa desde el cliente: sólo admin/subcomisión/porteria (el encargado y
--     la subcomisión). Los socios NO leen estas tablas: ven la disponibilidad a través de
--     la Edge Function `gimnasio-turnos`, que expone únicamente lo que corresponde
--     (cupo/ocupados, nunca quién reservó), así que no hace falta policy para
--     socio/cliente_gimnasio.
--
-- Decisión sobre solapamiento de franjas: NO se impone por constraint (exigiría
-- btree_gist y un EXCLUDE por día que complica editar horarios de temporada). El
-- encargado carga las franjas desde el panel; `gimnasio-turnos-admin` valida que no se
-- solapen dos franjas activas del mismo día antes de guardar.

-- ─── Config (una sola fila) ───────────────────────────────────────────────────

create table gimnasio_config (
  id               smallint    primary key default 1 check (id = 1),
  -- informativo: el Lector sólo avisa si no hay reserva; bloqueante: no deja pasar.
  modo_cupos       text        not null default 'informativo'
                               check (modo_cupos in ('informativo', 'bloqueante')),
  -- ventana de reserva de las reservas 'socio': 'mes' = desde hoy hasta el último día del
  -- mes en curso (el mes siguiente se abre el día 1); 'dias' = hoy + anticipacion_dias.
  ventana_reserva  text        not null default 'mes'
                               check (ventana_reserva in ('mes', 'dias')),
  -- sólo rige en modo 'dias'. Máximo 30: el listado cubre como mucho 31 días (hoy + 30).
  anticipacion_dias integer    not null default 7  check (anticipacion_dias >= 0),
  -- % del cupo que pueden ocupar los turnos fijos (el resto queda para reservas sueltas).
  pct_cupo_fijos   integer     not null default 70 check (pct_cupo_fijos between 0 and 100),
  -- faltas consecutivas tras las cuales se avisa que se va a liberar el horario.
  faltas_aviso     integer     not null default 2  check (faltas_aviso >= 1),
  -- faltas consecutivas tras las cuales se libera el horario (siempre mayor que el aviso).
  faltas_baja      integer     not null default 3,
  -- cuántas semanas hacia adelante se materializan las reservas de un turno fijo.
  semanas_fijos    integer     not null default 4  check (semanas_fijos >= 1),
  tolerancia_min   integer     not null default 15 check (tolerancia_min >= 0),
  updated_at       timestamptz not null default now(),
  constraint gimnasio_config_faltas_check check (faltas_baja > faltas_aviso)
);

create trigger gimnasio_config_updated_at
  before update on gimnasio_config
  for each row execute function set_updated_at();

-- ─── Franjas (plantilla semanal) ──────────────────────────────────────────────

create table gimnasio_franjas (
  id          uuid        primary key default gen_random_uuid(),
  dia_semana  smallint    not null check (dia_semana between 1 and 7),
  hora_desde  time        not null,
  hora_hasta  time        not null,
  cupo        integer     not null check (cupo > 0),
  activa      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint gimnasio_franjas_horas_check check (hora_desde < hora_hasta)
);

create index gimnasio_franjas_dia_idx on gimnasio_franjas (dia_semana) where activa;

create trigger gimnasio_franjas_updated_at
  before update on gimnasio_franjas
  for each row execute function set_updated_at();

-- ─── Excepciones por fecha (feriados, cierres, cupo especial) ─────────────────
-- franja_id null = aplica a todas las franjas de esa fecha. Si existe una excepción
-- específica de la franja, gana entera sobre la general.
-- Cerrar (cerrado = true) exige un mensaje (`motivo`): se le muestra al socio bajo
-- "Cerrado" y viaja en el push a quienes tenían reserva. Al cerrar, las reservas
-- 'reservada' de esa fecha se cancelan (ver gimnasio_cancelar_por_cierre); editar o
-- borrar el cierre después NUNCA restaura ni vuelve a avisar.

create table gimnasio_franjas_excepciones (
  id            uuid        primary key default gen_random_uuid(),
  fecha         date        not null,
  franja_id     uuid        references gimnasio_franjas(id) on delete cascade,
  cerrado       boolean     not null default true,
  cupo_override integer     check (cupo_override > 0),
  motivo        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- una excepción abierta sin cupo especial no cambia nada: no tiene sentido guardarla.
  constraint gimnasio_excepciones_efecto_check check (cerrado or cupo_override is not null),
  -- un cierre exige mensaje (3 a 300 caracteres, sin contar espacios en los bordes).
  constraint gimnasio_excepciones_motivo_check
    check (not cerrado or length(btrim(coalesce(motivo, ''))) between 3 and 300),
  constraint gimnasio_excepciones_motivo_largo_check
    check (motivo is null or length(motivo) <= 300)
);

create unique index gimnasio_excepciones_fecha_general_uq
  on gimnasio_franjas_excepciones (fecha) where franja_id is null;
create unique index gimnasio_excepciones_fecha_franja_uq
  on gimnasio_franjas_excepciones (fecha, franja_id) where franja_id is not null;

create trigger gimnasio_franjas_excepciones_updated_at
  before update on gimnasio_franjas_excepciones
  for each row execute function set_updated_at();

-- ─── Turnos fijos ─────────────────────────────────────────────────────────────

create table gimnasio_turnos_fijos (
  id                  uuid        primary key default gen_random_uuid(),
  socio_id            uuid        not null references socios(id) on delete cascade,
  franja_id           uuid        not null references gimnasio_franjas(id) on delete cascade,
  activo              boolean     not null default true,
  faltas_consecutivas integer     not null default 0 check (faltas_consecutivas >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Un socio no puede tener dos turnos fijos activos en la misma franja.
create unique index gimnasio_turnos_fijos_activo_uq
  on gimnasio_turnos_fijos (socio_id, franja_id) where activo;
create index gimnasio_turnos_fijos_franja_idx on gimnasio_turnos_fijos (franja_id) where activo;

create trigger gimnasio_turnos_fijos_updated_at
  before update on gimnasio_turnos_fijos
  for each row execute function set_updated_at();

-- ─── Reservas ─────────────────────────────────────────────────────────────────

create table gimnasio_reservas (
  id            uuid        primary key default gen_random_uuid(),
  socio_id      uuid        not null references socios(id) on delete cascade,
  franja_id     uuid        not null references gimnasio_franjas(id) on delete cascade,
  fecha         date        not null,
  estado        text        not null default 'reservada'
                            check (estado in ('reservada', 'cancelada', 'asistio', 'falto')),
  origen        text        not null default 'socio'
                            check (origen in ('socio', 'fijo')),
  turno_fijo_id uuid        references gimnasio_turnos_fijos(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Una sola reserva viva por socio+franja+fecha; las canceladas no estorban para volver a reservar.
create unique index gimnasio_reservas_activa_uq
  on gimnasio_reservas (socio_id, franja_id, fecha) where estado <> 'cancelada';
-- Consultas calientes: ocupación de una franja en una fecha, y reservas de un socio por fecha.
create index gimnasio_reservas_franja_fecha_idx on gimnasio_reservas (franja_id, fecha);
create index gimnasio_reservas_socio_fecha_idx  on gimnasio_reservas (socio_id, fecha);
create index gimnasio_reservas_turno_fijo_idx   on gimnasio_reservas (turno_fijo_id)
  where turno_fijo_id is not null;

create trigger gimnasio_reservas_updated_at
  before update on gimnasio_reservas
  for each row execute function set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table gimnasio_config               enable row level security;
alter table gimnasio_franjas              enable row level security;
alter table gimnasio_franjas_excepciones  enable row level security;
alter table gimnasio_turnos_fijos         enable row level security;
alter table gimnasio_reservas             enable row level security;

create policy "gimnasio_staff_select_config" on gimnasio_config
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision', 'porteria'));

create policy "gimnasio_staff_select_franjas" on gimnasio_franjas
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision', 'porteria'));

create policy "gimnasio_staff_select_excepciones" on gimnasio_franjas_excepciones
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision', 'porteria'));

create policy "gimnasio_staff_select_turnos_fijos" on gimnasio_turnos_fijos
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision', 'porteria'));

create policy "gimnasio_staff_select_reservas" on gimnasio_reservas
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision', 'porteria'));

-- ─── Funciones internas ───────────────────────────────────────────────────────
-- Todas: SECURITY DEFINER + search_path fijo; execute sólo para service_role
-- (las llaman las Edge Functions con la llave de servicio, nunca el cliente).

-- Hora local del club (UTC-3 fijo). Aislada en una función para poder fijar "ahora"
-- en el script de pruebas (supabase/tests/gimnasio_turnos_rpc.sql).
create or replace function gimnasio_ahora()
returns timestamp
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'utc') - interval '3 hours'
$$;

create or replace function gimnasio_fallo(p_codigo text, p_motivo text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object('ok', false, 'codigo', p_codigo, 'motivo', p_motivo) || coalesce(p_extra, '{}'::jsonb)
$$;

-- Estado efectivo de una franja en una fecha: cerrada o no, mensaje del cierre (`motivo`,
-- sólo si está cerrada) y capacidad (cupo especial de la excepción, si hay, o el cupo de la
-- plantilla). La excepción específica de la franja gana entera sobre la general de la fecha.
-- Fuente única para reservar y disponibilidad.
create or replace function gimnasio_estado_franja(p_franja_id uuid, p_fecha date)
returns table (cerrado boolean, capacidad integer, motivo text)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.cerrado,
    coalesce(case when e.id is not null then e.cupo_override else g.cupo_override end, f.cupo),
    case when c.cerrado then case when e.id is not null then e.motivo else g.motivo end end
  from gimnasio_franjas f
  left join lateral (
    select x.id, x.cerrado, x.cupo_override, x.motivo
    from gimnasio_franjas_excepciones x
    where x.fecha = p_fecha and x.franja_id = f.id
  ) e on true
  left join lateral (
    select x.id, x.cerrado, x.cupo_override, x.motivo
    from gimnasio_franjas_excepciones x
    where x.fecha = p_fecha and x.franja_id is null
  ) g on true
  cross join lateral (
    select case when e.id is not null then e.cerrado else coalesce(g.cerrado, false) end as cerrado
  ) c
  where f.id = p_franja_id
$$;

-- ─── Reserva atómica ──────────────────────────────────────────────────────────
-- Una transacción con lock `for update` de la franja, para que el cupo no se sobrepase con
-- reservas concurrentes. No hace falta lock por socio: sin tope semanal, lo único que mira
-- al socio es la reserva duplicada, y eso lo garantiza el índice único parcial
-- (el unique_violation se captura abajo).
--
-- p_origen: 'socio' | 'fijo'.
--   · 'socio' respeta la ventana de reserva (gimnasio_config.ventana_reserva):
--       'mes'  -> de hoy al último día del mes en curso (hora local);
--       'dias' -> de hoy a hoy + anticipacion_dias.
--   · 'fijo' la omite: la materialización de turnos fijos reserva `semanas_fijos`
--     semanas hacia adelante, más lejos que cualquiera de las dos ventanas.
-- Cupo: el total efectivo manda para todos; además los 'fijo' no pueden superar
-- floor(capacidad * pct_cupo_fijos / 100), así siempre queda lugar para reservas sueltas.
--
-- Devuelve {ok:true, reserva_id, ...} o {ok:false, codigo, motivo} con codigo estable:
--   parametros, origen_invalido, socio_inexistente, franja_inexistente, franja_inactiva,
--   dia_invalido, cerrado, pasado, fuera_de_mes, anticipacion, duplicada, cupo_lleno,
--   cupo_fijos_lleno.
create or replace function gimnasio_reservar(
  p_socio_id      uuid,
  p_franja_id     uuid,
  p_fecha         date,
  p_origen        text,
  p_turno_fijo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg        gimnasio_config%rowtype;
  v_franja     gimnasio_franjas%rowtype;
  v_ahora      timestamp := gimnasio_ahora();
  v_fin_mes    date;
  v_cerrado    boolean;
  v_cap        integer;
  v_ocupados   integer;
  v_fijos      integer;
  v_max_fijos  integer;
  v_reserva_id uuid;
begin
  if p_socio_id is null or p_franja_id is null or p_fecha is null then
    return gimnasio_fallo('parametros', 'Faltan datos para reservar');
  end if;
  if p_origen is null or p_origen not in ('socio', 'fijo') then
    return gimnasio_fallo('origen_invalido', 'Origen de reserva inválido');
  end if;

  select * into v_cfg from gimnasio_config where id = 1;
  if not found then
    raise exception 'gimnasio_config no tiene fila (id = 1)';
  end if;

  if not exists (select 1 from socios where id = p_socio_id) then
    return gimnasio_fallo('socio_inexistente', 'El socio no existe');
  end if;

  select * into v_franja from gimnasio_franjas where id = p_franja_id for update;
  if not found then
    return gimnasio_fallo('franja_inexistente', 'La franja no existe');
  end if;
  if not v_franja.activa then
    return gimnasio_fallo('franja_inactiva', 'La franja no está disponible');
  end if;
  if extract(isodow from p_fecha)::int <> v_franja.dia_semana then
    return gimnasio_fallo('dia_invalido', 'La fecha no corresponde al día de la franja');
  end if;

  select e.cerrado, e.capacidad into v_cerrado, v_cap
  from gimnasio_estado_franja(p_franja_id, p_fecha) e;
  if v_cerrado then
    return gimnasio_fallo('cerrado', 'El gimnasio está cerrado en esa fecha');
  end if;

  if (p_fecha + v_franja.hora_desde) <= v_ahora then
    return gimnasio_fallo('pasado', 'La franja ya comenzó o ya pasó');
  end if;
  if p_origen = 'socio' then
    if v_cfg.ventana_reserva = 'mes' then
      -- Último día del mes en curso: primer día del mes + 1 mes - 1 día (sirve para 28/29/30/31).
      v_fin_mes := (date_trunc('month', v_ahora) + interval '1 month' - interval '1 day')::date;
      if p_fecha > v_fin_mes then
        return gimnasio_fallo(
          'fuera_de_mes',
          'Todavía no se pueden reservar turnos del mes que viene.',
          jsonb_build_object('fin_de_mes', v_fin_mes)
        );
      end if;
    elsif p_fecha > v_ahora::date + v_cfg.anticipacion_dias then
      return gimnasio_fallo(
        'anticipacion',
        'Sólo se puede reservar con hasta ' || v_cfg.anticipacion_dias || ' días de anticipación',
        jsonb_build_object('anticipacion_dias', v_cfg.anticipacion_dias)
      );
    end if;
  end if;

  if exists (
    select 1 from gimnasio_reservas
    where socio_id = p_socio_id and franja_id = p_franja_id and fecha = p_fecha
      and estado <> 'cancelada'
  ) then
    return gimnasio_fallo('duplicada', 'Ya tenés una reserva en esa franja');
  end if;

  -- Cupo: total y, para los turnos fijos, el tope del porcentaje reservado a fijos.
  select count(*)::int, (count(*) filter (where origen = 'fijo'))::int
    into v_ocupados, v_fijos
  from gimnasio_reservas
  where franja_id = p_franja_id and fecha = p_fecha and estado <> 'cancelada';

  if v_ocupados >= v_cap then
    return gimnasio_fallo(
      'cupo_lleno', 'No quedan lugares en esa franja',
      jsonb_build_object('capacidad', v_cap, 'ocupados', v_ocupados)
    );
  end if;
  if p_origen = 'fijo' then
    v_max_fijos := floor(v_cap * v_cfg.pct_cupo_fijos / 100.0)::int;
    if v_fijos >= v_max_fijos then
      return gimnasio_fallo(
        'cupo_fijos_lleno', 'No quedan lugares para turnos fijos en esa franja',
        jsonb_build_object('max_fijos', v_max_fijos, 'fijos', v_fijos)
      );
    end if;
  end if;

  begin
    insert into gimnasio_reservas (socio_id, franja_id, fecha, origen, turno_fijo_id)
    values (p_socio_id, p_franja_id, p_fecha, p_origen, p_turno_fijo_id)
    returning id into v_reserva_id;
  exception when unique_violation then
    return gimnasio_fallo('duplicada', 'Ya tenés una reserva en esa franja');
  end;

  return jsonb_build_object(
    'ok', true,
    'reserva_id', v_reserva_id,
    'franja_id', p_franja_id,
    'fecha', p_fecha,
    'capacidad', v_cap,
    'ocupados', v_ocupados + 1
  );
end;
$$;

-- ─── Disponibilidad por franja y fecha ────────────────────────────────────────
-- Franjas ACTIVAS entre p_desde y p_hasta (rango acotado a 31 días desde p_desde).
-- capacidad efectiva (con excepciones), ocupados (reservas vivas, incluye fijos),
-- cerrado y, si está cerrada, el mensaje del cierre. La usan ambas Edge Functions.
create or replace function gimnasio_disponibilidad(p_desde date, p_hasta date)
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
  motivo_cierre  text
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
    e.motivo
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

-- ─── Cierre de una franja o de un día ─────────────────────────────────────────
-- Reservas 'reservada' que un cierre de p_fecha deja sin lugar: las de p_franja_id, o, si
-- es null (todo el día), las de todas las franjas de esa fecha que NO tengan excepción
-- propia (la específica gana entera sobre la general). Sólo franjas que todavía no empezaron:
-- avisar de un turno que ya pasó no tiene sentido.
-- Es de sólo lectura: sirve para la previsualización antes de confirmar el cierre.
create or replace function gimnasio_cierre_afectadas(p_fecha date, p_franja_id uuid)
returns table (
  reserva_id uuid,
  socio_id   uuid,
  franja_id  uuid,
  hora_desde time,
  hora_hasta time
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.socio_id, r.franja_id, f.hora_desde, f.hora_hasta
  from gimnasio_reservas r
  join gimnasio_franjas f on f.id = r.franja_id
  where r.fecha = p_fecha
    and r.estado = 'reservada'
    and (p_fecha + f.hora_desde) > gimnasio_ahora()
    and case
      when p_franja_id is not null then r.franja_id = p_franja_id
      else not exists (
        select 1 from gimnasio_franjas_excepciones x
        where x.fecha = p_fecha and x.franja_id = r.franja_id
      )
    end
  order by f.hora_desde, r.created_at
$$;

-- Cancela esas reservas y devuelve exactamente las filas canceladas, en UNA sentencia
-- UPDATE ... RETURNING. Antes toma el lock `for update` de las franjas afectadas (el mismo
-- que toma gimnasio_reservar, en orden de id para no cruzarse), así una reserva en vuelo
-- termina de insertarse antes de cancelar y no queda ninguna colada. Se llama DESPUÉS de
-- guardar la excepción: desde ese commit gimnasio_reservar ya rechaza la fecha como cerrada.
create or replace function gimnasio_cancelar_por_cierre(p_fecha date, p_franja_id uuid)
returns table (
  reserva_id uuid,
  socio_id   uuid,
  franja_id  uuid,
  hora_desde time,
  hora_hasta time
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform 1
  from gimnasio_franjas f
  where f.id in (select a.franja_id from gimnasio_cierre_afectadas(p_fecha, p_franja_id) a)
  order by f.id
  for update;

  return query
  with cancelada as (
    update gimnasio_reservas r
       set estado = 'cancelada'
     where r.estado = 'reservada'
       and r.id in (select a.reserva_id from gimnasio_cierre_afectadas(p_fecha, p_franja_id) a)
    returning r.id, r.socio_id, r.franja_id
  )
  select c.id, c.socio_id, c.franja_id, f.hora_desde, f.hora_hasta
  from cancelada c
  join gimnasio_franjas f on f.id = c.franja_id
  order by f.hora_desde, c.id;
end;
$$;

-- Execute sólo para service_role en todas las funciones nuevas.
revoke execute on function gimnasio_ahora()                                     from public, anon, authenticated;
revoke execute on function gimnasio_fallo(text, text, jsonb)                    from public, anon, authenticated;
revoke execute on function gimnasio_estado_franja(uuid, date)                   from public, anon, authenticated;
revoke execute on function gimnasio_reservar(uuid, uuid, date, text, uuid)      from public, anon, authenticated;
revoke execute on function gimnasio_disponibilidad(date, date)                  from public, anon, authenticated;
revoke execute on function gimnasio_cierre_afectadas(date, uuid)                from public, anon, authenticated;
revoke execute on function gimnasio_cancelar_por_cierre(date, uuid)             from public, anon, authenticated;

grant execute on function gimnasio_ahora()                                      to service_role;
grant execute on function gimnasio_fallo(text, text, jsonb)                     to service_role;
grant execute on function gimnasio_estado_franja(uuid, date)                    to service_role;
grant execute on function gimnasio_reservar(uuid, uuid, date, text, uuid)       to service_role;
grant execute on function gimnasio_disponibilidad(date, date)                   to service_role;
grant execute on function gimnasio_cierre_afectadas(date, uuid)                 to service_role;
grant execute on function gimnasio_cancelar_por_cierre(date, uuid)              to service_role;

-- ─── Seeds ────────────────────────────────────────────────────────────────────
-- Config con los defaults. SIN franjas: las carga el encargado desde el panel.
insert into gimnasio_config (id) values (1) on conflict (id) do nothing;
