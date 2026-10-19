-- Pruebas de escenario para la migración 20261026000000_recordatorio_eventos
-- (eventos.recordatorio_enviado_at, trigger que lo rearma al cambiar fecha/hora,
-- helper socio_habilitado_deporte y RPC reclamar_recordatorios_eventos).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name recordatorio-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec recordatorio-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase recordatorio-pg:/work
--   docker exec recordatorio-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/recordatorio_eventos.sql
--   docker rm -f recordatorio-pg
--
-- Mismas convenciones que agenda_socio.sql: stubs mínimos del schema real,
-- migraciones cargadas con \ir, cada fallo se anota en t_fallos y al final, si
-- hubo alguno, el script aborta. Todo corre dentro de una transacción con
-- ROLLBACK. La hora "actual" se pasa fija en p_ahora: 2026-11-02 23:05 UTC =
-- 20:05 en Argentina.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table profiles (
  id         uuid primary key,
  roles      text[] not null default '{socio}',
  divisiones uuid[],
  activo     boolean not null default true
);
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

create or replace function get_socio_id() returns uuid language sql security definer stable as $$
  select id from socios where profile_id = auth.uid()
$$;

-- ─── Migración bajo prueba ────────────────────────────────────────────────────
-- Si todavía no existe, el \ir aborta el script (RED).

\ir ../migrations/20261026000000_recordatorio_eventos.sql

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Divisiones: M15 (rugby), Vieja (rugby, inactiva), Sub 14 (hockey).
-- s1: servicio Rugby, juega M15 → recibe.
-- s2: sin servicios, juega M15 → no.
-- s3: categoría 'Becado Rugby', juega M15 → recibe.
-- s4: servicio Rugby, jugador inactivo en M15 → no.
-- s5: servicio Hockey, juega M15 y Sub 14 → sólo Sub 14.
-- Entrenadores: pe1 (M15 y Sub 14), pe2 (sólo Sub 14), pe3 (divisiones NULL),
-- pe4 (M15 pero inactivo), pm (manager con M15, no es entrenador).

insert into profiles (id, roles, divisiones, activo) values
  ('a0000000-0000-0000-0000-000000000001', '{socio}', null, true),
  ('a0000000-0000-0000-0000-000000000002', '{socio}', null, true),
  ('a0000000-0000-0000-0000-000000000003', '{socio}', null, true),
  ('a0000000-0000-0000-0000-000000000004', '{socio}', null, true),
  ('a0000000-0000-0000-0000-000000000005', '{socio}', null, true),
  ('b0000000-0000-0000-0000-000000000001', '{entrenador,socio}', '{d0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000003}', true),
  ('b0000000-0000-0000-0000-000000000002', '{entrenador}', '{d0000000-0000-0000-0000-000000000003}', true),
  ('b0000000-0000-0000-0000-000000000003', '{entrenador}', null, true),
  ('b0000000-0000-0000-0000-000000000004', '{entrenador}', '{d0000000-0000-0000-0000-000000000001}', false),
  ('b0000000-0000-0000-0000-000000000005', '{manager}', '{d0000000-0000-0000-0000-000000000001}', true);

insert into categorias_socio values
  ('c0000000-0000-0000-0000-000000000001', 'Activo'),
  ('c0000000-0000-0000-0000-000000000003', 'Becado Rugby');

insert into socios values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001');

insert into servicios_opcionales values
  ('e0000000-0000-0000-0000-000000000003', 'Rugby', true),
  ('e0000000-0000-0000-0000-000000000004', 'Hockey', true);

insert into socio_servicios values
  ('50000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000004');

insert into divisiones values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby', true),
  ('d0000000-0000-0000-0000-000000000002', 'Vieja', 'rugby', false),
  ('d0000000-0000-0000-0000-000000000003', 'Sub 14', 'hockey', true);

insert into jugadores (division_id, activo, socio_id) values
  ('d0000000-0000-0000-0000-000000000001', true,  '50000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000001', true,  '50000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000001', true,  '50000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000001', false, '50000000-0000-0000-0000-000000000004'),
  ('d0000000-0000-0000-0000-000000000001', true,  '50000000-0000-0000-0000-000000000005'),
  ('d0000000-0000-0000-0000-000000000003', true,  '50000000-0000-0000-0000-000000000005'),
  ('d0000000-0000-0000-0000-000000000001', true,  null);

-- Todos el 2026-11-02 (hora local). Ahora = 20:05.
insert into eventos (id, tipo, titulo, division_id, fecha, hora, lugar, cancelado) values
  ('e1000000-0000-0000-0000-000000000001', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:15', 'Gimnasio', false), -- en 10 min
  ('e1000000-0000-0000-0000-000000000002', 'actividad',     'Charla', 'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:35', null,       false), -- en 30 min (borde)
  ('e1000000-0000-0000-0000-000000000003', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:30', null,       false), -- zona horaria
  ('e1000000-0000-0000-0000-000000000004', 'partido',       null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:15', null,       false), -- partido
  ('e1000000-0000-0000-0000-000000000005', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:15', null,       true),  -- cancelado
  ('e1000000-0000-0000-0000-000000000006', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', null,    null,       false), -- sin hora
  ('e1000000-0000-0000-0000-000000000007', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:36', null,       false), -- en 31 min
  ('e1000000-0000-0000-0000-000000000008', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:00', null,       false), -- ya empezó
  ('e1000000-0000-0000-0000-000000000009', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-02', '20:05', null,       false), -- empieza ahora
  ('e1000000-0000-0000-0000-00000000000a', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000002', '2026-11-02', '20:15', null,       false), -- división inactiva
  ('e1000000-0000-0000-0000-00000000000b', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000003', '2026-11-02', '20:15', null,       false), -- Sub 14 (hockey)
  ('e1000000-0000-0000-0000-00000000000c', 'entrenamiento', null,     'd0000000-0000-0000-0000-000000000001', '2026-11-03', '20:15', null,       false); -- mañana

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);

create function t_espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    insert into t_fallos values (p_msg || ' → esperado ' || coalesce(p_esperado, 'NULL') || ', real ' || coalesce(p_real, 'NULL'));
    raise notice 'FALLA: % (esperado %, real %)', p_msg, p_esperado, p_real;
  else
    raise notice 'ok: %', p_msg;
  end if;
end $$;

-- Ids reclamados, ordenados, como texto.
create function t_ids(p jsonb) returns text language sql as $$
  select coalesce(string_agg(x->>'evento_id', ',' order by x->>'evento_id'), '') from jsonb_array_elements(p) x
$$;

create function t_fila(p jsonb, p_id text) returns jsonb language sql as $$
  select x from jsonb_array_elements(p) x where x->>'evento_id' = p_id
$$;

create table t_corrida (n int primary key, r jsonb not null);

-- ─── Casos ────────────────────────────────────────────────────────────────────

-- Primera corrida a las 20:05 (23:05 UTC).
insert into t_corrida values (1, reclamar_recordatorios_eventos('2026-11-02 23:05:00+00', 30));

select t_espera(t_ids((select r from t_corrida where n = 1)),
  'e1000000-0000-0000-0000-000000000001,e1000000-0000-0000-0000-000000000002,e1000000-0000-0000-0000-000000000003,e1000000-0000-0000-0000-00000000000b',
  'reclama entrenamientos y actividades en (ahora, ahora + 30 min] y nada más');

select t_espera(t_fila((select r from t_corrida where n = 1), 'e1000000-0000-0000-0000-000000000003')->>'hora', '20:30:00',
  'zona horaria: 20:30 local se reclama a las 23:05 UTC');

select t_espera(
  (select jsonb_build_object('tipo', x->'tipo', 'titulo', x->'titulo', 'lugar', x->'lugar', 'fecha', x->'fecha',
          'division_id', x->'division_id', 'division_nombre', x->'division_nombre')
     from (select t_fila((select r from t_corrida where n = 1), 'e1000000-0000-0000-0000-000000000002') x) s)::text,
  '{"fecha": "2026-11-02", "lugar": null, "tipo": "actividad", "titulo": "Charla", "division_id": "d0000000-0000-0000-0000-000000000001", "division_nombre": "M15"}'::jsonb::text,
  'la fila trae tipo, título, lugar, fecha y división');

select t_espera((t_fila((select r from t_corrida where n = 1), 'e1000000-0000-0000-0000-000000000001')->'socio_ids')::text,
  '["50000000-0000-0000-0000-000000000001", "50000000-0000-0000-0000-000000000003"]',
  'destinatarios de M15: con servicio Rugby y becado; sin servicio, inactivo, de otro deporte y sin socio quedan afuera');

select t_espera((t_fila((select r from t_corrida where n = 1), 'e1000000-0000-0000-0000-00000000000b')->'socio_ids')::text,
  '["50000000-0000-0000-0000-000000000005"]',
  'destinatarios de Sub 14: el de servicio Hockey');

select t_espera((t_fila((select r from t_corrida where n = 1), 'e1000000-0000-0000-0000-000000000001')->'entrenador_profile_ids')::text,
  '["b0000000-0000-0000-0000-000000000001"]',
  'entrenadores de M15: sólo el activo con M15 asignada (no NULL, no inactivo, no manager)');

select t_espera((t_fila((select r from t_corrida where n = 1), 'e1000000-0000-0000-0000-00000000000b')->'entrenador_profile_ids')::text,
  '["b0000000-0000-0000-0000-000000000001", "b0000000-0000-0000-0000-000000000002"]',
  'entrenadores de Sub 14: los dos que la tienen asignada');

select t_espera((select count(*)::text from eventos where recordatorio_enviado_at = '2026-11-02 23:05:00+00'), '4',
  'marca recordatorio_enviado_at en los reclamados');

-- Segunda corrida: no vuelve a reclamar nada.
select t_espera(reclamar_recordatorios_eventos('2026-11-02 23:05:00+00', 30)::text, '[]',
  'una segunda corrida no reclama nada');
select t_espera(reclamar_recordatorios_eventos('2026-11-02 23:05:30+00', 30)::text, '[]',
  'la corrida siguiente tampoco repite los ya avisados (20:36 todavía está a más de 30 min)');

-- Cambiar otro campo no rearma; cambiar la hora sí.
update eventos set lugar = 'Cancha 1' where id = 'e1000000-0000-0000-0000-000000000002';
select t_espera((select (recordatorio_enviado_at is not null)::text from eventos where id = 'e1000000-0000-0000-0000-000000000002'), 'true',
  'cambiar el lugar no rearma el recordatorio');

update eventos set hora = '20:20' where id = 'e1000000-0000-0000-0000-000000000001';
select t_espera((select (recordatorio_enviado_at is null)::text from eventos where id = 'e1000000-0000-0000-0000-000000000001'), 'true',
  'cambiar la hora rearma el recordatorio');
update eventos set fecha = '2026-11-03' where id = 'e1000000-0000-0000-0000-000000000003';
select t_espera((select (recordatorio_enviado_at is null)::text from eventos where id = 'e1000000-0000-0000-0000-000000000003'), 'true',
  'cambiar la fecha rearma el recordatorio');

select t_espera(t_ids(reclamar_recordatorios_eventos('2026-11-02 23:06:00+00', 30)),
  'e1000000-0000-0000-0000-000000000001,e1000000-0000-0000-0000-000000000007',
  'tras cambiar la hora se reclama de nuevo (y entra el de las 20:36)');

-- Permisos.
select t_espera(has_function_privilege('authenticated', 'reclamar_recordatorios_eventos(timestamptz, integer)', 'execute')::text, 'false',
  'authenticated no puede reclamar');
select t_espera(has_function_privilege('anon', 'reclamar_recordatorios_eventos(timestamptz, integer)', 'execute')::text, 'false',
  'anon no puede reclamar');
select t_espera(has_function_privilege('service_role', 'reclamar_recordatorios_eventos(timestamptz, integer)', 'execute')::text, 'true',
  'service_role puede reclamar');
select t_espera(has_function_privilege('authenticated', 'socio_habilitado_deporte(uuid, text)', 'execute')::text, 'false',
  'authenticated no puede usar el helper interno');
select t_espera(has_function_privilege('anon', 'socio_habilitado_deporte(uuid, text)', 'execute')::text, 'false',
  'anon no puede usar el helper interno');
select t_espera(
  (select prosecdef::text from pg_proc where proname = 'reclamar_recordatorios_eventos'), 'true',
  'el RPC es SECURITY DEFINER');

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
