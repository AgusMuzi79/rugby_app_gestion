-- Pruebas de la migración 20261125000000_tenis_aviso_jugadores (outbox del push
-- "Te sumaron a un turno de tenis" a los socios que otro agrega a una reserva).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_aviso_jugadores.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs, datos y utilidades que reservas_tenis.sql (copiados: cada
-- archivo corre solo). Carga la migración de tenis y encima la del aviso. Todo
-- dentro de una transacción que termina en ROLLBACK. "Ahora" por defecto:
-- viernes 2026-11-20 10:00 hora argentina.

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
\ir ../migrations/20261125000000_tenis_aviso_jugadores.sql

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

-- Avisos encolados de una reserva: 'S<n>' de cada socio, en orden ('' si no hay).
create function pg_temp.avisos(k text) returns text language sql as $$
  select coalesce(string_agg('S' || right(a.socio_id::text, 1), ',' order by a.socio_id::text), '')
  from tenis_avisos_jugadores a where a.reserva_id = pg_temp.id(k)
$$;
-- Estado de un aviso: pendiente | enviado | descartado:<motivo>.
create function pg_temp.aviso(k text, p_socio int) returns text language sql as $$
  select case
    when a.enviado_at is not null then 'enviado'
    when a.descartado_at is not null then 'descartado:' || a.descarte
    else 'pendiente' end
  from tenis_avisos_jugadores a where a.reserva_id = pg_temp.id(k) and a.socio_id = pg_temp.so(p_socio)
$$;
create function pg_temp.aviso_id(k text, p_socio int) returns uuid language sql as $$
  select a.id from tenis_avisos_jugadores a where a.reserva_id = pg_temp.id(k) and a.socio_id = pg_temp.so(p_socio)
$$;
-- Lo que reclamaría el cron: 'k:S<n>' de cada aviso devuelto, en orden.
create temp table t_reclamo (r jsonb);
create function pg_temp.reclamar() returns text language plpgsql as $$
declare v jsonb;
begin
  v := tenis_avisos_jugadores_reclamar(100);
  delete from t_reclamo;
  insert into t_reclamo values (v);
  return coalesce((
    select string_agg(x, ',' order by x) from (
      select coalesce((select t.k from t_ids t where t.id = (e->>'reserva_id')::uuid), '?')
             || ':S' || right(e->>'socio_id', 1) as x
      from jsonb_array_elements(v->'avisos') e) s), '');
end $$;
create function pg_temp.resultado(k text, p_socio int, p_res text, p_error text default null) returns jsonb language sql as $$
  select jsonb_build_object('id', pg_temp.aviso_id(k, p_socio), 'resultado', p_res, 'error', p_error)
$$;

-- ─── Tabla y permisos ─────────────────────────────────────────────────────────

select pg_temp.espera((select relrowsecurity::text from pg_class where relname = 'tenis_avisos_jugadores'),
  'true', 'RLS activa en tenis_avisos_jugadores');
select pg_temp.espera(has_table_privilege('authenticated', 'tenis_avisos_jugadores', 'select')::text,
  'false', 'authenticated no lee la outbox');
select pg_temp.espera(has_table_privilege('service_role', 'tenis_avisos_jugadores', 'select')::text,
  'true', 'service_role lee la outbox');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_avisos_jugadores_reclamar(int)', 'execute')::text,
  'false', 'authenticated no reclama avisos');
select pg_temp.espera(has_function_privilege('anon', 'tenis_avisos_jugadores_marcar(jsonb)', 'execute')::text,
  'false', 'anon no marca avisos');
select pg_temp.espera(has_function_privilege('service_role', 'tenis_avisos_jugadores_reclamar(int)', 'execute')::text
  || '/' || has_function_privilege('service_role', 'tenis_avisos_jugadores_marcar(jsonb)', 'execute')::text,
  'true/true', 'service_role reclama y marca');

-- ─── Encolado ─────────────────────────────────────────────────────────────────

-- Reserva del socio: S1 titular, S2 jugador.
select pg_temp.como('p1');
select pg_temp.guardar('a', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-21 18:00'), 'singles', pg_temp.j(2)));
select pg_temp.espera(pg_temp.avisos('a'), 'S2', 'socio reserva con otro socio: un aviso, sin el titular');

-- Dobles: S3 titular con S1, S2 y S4.
select pg_temp.como('p3');
select pg_temp.guardar('b', tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'dobles', pg_temp.j(1, 2, 4)));
select pg_temp.espera(pg_temp.avisos('b'), 'S1,S2,S4', 'dobles: un aviso por cada jugador socio');
select pg_temp.espera(pg_temp.aviso('b', 1), 'pendiente', 'el aviso nace pendiente');
select pg_temp.espera((pg_temp.err(format($$insert into tenis_avisos_jugadores (reserva_id, socio_id) values (%L, %L)$$,
  pg_temp.id('b'), pg_temp.so(1))) like '%duplicate key%')::text, 'true', 'unique (reserva, socio): no hay dos avisos');

-- Invitado: nada mientras es un hold; el aviso sale al confirmar por mail.
select pg_temp.guardar('g1', tenis_invitado_reservar(pg_temp.ca(8), pg_temp.t('2026-11-21 16:00'), 'singles',
  '{"dni":"30111222","nombre":"Carla","apellido":"Invitada","email":"carla@example.com"}',
  '[{"dni":"20111004"}]', repeat('a', 64)));
select pg_temp.espera(pg_temp.avisos('g1'), '', 'hold de invitado: sin aviso');
select tenis_invitado_confirmar(repeat('a', 64));
select pg_temp.espera(pg_temp.avisos('g1'), 'S4', 'invitado confirma por mail: aviso al socio jugador');
select tenis_invitado_confirmar(repeat('a', 64));
select pg_temp.espera(pg_temp.avisos('g1'), 'S4', 'confirmar de nuevo no duplica');

-- Hold que nunca se confirma: vence sin avisar.
select pg_temp.guardar('g2', tenis_invitado_reservar(pg_temp.ca(7), pg_temp.t('2026-11-21 16:00'), 'singles',
  '{"dni":"30111555","nombre":"Rita","apellido":"Paz","email":"rita@example.com"}',
  '[{"dni":"20111002"}]', repeat('b', 64)));
select pg_temp.ahora('2026-11-20 10:16');
select tenis_procesar();
select pg_temp.espera(pg_temp.estado('g2') || '/' || pg_temp.avisos('g2'), 'vencida/', 'hold vencido: sin aviso');
select pg_temp.ahora('2026-11-20 10:00');

-- Reserva telefónica: S1 titular (no se avisa), S3 jugador.
select pg_temp.como('gestor');
select pg_temp.guardar('t', tenis_reservar_staff(pg_temp.ca(3), pg_temp.t('2026-11-21 10:00'), 'singles',
  pg_temp.j(3), '{"socio_id":"b0000000-0000-0000-0000-000000000001"}', 'telefonica'));
select pg_temp.espera(pg_temp.avisos('t'), 'S3', 'reserva telefónica: aviso al jugador socio, no al titular');

-- Corrección: sale S2 (su aviso pendiente se borra), entra S4.
select pg_temp.como('canchero');
select tenis_jugadores_corregir(pg_temp.id('a'), pg_temp.j(4));
select pg_temp.espera(pg_temp.avisos('a'), 'S4', 'corregir: aviso al que se suma; el pendiente del que sale no sale');
select tenis_jugadores_corregir(pg_temp.id('a'), pg_temp.j(4));
select pg_temp.espera(pg_temp.avisos('a'), 'S4', 'corregir con los mismos jugadores no agrega avisos');

-- Reserva cancelada antes de que salga el aviso.
select pg_temp.como('p4');
select pg_temp.guardar('c', tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-21 14:00'), 'singles', pg_temp.j(3)));
select tenis_cancelar(pg_temp.id('c'), 'no puedo');
select pg_temp.espera(pg_temp.avisos('c'), 'S3', 'la cancelación deja el aviso (lo descarta el reclamo)');

-- ─── Reclamo y marcado (cron) ─────────────────────────────────────────────────

select pg_temp.ahora('2026-11-20 10:05');
select pg_temp.espera(pg_temp.reclamar(), 'a:S4,b:S1,b:S2,b:S4,g1:S4,t:S3', 'reclamo: los pendientes de reservas vivas');
select pg_temp.espera(pg_temp.aviso('c', 3), 'descartado:reserva_inactiva', 'reclamo: reserva cancelada se descarta');
select pg_temp.espera((select (r->>'descartados') from t_reclamo), '1', 'reclamo: cuenta los descartados');
select pg_temp.espera(
  (select (e->>'titular_nombre') || '|' || (e->>'cancha') || '|' || (e->>'modalidad') || '|'
          || ((e->>'inicio')::timestamptz = pg_temp.t('2026-11-21 18:00'))::text
     from t_reclamo, jsonb_array_elements(r->'avisos') e where (e->>'reserva_id')::uuid = pg_temp.id('a')),
  'Pérez Juan|01|singles|true', 'reclamo: datos del turno y nombre del titular');
select pg_temp.espera(
  (select e->>'titular_nombre' from t_reclamo, jsonb_array_elements(r->'avisos') e
    where (e->>'reserva_id')::uuid = pg_temp.id('g1')),
  'Carla Invitada', 'reclamo: titular invitado con nombre y apellido');
select pg_temp.espera(pg_temp.reclamar(), '', 'un aviso reclamado no se vuelve a reclamar enseguida');

select tenis_avisos_jugadores_marcar(jsonb_build_array(
  pg_temp.resultado('a', 4, 'entregado'),
  pg_temp.resultado('b', 1, 'sin_dispositivo'),
  pg_temp.resultado('b', 2, 'error', 'expo 500'),
  pg_temp.resultado('b', 4, 'entregado'),
  pg_temp.resultado('g1', 4, 'entregado')));
select pg_temp.espera(pg_temp.aviso('a', 4) || ',' || pg_temp.aviso('b', 1) || ',' || pg_temp.aviso('b', 2),
  'enviado,descartado:sin_dispositivo,pendiente', 'marcar: entregado, sin teléfono, error para reintentar');
select pg_temp.espera((select error from tenis_avisos_jugadores where id = pg_temp.aviso_id('b', 2)), 'expo 500',
  'marcar: guarda el error');
select pg_temp.espera(pg_temp.reclamar(), 'b:S2', 'el error se reintenta en la corrida siguiente');
select tenis_avisos_jugadores_marcar(jsonb_build_array(pg_temp.resultado('b', 2, 'error', 'expo 500')));
select pg_temp.espera(pg_temp.reclamar(), 'b:S2', 'segundo reintento');
select tenis_avisos_jugadores_marcar(jsonb_build_array(pg_temp.resultado('b', 2, 'error', 'expo 500')));
select pg_temp.espera(pg_temp.aviso('b', 2), 'descartado:reintentos_agotados', 'al tercer error se deja de intentar');
select pg_temp.espera(
  (tenis_avisos_jugadores_marcar(jsonb_build_array(pg_temp.resultado('a', 4, 'error', 'tarde'))))->>'actualizados',
  '0', 'marcar un aviso ya enviado no lo toca');
select pg_temp.espera(pg_temp.aviso('a', 4), 'enviado', 'sigue enviado');

-- Un reclamo que el cron no llegó a marcar se puede volver a reclamar a los 10 minutos.
select pg_temp.espera(pg_temp.reclamar(), '', 't:S3 sigue reclamado (sin marcar)');
select pg_temp.ahora('2026-11-20 10:16');
select pg_temp.espera(pg_temp.reclamar(), 't:S3', 'reclamo sin marcar vuelve a salir a los 10 minutos');
select tenis_avisos_jugadores_marcar(jsonb_build_array(pg_temp.resultado('t', 3, 'entregado')));

-- Nunca dos veces: S4 ya fue avisado en 'a'; sale y vuelve a entrar.
select pg_temp.como('canchero');
select tenis_jugadores_corregir(pg_temp.id('a'), pg_temp.j(2));
select pg_temp.espera(pg_temp.avisos('a'), 'S2,S4', 'vuelve S2: aviso nuevo; el enviado de S4 queda');
select tenis_jugadores_corregir(pg_temp.id('a'), pg_temp.j(4));
select pg_temp.espera(pg_temp.avisos('a') || '/' || pg_temp.aviso('a', 4), 'S4/enviado',
  'vuelve S4: no hay segundo aviso; el pendiente de S2 se borra');

-- Turno que terminó antes de avisar: se descarta.
select pg_temp.como('p2');
select pg_temp.guardar('e', tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-20 12:00'), 'singles', pg_temp.j(1)));
select pg_temp.espera(pg_temp.avisos('e'), 'S1', 'reserva de hoy: aviso encolado');
select pg_temp.ahora('2026-11-20 13:05');
select pg_temp.espera(pg_temp.reclamar(), '', 'turno terminado: no se reclama');
select pg_temp.espera(pg_temp.aviso('e', 1), 'descartado:turno_pasado', 'turno terminado: descartado');

-- Extensión: los mismos jugadores siguen, no se avisa.
select pg_temp.ahora('2026-11-22 11:20');
select pg_temp.como('canchero');
select pg_temp.guardar('x', tenis_extension(pg_temp.ca(2), pg_temp.t('2026-11-22 12:00'), pg_temp.id('b')));
select pg_temp.espera((select origen from tenis_reservas where id = pg_temp.id('x')), 'extension', 'extensión creada');
select pg_temp.espera(pg_temp.avisos('x'), '', 'extensión: sin avisos');

rollback;
