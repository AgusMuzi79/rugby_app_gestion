-- Migration: 20261112000000_reservas_tenis
--
-- Reservas de canchas de tenis (reemplaza OnDepor). Diseño cerrado con Agus y
-- la subcomisión de tenis (2026-11-17 → 2026-11-20); el contrato compartido
-- con las Edge Functions, la app y la web vive en odd/tasks/reservas-tenis.md.
--
-- Qué hay acá:
--   · Tablas: tenis_config (una fila), tenis_canchas (01..08), tenis_bloques
--     (recurrentes por día ISO con vigencia, o puntuales por fecha),
--     tenis_invitados (no socios por DNI), tenis_reservas (+ exclusión por
--     solape), tenis_reserva_jugadores (cargo por jugador), tenis_infracciones,
--     tenis_suspensiones, tenis_invitados_intentos (rate limit de la web
--     pública) y el bucket privado tenis-comprobantes.
--   · Helpers: tenis_ahora, es_gestor_tenis, es_canchero, tenis_cargo_jugador,
--     tenis_suspendido (+ internos tenis_*).
--   · RPC del socio, del gestor (subcomisión con deporte tenis, o admin), del
--     canchero y de service_role (web de invitados y cron).
--
-- Convenciones:
--   · RLS activa en todas las tablas y SIN policies: el cliente nunca lee ni
--     escribe directo. Todo pasa por las RPC SECURITY DEFINER de abajo (cada una
--     valida su rol) o por las Edge Functions con service_role.
--   · Errores con códigos estables: raise exception using errcode = 'P0001',
--     message = '<codigo>' (detail = dato extra, p. ej. el nombre del jugador).
--     Códigos: no_autorizado, sin_socio, no_es_socio, parametros,
--     modalidad_invalida, origen_invalido, cancha_inexistente, cancha_inactiva,
--     horario_invalido, fuera_de_horario, pasado, anticipacion, bloqueado,
--     turno_ocupado, limite_dia, limite_activas, cantidad_jugadores,
--     jugadores_duplicados, jugador_ocupado, socio_no_encontrado, dni_invalido,
--     invitado_incompleto, email_invalido, titular_suspendido, titular_moroso,
--     jugador_no_habilitado, titular_es_socio, plazo_invitado,
--     reserva_inexistente, estado_invalido, reserva_finalizada, fuera_de_plazo,
--     token_invalido, hold_vencido, reserva_cancelada, comprobante_vencido,
--     path_invalido, motivo_requerido, bloque_invalido, bloque_inexistente,
--     config_invalida, dias_invalidos, persona_requerida, jugador_inexistente,
--     infraccion_inexistente, suspension_inexistente, extension_invalida.
--     Para los jugadores que no son el titular, suspensión y morosidad dan el
--     mismo código (jugador_no_habilitado): un socio no se entera de por qué
--     otro socio no puede jugar.
--   · Hora: Argentina (America/Argentina/Buenos_Aires, UTC-3 sin horario de
--     verano, igual que gimnasio_ahora()). tenis_ahora() es el "ahora" de todo
--     el módulo (las pruebas lo redefinen); inicio/fin se guardan en timestamptz
--     y el "día" de una reserva es la fecha local de su inicio.
--   · inicio/fin son los de la grilla (18:00–19:00). El margen de 5 minutos
--     (margen_inicio_min, barrido de la cancha) es sólo de presentación: la app
--     muestra "18:05".
--   · Estados de una reserva:
--       pendiente_confirmacion → hold de un invitado (15 min, link por mail)
--       pendiente_comprobante  → invitado confirmado, falta el comprobante
--       confirmada             → firme (socio, telefónica, invitado aprobado)
--       jugada / no_show       → los cierra tenis_procesar() al terminar el turno
--       cancelada / vencida    → no ocupan la cancha
--     Las cuatro primeras ocupan la cancha (constraint de exclusión).
--   · Una reserva "activa" para los límites del titular es una no terminada
--     (fin > ahora) en pendiente_confirmacion, pendiente_comprobante o
--     confirmada: deja de contar apenas termina el turno, no a medianoche.
--
-- Deploy: aplicar ANTES de deployar tenis-invitados, tenis-gestion y tenis-cron.
-- No agenda el cron (ver el snippet comentado al final).

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ─── Config (una sola fila) ───────────────────────────────────────────────────

create table tenis_config (
  id                      boolean     primary key default true check (id),
  hora_desde              time        not null default '08:00',
  hora_hasta              time        not null default '22:00',
  modulo_min              int         not null default 30 check (modulo_min between 5 and 120),
  -- minutos de barrido: el turno real arranca inicio + margen (sólo presentación).
  margen_inicio_min       int         not null default 5  check (margen_inicio_min between 0 and 30),
  singles_min             int         not null default 60 check (singles_min > 0),
  dobles_min              int         not null default 90 check (dobles_min > 0),
  max_reservas_dia        int         not null default 1  check (max_reservas_dia >= 1),
  max_activas             int         not null default 2  check (max_activas >= 1),
  anticipacion_dias       int         not null default 2  check (anticipacion_dias between 0 and 30),
  cancelacion_horas       int         not null default 3  check (cancelacion_horas between 0 and 72),
  comprobante_horas_antes int         not null default 3  check (comprobante_horas_antes between 0 and 72),
  hold_min                int         not null default 15 check (hold_min between 1 and 120),
  alias_pago              text        not null default 'uncas.tenis.macro'
                                      check (length(btrim(alias_pago)) between 3 and 60),
  precio_socio_single     int         not null default 9000  check (precio_socio_single >= 0),
  precio_socio_dobles     int         not null default 10000 check (precio_socio_dobles >= 0),
  precio_nosocio_single   int         not null default 16000 check (precio_nosocio_single >= 0),
  precio_nosocio_dobles   int         not null default 18000 check (precio_nosocio_dobles >= 0),
  -- semáforo rojo (NUVIX) no puede reservar ni ser agregado como jugador.
  bloquear_morosos        boolean     not null default true,
  updated_at              timestamptz not null default now(),
  updated_by              uuid        references profiles(id) on delete set null,
  constraint tenis_config_horas_check check (hora_desde < hora_hasta),
  -- los turnos tienen que caer en la grilla.
  constraint tenis_config_duracion_check
    check (singles_min % modulo_min = 0 and dobles_min % modulo_min = 0)
);

create trigger tenis_config_updated_at
  before update on tenis_config
  for each row execute function set_updated_at();

-- ─── Canchas ──────────────────────────────────────────────────────────────────

create table tenis_canchas (
  id          uuid        primary key default gen_random_uuid(),
  nombre      text        not null unique,
  superficie  text        not null default 'polvo de ladrillo',
  luz         boolean     not null default true,
  activa      boolean     not null default true,
  orden       int         not null default 0,
  created_at  timestamptz not null default now()
);

-- ─── Bloques (clases, entrenamientos, torneos, no disponible, en suspenso) ────
-- Recurrente: dia_semana (ISO, 1 = lunes … 7 = domingo) dentro de
-- [vigente_desde, vigente_hasta] (vigente_hasta null = sin fin).
-- Puntual: fecha. Exactamente uno de los dos. cancha_id null = todas las canchas.
-- hora_hasta puede ser '24:00' (hasta medianoche).

create table tenis_bloques (
  id            uuid        primary key default gen_random_uuid(),
  cancha_id     uuid        references tenis_canchas(id) on delete cascade,
  tipo          text        not null
                            check (tipo in ('clase', 'entrenamiento', 'torneo', 'no_disponible', 'en_suspenso')),
  titulo        text        not null check (length(btrim(titulo)) between 1 and 120),
  dia_semana    int         check (dia_semana between 1 and 7),
  fecha         date,
  hora_desde    time        not null,
  hora_hasta    time        not null,
  vigente_desde date,
  vigente_hasta date,
  activo        boolean     not null default true,
  creado_por    uuid        references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint tenis_bloques_dia_o_fecha_check check ((dia_semana is null) <> (fecha is null)),
  constraint tenis_bloques_horas_check check (hora_desde < hora_hasta),
  constraint tenis_bloques_vigencia_check
    check (vigente_desde is null or vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index tenis_bloques_fecha_idx on tenis_bloques (fecha) where fecha is not null and activo;
create index tenis_bloques_dia_idx   on tenis_bloques (dia_semana) where dia_semana is not null and activo;

-- ─── Invitados (no socios) ────────────────────────────────────────────────────
-- dni normalizado (sin puntos, espacios ni guiones; letras en mayúscula para
-- pasaportes), ver tenis_norm_dni().

create table tenis_invitados (
  id          uuid        primary key default gen_random_uuid(),
  dni         text        not null unique check (dni ~ '^[0-9A-Z]{5,12}$'),
  nombre      text,
  apellido    text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tenis_invitados_updated_at
  before update on tenis_invitados
  for each row execute function set_updated_at();

-- ─── Reservas ─────────────────────────────────────────────────────────────────

create table tenis_reservas (
  id                      uuid        primary key default gen_random_uuid(),
  cancha_id               uuid        not null references tenis_canchas(id),
  inicio                  timestamptz not null,
  fin                     timestamptz not null,
  rango                   tstzrange   generated always as (tstzrange(inicio, fin, '[)')) stored,
  modalidad               text        not null check (modalidad in ('singles', 'dobles')),
  origen                  text        not null check (origen in ('socio', 'invitado', 'telefonica', 'extension')),
  titular_socio_id        uuid        references socios(id) on delete cascade,
  titular_invitado_id     uuid        references tenis_invitados(id) on delete cascade,
  estado                  text        not null default 'confirmada'
                                      check (estado in ('pendiente_confirmacion', 'pendiente_comprobante',
                                                        'confirmada', 'jugada', 'no_show', 'cancelada', 'vencida')),
  hold_vence_at           timestamptz,
  -- SHA-256 del token del link de confirmación (nunca el token en claro).
  confirmacion_token_hash text,
  comprobante_path        text,
  comprobante_estado      text        check (comprobante_estado in ('pendiente', 'aprobado', 'rechazado')),
  comprobante_motivo      text,
  comprobante_vence_at    timestamptz,
  cancelada_por           uuid        references profiles(id) on delete set null,
  cancelada_at            timestamptz,
  cancelacion_motivo      text,
  creado_por              uuid        references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  constraint tenis_reservas_horas_check check (fin > inicio),
  constraint tenis_reservas_titular_check
    check ((titular_socio_id is null) <> (titular_invitado_id is null)),
  -- Dos reservas vivas nunca se pisan en la misma cancha.
  constraint tenis_reservas_sin_solape
    exclude using gist (cancha_id with =, rango with &&)
    where (estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada'))
);

create index tenis_reservas_inicio_idx          on tenis_reservas (inicio);
create index tenis_reservas_titular_socio_idx   on tenis_reservas (titular_socio_id, inicio)
  where titular_socio_id is not null;
create index tenis_reservas_titular_inv_idx     on tenis_reservas (titular_invitado_id, inicio)
  where titular_invitado_id is not null;
create index tenis_reservas_pendientes_idx      on tenis_reservas (estado)
  where estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada');
create unique index tenis_reservas_token_uq     on tenis_reservas (confirmacion_token_hash)
  where confirmacion_token_hash is not null;

-- ─── Jugadores de una reserva (incluye al titular) ────────────────────────────

create table tenis_reserva_jugadores (
  id            uuid        primary key default gen_random_uuid(),
  reserva_id    uuid        not null references tenis_reservas(id) on delete cascade,
  socio_id      uuid        references socios(id) on delete cascade,
  invitado_id   uuid        references tenis_invitados(id) on delete cascade,
  es_titular    boolean     not null default false,
  cargo         int         not null default 0 check (cargo >= 0),
  motivo_cargo  text        check (motivo_cargo in ('carnet_gratis', 'turno_extra', 'socio', 'no_socio', 'no_show')),
  cobrado       boolean     not null default false,
  cobrado_por   uuid        references profiles(id) on delete set null,
  cobrado_at    timestamptz,
  check_in_at   timestamptz,
  check_in_por  uuid        references profiles(id) on delete set null,
  constraint tenis_jugadores_persona_check check ((socio_id is null) <> (invitado_id is null)),
  constraint tenis_jugadores_socio_uq    unique (reserva_id, socio_id),
  constraint tenis_jugadores_invitado_uq unique (reserva_id, invitado_id)
);

create unique index tenis_jugadores_titular_uq on tenis_reserva_jugadores (reserva_id) where es_titular;
create index tenis_jugadores_socio_idx    on tenis_reserva_jugadores (socio_id)    where socio_id is not null;
create index tenis_jugadores_invitado_idx on tenis_reserva_jugadores (invitado_id) where invitado_id is not null;

-- ─── Infracciones y suspensiones ──────────────────────────────────────────────
-- La primera infracción de una persona es una advertencia (perdonada = true);
-- desde la segunda el gestor decide la suspensión (días libres).

create table tenis_infracciones (
  id           uuid        primary key default gen_random_uuid(),
  socio_id     uuid        references socios(id) on delete cascade,
  invitado_id  uuid        references tenis_invitados(id) on delete cascade,
  reserva_id   uuid        references tenis_reservas(id) on delete set null,
  tipo         text        not null check (tipo in ('no_show', 'jugadores_incorrectos', 'otra')),
  nota         text,
  perdonada    boolean     not null default false,
  creado_por   uuid        references profiles(id) on delete set null,  -- null = automática
  created_at   timestamptz not null default now(),
  constraint tenis_infracciones_persona_check check ((socio_id is null) <> (invitado_id is null))
);

create index tenis_infracciones_socio_idx    on tenis_infracciones (socio_id)    where socio_id is not null;
create index tenis_infracciones_invitado_idx on tenis_infracciones (invitado_id) where invitado_id is not null;

-- levantada_at/levantada_por: tenis_suspension_levantar() corta la suspensión
-- sin borrar la historia.
create table tenis_suspensiones (
  id            uuid        primary key default gen_random_uuid(),
  socio_id      uuid        references socios(id) on delete cascade,
  invitado_id   uuid        references tenis_invitados(id) on delete cascade,
  desde         date        not null,
  hasta         date        not null,
  motivo        text,
  creado_por    uuid        references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  levantada_at  timestamptz,
  levantada_por uuid        references profiles(id) on delete set null,
  constraint tenis_suspensiones_persona_check check ((socio_id is null) <> (invitado_id is null)),
  constraint tenis_suspensiones_fechas_check check (hasta >= desde)
);

create index tenis_suspensiones_socio_idx    on tenis_suspensiones (socio_id)    where socio_id is not null;
create index tenis_suspensiones_invitado_idx on tenis_suspensiones (invitado_id) where invitado_id is not null;

-- ─── Rate limit de la web pública (tenis-invitados) ───────────────────────────
-- Una fila por intento; la Edge Function cuenta por clave (DNI/mail/IP
-- hasheados, nunca en claro) dentro de una ventana y borra lo viejo.

create table tenis_invitados_intentos (
  id          bigint      generated always as identity primary key,
  clave       text        not null,
  created_at  timestamptz not null default now()
);

create index tenis_invitados_intentos_clave_idx on tenis_invitados_intentos (clave, created_at);

-- ─── RLS: activa y sin policies; sólo service_role y las RPC ─────────────────

alter table tenis_config             enable row level security;
alter table tenis_canchas            enable row level security;
alter table tenis_bloques            enable row level security;
alter table tenis_invitados          enable row level security;
alter table tenis_reservas           enable row level security;
alter table tenis_reserva_jugadores  enable row level security;
alter table tenis_infracciones       enable row level security;
alter table tenis_suspensiones       enable row level security;
alter table tenis_invitados_intentos enable row level security;

revoke all on table tenis_config, tenis_canchas, tenis_bloques, tenis_invitados, tenis_reservas,
  tenis_reserva_jugadores, tenis_infracciones, tenis_suspensiones, tenis_invitados_intentos
  from public, anon, authenticated;
grant all on table tenis_config, tenis_canchas, tenis_bloques, tenis_invitados, tenis_reservas,
  tenis_reserva_jugadores, tenis_infracciones, tenis_suspensiones, tenis_invitados_intentos
  to service_role;

-- ─── Seeds ────────────────────────────────────────────────────────────────────

insert into tenis_config (id) values (true) on conflict (id) do nothing;

insert into tenis_canchas (nombre, orden)
select lpad(n::text, 2, '0'), n from generate_series(1, 8) as n
on conflict (nombre) do nothing;

-- ─── Storage: comprobantes de transferencia (privado) ─────────────────────────
-- Sin policies: se sube con signed upload URLs que emite tenis-invitados y se
-- lee con signed URLs de tenis-gestion (gestor/canchero). Path:
-- <reserva_id>/<uuid>.<ext>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenis-comprobantes', 'tenis-comprobantes', false, 5242880,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ═════════════════════════════════════════════════════════════════════════════
-- Helpers
-- ═════════════════════════════════════════════════════════════════════════════

-- "Ahora" del módulo. Aislado para poder fijarlo en las pruebas
-- (supabase/tests/reservas_tenis.sql lo redefine).
create or replace function tenis_ahora()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select now()
$$;

-- Hora local del club (Argentina) de un instante, y al revés.
create or replace function tenis_local(p_ts timestamptz)
returns timestamp
language sql
stable
set search_path = public
as $$
  select p_ts at time zone 'America/Argentina/Buenos_Aires'
$$;

create or replace function tenis_ts(p_fecha date, p_hora time)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_fecha + p_hora) at time zone 'America/Argentina/Buenos_Aires'
$$;

create or replace function tenis_hoy()
returns date
language sql
stable
set search_path = public
as $$
  select tenis_local(tenis_ahora())::date
$$;

-- Lanza un error con código estable.
create or replace function tenis_error(p_codigo text, p_detalle text default null)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = 'P0001', message = p_codigo, detail = coalesce(p_detalle, '');
end;
$$;

-- DNI normalizado: sin puntos/espacios/guiones, letras en mayúscula. '' → null.
create or replace function tenis_norm_dni(p_dni text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(upper(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

-- Búsqueda de socios por DNI normalizado (check-in y jugadores por DNI).
create index if not exists socios_dni_norm_idx on socios (tenis_norm_dni(dni));

-- ¿la cuenta logueada gestiona tenis? admin, o subcomisión con deporte 'tenis'.
-- Mira roles[] además del rol activo (igual que tiene_rol_beneficios()).
create or replace function es_gestor_tenis()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.activo
      and (
        p.rol = 'admin' or 'admin' = any (coalesce(p.roles, '{}'))
        or ((p.rol = 'subcomision' or 'subcomision' = any (coalesce(p.roles, '{}')))
            and p.deporte = 'tenis')
      )
  )
$$;

-- ¿la cuenta logueada es canchero (o gestor de tenis)?
create or replace function es_canchero()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select es_gestor_tenis() or exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.activo
      and (p.rol = 'canchero' or 'canchero' = any (coalesce(p.roles, '{}')))
  )
$$;

-- Socio vigente para tenis: no dado de baja y no Cliente Gimnasio (no es socio
-- del club aunque tenga fila en socios).
create or replace function tenis_es_socio_activo(p_socio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from socios s
    left join categorias_socio cs on cs.id = s.categoria_id
    where s.id = p_socio_id
      and s.estado <> 'inactivo'
      and coalesce(cs.nombre, '') <> 'Cliente Gimnasio'
  )
$$;

create or replace function tenis_socio_activo_por_dni(p_dni text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from socios s
  where tenis_norm_dni(s.dni) = tenis_norm_dni(p_dni)
    and tenis_es_socio_activo(s.id)
  limit 1
$$;

-- Nombre a mostrar: el del padrón (lo escribe el importador) o el del perfil.
create or replace function tenis_nombre_socio(p_socio_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(s.nombre_padron), ''), p.nombre)
  from socios s left join profiles p on p.id = s.profile_id
  where s.id = p_socio_id
$$;

create or replace function tenis_nombre_persona(p_socio_id uuid, p_invitado_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_socio_id is not null then tenis_nombre_socio(p_socio_id)
    else (select btrim(coalesce(i.nombre, '') || ' ' || coalesce(i.apellido, ''))
            from tenis_invitados i where i.id = p_invitado_id)
  end
$$;

-- Precio de lista por jugador según modalidad.
create or replace function tenis_precio(p_es_socio boolean, p_modalidad text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_es_socio and p_modalidad = 'singles' then c.precio_socio_single
    when p_es_socio then c.precio_socio_dobles
    when p_modalidad = 'singles' then c.precio_nosocio_single
    else c.precio_nosocio_dobles
  end
  from tenis_config c where c.id
$$;

-- ¿la persona está suspendida en esa fecha?
create or replace function tenis_suspendido(p_socio_id uuid, p_invitado_id uuid, p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenis_suspensiones x
    where x.levantada_at is null
      and p_fecha between x.desde and x.hasta
      and ((p_socio_id is not null and x.socio_id = p_socio_id)
        or (p_invitado_id is not null and x.invitado_id = p_invitado_id))
  )
$$;

-- Cargo de un jugador para un turno:
--   · invitado → precio no socio ('no_socio');
--   · socio con carnet (socio_habilitado_deporte(socio, 'tenis')) sin otro turno
--     no cancelado ese día local → 0 ('carnet_gratis');
--   · socio con carnet que ya tiene otro turno ese día → precio socio ('turno_extra');
--   · resto de los socios → precio socio ('socio').
-- p_excluir_reserva: la reserva que se está armando/corrigiendo (no cuenta como
-- "otro turno").
create or replace function tenis_cargo_jugador(
  p_socio_id        uuid,
  p_invitado_id     uuid,
  p_inicio          timestamptz,
  p_modalidad       text,
  p_excluir_reserva uuid default null
)
returns table (cargo int, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_fecha date := tenis_local(p_inicio)::date;
begin
  if p_modalidad is null or p_modalidad not in ('singles', 'dobles') then
    perform tenis_error('modalidad_invalida');
  end if;
  if (p_socio_id is null) = (p_invitado_id is null) or p_inicio is null then
    perform tenis_error('parametros');
  end if;

  if p_invitado_id is not null then
    return query select tenis_precio(false, p_modalidad), 'no_socio'::text;
    return;
  end if;

  if socio_habilitado_deporte(p_socio_id, 'tenis') then
    if exists (
      select 1
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where j.socio_id = p_socio_id
        and r.estado not in ('cancelada', 'vencida')
        and (p_excluir_reserva is null or r.id <> p_excluir_reserva)
        and r.inicio >= tenis_ts(v_fecha, '00:00')
        and r.inicio <  tenis_ts(v_fecha + 1, '00:00')
    ) then
      return query select tenis_precio(true, p_modalidad), 'turno_extra'::text;
    else
      return query select 0, 'carnet_gratis'::text;
    end if;
    return;
  end if;

  return query select tenis_precio(true, p_modalidad), 'socio'::text;
end;
$$;

-- ¿el instante local cae en la grilla de módulos?
create or replace function tenis_en_grilla(p_local timestamp, p_modulo int)
returns boolean
language sql
immutable
set search_path = public
as $$
  select extract(second from p_local) = 0
     and (extract(hour from p_local)::int * 60 + extract(minute from p_local)::int) % p_modulo = 0
$$;

-- Bloques que rigen en una fecha local, uno por cancha activa (cancha_id null
-- se expande a todas).
create or replace function tenis_bloques_dia(p_fecha date)
returns table (
  bloque_id  uuid,
  cancha_id  uuid,
  tipo       text,
  titulo     text,
  recurrente boolean,
  inicio     timestamptz,
  fin        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, c.id, b.tipo, b.titulo, b.dia_semana is not null,
         tenis_ts(p_fecha, b.hora_desde),
         case when b.hora_hasta = '24:00'::time then tenis_ts(p_fecha + 1, '00:00')
              else tenis_ts(p_fecha, b.hora_hasta) end
  from tenis_bloques b
  join tenis_canchas c on c.activa and (b.cancha_id is null or b.cancha_id = c.id)
  where b.activo
    and (b.fecha = p_fecha
      or (b.dia_semana = extract(isodow from p_fecha)::int
          and (b.vigente_desde is null or p_fecha >= b.vigente_desde)
          and (b.vigente_hasta is null or p_fecha <= b.vigente_hasta)))
$$;

-- Valida cancha, grilla, horario del club y bloques para [p_inicio, p_fin).
create or replace function tenis_validar_turno(p_cancha_id uuid, p_inicio timestamptz, p_fin timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg    tenis_config%rowtype;
  v_ini    timestamp := tenis_local(p_inicio);
  v_fin    timestamp := tenis_local(p_fin);
  v_fecha  date      := tenis_local(p_inicio)::date;
  v_activa boolean;
begin
  select * into v_cfg from tenis_config where id;

  select c.activa into v_activa from tenis_canchas c where c.id = p_cancha_id;
  if not found then
    perform tenis_error('cancha_inexistente');
  end if;
  if not v_activa then
    perform tenis_error('cancha_inactiva');
  end if;

  if p_fin <= p_inicio
     or not tenis_en_grilla(v_ini, v_cfg.modulo_min)
     or not tenis_en_grilla(v_fin, v_cfg.modulo_min) then
    perform tenis_error('horario_invalido');
  end if;
  if v_ini < v_fecha + v_cfg.hora_desde or v_fin > v_fecha + v_cfg.hora_hasta then
    perform tenis_error('fuera_de_horario');
  end if;

  if exists (
    select 1 from tenis_bloques_dia(v_fecha) b
    where b.cancha_id = p_cancha_id and b.inicio < p_fin and b.fin > p_inicio
  ) then
    perform tenis_error('bloqueado');
  end if;
end;
$$;

-- Lock transaccional por clave (cancha o persona), para serializar reservas
-- concurrentes que tocan lo mismo.
create or replace function tenis_lock(p_clave text)
returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('tenis:' || p_clave, 0))
$$;

-- Resuelve un jugador del JSON de entrada a (socio_id, invitado_id):
--   {socio_id}                         → socio vigente
--   {dni}                              → socio vigente con ese DNI, o invitado ya cargado
--   {invitado:{dni,nombre,apellido[,email]}}
--                                      → si el DNI es de un socio vigente, el socio;
--                                        si no, alta/actualización del invitado.
-- p_es_titular: el titular invitado actualiza su nombre y mail; un jugador
-- agregado por otro sólo completa los datos que falten.
create or replace function tenis_resolver_persona(p jsonb, p_es_titular boolean default false)
returns table (socio_id uuid, invitado_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_inv  jsonb;
  v_dni  text;
  v_sid  uuid;
  v_iid  uuid;
  v_nom  text;
  v_ape  text;
  v_mail text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    perform tenis_error('parametros');
  end if;

  if nullif(p->>'socio_id', '') is not null then
    begin
      v_sid := (p->>'socio_id')::uuid;
    exception when invalid_text_representation then
      perform tenis_error('parametros');
    end;
    if not exists (select 1 from socios s where s.id = v_sid) then
      perform tenis_error('socio_no_encontrado');
    end if;
    if not tenis_es_socio_activo(v_sid) then
      perform tenis_error('no_es_socio', tenis_nombre_socio(v_sid));
    end if;
    return query select v_sid, null::uuid;
    return;
  end if;

  if jsonb_typeof(p->'invitado') = 'object' then
    v_inv := p->'invitado';
    v_dni := tenis_norm_dni(v_inv->>'dni');
    if v_dni is null or v_dni !~ '^[0-9A-Z]{5,12}$' then
      perform tenis_error('dni_invalido', v_inv->>'dni');
    end if;

    v_sid := tenis_socio_activo_por_dni(v_dni);
    if v_sid is not null then
      return query select v_sid, null::uuid;
      return;
    end if;

    v_nom  := nullif(btrim(v_inv->>'nombre'), '');
    v_ape  := nullif(btrim(v_inv->>'apellido'), '');
    v_mail := nullif(lower(btrim(v_inv->>'email')), '');

    insert into tenis_invitados as t (dni, nombre, apellido, email)
    values (v_dni, v_nom, v_ape, v_mail)
    on conflict (dni) do update set
      nombre   = case when p_es_titular then coalesce(excluded.nombre, t.nombre)
                      else coalesce(t.nombre, excluded.nombre) end,
      apellido = case when p_es_titular then coalesce(excluded.apellido, t.apellido)
                      else coalesce(t.apellido, excluded.apellido) end,
      email    = case when p_es_titular then coalesce(excluded.email, t.email)
                      else coalesce(t.email, excluded.email) end
    returning t.id, t.nombre, t.apellido into v_iid, v_nom, v_ape;

    if v_nom is null or v_ape is null then
      perform tenis_error('invitado_incompleto', v_dni);
    end if;
    return query select null::uuid, v_iid;
    return;
  end if;

  if nullif(p->>'dni', '') is not null then
    v_dni := tenis_norm_dni(p->>'dni');
    v_sid := tenis_socio_activo_por_dni(v_dni);
    if v_sid is not null then
      return query select v_sid, null::uuid;
      return;
    end if;
    select i.id into v_iid from tenis_invitados i where i.dni = v_dni;
    if v_iid is not null then
      return query select null::uuid, v_iid;
      return;
    end if;
    perform tenis_error('socio_no_encontrado', p->>'dni');
  end if;

  perform tenis_error('parametros');
end;
$$;

-- Suspensión (hoy o el día del turno) y morosidad.
create or replace function tenis_validar_persona(
  p_socio_id    uuid,
  p_invitado_id uuid,
  p_fecha       date,
  p_es_titular  boolean
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nombre text := tenis_nombre_persona(p_socio_id, p_invitado_id);
begin
  if tenis_suspendido(p_socio_id, p_invitado_id, tenis_hoy())
     or tenis_suspendido(p_socio_id, p_invitado_id, p_fecha) then
    perform tenis_error(case when p_es_titular then 'titular_suspendido' else 'jugador_no_habilitado' end, v_nombre);
  end if;

  if p_socio_id is not null
     and (select c.bloquear_morosos from tenis_config c where c.id)
     and (select s.semaforo from socios s where s.id = p_socio_id) = 'rojo' then
    perform tenis_error(case when p_es_titular then 'titular_moroso' else 'jugador_no_habilitado' end, v_nombre);
  end if;
end;
$$;

-- Resumen de una reserva con sus jugadores y el total.
-- p_detalle: agrega número de socio / DNI del invitado (sólo staff).
create or replace function tenis_reserva_resumen(p_reserva_id uuid, p_detalle boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reserva_id',           r.id,
    'cancha_id',            r.cancha_id,
    'cancha_nombre',        c.nombre,
    'inicio',               r.inicio,
    'fin',                  r.fin,
    'modalidad',            r.modalidad,
    'origen',               r.origen,
    'estado',               r.estado,
    'comprobante_estado',   r.comprobante_estado,
    'comprobante_vence_at', r.comprobante_vence_at,
    'jugadores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jugador_id',  j.id,
          'socio_id',    j.socio_id,
          'invitado_id', j.invitado_id,
          'nombre',      tenis_nombre_persona(j.socio_id, j.invitado_id),
          'es_titular',  j.es_titular,
          'cargo',       j.cargo,
          'motivo',      j.motivo_cargo,
          'cobrado',     j.cobrado,
          'check_in_at', j.check_in_at
        ) || case when p_detalle then jsonb_build_object(
          'numero_socio', (select s.numero_socio from socios s where s.id = j.socio_id),
          'dni',          (select i.dni from tenis_invitados i where i.id = j.invitado_id)
        ) else '{}'::jsonb end
        order by j.es_titular desc, tenis_nombre_persona(j.socio_id, j.invitado_id))
      from tenis_reserva_jugadores j where j.reserva_id = r.id
    ), '[]'::jsonb),
    'total', (select coalesce(sum(j.cargo), 0) from tenis_reserva_jugadores j where j.reserva_id = r.id),
    'total_cobrado', (select coalesce(sum(j.cargo), 0) from tenis_reserva_jugadores j
                       where j.reserva_id = r.id and j.cobrado)
  )
  from tenis_reservas r
  join tenis_canchas c on c.id = r.cancha_id
  where r.id = p_reserva_id
$$;

-- Datos para avisar al titular (push a socios por profile_id, mail a invitados).
create or replace function tenis_aviso(p_reserva_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reserva_id',    r.id,
    'cancha_nombre', c.nombre,
    'inicio',        r.inicio,
    'fin',           r.fin,
    'modalidad',     r.modalidad,
    'origen',        r.origen,
    'estado',        r.estado,
    'motivo',        r.cancelacion_motivo,
    'titular', jsonb_build_object(
      'socio_id',    r.titular_socio_id,
      'profile_id',  (select s.profile_id from socios s where s.id = r.titular_socio_id),
      'invitado_id', r.titular_invitado_id,
      'nombre',      tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id),
      'email',       (select i.email from tenis_invitados i where i.id = r.titular_invitado_id)
    )
  )
  from tenis_reservas r
  join tenis_canchas c on c.id = r.cancha_id
  where r.id = p_reserva_id
$$;

-- Registra una infracción. La primera de una persona queda como advertencia
-- (perdonada = true). Devuelve {infraccion_id, advertencia}.
create or replace function tenis_registrar_infraccion(
  p_socio_id    uuid,
  p_invitado_id uuid,
  p_reserva_id  uuid,
  p_tipo        text,
  p_nota        text,
  p_creado_por  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primera boolean;
  v_id      uuid;
begin
  if (p_socio_id is null) = (p_invitado_id is null) then
    perform tenis_error('persona_requerida');
  end if;
  perform tenis_lock(coalesce('s:' || p_socio_id::text, 'i:' || p_invitado_id::text));

  v_primera := not exists (
    select 1 from tenis_infracciones x
    where (p_socio_id is not null and x.socio_id = p_socio_id)
       or (p_invitado_id is not null and x.invitado_id = p_invitado_id)
  );

  insert into tenis_infracciones (socio_id, invitado_id, reserva_id, tipo, nota, perdonada, creado_por)
  values (p_socio_id, p_invitado_id, p_reserva_id, p_tipo,
          case when v_primera
               then coalesce(nullif(btrim(p_nota), '') || ' · ', '') || 'Advertencia: primera infracción'
               else nullif(btrim(p_nota), '') end,
          v_primera, p_creado_por)
  returning id into v_id;

  return jsonb_build_object('infraccion_id', v_id, 'advertencia', v_primera);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Núcleo: crear una reserva
-- ═════════════════════════════════════════════════════════════════════════════
-- Usado por tenis_reservar (socio), tenis_reservar_staff (gestor) y
-- tenis_invitado_reservar (web pública). Orden de locks: cancha y después cada
-- persona (claves ordenadas), así dos reservas concurrentes no se cruzan.
-- p_jugadores: los otros jugadores (sin el titular): singles 1, dobles 3.
-- p_aplicar_limites: 1 por día y 2 activas por titular (el gestor no los aplica).
create or replace function tenis_crear_reserva(
  p_cancha_id           uuid,
  p_inicio              timestamptz,
  p_modalidad           text,
  p_titular_socio_id    uuid,
  p_titular_invitado_id uuid,
  p_jugadores           jsonb,
  p_origen              text,
  p_estado              text,
  p_aplicar_limites     boolean,
  p_creado_por          uuid,
  p_hold_vence_at       timestamptz default null,
  p_token_hash          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     tenis_config%rowtype;
  v_ahora   timestamptz := tenis_ahora();
  v_fin     timestamptz;
  v_fecha   date;
  v_socios  uuid[] := array[p_titular_socio_id];
  v_invs    uuid[] := array[p_titular_invitado_id];
  v_item    jsonb;
  v_p       record;
  v_c       record;
  v_claves  text[] := '{}';
  v_clave   text;
  v_id      uuid;
  i         int;
begin
  select * into v_cfg from tenis_config where id;

  if p_modalidad is null or p_modalidad not in ('singles', 'dobles') then
    perform tenis_error('modalidad_invalida');
  end if;
  if p_cancha_id is null or p_inicio is null
     or (p_titular_socio_id is null) = (p_titular_invitado_id is null) then
    perform tenis_error('parametros');
  end if;

  v_fin   := p_inicio + make_interval(mins => case when p_modalidad = 'singles'
                                                   then v_cfg.singles_min else v_cfg.dobles_min end);
  v_fecha := tenis_local(p_inicio)::date;

  if p_inicio <= v_ahora then
    perform tenis_error('pasado');
  end if;
  if v_fecha > tenis_hoy() + v_cfg.anticipacion_dias then
    perform tenis_error('anticipacion');
  end if;

  perform tenis_lock('cancha:' || p_cancha_id::text);
  perform tenis_validar_turno(p_cancha_id, p_inicio, v_fin);

  -- Jugadores: cantidad exacta y sin repetidos (el titular no va en la lista).
  if p_jugadores is null or jsonb_typeof(p_jugadores) <> 'array' then
    perform tenis_error('parametros');
  end if;
  if jsonb_array_length(p_jugadores) <> (case when p_modalidad = 'singles' then 1 else 3 end) then
    perform tenis_error('cantidad_jugadores');
  end if;

  for v_item in select e from jsonb_array_elements(p_jugadores) e loop
    select * into v_p from tenis_resolver_persona(v_item, false);
    for i in 1 .. array_length(v_socios, 1) loop
      if (v_p.socio_id is not null and v_socios[i] = v_p.socio_id)
         or (v_p.invitado_id is not null and v_invs[i] = v_p.invitado_id) then
        perform tenis_error('jugadores_duplicados', tenis_nombre_persona(v_p.socio_id, v_p.invitado_id));
      end if;
    end loop;
    v_socios := array_append(v_socios, v_p.socio_id);
    v_invs   := array_append(v_invs, v_p.invitado_id);
  end loop;

  -- Locks por persona, en orden.
  for i in 1 .. array_length(v_socios, 1) loop
    v_claves := array_append(v_claves,
      coalesce('s:' || v_socios[i]::text, 'i:' || v_invs[i]::text));
  end loop;
  for v_clave in select k from unnest(v_claves) k order by k loop
    perform tenis_lock(v_clave);
  end loop;

  for i in 1 .. array_length(v_socios, 1) loop
    perform tenis_validar_persona(v_socios[i], v_invs[i], v_fecha, i = 1);

    -- Nadie puede estar en dos turnos que se pisan (en cualquier cancha).
    if exists (
      select 1
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
        and r.rango && tstzrange(p_inicio, v_fin, '[)')
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    ) then
      perform tenis_error('jugador_ocupado', tenis_nombre_persona(v_socios[i], v_invs[i]));
    end if;
  end loop;

  -- Límites del titular.
  if p_aplicar_limites then
    if (
      select count(*) from tenis_reservas r
      where (r.titular_socio_id = p_titular_socio_id or r.titular_invitado_id = p_titular_invitado_id)
        and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada', 'no_show')
        and r.inicio >= tenis_ts(v_fecha, '00:00')
        and r.inicio <  tenis_ts(v_fecha + 1, '00:00')
    ) >= v_cfg.max_reservas_dia then
      perform tenis_error('limite_dia');
    end if;

    if (
      select count(*) from tenis_reservas r
      where (r.titular_socio_id = p_titular_socio_id or r.titular_invitado_id = p_titular_invitado_id)
        and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada')
        and r.fin > v_ahora
    ) >= v_cfg.max_activas then
      perform tenis_error('limite_activas');
    end if;
  end if;

  begin
    insert into tenis_reservas (
      cancha_id, inicio, fin, modalidad, origen, titular_socio_id, titular_invitado_id,
      estado, hold_vence_at, confirmacion_token_hash, creado_por
    ) values (
      p_cancha_id, p_inicio, v_fin, p_modalidad, p_origen, p_titular_socio_id, p_titular_invitado_id,
      p_estado, p_hold_vence_at, p_token_hash, p_creado_por
    )
    returning id into v_id;
  exception when exclusion_violation then
    perform tenis_error('turno_ocupado');
  end;

  -- Cargos en orden (titular primero): el carnet gratis lo define cada jugador.
  for i in 1 .. array_length(v_socios, 1) loop
    select * into v_c from tenis_cargo_jugador(v_socios[i], v_invs[i], p_inicio, p_modalidad, v_id);
    insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, cargo, motivo_cargo)
    values (v_id, v_socios[i], v_invs[i], i = 1, v_c.cargo, v_c.motivo);
  end loop;

  return tenis_reserva_resumen(v_id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC del socio
-- ═════════════════════════════════════════════════════════════════════════════

-- Grilla de un día para el socio: ocupación sin nombres de otras personas.
-- items: reservas vivas y bloques; tipo de reserva = reserva_web | reserva_telefonica
-- | reserva_invitado | extension; tipo de bloque = el del bloque.
-- mio = el socio logueado juega en esa reserva (sólo entonces viaja reserva_id).
create or replace function tenis_disponibilidad(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_socio uuid := get_socio_id();
  v_cfg   tenis_config%rowtype;
begin
  if v_socio is null and not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_fecha is null then
    perform tenis_error('parametros');
  end if;
  select * into v_cfg from tenis_config where id;

  return jsonb_build_object(
    'fecha',   p_fecha,
    'ahora',   tenis_ahora(),
    'config',  to_jsonb(v_cfg) - 'id' - 'updated_by' - 'updated_at',
    'canchas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'superficie', c.superficie,
                                          'luz', c.luz, 'orden', c.orden) order by c.orden, c.nombre)
      from tenis_canchas c where c.activa
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(x.item order by x.orden, x.inicio)
      from (
        select c.orden, r.inicio,
               jsonb_build_object(
                 'cancha_id',  r.cancha_id,
                 'inicio',     r.inicio,
                 'fin',        r.fin,
                 'tipo',       case r.origen when 'socio' then 'reserva_web'
                                             when 'telefonica' then 'reserva_telefonica'
                                             when 'invitado' then 'reserva_invitado'
                                             else 'extension' end,
                 'titulo',     case when m.mio then 'Mi reserva' else 'Reservado' end,
                 'recurrente', false,
                 'mio',        m.mio,
                 'reserva_id', case when m.mio then r.id end,
                 'estado',     case when m.mio then r.estado end
               ) as item
        from tenis_reservas r
        join tenis_canchas c on c.id = r.cancha_id and c.activa
        cross join lateral (
          select exists (select 1 from tenis_reserva_jugadores j
                          where j.reserva_id = r.id and j.socio_id = v_socio) as mio
        ) m
        where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
          and r.inicio >= tenis_ts(p_fecha, '00:00')
          and r.inicio <  tenis_ts(p_fecha + 1, '00:00')
        union all
        select c.orden, b.inicio,
               jsonb_build_object(
                 'cancha_id',  b.cancha_id,
                 'inicio',     b.inicio,
                 'fin',        b.fin,
                 'tipo',       b.tipo,
                 'titulo',     b.titulo,
                 'recurrente', b.recurrente,
                 'mio',        false,
                 'bloque_id',  b.bloque_id
               )
        from tenis_bloques_dia(p_fecha) b
        join tenis_canchas c on c.id = b.cancha_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Buscador de jugadores del padrón: hasta 20 socios vigentes por nombre (cada
-- palabra, sin tildes, en cualquier orden), número de socio exacto o DNI exacto.
-- Excluye al propio socio, a los suspendidos y (si bloquear_morosos) a los de
-- semáforo rojo. Devuelve sólo id, nombre y número de socio.
create or replace function tenis_buscar_jugadores(p_q text)
returns table (socio_id uuid, nombre text, numero_socio text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_q     text := btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g'));
  v_dni   text := tenis_norm_dni(p_q);
  v_yo    uuid := get_socio_id();
  v_hoy   date := tenis_hoy();
  v_moros boolean := (select c.bloquear_morosos from tenis_config c where c.id);
begin
  if v_yo is null and not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if length(v_q) < 2 then
    return;
  end if;

  return query
  select s.id, tenis_nombre_socio(s.id), s.numero_socio
  from socios s
  left join profiles p on p.id = s.profile_id
  left join categorias_socio cs on cs.id = s.categoria_id
  where s.estado <> 'inactivo'
    and coalesce(cs.nombre, '') <> 'Cliente Gimnasio'
    and (v_yo is null or s.id <> v_yo)
    and not (v_moros and coalesce(s.semaforo, '') = 'rojo')
    and not tenis_suspendido(s.id, null, v_hoy)
    and (
      s.numero_socio = v_q
      or (v_dni is not null and length(v_dni) >= 6 and tenis_norm_dni(s.dni) = v_dni)
      or not exists (
        select 1 from unnest(string_to_array(v_q, ' ')) w
        where w <> ''
          and position(lower(unaccent(w)) in
                       lower(unaccent(coalesce(nullif(btrim(s.nombre_padron), ''), p.nombre, '')))) = 0
      )
    )
  order by 2
  limit 20;
end;
$$;

-- Reserva del socio logueado (titular). p_jugadores: [{socio_id} | {dni} |
-- {invitado:{dni,nombre,apellido}}], sin el titular (singles 1, dobles 3).
create or replace function tenis_reservar(
  p_cancha_id uuid,
  p_inicio    timestamptz,
  p_modalidad text,
  p_jugadores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_socio uuid := get_socio_id();
begin
  if v_socio is null then
    perform tenis_error('sin_socio');
  end if;
  if not tenis_es_socio_activo(v_socio) then
    perform tenis_error('no_es_socio');
  end if;
  return tenis_crear_reserva(p_cancha_id, p_inicio, p_modalidad, v_socio, null, p_jugadores,
                             'socio', 'confirmada', true, auth.uid());
end;
$$;

-- Cancelar: el titular hasta cancelacion_horas antes del turno; el gestor siempre
-- (mientras el turno no haya terminado). La devolución, si corresponde, la paga
-- la administración en efectivo: acá sólo queda registrada la cancelación.
create or replace function tenis_cancelar(p_reserva_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      tenis_reservas%rowtype;
  v_gestor boolean := es_gestor_tenis();
  v_socio  uuid := get_socio_id();
  v_horas  int := (select c.cancelacion_horas from tenis_config c where c.id);
  v_ahora  timestamptz := tenis_ahora();
begin
  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;

  if not v_gestor then
    if v_socio is null or v_r.titular_socio_id is distinct from v_socio then
      perform tenis_error('no_autorizado');
    end if;
    if v_r.estado <> 'confirmada' then
      perform tenis_error('estado_invalido');
    end if;
    if v_r.inicio - make_interval(hours => v_horas) < v_ahora then
      perform tenis_error('fuera_de_plazo');
    end if;
  else
    if v_r.estado not in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada') then
      perform tenis_error('estado_invalido');
    end if;
    if v_r.fin <= v_ahora then
      perform tenis_error('reserva_finalizada');
    end if;
  end if;

  update tenis_reservas
     set estado = 'cancelada',
         cancelada_por = auth.uid(),
         cancelada_at = v_ahora,
         cancelacion_motivo = nullif(btrim(p_motivo), ''),
         hold_vence_at = null
   where id = p_reserva_id;

  return tenis_aviso(p_reserva_id);
end;
$$;

-- Reservas del socio logueado (como titular o jugador): desde 30 días atrás,
-- sin vencidas. puede_cancelar sólo para el titular, confirmada y en plazo.
create or replace function tenis_mis_reservas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_socio uuid := get_socio_id();
  v_ahora timestamptz := tenis_ahora();
  v_horas int := (select c.cancelacion_horas from tenis_config c where c.id);
begin
  if v_socio is null then
    perform tenis_error('sin_socio');
  end if;

  return coalesce((
    select jsonb_agg(
      tenis_reserva_resumen(r.id) || jsonb_build_object(
        'es_titular',       r.titular_socio_id = v_socio,
        'mi_cargo',         j.cargo,
        'mi_motivo',        j.motivo_cargo,
        'mi_cobrado',       j.cobrado,
        'cancelable_hasta', r.inicio - make_interval(hours => v_horas),
        'puede_cancelar',   r.titular_socio_id = v_socio and r.estado = 'confirmada'
                            and r.inicio - make_interval(hours => v_horas) >= v_ahora
      ) order by r.inicio)
    from tenis_reservas r
    join tenis_reserva_jugadores j on j.reserva_id = r.id and j.socio_id = v_socio
    where r.estado <> 'vencida'
      and r.inicio >= v_ahora - interval '30 days'
  ), '[]'::jsonb);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC del gestor (y del canchero donde se indica)
-- ═════════════════════════════════════════════════════════════════════════════

-- Grilla completa de un día (gestor y canchero): como disponibilidad pero con
-- jugadores, cargos, cobro, check-in y comprobante.
create or replace function tenis_grilla(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg tenis_config%rowtype;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_fecha is null then
    perform tenis_error('parametros');
  end if;
  select * into v_cfg from tenis_config where id;

  return jsonb_build_object(
    'fecha',   p_fecha,
    'ahora',   tenis_ahora(),
    'config',  to_jsonb(v_cfg) - 'id' - 'updated_by' - 'updated_at',
    'canchas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'superficie', c.superficie,
                                          'luz', c.luz, 'orden', c.orden) order by c.orden, c.nombre)
      from tenis_canchas c where c.activa
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(x.item order by x.orden, x.inicio)
      from (
        select c.orden, r.inicio,
               tenis_reserva_resumen(r.id, true) || jsonb_build_object(
                 'tipo',              case r.origen when 'socio' then 'reserva_web'
                                                    when 'telefonica' then 'reserva_telefonica'
                                                    when 'invitado' then 'reserva_invitado'
                                                    else 'extension' end,
                 'titulo',            tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id),
                 'recurrente',        false,
                 'mio',               false,
                 'titular', jsonb_build_object(
                   'tipo',        case when r.titular_socio_id is not null then 'socio' else 'invitado' end,
                   'socio_id',    r.titular_socio_id,
                   'invitado_id', r.titular_invitado_id,
                   'nombre',      tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id)
                 ),
                 'tiene_comprobante', r.comprobante_path is not null,
                 'check_ins', (select count(*) from tenis_reserva_jugadores j
                                where j.reserva_id = r.id and j.check_in_at is not null)
               ) as item
        from tenis_reservas r
        join tenis_canchas c on c.id = r.cancha_id and c.activa
        where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada', 'no_show')
          and r.inicio >= tenis_ts(p_fecha, '00:00')
          and r.inicio <  tenis_ts(p_fecha + 1, '00:00')
        union all
        select c.orden, b.inicio,
               jsonb_build_object(
                 'cancha_id',  b.cancha_id,
                 'inicio',     b.inicio,
                 'fin',        b.fin,
                 'tipo',       b.tipo,
                 'titulo',     b.titulo,
                 'recurrente', b.recurrente,
                 'mio',        false,
                 'bloque_id',  b.bloque_id,
                 -- Para editar el bloque desde la grilla sin pisar su vigencia ni
                 -- pasarlo a una sola cancha (bloque_cancha_id null = todas).
                 'bloque_cancha_id', tb.cancha_id,
                 'dia_semana',       tb.dia_semana,
                 'vigente_desde',    tb.vigente_desde,
                 'vigente_hasta',    tb.vigente_hasta
               )
        from tenis_bloques_dia(p_fecha) b
        join tenis_canchas c on c.id = b.cancha_id
        join tenis_bloques tb on tb.id = b.bloque_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Reserva telefónica (gestor): mismas reglas de grilla, horario, bloques,
-- suspensión y morosidad, SIN el límite por día ni el de activas.
-- p_titular: {socio_id} | {dni} | {invitado:{dni,nombre,apellido[,email]}}.
create or replace function tenis_reservar_staff(
  p_cancha_id uuid,
  p_inicio    timestamptz,
  p_modalidad text,
  p_jugadores jsonb,
  p_titular   jsonb,
  p_origen    text default 'telefonica'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if coalesce(p_origen, 'telefonica') <> 'telefonica' then
    perform tenis_error('origen_invalido');
  end if;
  select * into v_t from tenis_resolver_persona(p_titular, true);
  return tenis_crear_reserva(p_cancha_id, p_inicio, p_modalidad, v_t.socio_id, v_t.invitado_id,
                             p_jugadores, 'telefonica', 'confirmada', false, auth.uid());
end;
$$;

-- Crea o edita un bloque. p: {id?, cancha_id?, tipo, titulo, dia_semana? | fecha?,
-- hora_desde, hora_hasta, vigente_desde?, vigente_hasta?, activo?}.
-- Un recurrente sin vigente_desde arranca hoy. No toca reservas existentes
-- (para eso está tenis_bloqueo_puntual).
create or replace function tenis_bloque_guardar(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_cancha    uuid;
  v_dia       int;
  v_fecha     date;
  v_vig_desde date;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    perform tenis_error('parametros');
  end if;

  begin
    v_id        := nullif(p->>'id', '')::uuid;
    v_cancha    := nullif(p->>'cancha_id', '')::uuid;
    v_dia       := nullif(p->>'dia_semana', '')::int;
    v_fecha     := nullif(p->>'fecha', '')::date;
    v_vig_desde := nullif(p->>'vigente_desde', '')::date;
    if v_dia is not null and v_vig_desde is null then
      v_vig_desde := tenis_hoy();
    end if;

    if v_cancha is not null and not exists (select 1 from tenis_canchas c where c.id = v_cancha) then
      perform tenis_error('cancha_inexistente');
    end if;

    if v_id is null then
      insert into tenis_bloques (cancha_id, tipo, titulo, dia_semana, fecha, hora_desde, hora_hasta,
                                 vigente_desde, vigente_hasta, activo, creado_por)
      values (v_cancha, p->>'tipo', btrim(p->>'titulo'), v_dia, v_fecha,
              (p->>'hora_desde')::time, (p->>'hora_hasta')::time,
              v_vig_desde, nullif(p->>'vigente_hasta', '')::date,
              coalesce((p->>'activo')::boolean, true), auth.uid())
      returning id into v_id;
    else
      update tenis_bloques set
        cancha_id     = v_cancha,
        tipo          = p->>'tipo',
        titulo        = btrim(p->>'titulo'),
        dia_semana    = v_dia,
        fecha         = v_fecha,
        hora_desde    = (p->>'hora_desde')::time,
        hora_hasta    = (p->>'hora_hasta')::time,
        vigente_desde = v_vig_desde,
        vigente_hasta = nullif(p->>'vigente_hasta', '')::date,
        activo        = coalesce((p->>'activo')::boolean, activo)
      where id = v_id;
      if not found then
        perform tenis_error('bloque_inexistente');
      end if;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation
         or invalid_datetime_format or datetime_field_overflow then
      perform tenis_error('bloque_invalido');
  end;

  return v_id;
end;
$$;

create or replace function tenis_bloque_borrar(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  delete from tenis_bloques where id = p_id;
  if not found then
    perform tenis_error('bloque_inexistente');
  end if;
  return true;
end;
$$;

-- Bloqueo puntual (lluvia, mantenimiento): crea un bloque de un día y cancela
-- las reservas vivas que se pisan con [p_desde, p_hasta) en esa cancha (o en
-- todas si p_cancha_id es null). Devuelve {bloque_id, reservas_canceladas:[ids],
-- reservas:[aviso]} para que tenis-gestion avise a cada titular.
create or replace function tenis_bloqueo_puntual(
  p_cancha_id uuid,
  p_desde     timestamptz,
  p_hasta     timestamptz,
  p_tipo      text default 'no_disponible',
  p_titulo    text default 'No disponible'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha  date;
  v_hasta  time;
  v_bloque uuid;
  v_ids    uuid[];
  v_c      uuid;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or tenis_local(p_hasta - interval '1 microsecond')::date <> tenis_local(p_desde)::date then
    perform tenis_error('bloque_invalido');
  end if;
  if p_cancha_id is not null and not exists (select 1 from tenis_canchas c where c.id = p_cancha_id) then
    perform tenis_error('cancha_inexistente');
  end if;

  -- Mismo lock que toma una reserva en curso: ninguna se cuela entre el bloque y la cancelación.
  for v_c in select c.id from tenis_canchas c
              where p_cancha_id is null or c.id = p_cancha_id order by c.id loop
    perform tenis_lock('cancha:' || v_c::text);
  end loop;

  v_fecha := tenis_local(p_desde)::date;
  v_hasta := case when tenis_local(p_hasta)::date > v_fecha then '24:00'::time
                  else tenis_local(p_hasta)::time end;

  begin
    insert into tenis_bloques (cancha_id, tipo, titulo, fecha, hora_desde, hora_hasta, creado_por)
    values (p_cancha_id, coalesce(p_tipo, 'no_disponible'),
            coalesce(nullif(btrim(p_titulo), ''), 'No disponible'),
            v_fecha, tenis_local(p_desde)::time, v_hasta, auth.uid())
    returning id into v_bloque;
  exception when check_violation then
    perform tenis_error('bloque_invalido');
  end;

  with canceladas as (
    update tenis_reservas r
       set estado = 'cancelada',
           cancelada_por = auth.uid(),
           cancelada_at = tenis_ahora(),
           cancelacion_motivo = coalesce(nullif(btrim(p_titulo), ''), 'No disponible'),
           hold_vence_at = null
     where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada')
       and r.fin > tenis_ahora()
       and (p_cancha_id is null or r.cancha_id = p_cancha_id)
       and r.rango && tstzrange(p_desde, p_hasta, '[)')
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from canceladas;

  return jsonb_build_object(
    'bloque_id',           v_bloque,
    'reservas_canceladas', to_jsonb(v_ids),
    'reservas', coalesce((select jsonb_agg(tenis_aviso(x)) from unnest(v_ids) x), '[]'::jsonb)
  );
end;
$$;

-- Reglas y precios. p: claves de tenis_config a cambiar (las ausentes quedan igual).
create or replace function tenis_config_guardar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg tenis_config%rowtype;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    perform tenis_error('parametros');
  end if;

  begin
    update tenis_config c set
      hora_desde              = coalesce((p->>'hora_desde')::time, c.hora_desde),
      hora_hasta              = coalesce((p->>'hora_hasta')::time, c.hora_hasta),
      modulo_min              = coalesce((p->>'modulo_min')::int, c.modulo_min),
      margen_inicio_min       = coalesce((p->>'margen_inicio_min')::int, c.margen_inicio_min),
      singles_min             = coalesce((p->>'singles_min')::int, c.singles_min),
      dobles_min              = coalesce((p->>'dobles_min')::int, c.dobles_min),
      max_reservas_dia        = coalesce((p->>'max_reservas_dia')::int, c.max_reservas_dia),
      max_activas             = coalesce((p->>'max_activas')::int, c.max_activas),
      anticipacion_dias       = coalesce((p->>'anticipacion_dias')::int, c.anticipacion_dias),
      cancelacion_horas       = coalesce((p->>'cancelacion_horas')::int, c.cancelacion_horas),
      comprobante_horas_antes = coalesce((p->>'comprobante_horas_antes')::int, c.comprobante_horas_antes),
      hold_min                = coalesce((p->>'hold_min')::int, c.hold_min),
      alias_pago              = coalesce(nullif(btrim(p->>'alias_pago'), ''), c.alias_pago),
      precio_socio_single     = coalesce((p->>'precio_socio_single')::int, c.precio_socio_single),
      precio_socio_dobles     = coalesce((p->>'precio_socio_dobles')::int, c.precio_socio_dobles),
      precio_nosocio_single   = coalesce((p->>'precio_nosocio_single')::int, c.precio_nosocio_single),
      precio_nosocio_dobles   = coalesce((p->>'precio_nosocio_dobles')::int, c.precio_nosocio_dobles),
      bloquear_morosos        = coalesce((p->>'bloquear_morosos')::boolean, c.bloquear_morosos),
      updated_by              = auth.uid()
    where c.id
    returning * into v_cfg;
  exception
    when check_violation or invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range then
      perform tenis_error('config_invalida');
  end;

  return to_jsonb(v_cfg) - 'id';
end;
$$;

-- Comprobantes de invitados esperando revisión (gestor y canchero).
create or replace function tenis_comprobantes_pendientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;

  return coalesce((
    select jsonb_agg(
      tenis_reserva_resumen(r.id, true) || jsonb_build_object(
        'comprobante_path', r.comprobante_path,
        'titular', jsonb_build_object(
          'invitado_id', i.id,
          'nombre',      btrim(coalesce(i.nombre, '') || ' ' || coalesce(i.apellido, '')),
          'dni',         i.dni,
          'email',       i.email
        )
      ) order by r.inicio)
    from tenis_reservas r
    left join tenis_invitados i on i.id = r.titular_invitado_id
    where r.estado = 'pendiente_comprobante'
      and r.comprobante_estado = 'pendiente'
  ), '[]'::jsonb);
end;
$$;

-- Aprobar: la reserva queda confirmada y todos los cargos cobrados (la
-- transferencia cubre el total). Rechazar exige motivo; el invitado puede volver
-- a subir otro comprobante hasta el plazo. Devuelve el aviso (con el mail del
-- invitado) para que tenis-gestion le escriba.
create or replace function tenis_comprobante_resolver(p_reserva_id uuid, p_aprobado boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r tenis_reservas%rowtype;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_r.estado <> 'pendiente_comprobante' or v_r.comprobante_estado is distinct from 'pendiente' then
    perform tenis_error('estado_invalido');
  end if;
  if p_aprobado is null then
    perform tenis_error('parametros');
  end if;

  if p_aprobado then
    update tenis_reservas
       set estado = 'confirmada', comprobante_estado = 'aprobado', comprobante_motivo = null
     where id = p_reserva_id;
    update tenis_reserva_jugadores
       set cobrado = true, cobrado_por = auth.uid(), cobrado_at = tenis_ahora()
     where reserva_id = p_reserva_id and not cobrado;
  else
    if nullif(btrim(p_motivo), '') is null then
      perform tenis_error('motivo_requerido');
    end if;
    update tenis_reservas
       set comprobante_estado = 'rechazado', comprobante_motivo = btrim(p_motivo)
     where id = p_reserva_id;
  end if;

  return tenis_aviso(p_reserva_id) || jsonb_build_object(
    'aprobado',             p_aprobado,
    'comprobante_estado',   case when p_aprobado then 'aprobado' else 'rechazado' end,
    'comprobante_motivo',   case when p_aprobado then null else btrim(p_motivo) end,
    'comprobante_vence_at', v_r.comprobante_vence_at
  );
end;
$$;

-- Infracciones (último año, más nuevas primero) y suspensiones vigentes o futuras.
-- {infracciones:[...], suspensiones:[...]}; cada infracción trae cuántas tiene
-- la persona sin perdonar y su suspensión vigente.
create or replace function tenis_infracciones_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := tenis_hoy();
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;

  return jsonb_build_object(
    'infracciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            x.id,
        'socio_id',      x.socio_id,
        'invitado_id',   x.invitado_id,
        'nombre',        tenis_nombre_persona(x.socio_id, x.invitado_id),
        'tipo',          x.tipo,
        'nota',          x.nota,
        'perdonada',     x.perdonada,
        'automatica',    x.creado_por is null,
        'reserva_id',    x.reserva_id,
        'reserva_inicio', (select r.inicio from tenis_reservas r where r.id = x.reserva_id),
        'created_at',    x.created_at,
        'infracciones_persona', (
          select count(*) from tenis_infracciones y
          where not y.perdonada
            and ((x.socio_id is not null and y.socio_id = x.socio_id)
              or (x.invitado_id is not null and y.invitado_id = x.invitado_id))
        ),
        'suspendido', tenis_suspendido(x.socio_id, x.invitado_id, v_hoy)
      ) order by x.created_at desc)
      from (
        select * from tenis_infracciones
        where created_at >= tenis_ahora() - interval '365 days'
        order by created_at desc
        limit 500
      ) x
    ), '[]'::jsonb),
    'suspensiones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          s.id,
        'socio_id',    s.socio_id,
        'invitado_id', s.invitado_id,
        'nombre',      tenis_nombre_persona(s.socio_id, s.invitado_id),
        'desde',       s.desde,
        'hasta',       s.hasta,
        'motivo',      s.motivo,
        'created_at',  s.created_at
      ) order by s.desde)
      from tenis_suspensiones s
      where s.levantada_at is null and s.hasta >= v_hoy
    ), '[]'::jsonb)
  );
end;
$$;

-- Infracción manual (gestor). Misma regla: la primera de la persona es advertencia.
create or replace function tenis_infraccion_crear(
  p_socio_id    uuid,
  p_invitado_id uuid,
  p_reserva_id  uuid,
  p_tipo        text,
  p_nota        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p_tipo is null or p_tipo not in ('no_show', 'jugadores_incorrectos', 'otra') then
    perform tenis_error('parametros');
  end if;
  return tenis_registrar_infraccion(p_socio_id, p_invitado_id, p_reserva_id, p_tipo, p_nota, auth.uid());
end;
$$;

create or replace function tenis_infraccion_perdonar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  update tenis_infracciones set perdonada = true where id = p_id;
  if not found then
    perform tenis_error('infraccion_inexistente');
  end if;
  return jsonb_build_object('id', p_id, 'perdonada', true);
end;
$$;

-- Suspensión de p_dias días desde hoy (inclusive): hoy .. hoy + p_dias - 1.
-- No cancela reservas ya hechas; impide reservar y ser agregado.
create or replace function tenis_suspender(p_socio_id uuid, p_invitado_id uuid, p_dias int, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := tenis_hoy();
  v_id  uuid;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if (p_socio_id is null) = (p_invitado_id is null) then
    perform tenis_error('persona_requerida');
  end if;
  if p_dias is null or p_dias not between 1 and 365 then
    perform tenis_error('dias_invalidos');
  end if;
  if (p_socio_id is not null and not exists (select 1 from socios s where s.id = p_socio_id))
     or (p_invitado_id is not null and not exists (select 1 from tenis_invitados i where i.id = p_invitado_id)) then
    perform tenis_error('persona_requerida');
  end if;

  insert into tenis_suspensiones (socio_id, invitado_id, desde, hasta, motivo, creado_por)
  values (p_socio_id, p_invitado_id, v_hoy, v_hoy + p_dias - 1, nullif(btrim(p_motivo), ''), auth.uid())
  returning id into v_id;

  return jsonb_build_object('suspension_id', v_id, 'desde', v_hoy, 'hasta', v_hoy + p_dias - 1);
end;
$$;

create or replace function tenis_suspension_levantar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := tenis_ahora();
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  update tenis_suspensiones
     set levantada_at = v_at, levantada_por = auth.uid()
   where id = p_id and levantada_at is null;
  if not found then
    perform tenis_error('suspension_inexistente');
  end if;
  return jsonb_build_object('suspension_id', p_id, 'levantada_at', v_at);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC del canchero (también gestor)
-- ═════════════════════════════════════════════════════════════════════════════

-- Check-in por DNI (tipeado) o por número de socio (QR del carnet,
-- "<numero_socio>:<código>"); exactamente uno de los dos. Busca al socio
-- (socios) o al invitado (tenis_invitados, sólo por DNI) y su reserva en la
-- ventana [inicio - 15 min, fin]. El código TOTP del QR no se valida acá (lo
-- valida socios-qr en el escáner de la puerta): el canchero ve el nombre.
-- resultado:
--   suspendido            → suspendido hoy (no se registra el ingreso)
--   sin_reserva           → DNI desconocido o sin reserva en la ventana
--   comprobante_pendiente → reserva de invitado sin comprobante aprobado
--   ok                    → check_in_at y, para socios, fila en accesos (punto 'tenis')
create or replace function tenis_checkin(p_dni text default null, p_numero_socio text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dni     text := tenis_norm_dni(p_dni);
  v_numero  text := nullif(btrim(coalesce(p_numero_socio, '')), '');
  v_ahora   timestamptz := tenis_ahora();
  v_socio   socios%rowtype;
  v_inv     uuid;
  v_persona jsonb;
  v_susp    boolean;
  v_j       tenis_reserva_jugadores%rowtype;
  v_estado  text;
  v_res     text;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if (p_dni is null) = (v_numero is null) then
    perform tenis_error('parametros');
  end if;

  if v_numero is not null then
    select s.* into v_socio from socios s
    where s.numero_socio = v_numero
    order by (s.estado <> 'inactivo') desc
    limit 1;
  else
    if v_dni is null then
      perform tenis_error('dni_invalido');
    end if;
    select s.* into v_socio from socios s
    where tenis_norm_dni(s.dni) = v_dni
    order by (s.estado <> 'inactivo') desc
    limit 1;
    select i.id into v_inv from tenis_invitados i where i.dni = v_dni;
  end if;

  if v_socio.id is null and v_inv is null then
    return jsonb_build_object('persona', null, 'reserva', null, 'jugador', null,
                              'suspendido', false, 'resultado', 'sin_reserva');
  end if;

  if v_socio.id is not null then
    v_persona := jsonb_build_object(
      'tipo', 'socio', 'socio_id', v_socio.id, 'invitado_id', null,
      'nombre', tenis_nombre_socio(v_socio.id), 'numero_socio', v_socio.numero_socio,
      'dni', v_socio.dni, 'semaforo', v_socio.semaforo,
      'es_socio_activo', tenis_es_socio_activo(v_socio.id));
  else
    v_persona := jsonb_build_object(
      'tipo', 'invitado', 'socio_id', null, 'invitado_id', v_inv,
      'nombre', tenis_nombre_persona(null, v_inv), 'numero_socio', null,
      'dni', v_dni, 'semaforo', null, 'es_socio_activo', false);
  end if;

  v_susp := tenis_suspendido(v_socio.id, null, tenis_hoy()) or tenis_suspendido(null, v_inv, tenis_hoy());

  select j.* into v_j
  from tenis_reserva_jugadores j
  join tenis_reservas r on r.id = j.reserva_id
  where ((v_socio.id is not null and j.socio_id = v_socio.id) or (v_inv is not null and j.invitado_id = v_inv))
    and r.estado in ('confirmada', 'pendiente_comprobante')
    and v_ahora >= r.inicio - interval '15 minutes'
    and v_ahora <= r.fin
  order by r.inicio
  limit 1
  for update of j;

  if v_j.id is not null then
    select r.estado into v_estado from tenis_reservas r where r.id = v_j.reserva_id;
  end if;

  v_res := case
    when v_susp then 'suspendido'
    when v_j.id is null then 'sin_reserva'
    when v_estado = 'pendiente_comprobante' then 'comprobante_pendiente'
    else 'ok'
  end;

  if v_res = 'ok' and v_j.check_in_at is null then
    update tenis_reserva_jugadores
       set check_in_at = v_ahora, check_in_por = auth.uid()
     where id = v_j.id
    returning * into v_j;
    if v_j.socio_id is not null then
      insert into accesos (socio_id, punto, semaforo) values (v_j.socio_id, 'tenis', v_socio.semaforo);
    end if;
  end if;

  return jsonb_build_object(
    'persona',    v_persona,
    'reserva',    case when v_j.id is not null then tenis_reserva_resumen(v_j.reserva_id, true) end,
    'jugador',    case when v_j.id is not null then jsonb_build_object(
                    'jugador_id', v_j.id, 'cargo', v_j.cargo, 'motivo', v_j.motivo_cargo,
                    'cobrado', v_j.cobrado, 'check_in_at', v_j.check_in_at) end,
    'suspendido', v_susp,
    'resultado',  v_res
  );
end;
$$;

-- Corrige los jugadores (sin el titular) antes de entrar: reemplaza la lista,
-- conserva cobro y check-in de los que siguen y recalcula los cargos no cobrados.
-- p_registrar_infraccion: además anota 'jugadores_incorrectos' al titular.
create or replace function tenis_jugadores_corregir(
  p_reserva_id           uuid,
  p_jugadores            jsonb,
  p_registrar_infraccion boolean default false,
  p_nota                 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      tenis_reservas%rowtype;
  v_socios uuid[];
  v_invs   uuid[];
  v_item   jsonb;
  v_p      record;
  v_j      record;
  v_c      record;
  v_clave  text;
  v_inf    jsonb;
  i        int;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_r.estado not in ('confirmada', 'pendiente_comprobante') then
    perform tenis_error('estado_invalido');
  end if;
  if v_r.fin <= tenis_ahora() then
    perform tenis_error('reserva_finalizada');
  end if;
  if p_jugadores is null or jsonb_typeof(p_jugadores) <> 'array' then
    perform tenis_error('parametros');
  end if;
  if jsonb_array_length(p_jugadores) <> (case when v_r.modalidad = 'singles' then 1 else 3 end) then
    perform tenis_error('cantidad_jugadores');
  end if;

  v_socios := array[v_r.titular_socio_id];
  v_invs   := array[v_r.titular_invitado_id];
  for v_item in select e from jsonb_array_elements(p_jugadores) e loop
    select * into v_p from tenis_resolver_persona(v_item, false);
    for i in 1 .. array_length(v_socios, 1) loop
      if (v_p.socio_id is not null and v_socios[i] = v_p.socio_id)
         or (v_p.invitado_id is not null and v_invs[i] = v_p.invitado_id) then
        perform tenis_error('jugadores_duplicados', tenis_nombre_persona(v_p.socio_id, v_p.invitado_id));
      end if;
    end loop;
    v_socios := array_append(v_socios, v_p.socio_id);
    v_invs   := array_append(v_invs, v_p.invitado_id);
  end loop;

  for v_clave in
    select k from unnest(v_socios, v_invs) as u(s, iv)
    cross join lateral (select coalesce('s:' || u.s::text, 'i:' || u.iv::text) as k) kk
    order by k
  loop
    perform tenis_lock(v_clave);
  end loop;

  -- Validar sólo a los que se suman.
  for i in 2 .. array_length(v_socios, 1) loop
    if not exists (
      select 1 from tenis_reserva_jugadores j
      where j.reserva_id = p_reserva_id
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    ) then
      perform tenis_validar_persona(v_socios[i], v_invs[i], tenis_local(v_r.inicio)::date, false);
      if exists (
        select 1
        from tenis_reserva_jugadores j
        join tenis_reservas r on r.id = j.reserva_id
        where r.id <> p_reserva_id
          and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
          and r.rango && v_r.rango
          and ((v_socios[i] is not null and j.socio_id = v_socios[i])
            or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
      ) then
        perform tenis_error('jugador_ocupado', tenis_nombre_persona(v_socios[i], v_invs[i]));
      end if;
    end if;
  end loop;

  -- Sacar a los que ya no están y sumar a los nuevos.
  delete from tenis_reserva_jugadores j
   where j.reserva_id = p_reserva_id
     and not j.es_titular
     and not exists (
       select 1 from unnest(v_socios, v_invs) as u(s, iv)
       where (u.s is not null and u.s = j.socio_id) or (u.iv is not null and u.iv = j.invitado_id)
     );

  for i in 2 .. array_length(v_socios, 1) loop
    insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, cargo)
    select p_reserva_id, v_socios[i], v_invs[i], false, 0
    where not exists (
      select 1 from tenis_reserva_jugadores j
      where j.reserva_id = p_reserva_id
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    );
  end loop;

  -- Recalcular los cargos que no se cobraron todavía.
  for v_j in select * from tenis_reserva_jugadores where reserva_id = p_reserva_id and not cobrado loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, v_r.inicio, v_r.modalidad, p_reserva_id);
    update tenis_reserva_jugadores set cargo = v_c.cargo, motivo_cargo = v_c.motivo where id = v_j.id;
  end loop;

  if coalesce(p_registrar_infraccion, false) then
    v_inf := tenis_registrar_infraccion(v_r.titular_socio_id, v_r.titular_invitado_id, p_reserva_id,
                                        'jugadores_incorrectos', p_nota, auth.uid());
  end if;

  return tenis_reserva_resumen(p_reserva_id, true) || jsonb_build_object('infraccion', v_inf);
end;
$$;

create or replace function tenis_cobro_marcar(p_jugador_id uuid, p_cobrado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j tenis_reserva_jugadores%rowtype;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_cobrado is null then
    perform tenis_error('parametros');
  end if;
  update tenis_reserva_jugadores
     set cobrado     = p_cobrado,
         cobrado_por = case when p_cobrado then auth.uid() end,
         cobrado_at  = case when p_cobrado then tenis_ahora() end
   where id = p_jugador_id
  returning * into v_j;
  if not found then
    perform tenis_error('jugador_inexistente');
  end if;
  return jsonb_build_object('jugador_id', v_j.id, 'reserva_id', v_j.reserva_id,
                            'cargo', v_j.cargo, 'cobrado', v_j.cobrado, 'cobrado_at', v_j.cobrado_at);
end;
$$;

-- Extensión: los jugadores de p_reserva_origen siguen en una cancha libre
-- (p_cancha_id, la misma u otra) desde el fin de su turno hasta p_hasta.
-- Crea una reserva origen 'extension' con los mismos jugadores (ya presentes:
-- check-in ahora) y cargo de un turno más (el carnet ya usó el gratis del día).
create or replace function tenis_extension(p_cancha_id uuid, p_hasta timestamptz, p_reserva_origen uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o     tenis_reservas%rowtype;
  v_ahora timestamptz := tenis_ahora();
  v_id    uuid;
  v_j     record;
  v_c     record;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  select * into v_o from tenis_reservas where id = p_reserva_origen for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_o.estado not in ('confirmada', 'jugada') then
    perform tenis_error('estado_invalido');
  end if;
  if p_cancha_id is null or p_hasta is null or p_hasta <= greatest(v_o.fin, v_ahora) then
    perform tenis_error('extension_invalida');
  end if;

  perform tenis_lock('cancha:' || p_cancha_id::text);
  perform tenis_validar_turno(p_cancha_id, v_o.fin, p_hasta);

  begin
    insert into tenis_reservas (cancha_id, inicio, fin, modalidad, origen, titular_socio_id,
                                titular_invitado_id, estado, creado_por)
    values (p_cancha_id, v_o.fin, p_hasta, v_o.modalidad, 'extension', v_o.titular_socio_id,
            v_o.titular_invitado_id, 'confirmada', auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    perform tenis_error('turno_ocupado');
  end;

  for v_j in select * from tenis_reserva_jugadores where reserva_id = p_reserva_origen
             order by es_titular desc loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, v_o.fin, v_o.modalidad, v_id);
    insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, cargo, motivo_cargo,
                                         check_in_at, check_in_por)
    values (v_id, v_j.socio_id, v_j.invitado_id, v_j.es_titular, v_c.cargo, v_c.motivo, v_ahora, auth.uid());
  end loop;

  return tenis_reserva_resumen(v_id, true);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC de service_role (tenis-invitados y tenis-cron)
-- ═════════════════════════════════════════════════════════════════════════════

-- Hold de un invitado desde la web pública. p_titular: {dni, nombre, apellido,
-- email}; p_jugadores: [{dni} (socio por DNI) | {invitado:{dni,nombre,apellido}}]
-- (sin socio_id: la web no conoce ids del padrón). Un socio no reserva por acá
-- (titular_es_socio): lo hace desde la app. El turno tiene que dejar tiempo para
-- confirmar y subir el comprobante (plazo_invitado).
create or replace function tenis_invitado_reservar(
  p_cancha_id  uuid,
  p_inicio     timestamptz,
  p_modalidad  text,
  p_titular    jsonb,
  p_jugadores  jsonb,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg   tenis_config%rowtype;
  v_ahora timestamptz := tenis_ahora();
  v_dni   text;
  v_mail  text;
  v_t     record;
  v_hold  timestamptz;
  v_res   jsonb;
begin
  select * into v_cfg from tenis_config where id;
  if p_titular is null or jsonb_typeof(p_titular) <> 'object'
     or p_token_hash is null or length(p_token_hash) < 32 or p_inicio is null then
    perform tenis_error('parametros');
  end if;

  v_dni  := tenis_norm_dni(p_titular->>'dni');
  v_mail := nullif(lower(btrim(p_titular->>'email')), '');
  if v_dni is null or v_dni !~ '^[0-9A-Z]{5,12}$' then
    perform tenis_error('dni_invalido');
  end if;
  if nullif(btrim(p_titular->>'nombre'), '') is null or nullif(btrim(p_titular->>'apellido'), '') is null then
    perform tenis_error('invitado_incompleto');
  end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform tenis_error('email_invalido');
  end if;
  if tenis_socio_activo_por_dni(v_dni) is not null then
    perform tenis_error('titular_es_socio');
  end if;
  if p_jugadores is not null and jsonb_typeof(p_jugadores) = 'array' and exists (
    select 1 from jsonb_array_elements(p_jugadores) e where e ? 'socio_id'
  ) then
    perform tenis_error('parametros');
  end if;
  if p_inicio - make_interval(hours => v_cfg.comprobante_horas_antes)
     <= v_ahora + make_interval(mins => v_cfg.hold_min) then
    perform tenis_error('plazo_invitado');
  end if;

  select * into v_t from tenis_resolver_persona(jsonb_build_object('invitado', p_titular), true);
  v_hold := v_ahora + make_interval(mins => v_cfg.hold_min);

  v_res := tenis_crear_reserva(p_cancha_id, p_inicio, p_modalidad, null, v_t.invitado_id, p_jugadores,
                               'invitado', 'pendiente_confirmacion', true, null, v_hold, p_token_hash);

  return v_res || jsonb_build_object('hold_vence_at', v_hold);
end;
$$;

-- Confirmación por el link del mail. Idempotente: si ya estaba confirmada
-- devuelve los mismos datos (la web la usa también para mostrar el estado).
create or replace function tenis_invitado_confirmar(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r     tenis_reservas%rowtype;
  v_ahora timestamptz := tenis_ahora();
  v_horas int := (select c.comprobante_horas_antes from tenis_config c where c.id);
begin
  if p_token_hash is null then
    perform tenis_error('token_invalido');
  end if;
  select * into v_r from tenis_reservas where confirmacion_token_hash = p_token_hash for update;
  if not found then
    perform tenis_error('token_invalido');
  end if;

  if v_r.estado = 'pendiente_confirmacion' then
    if v_r.hold_vence_at <= v_ahora then
      perform tenis_error('hold_vencido');
    end if;
    update tenis_reservas
       set estado = 'pendiente_comprobante',
           hold_vence_at = null,
           comprobante_vence_at = v_r.inicio - make_interval(hours => v_horas)
     where id = v_r.id;
  elsif v_r.estado = 'vencida' then
    perform tenis_error('hold_vencido');
  elsif v_r.estado = 'cancelada' then
    perform tenis_error('reserva_cancelada', coalesce(v_r.cancelacion_motivo, ''));
  elsif v_r.estado not in ('pendiente_comprobante', 'confirmada', 'jugada') then
    perform tenis_error('estado_invalido');
  end if;

  return tenis_reserva_resumen(v_r.id) || jsonb_build_object(
    'alias',              (select c.alias_pago from tenis_config c where c.id),
    'comprobante_motivo', (select r.comprobante_motivo from tenis_reservas r where r.id = v_r.id),
    'titular_nombre',     tenis_nombre_persona(null, v_r.titular_invitado_id)
  );
end;
$$;

-- Registra el comprobante ya subido (signed upload URL de tenis-invitados).
-- Acepta reemplazar uno pendiente o uno rechazado, hasta comprobante_vence_at.
create or replace function tenis_invitado_comprobante(p_reserva_id uuid, p_token_hash text, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r tenis_reservas%rowtype;
begin
  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if not found or p_token_hash is null or v_r.confirmacion_token_hash is distinct from p_token_hash then
    perform tenis_error('token_invalido');
  end if;
  if v_r.estado <> 'pendiente_comprobante' or v_r.comprobante_estado = 'aprobado' then
    perform tenis_error('estado_invalido');
  end if;
  if v_r.comprobante_vence_at <= tenis_ahora() then
    perform tenis_error('comprobante_vencido');
  end if;
  if p_path is null or p_path not like p_reserva_id::text || '/%' or p_path like '%..%' then
    perform tenis_error('path_invalido');
  end if;

  update tenis_reservas
     set comprobante_path = p_path, comprobante_estado = 'pendiente', comprobante_motivo = null
   where id = p_reserva_id;

  return jsonb_build_object('reserva_id', p_reserva_id, 'comprobante_estado', 'pendiente',
                            'comprobante_path', p_path, 'comprobante_vence_at', v_r.comprobante_vence_at);
end;
$$;

-- Cron (tenis-cron cada 5 min):
--   1. holds vencidos (pendiente_confirmacion) → vencida;
--   2. pendiente_comprobante sin comprobante (o con uno rechazado) pasado el
--      plazo → cancelada. Uno esperando revisión no se cancela: lo resuelve el
--      gestor/canchero;
--   3. confirmada cuyo fin pasó → jugada si alguien hizo check-in; si no,
--      no_show: el precio de lista de cada jugador que no pagó se le carga al
--      titular (motivo 'no_show') y se registra una infracción automática (la
--      primera de la persona queda como advertencia);
--   4. borra los intentos del rate limit de la web (tenis_invitados_intentos)
--      de más de 24 h (las ventanas de tenis-invitados son de 1 h).
-- Devuelve el resumen para que tenis-cron avise (push/mail).
create or replace function tenis_procesar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora   timestamptz := tenis_ahora();
  v_holds   jsonb := '[]'::jsonb;
  v_comp    jsonb := '[]'::jsonb;
  v_jugadas jsonb := '[]'::jsonb;
  v_noshows jsonb := '[]'::jsonb;
  v_r       record;
  v_total   int;
  v_inf     jsonb;
begin
  for v_r in
    select * from tenis_reservas
    where estado = 'pendiente_confirmacion' and hold_vence_at <= v_ahora
    for update skip locked
  loop
    update tenis_reservas set estado = 'vencida' where id = v_r.id;
    v_holds := v_holds || jsonb_build_array(tenis_aviso(v_r.id));
  end loop;

  for v_r in
    select * from tenis_reservas
    where estado = 'pendiente_comprobante'
      and comprobante_vence_at <= v_ahora
      and comprobante_estado is distinct from 'pendiente'
    for update skip locked
  loop
    update tenis_reservas
       set estado = 'cancelada', cancelada_at = v_ahora,
           cancelacion_motivo = 'No se recibió el comprobante a tiempo'
     where id = v_r.id;
    v_comp := v_comp || jsonb_build_array(tenis_aviso(v_r.id));
  end loop;

  for v_r in
    select * from tenis_reservas
    where estado = 'confirmada' and fin <= v_ahora
    for update skip locked
  loop
    if exists (select 1 from tenis_reserva_jugadores j
                where j.reserva_id = v_r.id and j.check_in_at is not null) then
      update tenis_reservas set estado = 'jugada' where id = v_r.id;
      v_jugadas := v_jugadas || jsonb_build_array(v_r.id);
    else
      select coalesce(sum(tenis_precio(j.socio_id is not null, v_r.modalidad)), 0)::int into v_total
      from tenis_reserva_jugadores j
      where j.reserva_id = v_r.id and not j.cobrado;

      update tenis_reserva_jugadores
         set cargo = 0, motivo_cargo = 'no_show'
       where reserva_id = v_r.id and not es_titular and not cobrado;

      update tenis_reserva_jugadores
         set cargo        = case when cobrado then cargo else 0 end + v_total,
             motivo_cargo = 'no_show',
             cobrado      = cobrado and v_total = 0,
             cobrado_por  = case when cobrado and v_total = 0 then cobrado_por end,
             cobrado_at   = case when cobrado and v_total = 0 then cobrado_at end
       where reserva_id = v_r.id and es_titular;

      update tenis_reservas set estado = 'no_show' where id = v_r.id;

      v_inf := tenis_registrar_infraccion(v_r.titular_socio_id, v_r.titular_invitado_id, v_r.id,
                                          'no_show', 'Ausencia sin aviso (automática)', null);

      v_noshows := v_noshows || jsonb_build_array(
        tenis_aviso(v_r.id) || jsonb_build_object(
          'cargo_titular', v_total,
          'infraccion_id', v_inf->'infraccion_id',
          'advertencia',   v_inf->'advertencia'
        ));
    end if;
  end loop;

  delete from tenis_invitados_intentos where created_at < v_ahora - interval '24 hours';

  return jsonb_build_object(
    'ahora',                 v_ahora,
    'holds_vencidos',        v_holds,
    'comprobantes_vencidos', v_comp,
    'jugadas',               v_jugadas,
    'no_shows',              v_noshows
  );
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Permisos
-- ═════════════════════════════════════════════════════════════════════════════
-- Supabase da EXECUTE a anon/authenticated por default privileges: se revoca
-- explícito. Internos: sin EXECUTE para nadie (los llaman las SECURITY DEFINER).

revoke execute on function tenis_local(timestamptz)                         from public, anon, authenticated;
revoke execute on function tenis_ts(date, time)                             from public, anon, authenticated;
revoke execute on function tenis_hoy()                                      from public, anon, authenticated;
revoke execute on function tenis_error(text, text)                          from public, anon, authenticated;
revoke execute on function tenis_norm_dni(text)                             from public, anon, authenticated;
revoke execute on function tenis_es_socio_activo(uuid)                      from public, anon, authenticated;
revoke execute on function tenis_socio_activo_por_dni(text)                 from public, anon, authenticated;
revoke execute on function tenis_nombre_socio(uuid)                         from public, anon, authenticated;
revoke execute on function tenis_nombre_persona(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function tenis_precio(boolean, text)                      from public, anon, authenticated;
revoke execute on function tenis_en_grilla(timestamp, int)                  from public, anon, authenticated;
revoke execute on function tenis_bloques_dia(date)                          from public, anon, authenticated;
revoke execute on function tenis_validar_turno(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function tenis_lock(text)                                 from public, anon, authenticated;
revoke execute on function tenis_resolver_persona(jsonb, boolean)           from public, anon, authenticated;
revoke execute on function tenis_validar_persona(uuid, uuid, date, boolean) from public, anon, authenticated;
revoke execute on function tenis_reserva_resumen(uuid, boolean)             from public, anon, authenticated;
revoke execute on function tenis_aviso(uuid)                                from public, anon, authenticated;
revoke execute on function tenis_registrar_infraccion(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function tenis_crear_reserva(uuid, timestamptz, text, uuid, uuid, jsonb, text, text, boolean, uuid, timestamptz, text)
  from public, anon, authenticated;

-- Helpers del contrato: authenticated + service_role.
revoke execute on function tenis_ahora()                                    from public, anon;
revoke execute on function es_gestor_tenis()                                from public, anon;
revoke execute on function es_canchero()                                    from public, anon;
revoke execute on function tenis_cargo_jugador(uuid, uuid, timestamptz, text, uuid) from public, anon;
revoke execute on function tenis_suspendido(uuid, uuid, date)               from public, anon;
grant  execute on function tenis_ahora()                                    to authenticated, service_role;
grant  execute on function es_gestor_tenis()                                to authenticated, service_role;
grant  execute on function es_canchero()                                    to authenticated, service_role;
grant  execute on function tenis_cargo_jugador(uuid, uuid, timestamptz, text, uuid) to authenticated, service_role;
grant  execute on function tenis_suspendido(uuid, uuid, date)               to authenticated, service_role;

-- RPC del socio, gestor y canchero: authenticated (cada una valida su rol).
revoke execute on function tenis_disponibilidad(date)                                   from public, anon;
revoke execute on function tenis_buscar_jugadores(text)                                 from public, anon;
revoke execute on function tenis_reservar(uuid, timestamptz, text, jsonb)               from public, anon;
revoke execute on function tenis_cancelar(uuid, text)                                   from public, anon;
revoke execute on function tenis_mis_reservas()                                         from public, anon;
revoke execute on function tenis_grilla(date)                                           from public, anon;
revoke execute on function tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text) from public, anon;
revoke execute on function tenis_bloque_guardar(jsonb)                                  from public, anon;
revoke execute on function tenis_bloque_borrar(uuid)                                    from public, anon;
revoke execute on function tenis_bloqueo_puntual(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function tenis_config_guardar(jsonb)                                  from public, anon;
revoke execute on function tenis_comprobantes_pendientes()                              from public, anon;
revoke execute on function tenis_comprobante_resolver(uuid, boolean, text)              from public, anon;
revoke execute on function tenis_infracciones_listar()                                  from public, anon;
revoke execute on function tenis_infraccion_crear(uuid, uuid, uuid, text, text)         from public, anon;
revoke execute on function tenis_infraccion_perdonar(uuid)                              from public, anon;
revoke execute on function tenis_suspender(uuid, uuid, int, text)                       from public, anon;
revoke execute on function tenis_suspension_levantar(uuid)                              from public, anon;
revoke execute on function tenis_checkin(text, text)                                          from public, anon;
revoke execute on function tenis_jugadores_corregir(uuid, jsonb, boolean, text)         from public, anon;
revoke execute on function tenis_cobro_marcar(uuid, boolean)                            from public, anon;
revoke execute on function tenis_extension(uuid, timestamptz, uuid)                     from public, anon;

grant execute on function tenis_disponibilidad(date)                                    to authenticated, service_role;
grant execute on function tenis_buscar_jugadores(text)                                  to authenticated, service_role;
grant execute on function tenis_reservar(uuid, timestamptz, text, jsonb)                to authenticated, service_role;
grant execute on function tenis_cancelar(uuid, text)                                    to authenticated, service_role;
grant execute on function tenis_mis_reservas()                                          to authenticated, service_role;
grant execute on function tenis_grilla(date)                                            to authenticated, service_role;
grant execute on function tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function tenis_bloque_guardar(jsonb)                                   to authenticated, service_role;
grant execute on function tenis_bloque_borrar(uuid)                                     to authenticated, service_role;
grant execute on function tenis_bloqueo_puntual(uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
grant execute on function tenis_config_guardar(jsonb)                                   to authenticated, service_role;
grant execute on function tenis_comprobantes_pendientes()                               to authenticated, service_role;
grant execute on function tenis_comprobante_resolver(uuid, boolean, text)               to authenticated, service_role;
grant execute on function tenis_infracciones_listar()                                   to authenticated, service_role;
grant execute on function tenis_infraccion_crear(uuid, uuid, uuid, text, text)          to authenticated, service_role;
grant execute on function tenis_infraccion_perdonar(uuid)                               to authenticated, service_role;
grant execute on function tenis_suspender(uuid, uuid, int, text)                        to authenticated, service_role;
grant execute on function tenis_suspension_levantar(uuid)                               to authenticated, service_role;
grant execute on function tenis_checkin(text, text)                                           to authenticated, service_role;
grant execute on function tenis_jugadores_corregir(uuid, jsonb, boolean, text)          to authenticated, service_role;
grant execute on function tenis_cobro_marcar(uuid, boolean)                             to authenticated, service_role;
grant execute on function tenis_extension(uuid, timestamptz, uuid)                      to authenticated, service_role;

-- Sólo service_role (Edge Functions tenis-invitados y tenis-cron).
revoke execute on function tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function tenis_invitado_confirmar(text)                                  from public, anon, authenticated;
revoke execute on function tenis_invitado_comprobante(uuid, text, text)                    from public, anon, authenticated;
revoke execute on function tenis_procesar()                                                from public, anon, authenticated;
grant  execute on function tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text) to service_role;
grant  execute on function tenis_invitado_confirmar(text)                                  to service_role;
grant  execute on function tenis_invitado_comprobante(uuid, text, text)                    to service_role;
grant  execute on function tenis_procesar()                                                to service_role;

-- ─── Cron (NO se agenda acá) ─────────────────────────────────────────────────
-- Cuando tenis-cron esté deployada (--no-verify-jwt) y el secret CRON_SECRET
-- cargado, agendarla a mano cada 5 minutos:
--
-- SELECT cron.schedule(
--   'tenis-cron',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/tenis-cron',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
--
-- Para darlo de baja: SELECT cron.unschedule('tenis-cron');
