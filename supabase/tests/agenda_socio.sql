-- Pruebas de escenario para la migración 20261023000000_agenda_socio
-- (RPC agenda_socio: eventos de las divisiones del socio + si tiene gimnasio).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name agenda-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec agenda-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase agenda-pg:/work
--   docker exec agenda-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/agenda_socio.sql
--   docker rm -f agenda-pg
--
-- Mismas convenciones que eventos_actividad.sql: stubs mínimos del schema real,
-- migración cargada con \ir, cada fallo se anota en t_fallos y al final, si
-- hubo alguno, el script aborta. Todo corre dentro de una transacción con
-- ROLLBACK. auth.uid() se simula con el setting `test.uid`.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table profiles (id uuid primary key);
create table categorias_socio (id uuid primary key, nombre text not null);
create table socios (
  id           uuid primary key,
  profile_id   uuid references profiles(id),
  categoria_id uuid not null references categorias_socio(id)
);
create table servicios_opcionales (id uuid primary key, nombre text not null, activo boolean not null default true);
create table socio_servicios (
  socio_id    uuid not null references socios(id),
  servicio_id uuid not null references servicios_opcionales(id),
  unique (socio_id, servicio_id)
);
create table divisiones (
  id      uuid primary key,
  nombre  text not null,
  deporte text not null default 'rugby',
  activa  boolean not null default true
);
create table jugadores (
  id          uuid default gen_random_uuid() primary key,
  division_id uuid not null references divisiones(id),
  activo      boolean not null default true,
  socio_id    uuid references socios(id)
);
create table eventos (
  id          uuid default gen_random_uuid() primary key,
  tipo        text not null,
  titulo      text,
  division_id uuid not null references divisiones(id),
  fecha       date not null,
  hora        time,
  lugar       text,
  rival       text,
  modalidad   text,
  cancelado   boolean not null default false
);

-- Copia de 20260601000000_socios_schema.
create or replace function get_socio_id() returns uuid language sql security definer stable as $$
  select id from socios where profile_id = auth.uid()
$$;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- p1: juega en M15 (rugby), sin gimnasio.
-- p2: socio con servicio "Gimnasio" activo, sin división.
-- p3: categoría 'Cliente Gimnasio', sin división.
-- p4: nada (sólo un servicio inactivo de gimnasio y un jugador inactivo).
-- p5: perfil sin fila en socios (p. ej. staff).
-- p6: juega en M15 y en Sub 14 (hockey) y en una división inactiva.

insert into profiles values
  ('a0000000-0000-0000-0000-000000000001'), ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'), ('a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005'), ('a0000000-0000-0000-0000-000000000006');

insert into categorias_socio values
  ('c0000000-0000-0000-0000-000000000001', 'Activo'),
  ('c0000000-0000-0000-0000-000000000002', 'Cliente Gimnasio');

insert into socios values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001');

insert into servicios_opcionales values
  ('e0000000-0000-0000-0000-000000000001', 'Gimnasio', true),
  ('e0000000-0000-0000-0000-000000000002', 'Gimnasio (viejo)', false),
  ('e0000000-0000-0000-0000-000000000003', 'Rugby', true);

insert into socio_servicios values
  ('50000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000002');

insert into divisiones values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby', true),
  ('d0000000-0000-0000-0000-000000000002', 'Sub 14', 'hockey', true),
  ('d0000000-0000-0000-0000-000000000003', 'M17', 'rugby', true),
  ('d0000000-0000-0000-0000-000000000004', 'Vieja', 'rugby', false);

insert into jugadores (division_id, activo, socio_id) values
  ('d0000000-0000-0000-0000-000000000001', true,  '50000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', false, '50000000-0000-0000-0000-000000000004'),
  ('d0000000-0000-0000-0000-000000000001', true,  '50000000-0000-0000-0000-000000000006'),
  ('d0000000-0000-0000-0000-000000000002', true,  '50000000-0000-0000-0000-000000000006'),
  ('d0000000-0000-0000-0000-000000000004', true,  '50000000-0000-0000-0000-000000000006');

insert into eventos (id, tipo, titulo, division_id, fecha, hora, rival, cancelado) values
  ('e1000000-0000-0000-0000-000000000001', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000001', current_date + 2, '19:00', null, false),
  ('e1000000-0000-0000-0000-000000000002', 'partido', null,      'd0000000-0000-0000-0000-000000000001', current_date + 5, '10:00', 'Los Tilos', false),
  ('e1000000-0000-0000-0000-000000000003', 'actividad', 'Charla', 'd0000000-0000-0000-0000-000000000001', current_date + 2, '08:00', null, false),
  ('e1000000-0000-0000-0000-000000000004', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000001', current_date + 3, null, null, true),   -- cancelado
  ('e1000000-0000-0000-0000-000000000005', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000001', current_date - 1, null, null, false),  -- pasado
  ('e1000000-0000-0000-0000-000000000006', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000001', current_date + 90, null, null, false), -- fuera de la ventana default
  ('e1000000-0000-0000-0000-000000000007', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000003', current_date + 2, null, null, false),  -- otra división
  ('e1000000-0000-0000-0000-000000000008', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000002', current_date + 4, null, null, false),  -- Sub 14
  ('e1000000-0000-0000-0000-000000000009', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000004', current_date + 4, null, null, false),  -- división inactiva
  ('e1000000-0000-0000-0000-00000000000a', 'entrenamiento', null, 'd0000000-0000-0000-0000-000000000001', current_date + 200, null, null, false);-- más allá del tope

-- ─── Migración bajo prueba ────────────────────────────────────────────────────
-- Si todavía no existe, el \ir aborta el script (RED).

\ir ../migrations/20261023000000_agenda_socio.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);

create function t_espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    insert into t_fallos values (p_msg);
    raise notice 'FALLO - % (esperado %, obtenido %)', p_msg, p_esperado, p_real;
  else
    raise notice 'ok   - %', p_msg;
  end if;
end $$;

-- Agenda del perfil indicado (ventana por defecto o explícita).
create function t_agenda(p_uid text, p_desde date default null, p_hasta date default null) returns jsonb
language plpgsql as $$
begin
  perform set_config('test.uid', coalesce(p_uid, ''), true);
  if p_desde is null then return agenda_socio(); end if;
  return agenda_socio(p_desde, p_hasta);
end $$;

-- Ids de eventos (sufijo) en el orden devuelto.
create function t_ids(p jsonb) returns text language sql as $$
  select coalesce(string_agg(right(e->>'id', 1), ',' order by ord), '')
  from jsonb_array_elements(p->'eventos') with ordinality as t(e, ord)
$$;

create function t_divs(p jsonb) returns text language sql as $$
  select coalesce(string_agg(d->>'nombre', ',' order by d->>'nombre'), '')
  from jsonb_array_elements(p->'divisiones') d
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Casos
-- ═════════════════════════════════════════════════════════════════════════════

-- p1: división M15, sin gimnasio.
select t_espera(t_agenda('a0000000-0000-0000-0000-000000000001')->>'tiene_gimnasio', 'false',
  'socio con sólo servicio de rugby no tiene gimnasio');
select t_espera(t_divs(t_agenda('a0000000-0000-0000-0000-000000000001')), 'M15',
  'socio jugador ve su división');
select t_espera(t_ids(t_agenda('a0000000-0000-0000-0000-000000000001')), '3,1,2',
  'sólo eventos de su división, no cancelados, dentro de la ventana, ordenados por fecha y hora');
select t_espera(
  (t_agenda('a0000000-0000-0000-0000-000000000001')->'eventos'->2)->>'rival', 'Los Tilos',
  'el partido trae el rival');
select t_espera(
  (t_agenda('a0000000-0000-0000-0000-000000000001')->'eventos'->0)->>'titulo', 'Charla',
  'la actividad trae su título');
select t_espera(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(t_agenda('a0000000-0000-0000-0000-000000000001')->'eventos'->0) k),
  'division_id,fecha,hora,id,lugar,modalidad,rival,tipo,titulo',
  'cada evento trae exactamente las columnas acordadas');

-- Ventana explícita y tope.
select t_espera(t_ids(t_agenda('a0000000-0000-0000-0000-000000000001', current_date - 2, current_date + 100)), '5,3,1,2,6',
  'ventana explícita incluye pasados y lejanos');
select t_espera(t_ids(t_agenda('a0000000-0000-0000-0000-000000000001', current_date, current_date + 1000)), '3,1,2,6',
  'la ventana se recorta a 120 días');

-- Gimnasio.
select t_espera(t_agenda('a0000000-0000-0000-0000-000000000002')::text,
  '{"eventos": [], "divisiones": [], "tiene_gimnasio": true}',
  'gimnasio por servicio activo, sin división');
select t_espera(t_agenda('a0000000-0000-0000-0000-000000000003')->>'tiene_gimnasio', 'true',
  'gimnasio por categoría Cliente Gimnasio');

-- Nada.
select t_espera(t_agenda('a0000000-0000-0000-0000-000000000004')::text,
  '{"eventos": [], "divisiones": [], "tiene_gimnasio": false}',
  'servicio de gimnasio inactivo y jugador inactivo no cuentan');
select t_espera(t_agenda('a0000000-0000-0000-0000-000000000005')::text,
  '{"eventos": [], "divisiones": [], "tiene_gimnasio": false}',
  'perfil sin socio recibe agenda vacía');
select t_espera(t_agenda(null)::text,
  '{"eventos": [], "divisiones": [], "tiene_gimnasio": false}',
  'sin sesión recibe agenda vacía');

-- Varias divisiones.
select t_espera(t_divs(t_agenda('a0000000-0000-0000-0000-000000000006')), 'M15,Sub 14',
  'varias divisiones activas, sin la inactiva');
select t_espera(t_ids(t_agenda('a0000000-0000-0000-0000-000000000006')), '3,1,8,2',
  'eventos de todas sus divisiones activas, nunca de la inactiva ni de otras');

-- Permisos.
select t_espera(has_function_privilege('authenticated', 'agenda_socio(date, date)', 'execute')::text, 'true',
  'authenticated puede ejecutar');
select t_espera(has_function_privilege('anon', 'agenda_socio(date, date)', 'execute')::text, 'false',
  'anon no puede ejecutar');
select t_espera(
  (select prosecdef::text from pg_proc where proname = 'agenda_socio'), 'true',
  'es SECURITY DEFINER');

-- ─── Resultado ────────────────────────────────────────────────────────────────

do $$
declare
  v_n int;
begin
  select count(*) into v_n from t_fallos;
  if v_n > 0 then
    raise exception 'FALLARON % casos: %', v_n, (select string_agg(msg, ' / ') from t_fallos);
  end if;
  raise notice 'TODOS LOS CASOS OK';
end $$;

rollback;
