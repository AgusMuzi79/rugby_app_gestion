-- Pruebas de la migración 20261202000000_tenis_checkin_turnos_carnet: en el check-in, el
-- canchero ve si el jugador tiene el beneficio del carnet de tenis (servicio o categoría
-- "Becado Tenis") y qué turno del día es éste (1º gratis, los siguientes a precio socio).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_checkin_turnos_carnet.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs que tenis_paridad.sql (copiados: cada archivo corre solo, dentro de una
-- transacción que termina en ROLLBACK). Las reservas se cargan directo en las tablas (con
-- created_at explícito) para fijar el orden en que se reservaron.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create extension if not exists unaccent;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table profiles (
  id         uuid primary key,
  rol        text not null,
  roles      text[],
  nombre     text not null default '',
  activo     boolean not null default true,
  deporte    text
);

create or replace function get_rol() returns text language sql security definer stable as $$
  select rol from profiles where id = auth.uid()
$$;

create table categorias_socio (id uuid primary key, nombre text not null);
create table socios (
  id            uuid primary key,
  profile_id    uuid references profiles(id),
  numero_socio  text,
  dni           text not null,
  estado        text not null default 'pendiente',
  categoria_id  uuid references categorias_socio(id),
  semaforo      text,
  nombre_padron text
);

create or replace function get_socio_id() returns uuid language sql security definer stable as $$
  select id from socios where profile_id = auth.uid()
$$;

create table servicios_opcionales (id uuid primary key, nombre text not null, activo boolean not null default true);
create table socio_servicios (
  socio_id    uuid references socios(id),
  servicio_id uuid references servicios_opcionales(id),
  primary key (socio_id, servicio_id)
);

-- Real (20261026000000_recordatorio_eventos).
create or replace function socio_habilitado_deporte(p_socio_id uuid, p_deporte text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from socio_servicios ss
    join servicios_opcionales so on so.id = ss.servicio_id
    where ss.socio_id = p_socio_id and so.activo and so.nombre ilike '%' || p_deporte || '%'
  ) or exists (
    select 1 from socios s
    join categorias_socio cs on cs.id = s.categoria_id
    where s.id = p_socio_id and cs.nombre ilike 'becado%' and cs.nombre ilike '%' || p_deporte || '%'
  )
$$;

create table accesos (
  id        uuid primary key default gen_random_uuid(),
  socio_id  uuid references socios(id),
  punto     text not null default 'gimnasio',
  semaforo  text,
  creado_en timestamptz not null default now()
);

create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Perfiles: p1..p7 socios, pg gestor (subcomisión tenis), pr subcomisión rugby,
-- pc canchero, pa admin.
-- Socios: S1 y S3 con Carnet Tenis; S2 y S4 sin carnet; S5 semáforo rojo;
-- S6 dado de baja; S7 Cliente Gimnasio.

insert into categorias_socio values
  ('c0000000-0000-0000-0000-000000000001', 'Socio Activo'),
  ('c0000000-0000-0000-0000-000000000002', 'Cliente Gimnasio');

insert into profiles (id, rol, roles, nombre, deporte) values
  ('a0000000-0000-0000-0000-000000000001', 'socio', '{socio}', 'Perfil Uno', null),
  ('a0000000-0000-0000-0000-000000000002', 'socio', '{socio}', 'Perfil Dos', null),
  ('a0000000-0000-0000-0000-000000000003', 'socio', '{socio}', 'Perfil Tres', null),
  ('a0000000-0000-0000-0000-000000000004', 'socio', '{socio}', 'Perfil Cuatro', null),
  ('a0000000-0000-0000-0000-000000000005', 'socio', '{socio}', 'Perfil Cinco', null),
  ('a0000000-0000-0000-0000-000000000006', 'socio', '{socio}', 'Perfil Seis', null),
  ('a0000000-0000-0000-0000-000000000007', 'cliente_gimnasio', '{cliente_gimnasio}', 'Perfil Siete', null),
  ('a0000000-0000-0000-0000-0000000000a1', 'subcomision', '{subcomision,socio}', 'Gestora Tenis', 'tenis'),
  ('a0000000-0000-0000-0000-0000000000a2', 'subcomision', '{subcomision}', 'Subco Rugby', 'rugby'),
  ('a0000000-0000-0000-0000-0000000000a3', 'canchero', '{canchero}', 'Canchero', null),
  ('a0000000-0000-0000-0000-0000000000a4', 'admin', '{admin}', 'Admin', null);

insert into socios (id, profile_id, numero_socio, dni, estado, categoria_id, semaforo, nombre_padron) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '1001', '20.111.001', 'pendiente', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Pérez Juan'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '1002', '20111002', 'activo', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Gómez Ana'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '1003', '20111003', 'activo', 'c0000000-0000-0000-0000-000000000001', 'amarillo', 'López Tomás'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', '1004', '20111004', 'activo', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Díaz Sofía'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', '1005', '20111005', 'activo', 'c0000000-0000-0000-0000-000000000001', 'rojo', 'Ruiz Pablo'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', '1006', '20111006', 'inactivo', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Sosa Laura'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000007', '1007', '20111007', 'activo', 'c0000000-0000-0000-0000-000000000002', 'verde', 'Vera Marta');

insert into servicios_opcionales values
  ('d0000000-0000-0000-0000-000000000001', 'Tenis Carnet', true),
  ('d0000000-0000-0000-0000-000000000002', 'Gimnasio', true);
insert into socio_servicios values
  ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002');

-- S8: sin servicio, con la categoría "Becado Tenis" (cuenta como el carnet).
insert into categorias_socio values ('c0000000-0000-0000-0000-000000000003', 'Becado Tenis');
insert into profiles (id, rol, roles, nombre) values
  ('a0000000-0000-0000-0000-000000000008', 'socio', '{socio}', 'Perfil Ocho');
insert into socios (id, profile_id, numero_socio, dni, estado, categoria_id, semaforo, nombre_padron) values
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000008', '1008', '20111008', 'activo',
   'c0000000-0000-0000-0000-000000000003', 'verde', 'Benítez Iara');

-- ─── Migraciones bajo prueba ──────────────────────────────────────────────────

\ir ../migrations/20261112000000_reservas_tenis.sql
\ir ../migrations/20261125000000_tenis_aviso_jugadores.sql
\ir ../migrations/20261126000000_tenis_editar_reserva.sql
\ir ../migrations/20261127000000_tenis_detalles_edicion.sql
\ir ../migrations/20261128000000_tenis_paridad_ondepor.sql
\ir ../migrations/20261202000000_tenis_checkin_turnos_carnet.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create or replace function tenis_ahora() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('test.ahora', true), ''), '2026-11-20 10:00:00-03')::timestamptz
$$;

create function pg_temp.ahora(p text) returns void language sql as $$
  select set_config('test.ahora', p || '-03', false)
$$;
create function pg_temp.so(n int) returns uuid language sql as $$
  select ('b0000000-0000-0000-0000-00000000000' || n)::uuid
$$;
create function pg_temp.ca(n int) returns uuid language sql as $$
  select id from tenis_canchas where nombre = lpad(n::text, 2, '0')
$$;
create function pg_temp.t(p text) returns timestamptz language sql as $$
  select (p || '-03')::timestamptz
$$;
create function pg_temp.espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLO [%]: esperado %, obtenido %', p_msg, p_esperado, p_real;
  end if;
  raise notice 'ok   - %', p_msg;
end $$;

create temp table t_ids (k text primary key, id uuid);
create function pg_temp.id(k text) returns uuid language sql as $$ select id from t_ids where t_ids.k = $1 $$;

-- Reserva cargada a mano: clave, cancha, inicio y fin locales, estado, origen, socio titular
-- (null = el invitado 30111777) y cuándo se reservó.
create function pg_temp.res(k text, p_cancha int, p_ini text, p_fin text, p_estado text, p_origen text,
                            p_titular int, p_creada text) returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into tenis_reservas (cancha_id, inicio, fin, modalidad, origen, titular_socio_id, titular_invitado_id,
                              estado, created_at)
  values (pg_temp.ca(p_cancha), pg_temp.t(p_ini), pg_temp.t(p_fin), 'singles', p_origen,
          case when p_titular is not null then pg_temp.so(p_titular) end,
          case when p_titular is null then (select id from tenis_invitados where dni = '30111777') end,
          p_estado, pg_temp.t(p_creada))
  returning id into v_id;
  insert into t_ids values (k, v_id);
end $$;
create function pg_temp.jug(k text, p_socio int, p_cargo int, p_motivo text, p_titular boolean) returns void language sql as $$
  insert into tenis_reserva_jugadores (reserva_id, socio_id, es_titular, cargo, motivo_cargo)
  values (pg_temp.id(k), pg_temp.so(p_socio), p_titular, p_cargo, p_motivo);
$$;
create function pg_temp.jug_inv(k text, p_cargo int) returns void language sql as $$
  insert into tenis_reserva_jugadores (reserva_id, invitado_id, es_titular, cargo, motivo_cargo)
  values (pg_temp.id(k), (select id from tenis_invitados where dni = '30111777'), false, p_cargo, 'no_socio');
$$;

-- resultado:carnet/turnos_dia/turno_n/motivo/cargo del check-in por DNI.
create function pg_temp.ci(p_dni text) returns text language plpgsql as $$
declare
  v jsonb := tenis_checkin(p_dni);
begin
  return coalesce(v->>'resultado', '?') || ':' || coalesce(v->'jugador'->>'carnet', 'null') || '/'
      || coalesce(v->'jugador'->>'turnos_dia', 'null') || '/' || coalesce(v->'jugador'->>'turno_n', 'null') || '/'
      || coalesce(v->'jugador'->>'motivo', 'null') || '/' || coalesce(v->'jugador'->>'cargo', 'null');
end $$;

-- ─── Datos: sábado 2026-11-21 ─────────────────────────────────────────────────
-- S1 (carnet): 'a' 18:00 reservada primero (gratis), 'b' 11:00 reservada después (precio
--   socio); 'y' vencida y 'x' cancelada reservadas antes que todas; 'z' es del domingo.
-- S2 (sin carnet) juega en 'b'. S3 (carnet) un solo turno 'c', con un invitado.
-- S8 (Becado Tenis): 'd' 08:00 ya jugada, 'e' 11:00 (precio socio) y después una extensión.

insert into tenis_invitados (dni, nombre, apellido) values ('30111777', 'Ana', 'Paz');

select pg_temp.res('y', 3, '2026-11-21 09:00', '2026-11-21 10:00', 'vencida',    'socio', 1, '2026-11-19 07:00');
select pg_temp.jug('y', 1, 0, 'carnet_gratis', true);
select pg_temp.res('x', 3, '2026-11-21 15:00', '2026-11-21 16:00', 'cancelada',  'socio', 1, '2026-11-19 08:00');
select pg_temp.jug('x', 1, 0, 'carnet_gratis', true);
select pg_temp.res('a', 1, '2026-11-21 18:00', '2026-11-21 19:00', 'confirmada', 'socio', 1, '2026-11-19 09:00');
select pg_temp.jug('a', 1, 0, 'carnet_gratis', true);
select pg_temp.res('b', 2, '2026-11-21 11:00', '2026-11-21 12:00', 'confirmada', 'socio', 1, '2026-11-19 09:30');
select pg_temp.jug('b', 1, 9000, 'turno_extra', true);
select pg_temp.jug('b', 2, 9000, 'socio', false);
select pg_temp.res('z', 1, '2026-11-22 10:00', '2026-11-22 11:00', 'confirmada', 'socio', 1, '2026-11-18 09:00');
select pg_temp.jug('z', 1, 0, 'carnet_gratis', true);

select pg_temp.res('c', 4, '2026-11-21 11:00', '2026-11-21 12:00', 'confirmada', 'socio', 3, '2026-11-19 10:00');
select pg_temp.jug('c', 3, 0, 'carnet_gratis', true);
select pg_temp.jug_inv('c', 16000);

select pg_temp.res('d', 5, '2026-11-21 08:00', '2026-11-21 09:00', 'jugada',     'socio', 8, '2026-11-19 11:00');
select pg_temp.jug('d', 8, 0, 'carnet_gratis', true);
select pg_temp.res('e', 5, '2026-11-21 11:00', '2026-11-21 12:00', 'confirmada', 'socio', 8, '2026-11-19 12:00');
select pg_temp.jug('e', 8, 9000, 'turno_extra', true);

select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a3', false);  -- canchero

-- ═════════════════════════════════════════════════════════════════════════════
-- Check-in a las 10:50
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.ahora('2026-11-21 10:50');

select pg_temp.espera(pg_temp.ci('20.111.001'), 'ok:true/2/2/turno_extra/9000',
  'carnet: el turno que empieza antes pero se reservó segundo es el 2º (paga como socio)');
select pg_temp.espera(pg_temp.ci('20111002'), 'ok:false/1/1/socio/9000',
  'socio sin carnet: carnet false, igual devuelve sus turnos');
select pg_temp.espera(pg_temp.ci('20111003'), 'ok:true/1/1/carnet_gratis/0',
  'carnet con un solo turno: 1º de 1, sin cargo');
select pg_temp.espera(pg_temp.ci('30111777'), 'ok:false/1/1/no_socio/16000',
  'invitado: carnet false');
select pg_temp.espera(pg_temp.ci('20111008'), 'ok:true/2/2/turno_extra/9000',
  'Becado Tenis cuenta como carnet; el turno ya jugado cuenta');

select pg_temp.espera((select string_agg(k, ',' order by k) from jsonb_object_keys(
  tenis_checkin('20111003')->'jugador') k where k in ('carnet', 'turnos_dia', 'turno_n', 'motivo', 'a_designar', 'pendiente')),
  'a_designar,carnet,motivo,pendiente,turno_n,turnos_dia', 'jugador: campos nuevos junto a los de siempre');

-- ═════════════════════════════════════════════════════════════════════════════
-- Check-in a las 17:50: el turno de la tarde se reservó primero
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.ahora('2026-11-21 17:50');
select pg_temp.espera(pg_temp.ci('20111001'), 'ok:true/2/1/carnet_gratis/0',
  'carnet: el reservado primero es el 1º aunque empiece más tarde; cancelada y vencida no cuentan');

update tenis_reservas set estado = 'cancelada' where id = pg_temp.id('b');
select pg_temp.espera(pg_temp.ci('20111001'), 'ok:true/1/1/carnet_gratis/0',
  'carnet: cancelado el otro turno, juega 1 hoy');

-- ═════════════════════════════════════════════════════════════════════════════
-- Extensión: cuenta como un turno más (el precio la cobra como turno extra)
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.res('f', 5, '2026-11-21 12:00', '2026-11-21 12:30', 'confirmada', 'extension', 8, '2026-11-21 11:55');
select pg_temp.jug('f', 8, 9000, 'turno_extra', true);
select pg_temp.ahora('2026-11-21 12:05');
select pg_temp.espera(pg_temp.ci('20111008'), 'ok:true/3/3/turno_extra/9000',
  'Becado Tenis: la extensión es el 3º turno del día');

select pg_temp.espera(pg_temp.ci('20111004'), 'sin_reserva:null/null/null/null/null', 'sin reserva: jugador null');

rollback;
