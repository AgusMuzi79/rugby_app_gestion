-- Pruebas de escenario para la migración 20261112000000_reservas_tenis
-- (reservas de canchas de tenis: socios, invitados, gestor, canchero y cron).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/reservas_tenis.sql
--   docker rm -f tenis-pg
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos del
-- schema real (profiles, socios, servicios, accesos, storage.buckets, get_rol,
-- get_socio_id, set_updated_at y socio_habilitado_deporte reales), la
-- migración cargada con \ir y verificación con RAISE EXCEPTION. Todo corre
-- dentro de una transacción que termina en ROLLBACK.
--
-- auth.uid() sale del GUC test.uid y "ahora" del GUC test.ahora (se redefine
-- tenis_ahora()). Por defecto: viernes 2026-11-20 10:00 hora argentina.
-- Las RPC se llaman como superusuario (son SECURITY DEFINER: el rol que llama
-- sólo importa por auth.uid()); los permisos se verifican aparte con
-- has_function_privilege / has_table_privilege.

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

-- ─── Migración bajo prueba ────────────────────────────────────────────────────

\ir ../migrations/20261112000000_reservas_tenis.sql

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

-- ─── Seeds, constraints y permisos ────────────────────────────────────────────

select pg_temp.espera((select count(*)::text from tenis_canchas where activa), '8', 'seed: 8 canchas activas');
select pg_temp.espera((select string_agg(nombre, ',' order by orden) from tenis_canchas),
  '01,02,03,04,05,06,07,08', 'seed: canchas 01..08 en orden');
select pg_temp.espera(
  (select hora_desde || '/' || hora_hasta || '/' || modulo_min || '/' || singles_min || '/' || dobles_min || '/'
          || max_reservas_dia || '/' || max_activas || '/' || anticipacion_dias || '/' || cancelacion_horas || '/'
          || hold_min || '/' || precio_socio_single || '/' || precio_nosocio_dobles || '/' || alias_pago
     from tenis_config),
  '08:00:00/22:00:00/30/60/90/1/2/2/3/15/9000/18000/uncas.tenis.macro', 'seed: config con los defaults del contrato');
select pg_temp.espera((select public::text from storage.buckets where id = 'tenis-comprobantes'), 'false',
  'bucket tenis-comprobantes privado');

select pg_temp.espera((pg_temp.err($$insert into tenis_config (id) values (false)$$) like '%violates check%')::text, 'true',
  'config: no admite una segunda fila');
select pg_temp.espera((pg_temp.err($$insert into tenis_bloques (tipo, titulo, dia_semana, fecha, hora_desde, hora_hasta)
  values ('clase', 'X', 1, '2026-11-23', '09:00', '10:00')$$) like '%tenis_bloques_dia_o_fecha_check%')::text, 'true',
  'bloques: dia_semana y fecha a la vez rechazado');
select pg_temp.espera((pg_temp.err($$insert into tenis_bloques (tipo, titulo, hora_desde, hora_hasta)
  values ('clase', 'X', '09:00', '10:00')$$) like '%tenis_bloques_dia_o_fecha_check%')::text, 'true',
  'bloques: ni dia_semana ni fecha rechazado');

select pg_temp.espera(has_function_privilege('anon', 'tenis_reservar(uuid, timestamptz, text, jsonb)', 'execute')::text,
  'false', 'anon no ejecuta tenis_reservar');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_reservar(uuid, timestamptz, text, jsonb)', 'execute')::text,
  'true', 'authenticated ejecuta tenis_reservar');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_checkin(text)', 'execute')::text,
  'true', 'authenticated ejecuta tenis_checkin (valida rol adentro)');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_procesar()', 'execute')::text,
  'false', 'authenticated no ejecuta tenis_procesar');
select pg_temp.espera(has_function_privilege('authenticated',
  'tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text)', 'execute')::text,
  'false', 'authenticated no ejecuta tenis_invitado_reservar');
select pg_temp.espera(has_function_privilege('service_role', 'tenis_procesar()', 'execute')::text,
  'true', 'service_role ejecuta tenis_procesar');
select pg_temp.espera(has_function_privilege('authenticated',
  'tenis_crear_reserva(uuid, timestamptz, text, uuid, uuid, jsonb, text, text, boolean, uuid, timestamptz, text)', 'execute')::text,
  'false', 'el núcleo tenis_crear_reserva no es invocable por clientes');
select pg_temp.espera(has_table_privilege('authenticated', 'tenis_reservas', 'select')::text,
  'false', 'authenticated no lee tenis_reservas directo');
select pg_temp.espera((select relrowsecurity::text from pg_class where relname = 'tenis_reserva_jugadores'),
  'true', 'RLS activa en tenis_reserva_jugadores');

-- ─── Roles ────────────────────────────────────────────────────────────────────

select pg_temp.como('gestor');
select pg_temp.espera(es_gestor_tenis()::text || '/' || es_canchero()::text, 'true/true', 'subco tenis: gestor y canchero');
select pg_temp.como('rugby');
select pg_temp.espera(es_gestor_tenis()::text || '/' || es_canchero()::text, 'false/false', 'subco rugby: ninguno');
select pg_temp.como('canchero');
select pg_temp.espera(es_gestor_tenis()::text || '/' || es_canchero()::text, 'false/true', 'canchero: sólo canchero');
select pg_temp.como('admin');
select pg_temp.espera(es_gestor_tenis()::text, 'true', 'admin: gestor');
select pg_temp.como('p1');
select pg_temp.espera(es_gestor_tenis()::text || '/' || es_canchero()::text, 'false/false', 'socio: ninguno');
select pg_temp.espera(pg_temp.err($$select tenis_grilla('2026-11-21')$$), 'no_autorizado', 'socio no ve la grilla del gestor');
select pg_temp.espera(pg_temp.err($$select tenis_checkin('20111002')$$), 'no_autorizado', 'socio no hace check-in');
select pg_temp.espera(pg_temp.err($$select tenis_suspender(null, null, 3, 'x')$$), 'no_autorizado', 'socio no suspende');

-- ─── Reserva del socio y precios (carnet) ─────────────────────────────────────

select pg_temp.como('p1');
select pg_temp.guardar('r1', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-21 18:00'), 'singles', pg_temp.j(2)));
select pg_temp.espera((select (fin - inicio)::text from tenis_reservas where id = pg_temp.id('r1')), '01:00:00',
  'singles dura 60 minutos');
select pg_temp.espera(pg_temp.cargo('r1', 1), '0/carnet_gratis', 'S1 con carnet: primer turno del día gratis');
select pg_temp.espera(pg_temp.cargo('r1', 2), '9000/socio', 'S2 sin carnet: precio socio singles');
select pg_temp.espera((select es_titular::text from tenis_reserva_jugadores
                        where reserva_id = pg_temp.id('r1') and socio_id = pg_temp.so(1)), 'true', 'S1 queda como titular');
select pg_temp.espera(
  (select (tenis_reserva_resumen(pg_temp.id('r1')))->>'total'), '9000', 'total de la reserva = 9000');

-- Grilla y horario.
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 18:15'), 'singles', pg_temp.j(3))$$),
  'horario_invalido', 'fuera de la grilla de 30 min');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 21:00'), 'dobles', pg_temp.j(2, 3, 4))$$),
  'fuera_de_horario', 'dobles a las 21:00 termina 22:30: fuera de horario');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 07:30'), 'singles', pg_temp.j(3))$$),
  'fuera_de_horario', 'antes de las 08:00');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-23 10:00'), 'singles', pg_temp.j(3))$$),
  'anticipacion', 'más de 2 días de anticipación');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-20 09:00'), 'singles', pg_temp.j(3))$$),
  'pasado', 'turno que ya pasó');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'dobles', pg_temp.j(3))$$),
  'cantidad_jugadores', 'dobles exige 3 jugadores además del titular');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'singles', pg_temp.j(1))$$),
  'jugadores_duplicados', 'el titular no puede ir también como jugador');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'singles', pg_temp.j(6))$$),
  'no_es_socio', 'socio dado de baja no puede jugar como socio');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'singles', pg_temp.j(7))$$),
  'no_es_socio', 'Cliente Gimnasio no cuenta como socio');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'singles', pg_temp.j(5))$$),
  'jugador_no_habilitado', 'semáforo rojo no puede ser agregado (bloquear_morosos)');

-- ─── Solape ───────────────────────────────────────────────────────────────────

select pg_temp.como('p3');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-21 18:30'), 'singles', pg_temp.j(4))$$),
  'turno_ocupado', 'solape en la misma cancha rechazado');
select pg_temp.espera((pg_temp.err($$insert into tenis_reservas (cancha_id, inicio, fin, modalidad, origen, titular_socio_id, estado)
  values (pg_temp.ca(1), pg_temp.t('2026-11-21 18:30'), pg_temp.t('2026-11-21 19:30'), 'singles', 'socio', pg_temp.so(3), 'confirmada')$$)
  like '%tenis_reservas_sin_solape%')::text, 'true', 'la constraint de exclusión frena el solape aunque se inserte directo');
select pg_temp.espera(pg_temp.err($$insert into tenis_reservas (cancha_id, inicio, fin, modalidad, origen, titular_socio_id, estado)
  values (pg_temp.ca(1), pg_temp.t('2026-11-21 18:30'), pg_temp.t('2026-11-21 19:30'), 'singles', 'socio', pg_temp.so(3), 'cancelada')$$),
  'ok', 'una reserva cancelada no ocupa la cancha');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 18:30'), 'singles', pg_temp.j(2))$$),
  'jugador_ocupado', 'un jugador no puede estar en dos turnos que se pisan');

-- Turno extra del carnet: S3 (carnet) reserva y suma a S1, que ya juega ese día.
select pg_temp.guardar('r3', tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-21 20:00'), 'singles', pg_temp.j(1)));
select pg_temp.espera(pg_temp.cargo('r3', 3), '0/carnet_gratis', 'S3 con carnet: primer turno gratis');
select pg_temp.espera(pg_temp.cargo('r3', 1), '9000/turno_extra', 'S1 con carnet en su segundo turno del día: turno_extra');
select pg_temp.espera(
  (select cargo || '/' || motivo from tenis_cargo_jugador(pg_temp.so(1), null, pg_temp.t('2026-11-22 10:00'), 'dobles', null)),
  '0/carnet_gratis', 'cargo_jugador: otro día vuelve a ser gratis');

-- ─── Bloques ──────────────────────────────────────────────────────────────────

select pg_temp.como('gestor');
select pg_temp.espera(pg_temp.err($$select tenis_bloque_guardar(jsonb_build_object(
  'cancha_id', pg_temp.ca(2), 'tipo', 'clase', 'titulo', 'Escuelita', 'dia_semana', 6,
  'hora_desde', '09:00', 'hora_hasta', '12:00', 'vigente_desde', '2026-11-01', 'vigente_hasta', '2026-12-31'))$$),
  'ok', 'gestor crea un bloque recurrente (sábados 9-12, cancha 02)');
select pg_temp.espera(pg_temp.err($$select tenis_bloque_guardar(jsonb_build_object(
  'tipo', 'torneo', 'titulo', 'Torneo', 'fecha', '2026-11-22', 'hora_desde', '08:00', 'hora_hasta', '10:00'))$$),
  'ok', 'gestor crea un bloque puntual para todas las canchas (domingo 8-10)');
select pg_temp.espera(pg_temp.err($$select tenis_bloque_guardar(jsonb_build_object(
  'tipo', 'clase', 'titulo', 'Mal', 'dia_semana', 6, 'hora_desde', '12:00', 'hora_hasta', '09:00'))$$),
  'bloque_invalido', 'bloque con horas invertidas rechazado');

select pg_temp.como('p4');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 11:30'), 'singles', pg_temp.j(2))$$),
  'bloqueado', 'reserva que pisa un bloque recurrente rechazada');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(7), pg_temp.t('2026-11-22 09:30'), 'singles', pg_temp.j(2))$$),
  'bloqueado', 'bloque puntual sin cancha aplica a todas');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-28 12:00'), 'singles', pg_temp.j(2))$$),
  'anticipacion', 'control: otro sábado queda fuera de la anticipación');

-- Disponibilidad: el socio ve ocupación y bloques, sin nombres de otros.
select pg_temp.como('p2');
select pg_temp.espera(
  (select count(*)::text from jsonb_array_elements(tenis_disponibilidad('2026-11-21')->'items') i
    where i->>'tipo' = 'clase' and (i->>'recurrente')::boolean), '1', 'disponibilidad: bloque recurrente con recurrente = true');
select pg_temp.espera(
  (select string_agg(i->>'titulo' || ':' || (i->>'mio'), ',' order by i->>'inicio')
     from jsonb_array_elements(tenis_disponibilidad('2026-11-21')->'items') i where i->>'tipo' = 'reserva_web'),
  'Mi reserva:true,Reservado:false', 'disponibilidad: S2 ve la suya como mía y la otra sin nombres');
select pg_temp.espera(
  (select count(*)::text from jsonb_array_elements(tenis_disponibilidad('2026-11-22')->'items') i where i->>'tipo' = 'torneo'),
  '8', 'disponibilidad: bloque sin cancha se expande a las 8 canchas');
select pg_temp.espera((tenis_disponibilidad('2026-11-21')::text like '%Pérez%')::text, 'false',
  'disponibilidad no expone nombres');

-- Buscador del padrón.
select pg_temp.espera(
  (select string_agg(nombre, ',' order by nombre) from tenis_buscar_jugadores('tomas')), 'López Tomás',
  'buscador sin tildes');
select pg_temp.espera(
  (select count(*)::text from tenis_buscar_jugadores('20111005')), '0', 'buscador excluye morosos (semáforo rojo)');
select pg_temp.espera(
  (select count(*)::text from tenis_buscar_jugadores('Gómez')), '0', 'buscador excluye al propio socio');
select pg_temp.espera(
  (select string_agg(numero_socio, ',') from tenis_buscar_jugadores('1004')), '1004', 'buscador por número de socio');

-- ─── Límites: 1 por día y 2 activas ──────────────────────────────────────────

select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(4))$$),
  'limite_dia', 'S1 ya es titular el 21: máximo 1 por día');
select pg_temp.guardar('r1b', tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(4)));
select pg_temp.espera(pg_temp.estado('r1b'), 'confirmada', 'S1 reserva el 22 (segunda activa)');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-20 16:00'), 'singles', pg_temp.j(4))$$),
  'limite_activas', 'S1 con 2 activas no puede una tercera');

-- ─── Cancelación (3 h) ───────────────────────────────────────────────────────

select pg_temp.como('p2');
select pg_temp.espera(pg_temp.err($$select tenis_cancelar(pg_temp.id('r1b'), null)$$), 'no_autorizado',
  'sólo el titular cancela');
select pg_temp.ahora('2026-11-21 17:30');
select pg_temp.como('p3');
select pg_temp.espera(pg_temp.err($$select tenis_cancelar(pg_temp.id('r3'), null)$$), 'fuera_de_plazo',
  'S3 no cancela a 2 h 30 del turno');
select pg_temp.como('gestor');
select pg_temp.espera((tenis_cancelar(pg_temp.id('r3'), 'Pedido por teléfono'))->>'estado', 'cancelada',
  'el gestor cancela siempre');
select pg_temp.ahora('2026-11-20 10:00');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_cancelar(pg_temp.id('r1b'), 'no puedo')$$), 'ok',
  'S1 cancela el 22 con más de 3 h');
select pg_temp.espera(pg_temp.estado('r1b'), 'cancelada', 'r1b cancelada');
select pg_temp.espera(
  (select count(*)::text from jsonb_array_elements(tenis_mis_reservas()) x where (x->>'puede_cancelar')::boolean),
  '1', 'mis reservas: sólo r1 cancelable');

-- ─── Suspensión ───────────────────────────────────────────────────────────────

select pg_temp.como('gestor');
select pg_temp.espera(
  (tenis_suspender(pg_temp.so(4), null, 3, 'No show reiterado'))->>'hasta', '2026-11-22', 'suspensión de 3 días: hoy..hoy+2');
select pg_temp.como('p4');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(2))$$),
  'titular_suspendido', 'suspendido no puede reservar');
select pg_temp.como('p2');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(4))$$),
  'jugador_no_habilitado', 'suspendido no puede ser agregado');
select pg_temp.espera((select count(*)::text from tenis_buscar_jugadores('Díaz')), '0', 'buscador excluye suspendidos');
select pg_temp.como('gestor');
select pg_temp.espera(
  (select (tenis_suspension_levantar((x->>'id')::uuid))->>'suspension_id' is not null
     from jsonb_array_elements(tenis_infracciones_listar()->'suspensiones') x limit 1)::text,
  'true', 'el gestor levanta la suspensión');
select pg_temp.espera(tenis_suspendido(pg_temp.so(4), null, '2026-11-21')::text, 'false', 'S4 ya no está suspendido');

-- ─── No-show, jugada e infracción automática ─────────────────────────────────

select pg_temp.como('p2');
select pg_temp.guardar('ns1', tenis_reservar(pg_temp.ca(6), pg_temp.t('2026-11-20 16:00'), 'singles', pg_temp.j(4)));
select pg_temp.como('p3');
select pg_temp.guardar('jug', tenis_reservar(pg_temp.ca(7), pg_temp.t('2026-11-20 16:00'), 'singles', pg_temp.j(1)));

-- Check-in: ventana de 15 minutos antes del inicio.
select pg_temp.como('canchero');
select pg_temp.ahora('2026-11-20 15:40');
select pg_temp.espera((tenis_checkin('20111003'))->>'resultado', 'sin_reserva', 'check-in a 20 min: fuera de ventana');
select pg_temp.ahora('2026-11-20 15:50');
select pg_temp.espera((tenis_checkin('20.111.003'))->>'resultado', 'ok', 'check-in de S3 a 10 min (DNI con puntos)');
select pg_temp.espera((tenis_checkin('20111003'))->>'resultado', 'ok', 'segundo check-in de S3 también ok');
select pg_temp.espera(
  (select count(*)::text from accesos where socio_id = pg_temp.so(3) and punto = 'tenis'), '1',
  'un solo registro en accesos con punto tenis');
select pg_temp.espera((tenis_checkin('99999999'))->>'resultado', 'sin_reserva', 'DNI desconocido: sin_reserva');
select pg_temp.espera(((tenis_checkin('99999999'))->'persona')::text, 'null', 'DNI desconocido: persona null');
select pg_temp.espera((tenis_checkin('20111006'))->>'resultado', 'sin_reserva', 'socio sin reserva: sin_reserva');
select pg_temp.espera((tenis_checkin('20111006'))#>>'{persona,tipo}', 'socio', 'socio sin reserva: persona socio');

select pg_temp.ahora('2026-11-20 17:01');
select pg_temp.espera(
  (select jsonb_array_length(r->'no_shows') || '/' || jsonb_array_length(r->'jugadas') from tenis_procesar() r),
  '1/1', 'procesar: un no_show y una jugada');
select pg_temp.espera(pg_temp.estado('ns1') || '/' || pg_temp.estado('jug'), 'no_show/jugada', 'estados finales');
select pg_temp.espera(pg_temp.cargo('ns1', 2), '18000/no_show', 'no_show: el titular paga los dos jugadores');
select pg_temp.espera(pg_temp.cargo('ns1', 4), '0/no_show', 'no_show: el otro jugador queda en 0');
select pg_temp.espera(
  (select perdonada::text || '/' || (creado_por is null)::text from tenis_infracciones
    where reserva_id = pg_temp.id('ns1')), 'true/true', 'primera infracción automática = advertencia');
select pg_temp.espera(
  (select jsonb_array_length(r->'no_shows') from tenis_procesar() r)::text, '0', 'procesar es idempotente');

-- Segundo no-show de S2: ya no es advertencia.
select pg_temp.ahora('2026-11-20 10:00');
select pg_temp.como('p2');
select pg_temp.guardar('ns2', tenis_reservar(pg_temp.ca(6), pg_temp.t('2026-11-21 08:00'), 'singles', pg_temp.j(4)));
select pg_temp.ahora('2026-11-21 09:05');
select pg_temp.espera(
  (select (r->'no_shows'->0->>'advertencia') from tenis_procesar() r), 'false', 'segunda infracción: no es advertencia');
select pg_temp.espera(
  (select perdonada::text from tenis_infracciones where reserva_id = pg_temp.id('ns2')), 'false',
  'segunda infracción queda sin perdonar');

-- Límite de activas: una reserva deja de contar apenas termina su turno.
select pg_temp.ahora('2026-11-21 19:05');
select pg_temp.como('p1');
select pg_temp.guardar('r1c', tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(4)));
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-23 12:00'), 'singles', pg_temp.j(2))$$),
  'ok', 'r1 terminó a las 19:00 (sin cron): ya no cuenta como activa');
select pg_temp.ahora('2026-11-20 10:00');

-- ─── Invitados: hold, confirmación, comprobante ──────────────────────────────

select pg_temp.guardar('g1', tenis_invitado_reservar(pg_temp.ca(8), pg_temp.t('2026-11-21 16:00'), 'singles',
  '{"dni":"30.111.222","nombre":"Carla","apellido":"Invitada","email":"Carla@Example.com"}',
  '[{"invitado":{"dni":"30111333","nombre":"Mario","apellido":"Amigo"}}]', repeat('a', 64)));
select pg_temp.espera(pg_temp.estado('g1'), 'pendiente_confirmacion', 'invitado: hold creado');
select pg_temp.espera((select (tenis_reserva_resumen(pg_temp.id('g1')))->>'total'), '32000',
  'invitado: dos no socios singles = 2 x 16000');
select pg_temp.espera((select email from tenis_invitados where dni = '30111222'), 'carla@example.com',
  'invitado: DNI normalizado y mail en minúsculas');
select pg_temp.espera(pg_temp.err($$select tenis_invitado_reservar(pg_temp.ca(5), pg_temp.t('2026-11-21 16:00'), 'singles',
  '{"dni":"20111002","nombre":"Ana","apellido":"Gomez","email":"ana@example.com"}',
  '[{"invitado":{"dni":"30111444","nombre":"X","apellido":"Y"}}]', repeat('c', 64))$$),
  'titular_es_socio', 'un socio no reserva por la web de invitados');
select pg_temp.espera(pg_temp.err($$select tenis_invitado_reservar(pg_temp.ca(5), pg_temp.t('2026-11-20 13:00'), 'singles',
  '{"dni":"30111555","nombre":"Z","apellido":"Z","email":"z@example.com"}',
  '[{"invitado":{"dni":"30111666","nombre":"X","apellido":"Y"}}]', repeat('d', 64))$$),
  'plazo_invitado', 'invitado: el turno tiene que dejar tiempo para el comprobante');

-- Hold vencido a los 15 minutos.
select pg_temp.ahora('2026-11-20 10:16');
select pg_temp.espera(
  (select r->'holds_vencidos'->0->>'reserva_id' from tenis_procesar() r), pg_temp.id('g1')::text,
  'procesar: hold sin confirmar vence');
select pg_temp.espera(pg_temp.estado('g1'), 'vencida', 'g1 vencida');
select pg_temp.espera(pg_temp.err($$select tenis_invitado_confirmar(repeat('a', 64))$$), 'hold_vencido',
  'confirmar un hold vencido falla');

-- Confirmado pero sin comprobante a 3 h del turno → cancelado.
select pg_temp.ahora('2026-11-20 10:20');
select pg_temp.guardar('g2', tenis_invitado_reservar(pg_temp.ca(8), pg_temp.t('2026-11-21 16:00'), 'singles',
  '{"dni":"30111222","nombre":"Carla","apellido":"Invitada","email":"carla@example.com"}',
  '[{"dni":"20111004"}]', repeat('b', 64)));
select pg_temp.espera(pg_temp.cargo('g2', 4), '9000/socio', 'invitado + socio por DNI: el socio paga precio socio');
select pg_temp.espera((tenis_invitado_confirmar(repeat('b', 64)))->>'alias', 'uncas.tenis.macro', 'confirmar devuelve el alias');
select pg_temp.espera(pg_temp.estado('g2'), 'pendiente_comprobante', 'g2 confirmada por mail');
select pg_temp.espera(
  (select comprobante_vence_at = pg_temp.t('2026-11-21 13:00') from tenis_reservas where id = pg_temp.id('g2'))::text,
  'true', 'plazo del comprobante = 3 h antes del turno');
select pg_temp.espera((tenis_invitado_confirmar(repeat('b', 64)))->>'estado', 'pendiente_comprobante',
  'confirmar es idempotente');
select pg_temp.ahora('2026-11-21 13:01');
select pg_temp.espera(
  (select r->'comprobantes_vencidos'->0->>'reserva_id' from tenis_procesar() r), pg_temp.id('g2')::text,
  'procesar: sin comprobante a tiempo se cancela');
select pg_temp.espera(pg_temp.estado('g2'), 'cancelada', 'g2 cancelada');

-- Comprobante subido y aprobado → confirmada y cobrada.
select pg_temp.ahora('2026-11-20 10:30');
select pg_temp.guardar('g3', tenis_invitado_reservar(pg_temp.ca(8), pg_temp.t('2026-11-21 18:00'), 'singles',
  '{"dni":"30111777","nombre":"Lucía","apellido":"Visitante","email":"lucia@example.com"}',
  '[{"invitado":{"dni":"30111888","nombre":"Pedro","apellido":"Visitante"}}]', repeat('e', 64)));
select tenis_invitado_confirmar(repeat('e', 64));
select pg_temp.espera(pg_temp.err(format($$select tenis_invitado_comprobante(%L, %L, 'otra/foto.jpg')$$,
  pg_temp.id('g3'), repeat('e', 64))), 'path_invalido', 'el path del comprobante tiene que ser de la reserva');
select pg_temp.espera(pg_temp.err(format($$select tenis_invitado_comprobante(%L, %L, %L)$$,
  pg_temp.id('g3'), repeat('f', 64), pg_temp.id('g3') || '/x.jpg')), 'token_invalido', 'token de otra reserva rechazado');
select pg_temp.espera(
  (tenis_invitado_comprobante(pg_temp.id('g3'), repeat('e', 64), pg_temp.id('g3') || '/c.jpg'))->>'comprobante_estado',
  'pendiente', 'comprobante registrado');
select pg_temp.como('canchero');
select pg_temp.ahora('2026-11-21 17:50');
select pg_temp.espera((tenis_checkin('30111777'))->>'resultado', 'comprobante_pendiente',
  'check-in de invitado con comprobante sin aprobar');
select pg_temp.espera(
  (select jsonb_array_length(tenis_comprobantes_pendientes()))::text, '1', 'un comprobante pendiente');
select pg_temp.espera(pg_temp.err(format($$select tenis_comprobante_resolver(%L, false, '')$$, pg_temp.id('g3'))),
  'motivo_requerido', 'rechazar exige motivo');
select pg_temp.espera((tenis_comprobante_resolver(pg_temp.id('g3'), true, null))#>>'{titular,email}', 'lucia@example.com',
  'aprobar devuelve el mail del invitado');
select pg_temp.espera(pg_temp.estado('g3'), 'confirmada', 'g3 confirmada');
select pg_temp.espera(
  (select bool_and(cobrado)::text from tenis_reserva_jugadores where reserva_id = pg_temp.id('g3')), 'true',
  'aprobar marca todo cobrado');
select pg_temp.espera((tenis_checkin('30111777'))->>'resultado', 'ok', 'check-in del invitado aprobado');
select pg_temp.espera(
  (select count(*)::text from accesos where punto = 'tenis' and socio_id is null), '0',
  'invitados no van a accesos');

-- ─── Canchero: corregir jugadores, cobro, extensión ──────────────────────────

select pg_temp.ahora('2026-11-20 10:00');
select pg_temp.como('p2');
select pg_temp.guardar('c1', tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(3)));
select pg_temp.como('canchero');
select pg_temp.espera(
  (tenis_jugadores_corregir(pg_temp.id('c1'), '[{"invitado":{"dni":"30111999","nombre":"Nuevo","apellido":"Jugador"}}]',
                            true, 'Vino otro'))->>'total', '25000',
  'corregir: invitado en lugar de S3 → 9000 + 16000');
select pg_temp.espera(
  (select count(*)::text from tenis_reserva_jugadores where reserva_id = pg_temp.id('c1') and socio_id = pg_temp.so(3)), '0',
  'corregir: S3 ya no está');
select pg_temp.espera(
  (select tipo from tenis_infracciones where reserva_id = pg_temp.id('c1')), 'jugadores_incorrectos',
  'corregir: infracción jugadores_incorrectos al titular');
select pg_temp.espera(
  (tenis_cobro_marcar((select id from tenis_reserva_jugadores where reserva_id = pg_temp.id('c1') and es_titular), true))->>'cobrado',
  'true', 'cobro marcado');
select pg_temp.ahora('2026-11-22 12:50');
select pg_temp.espera((tenis_checkin('20111002'))->>'resultado', 'ok', 'check-in del titular de c1');
select pg_temp.espera(
  (select (x->>'fin')::timestamptz = pg_temp.t('2026-11-22 13:30')
     from tenis_extension(pg_temp.ca(5), pg_temp.t('2026-11-22 13:30'), pg_temp.id('c1')) x)::text,
  'true', 'extensión de 30 min en la misma cancha');
select pg_temp.espera(
  (select string_agg(motivo_cargo, ',' order by motivo_cargo) from tenis_reserva_jugadores j
     join tenis_reservas r on r.id = j.reserva_id where r.origen = 'extension'), 'no_socio,socio',
  'extensión: mismos jugadores con su cargo');

-- ─── Gestor: reserva telefónica y bloqueo puntual ────────────────────────────

select pg_temp.como('gestor');
select pg_temp.ahora('2026-11-20 10:00');
select pg_temp.guardar('tel', tenis_reservar_staff(pg_temp.ca(3), pg_temp.t('2026-11-21 10:00'), 'singles',
  pg_temp.j(4), '{"socio_id":"b0000000-0000-0000-0000-000000000001"}', 'telefonica'));
select pg_temp.espera(
  (select origen || '/' || estado from tenis_reservas where id = pg_temp.id('tel')), 'telefonica/confirmada',
  'reserva telefónica sin límites (S1 ya tenía reserva el 21)');
select pg_temp.espera(
  (select jsonb_array_length(r->'reservas_canceladas')::text
     from tenis_bloqueo_puntual(pg_temp.ca(1), pg_temp.t('2026-11-21 17:00'), pg_temp.t('2026-11-21 19:00'),
                                'no_disponible', 'Lluvia') r), '1',
  'bloqueo puntual cancela la reserva afectada');
select pg_temp.espera(
  (select estado || '/' || cancelacion_motivo from tenis_reservas where id = pg_temp.id('r1')), 'cancelada/Lluvia',
  'r1 cancelada por lluvia');
select pg_temp.espera(
  (select count(*)::text from jsonb_array_elements(tenis_grilla('2026-11-21')->'items') i
    where i->>'tipo' = 'no_disponible'), '1', 'grilla del gestor muestra el bloqueo');
select pg_temp.espera(
  (tenis_config_guardar('{"precio_socio_single": 9500}'))->>'precio_socio_single', '9500', 'gestor cambia un precio');
select pg_temp.espera(pg_temp.err($$select tenis_config_guardar('{"hora_desde": "23:00"}')$$), 'config_invalida',
  'config inválida rechazada');

rollback;
