-- Pruebas de escenario para la migración 20261126000000_tenis_editar_reserva
-- (el socio titular edita su reserva de tenis: jugadores, día/horario, cancha y
-- singles/dobles).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_editar_reserva.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs y utilidades que reservas_tenis.sql (copiados: cada archivo
-- corre solo, dentro de una transacción que termina en ROLLBACK). Carga la
-- migración de tenis y después la de esta feature.
-- auth.uid() sale del GUC test.uid y "ahora" del GUC test.ahora. Por defecto:
-- viernes 2026-11-20 10:00 hora argentina (se puede reservar hasta el 22).

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

-- ─── Migraciones bajo prueba ──────────────────────────────────────────────────

\ir ../migrations/20261112000000_reservas_tenis.sql
\ir ../migrations/20261126000000_tenis_editar_reserva.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create or replace function tenis_ahora() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('test.ahora', true), ''), '2026-11-20 10:00:00-03')::timestamptz
$$;

create function pg_temp.ahora(p text) returns void language sql as $$
  select set_config('test.ahora', p || '-03', false)
$$;
create function pg_temp.como(p text) returns void language sql as $$
  select set_config('test.uid', case p
    when 'p1' then 'a0000000-0000-0000-0000-000000000001'
    when 'p2' then 'a0000000-0000-0000-0000-000000000002'
    when 'p3' then 'a0000000-0000-0000-0000-000000000003'
    when 'p4' then 'a0000000-0000-0000-0000-000000000004'
    when 'p7' then 'a0000000-0000-0000-0000-000000000007'
    when 'gestor' then 'a0000000-0000-0000-0000-0000000000a1'
    when 'rugby' then 'a0000000-0000-0000-0000-0000000000a2'
    when 'canchero' then 'a0000000-0000-0000-0000-0000000000a3'
    when 'admin' then 'a0000000-0000-0000-0000-0000000000a4'
    else '' end, false)
$$;
-- socio n → uuid; cancha n → id; t('2026-11-21 18:00') → timestamptz local.
create function pg_temp.so(n int) returns uuid language sql as $$
  select ('b0000000-0000-0000-0000-00000000000' || n)::uuid
$$;
create function pg_temp.ca(n int) returns uuid language sql as $$
  select id from tenis_canchas where nombre = lpad(n::text, 2, '0')
$$;
create function pg_temp.t(p text) returns timestamptz language sql as $$
  select (p || '-03')::timestamptz
$$;
create function pg_temp.j(variadic p int[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('socio_id', pg_temp.so(n))) from unnest(p) n
$$;

-- Ejecuta y devuelve 'ok' o el mensaje de error (código estable).
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- Igual, pero con el DETAIL del error: '<código>|<detail>'.
create function pg_temp.err_detalle(p_sql text) returns text language plpgsql as $$
declare
  v_det text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlerrm || '|' || coalesce(v_det, '');
end $$;

create function pg_temp.espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLO [%]: esperado %, obtenido %', p_msg, p_esperado, p_real;
  end if;
  raise notice 'ok   - %', p_msg;
end $$;

create temp table t_ids (k text primary key, id uuid);
create function pg_temp.guardar(k text, r jsonb) returns jsonb language sql as $$
  insert into t_ids values (k, (r->>'reserva_id')::uuid) on conflict (k) do update set id = excluded.id;
  select r;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from t_ids where t_ids.k = $1 $$;
create function pg_temp.estado(k text) returns text language sql as $$
  select estado from tenis_reservas where id = pg_temp.id(k)
$$;
-- cargo/motivo de un jugador (socio n o invitado por dni) en una reserva.
create function pg_temp.cargo(k text, p_socio int) returns text language sql as $$
  select cargo || '/' || motivo_cargo from tenis_reserva_jugadores
  where reserva_id = pg_temp.id(k) and socio_id = pg_temp.so(p_socio)
$$;
-- Turno de una reserva: 'cancha HH:MM dd/mm modalidad', en hora local.
create function pg_temp.turno(k text) returns text language sql as $$
  select c.nombre || ' ' || to_char(tenis_local(r.inicio), 'HH24:MI DD/MM') || ' ' || r.modalidad
  from tenis_reservas r join tenis_canchas c on c.id = r.cancha_id where r.id = pg_temp.id(k)
$$;
create function pg_temp.njug(k text) returns text language sql as $$
  select count(*)::text from tenis_reserva_jugadores where reserva_id = pg_temp.id(k)
$$;
create function pg_temp.fila(k text, p_socio int) returns uuid language sql as $$
  select id from tenis_reserva_jugadores where reserva_id = pg_temp.id(k) and socio_id = pg_temp.so(p_socio)
$$;
create temp table t_filas (k text primary key, id uuid);

-- ─── Permisos ─────────────────────────────────────────────────────────────────

select pg_temp.espera(has_function_privilege('anon',
  'tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb)', 'execute')::text, 'false', 'anon no ejecuta tenis_editar_reserva');
select pg_temp.espera(has_function_privilege('authenticated',
  'tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb)', 'execute')::text, 'true', 'authenticated ejecuta tenis_editar_reserva');

-- ─── Datos: otras reservas del sábado 21 ──────────────────────────────────────
-- p3: cancha 02 14:00 con S4. p2: cancha 04 16:00 con S4. p1 (S1, carnet): e1
-- cancha 01 10:00 singles con S2.

select pg_temp.como('p3');
select pg_temp.guardar('p3', tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 14:00'), 'singles', pg_temp.j(4)));
select pg_temp.como('p2');
select pg_temp.guardar('p2', tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-21 16:00'), 'singles', pg_temp.j(4)));
select pg_temp.como('p1');
select pg_temp.guardar('e1', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(2)));
select pg_temp.espera(pg_temp.cargo('e1', 2), '9000/socio', 'e1: S2 paga precio socio');
update tenis_reserva_jugadores set cobrado = true, check_in_at = now()
 where reserva_id = pg_temp.id('e1') and es_titular;

-- ─── Jugadores ────────────────────────────────────────────────────────────────

select pg_temp.espera(
  (tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(3)))->>'reserva_id',
  pg_temp.id('e1')::text, 'cambiar jugadores: misma reserva (mismo id)');
select pg_temp.espera(pg_temp.cargo('e1', 3), '9000/turno_extra', 'S3 con carnet ya juega el 21: turno extra recalculado');
select pg_temp.espera(pg_temp.cargo('e1', 2), null, 'S2 sale de la reserva');
select pg_temp.espera(pg_temp.njug('e1'), '2', 'singles: titular + 1');
select pg_temp.espera(
  (select cobrado::text || '/' || (check_in_at is not null)::text from tenis_reserva_jugadores
    where reserva_id = pg_temp.id('e1') and es_titular), 'true/true', 'mismo turno: conserva cobro y check-in');
select pg_temp.espera((tenis_reserva_resumen(pg_temp.id('e1')))->>'total', '9000', 'total recalculado');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(1))$$),
  'jugadores_duplicados', 'el titular no va en la lista');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(5))$$),
  'jugador_no_habilitado', 'moroso no se puede sumar');
insert into t_filas values ('s3', pg_temp.fila('e1', 3));

-- ─── Mover horario y cancha ───────────────────────────────────────────────────

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(3))$$),
  'ok', 'mover a cancha 03 12:00');
select pg_temp.espera(pg_temp.turno('e1'), '03 12:00 21/11 singles', 'e1 quedó en el turno nuevo');
select pg_temp.espera(pg_temp.fila('e1', 3)::text, (select id::text from t_filas where k = 's3'),
  'el jugador que sigue conserva su fila (no se reinserta)');
select pg_temp.espera(
  (select cobrado::text || '/' || (check_in_at is null)::text from tenis_reserva_jugadores
    where reserva_id = pg_temp.id('e1') and es_titular), 'false/true', 'turno nuevo: cobro y check-in reseteados');
select pg_temp.espera(pg_temp.cargo('e1', 1), '0/carnet_gratis', 'titular con carnet: sigue gratis (no se cuenta a sí misma)');
select pg_temp.espera(
  (select count(*)::text from tenis_reservas where titular_socio_id = pg_temp.so(1)), '1', 'no se creó otra reserva');

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(4), pg_temp.t('2026-11-21 16:00'), 'singles', pg_temp.j(3))$$),
  'turno_ocupado', 'mover a un turno ocupado');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(4), pg_temp.t('2026-11-21 16:30'), 'singles', pg_temp.j(3))$$),
  'turno_ocupado', 'mover pisando a medias otro turno');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(4), pg_temp.t('2026-11-21 17:30'), 'singles', pg_temp.j(3))$$),
  'hueco_invalido', 'mañana: dejar 30 min libres rechazado');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(5), pg_temp.t('2026-11-21 16:00'), 'singles', pg_temp.j(4))$$),
  'jugador_ocupado', 'S4 ya juega a las 16:00 en otra cancha');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:15'), 'singles', pg_temp.j(3))$$),
  'horario_invalido', 'fuera de la grilla');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-23 12:00'), 'singles', pg_temp.j(3))$$),
  'anticipacion', 'más de 2 días');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 21:00'), 'dobles', pg_temp.j(2, 3, 4))$$),
  'fuera_de_horario', 'dobles a las 21:00 termina después del cierre');
select pg_temp.espera(pg_temp.turno('e1'), '03 12:00 21/11 singles', 'los intentos rechazados no movieron la reserva');

-- ─── Singles ↔ dobles ─────────────────────────────────────────────────────────

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'dobles', pg_temp.j(3))$$),
  'cantidad_jugadores', 'dobles exige 3 jugadores además del titular');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'dobles', pg_temp.j(2, 3, 4))$$),
  'ok', 'pasar a dobles con 3 jugadores');
select pg_temp.espera(
  (select (fin - inicio)::text from tenis_reservas where id = pg_temp.id('e1')), '01:30:00', 'dobles dura 90 minutos');
select pg_temp.espera(pg_temp.njug('e1'), '4', 'dobles: titular + 3');
select pg_temp.espera(pg_temp.cargo('e1', 2) || ',' || pg_temp.cargo('e1', 3) || ',' || pg_temp.cargo('e1', 4),
  '10000/socio,10000/turno_extra,10000/socio', 'cargos de dobles recalculados');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(2))$$),
  'ok', 'volver a singles con 1 jugador');
select pg_temp.espera(pg_temp.njug('e1') || ' ' || pg_temp.cargo('e1', 2), '2 9000/socio', 'singles: titular + 1, precio singles');

-- ─── Quién y cuándo puede editar ──────────────────────────────────────────────

select pg_temp.como('p2');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(4))$$),
  'reserva_no_editable', 'otro socio no edita la reserva ajena');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(gen_random_uuid(), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(2))$$),
  'reserva_inexistente', 'reserva que no existe');

select pg_temp.como('gestor');
select pg_temp.guardar('tel', tenis_reservar_staff(pg_temp.ca(6), pg_temp.t('2026-11-22 10:00'), 'singles', pg_temp.j(2),
  '{"socio_id":"b0000000-0000-0000-0000-000000000001"}', 'telefonica'));
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('tel'), pg_temp.ca(6), pg_temp.t('2026-11-22 11:00'), 'singles', pg_temp.j(2))$$),
  'reserva_no_editable', 'la reserva telefónica la edita el gestor, no el socio');
select pg_temp.como('gestor');
select tenis_cancelar(pg_temp.id('tel'), 'prueba');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('tel'), pg_temp.ca(6), pg_temp.t('2026-11-22 11:00'), 'singles', pg_temp.j(2))$$),
  'reserva_no_editable', 'una reserva cancelada no se edita');

select pg_temp.ahora('2026-11-21 09:30');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 14:00'), 'singles', pg_temp.j(2))$$),
  'fuera_de_plazo', 'faltan menos de 3 horas para el turno');
select pg_temp.ahora('2026-11-21 09:00');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(3))$$),
  'ok', 'justo 3 horas antes todavía se puede');
select pg_temp.ahora('2026-11-20 10:00');

-- ─── Límites del titular ──────────────────────────────────────────────────────
-- p1 tiene e1 (21) y reserva e2 (22): 2 activas.

select pg_temp.guardar('e2', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-22 10:00'), 'singles', pg_temp.j(2)));
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e2'), pg_temp.ca(5), pg_temp.t('2026-11-21 18:00'), 'singles', pg_temp.j(2))$$),
  'limite_dia', 'mover al día en que ya tiene otra reserva');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e2'), pg_temp.ca(1), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(2))$$),
  'ok', 'con 2 activas puede editar una: la editada no cuenta dos veces');
select pg_temp.espera(pg_temp.turno('e2'), '01 12:00 22/11 singles', 'e2 quedó a las 12:00');

-- ─── Invitados ────────────────────────────────────────────────────────────────

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e2'), pg_temp.ca(1), pg_temp.t('2026-11-22 12:00'), 'singles',
  '[{"invitado":{"dni":"30.999.111","nombre":"Ana","apellido":"Paz"}}]')$$), 'ok', 'sumar un invitado nuevo');
select pg_temp.espera(
  (select cargo || '/' || motivo_cargo from tenis_reserva_jugadores where reserva_id = pg_temp.id('e2') and invitado_id is not null),
  '16000/no_socio', 'el invitado paga precio no socio');
select pg_temp.espera(pg_temp.err(format($f$select tenis_editar_reserva(pg_temp.id('e2'), pg_temp.ca(1), pg_temp.t('2026-11-22 14:00'), 'singles',
  '[{"invitado_id":"%s"}]')$f$, (select id from tenis_invitados where dni = '30999111'))), 'ok',
  'conservar al invitado que ya juega por su invitado_id');
select pg_temp.espera(
  (select count(*)::text from tenis_reserva_jugadores j join tenis_invitados i on i.id = j.invitado_id
    where j.reserva_id = pg_temp.id('e2') and i.dni = '30999111'), '1', 'el invitado sigue en la reserva movida');
select pg_temp.espera(pg_temp.err(format($f$select tenis_editar_reserva(pg_temp.id('e2'), pg_temp.ca(1), pg_temp.t('2026-11-22 14:00'), 'singles',
  '[{"invitado_id":"%s"}]')$f$, gen_random_uuid())), 'parametros', 'invitado_id de alguien que no juega en la reserva');

-- ─── Mis reservas: el socio logueado (Agenda: "con quién juego") ─────────────

select pg_temp.como('p2');
select pg_temp.espera(
  (select string_agg(distinct x->>'mi_socio_id', ',') from jsonb_array_elements(tenis_mis_reservas()) x),
  'b0000000-0000-0000-0000-000000000002', 'tenis_mis_reservas trae mi_socio_id');
select pg_temp.como('p1');

-- ─── Hoy se pueden dejar 30 minutos libres ────────────────────────────────────

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e1'), pg_temp.ca(5), pg_temp.t('2026-11-20 20:30'), 'singles', pg_temp.j(2))$$),
  'ok', 'hoy: mover dejando 30 min libres antes del cierre');
select pg_temp.espera(pg_temp.turno('e1'), '05 20:30 20/11 singles', 'e1 quedó hoy 20:30');

rollback;

