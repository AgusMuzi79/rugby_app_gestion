-- Pruebas de la migración 20261128000000_tenis_paridad_ondepor (tenis como OnDepor):
-- horarios por día, ventana de 7 días, nombres en la grilla, comentario, "Socio a designar",
-- invitados sin DNI, disponibilidad semanal, historial, canceladas, listado, cancelación
-- masiva, reportes, cartelera, check-in con pendientes y cotización.
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_paridad_ondepor.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs y utilidades que tenis_detalles_edicion.sql (copiados: cada archivo corre solo,
-- dentro de una transacción que termina en ROLLBACK). Carga las cinco migraciones de tenis en
-- orden. auth.uid() sale del GUC test.uid y "ahora" del GUC test.ahora. Por defecto: viernes
-- 2026-11-20 10:00 hora argentina (se puede reservar hasta el domingo 22, se ve hasta el 26).

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
\ir ../migrations/20261126000000_tenis_editar_reserva.sql
\ir ../migrations/20261127000000_tenis_detalles_edicion.sql
\ir ../migrations/20261128000000_tenis_paridad_ondepor.sql

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

-- Intenta y deshace: 'ok' si la sentencia pasa (sin dejar nada escrito) o el código de error.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception using errcode = 'TQ999', message = 'deshacer';
  exception
    when sqlstate 'TQ999' then return 'ok';
    when others then return sqlerrm;
  end;
end $$;
-- Versiones del historial de una reserva: 'v:accion,...'.
create function pg_temp.versiones(k text) returns text language sql as $$
  select coalesce(string_agg(version || ':' || accion, ',' order by version), '')
  from tenis_reservas_historial where reserva_id = pg_temp.id(k)
$$;
-- Fila "a designar" de una reserva: 'cargo/motivo' (la primera).
create function pg_temp.cargo_ad(k text) returns text language sql as $$
  select cargo || '/' || motivo_cargo from tenis_reserva_jugadores
  where reserva_id = pg_temp.id(k) and a_designar order by id limit 1
$$;
create function pg_temp.n_ad(k text) returns text language sql as $$
  select count(*)::text from tenis_reserva_jugadores where reserva_id = pg_temp.id(k) and a_designar
$$;
-- Item de una reserva en tenis_disponibilidad (cancha n, hora local 'YYYY-MM-DD HH:MI').
create function pg_temp.item_disp(p_fecha date, p_cancha int, p_hora text) returns jsonb language sql as $$
  select e from jsonb_array_elements((tenis_disponibilidad(p_fecha))->'items') e
  where (e->>'cancha_id')::uuid = pg_temp.ca(p_cancha) and (e->>'inicio')::timestamptz = pg_temp.t(p_hora)
$$;
-- Slot de la disponibilidad semanal: 'libres/total' (fecha, hora 'HH:MM').
create function pg_temp.slot(p_sem jsonb, p_fecha text, p_hora text) returns text language sql as $$
  select s->>'libres' || '/' || (s->>'total')
  from jsonb_array_elements(p_sem) d, jsonb_array_elements(d->'slots') s
  where d->>'fecha' = p_fecha and s->>'hora' = p_hora
$$;
-- Fila de un reporte del miércoles 25 por clave = valor: el campo pedido.
create function pg_temp.rep(p_tipo text, p_clave text, p_valor text, p_campo text) returns text language sql as $$
  select f->>p_campo from jsonb_array_elements((tenis_reporte(p_tipo, '2026-11-25', '2026-11-25'))->'filas') f
  where f->>p_clave = p_valor
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Tablas y permisos
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera((select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class
  where relname in ('tenis_horarios', 'tenis_reservas_historial', 'tenis_novedades') and relkind = 'r'),
  'tenis_horarios=true,tenis_novedades=true,tenis_reservas_historial=true', 'RLS activa en las tablas nuevas');
select pg_temp.espera((select coalesce(string_agg(t, ','), '') from unnest(array['tenis_horarios',
  'tenis_reservas_historial', 'tenis_novedades']) t where has_table_privilege('authenticated', t, 'select')),
  '', 'authenticated no lee las tablas nuevas directo');

-- RPC de clientes: authenticated sí (validan el rol adentro), anon no.
create temp table t_rpc (f text);
insert into t_rpc values
  ('tenis_horarios_guardar(jsonb)'), ('tenis_disponibilidad_semana(date, int, text)'),
  ('tenis_reserva_historial(uuid)'), ('tenis_canceladas_listar(date, date, text, text, text, int, int)'),
  ('tenis_reservas_listar(date, date, text, uuid, text, text, int, int)'), ('tenis_cancelar_varias(uuid[], text)'),
  ('tenis_reporte(text, date, date)'), ('tenis_novedades_listar(int)'), ('tenis_novedad_guardar(jsonb)'),
  ('tenis_novedad_borrar(uuid)'), ('tenis_cotizar(uuid, timestamptz, text, jsonb, uuid, uuid)'),
  ('tenis_reservar(uuid, timestamptz, text, jsonb, text)'),
  ('tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text, text)'),
  ('tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb, text)');
select pg_temp.espera((select coalesce(string_agg(f, ','), '') from t_rpc where has_function_privilege('anon', f, 'execute')),
  '', 'anon no ejecuta ninguna RPC nueva');
select pg_temp.espera((select coalesce(string_agg(f, ','), '') from t_rpc
  where not has_function_privilege('authenticated', f, 'execute')), '', 'authenticated ejecuta todas las RPC nuevas');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_audiencia_novedades()', 'execute')::text
  || '/' || has_function_privilege('service_role', 'tenis_audiencia_novedades()', 'execute')::text,
  'false/true', 'audiencia de la cartelera: sólo service_role');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_novedad_marcar_enviada(uuid, int, int)', 'execute')::text
  || '/' || has_function_privilege('service_role', 'tenis_novedad_marcar_enviada(uuid, int, int)', 'execute')::text,
  'false/true', 'marcar novedad enviada: sólo service_role');
select pg_temp.espera(has_function_privilege('authenticated',
  'tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text, text)', 'execute')::text
  || '/' || has_function_privilege('service_role',
  'tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text, text)', 'execute')::text,
  'false/true', 'tenis_invitado_reservar con comentario: sólo service_role');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_historial_registrar(uuid, text)', 'execute')::text,
  'false', 'el helper del historial no es invocable por clientes');
select pg_temp.espera((select coalesce(string_agg(f, ','), '') from unnest(array[
  'tenis_reservar(uuid, timestamptz, text, jsonb)', 'tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text)',
  'tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb)',
  'tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text)']) f where to_regprocedure(f) is not null), '',
  'las firmas viejas (sin comentario) ya no existen: no hay sobrecargas ambiguas');

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Horarios por día de la semana
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera((select string_agg(dia_semana || '=' || to_char(hora_desde, 'HH24:MI') || '-'
  || to_char(hora_hasta, 'HH24:MI') || case when activo then '' else 'x' end, ',' order by dia_semana) from tenis_horarios),
  '1=08:00-22:00,2=08:00-22:00,3=08:00-22:00,4=08:00-22:00,5=08:00-22:00,6=09:00-22:00,7=10:00-17:00',
  'seed: lunes a viernes 08–22, sábado 09–22, domingo 10–17');

select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 08:00'), 'singles', pg_temp.j(2))$$),
  'fuera_de_horario', 'sábado abre a las 09:00');
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 09:00'), 'singles', pg_temp.j(2))$$),
  'ok', 'sábado 09:00 se puede');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(7), pg_temp.t('2026-11-22 16:30'), 'singles', pg_temp.j(2))$$),
  'fuera_de_horario', 'domingo cierra a las 17:00 (16:30 singles termina 17:30)');
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(7), pg_temp.t('2026-11-22 16:00'), 'singles', pg_temp.j(2))$$),
  'ok', 'domingo 16:00 singles termina justo al cierre');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(7), pg_temp.t('2026-11-22 15:30'), 'singles', pg_temp.j(2))$$),
  'hueco_invalido', 'optimizador con el cierre del día: no deja media hora antes de las 17:00');

select pg_temp.espera((tenis_disponibilidad('2026-11-22'))->>'horario', '{"desde": "10:00", "hasta": "17:00", "abierto": true}',
  'disponibilidad trae el horario del día pedido');
select pg_temp.espera(jsonb_array_length((tenis_disponibilidad('2026-11-22'))->'config'->'horarios')::text, '7',
  'config trae los horarios de los 7 días');
select pg_temp.espera((tenis_disponibilidad('2026-11-22'))->'config'->'horarios'->5->>'hora_desde', '09:00',
  'horarios en formato HH:MM');

-- Permisos y validación de tenis_horarios_guardar.
select pg_temp.espera(pg_temp.err($$select tenis_horarios_guardar('[{"dia_semana": 7, "activo": false}]')$$),
  'no_autorizado', 'socio no cambia horarios');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_horarios_guardar('[{"dia_semana": 7, "activo": false}]')$$),
  'no_autorizado', 'canchero no cambia horarios');
select pg_temp.como('gestor');
select pg_temp.espera(pg_temp.err($$select tenis_horarios_guardar('[{"dia_semana": 8, "hora_desde": "08:00", "hora_hasta": "20:00"}]')$$),
  'config_invalida', 'día fuera de 1..7');
select pg_temp.espera(pg_temp.err($$select tenis_horarios_guardar('[{"dia_semana": 1, "hora_desde": "20:00", "hora_hasta": "08:00"}]')$$),
  'config_invalida', 'desde después de hasta');
select pg_temp.espera(jsonb_array_length(tenis_horarios_guardar('{"horarios": [{"dia_semana": 7, "activo": false}]}'))::text, '7',
  'gestor cierra el domingo (acepta {horarios:[...]}) y recibe los 7 días');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(7), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(2))$$),
  'fuera_de_horario', 'día cerrado: no se reserva');
select pg_temp.espera((tenis_disponibilidad('2026-11-22'))->'horario'->>'abierto', 'false', 'disponibilidad: día cerrado');
select pg_temp.espera((select d->'slots' from jsonb_array_elements(tenis_disponibilidad_semana('2026-11-22', 1)) d)::text, '[]',
  'semana: día cerrado sin slots');
select pg_temp.como('gestor');
select pg_temp.espera((select h->>'hora_hasta' from jsonb_array_elements(
  tenis_horarios_guardar('[{"dia_semana": 7, "activo": true}]')) h where (h->>'dia_semana')::int = 7), '17:00',
  'reabrir el domingo conserva sus horas');
select pg_temp.espera((select string_agg(h->>'dia_semana', ',') from jsonb_array_elements(
  (tenis_config_guardar('{}'))->'horarios') h), '1,2,3,4,5,6,7', 'tenis_config_guardar devuelve los horarios');
select pg_temp.espera((tenis_grilla('2026-11-21'))->'horario'->>'desde', '09:00', 'grilla trae el horario del día');

-- Sin fila para el día: vale el horario de tenis_config (08–22).
delete from tenis_horarios where dia_semana = 6;
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 08:00'), 'singles', pg_temp.j(2))$$),
  'ok', 'sin fila del sábado: fallback a tenis_config (08:00)');
insert into tenis_horarios (dia_semana, hora_desde, hora_hasta) values (6, '09:00', '22:00');

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Ventana de vista (dias_vista)
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera((tenis_disponibilidad('2026-11-22'))->'config'->>'dias_vista', '7', 'dias_vista por defecto 7');
select pg_temp.espera((tenis_disponibilidad('2026-11-22'))->>'reservable', 'true', 'domingo 22: reservable');
select pg_temp.espera((tenis_disponibilidad('2026-11-26'))->>'reservable', 'false', 'jueves 26: se ve, no se reserva');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad('2026-11-27')$$), 'fuera_de_vista', 'socio: día 8 fuera de la vista');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad('2026-11-19')$$), 'fuera_de_vista', 'socio: ayer fuera de la vista');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad('2026-12-10')$$), 'ok', 'canchero: sin ventana');
select pg_temp.como('gestor');
select pg_temp.espera(pg_temp.err($$select tenis_grilla('2026-11-19')$$), 'ok', 'gestor: grilla de días pasados');
select pg_temp.espera((tenis_grilla('2026-11-26'))->>'reservable', 'false', 'grilla: reservable según anticipación');
select pg_temp.espera(pg_temp.err($$select tenis_config_guardar('{"dias_vista": 0}')$$), 'config_invalida', 'dias_vista >= 1');
select pg_temp.espera((tenis_config_guardar('{"dias_vista": 10}'))->>'dias_vista', '10', 'gestor cambia dias_vista');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad('2026-11-29')$$), 'ok', 'con dias_vista 10 se ve el 29');
select pg_temp.como('gestor');
select tenis_config_guardar('{"dias_vista": 7}');

-- ═════════════════════════════════════════════════════════════════════════════
-- 4–6. Comentario, "Socio a designar" e invitados sin DNI
-- ═════════════════════════════════════════════════════════════════════════════
-- ad: p1 (S1, carnet) dobles cancha 01 sábado 21 10:00 con S2, un "a designar" e invitada sin DNI.

select pg_temp.como('p1');
select pg_temp.guardar('ad', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'dobles',
  '[{"socio_id": "b0000000-0000-0000-0000-000000000002"}, {"a_designar": true},
    {"invitado": {"nombre": " Carla ", "apellido": "Ruiz"}}]', '  Traigo pelotas  '));
select pg_temp.espera((select comentario from tenis_reservas where id = pg_temp.id('ad')), 'Traigo pelotas',
  'comentario guardado sin espacios de más');
select pg_temp.espera((tenis_reserva_resumen(pg_temp.id('ad')))->>'comentario', 'Traigo pelotas', 'el resumen trae el comentario');
select pg_temp.espera(pg_temp.cargo_ad('ad'), '10000/a_designar', 'a designar: precio socio dobles, motivo a_designar');
select pg_temp.espera((select (socio_id is null and invitado_id is null)::text from tenis_reserva_jugadores
  where reserva_id = pg_temp.id('ad') and a_designar), 'true', 'a designar: sin socio ni invitado');
select pg_temp.espera((select j.cargo || '/' || j.motivo_cargo || '/' || coalesce(i.dni, 'null') from tenis_reserva_jugadores j
  join tenis_invitados i on i.id = j.invitado_id where j.reserva_id = pg_temp.id('ad')), '18000/no_socio/null',
  'invitada sin DNI: precio no socio, dni null');
select pg_temp.espera((tenis_reserva_resumen(pg_temp.id('ad')))->>'total', '38000', 'total 0 + 10000 + 10000 + 18000');
select pg_temp.espera((select string_agg((e->>'nombre') || ':' || (e->>'a_designar'), ',' order by e->>'nombre')
  from jsonb_array_elements((tenis_reserva_resumen(pg_temp.id('ad')))->'jugadores') e),
  'Carla Ruiz:false,Gómez Ana:false,Pérez Juan:false,Socio a designar:true', 'nombres del resumen (a designar incluido)');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(2), repeat('x', 281))$$),
  'comentario_largo', 'comentario de más de 280 caracteres');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-22 12:00'), 'singles',
  '[{"invitado": {"nombre": "Solo"}}]')$$), 'invitado_incompleto', 'invitado sin DNI exige nombre y apellido');
select pg_temp.espera(pg_temp.err($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-22 12:00'), 'singles',
  '[{"invitado": {"dni": "12", "nombre": "A", "apellido": "B"}}]')$$), 'dni_invalido', 'DNI inválido sigue fallando');

-- inv2: p2 singles cancha 02 sábado 14:00 con otra "Carla Ruiz" sin DNI → otra fila de invitado.
select pg_temp.como('p2');
select pg_temp.guardar('inv2', tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-21 14:00'), 'singles',
  '[{"invitado": {"nombre": "Carla", "apellido": "Ruiz"}}]'));
select pg_temp.espera((select count(*)::text from tenis_invitados where nombre = 'Carla' and dni is null), '2',
  'cada invitado sin DNI es una fila nueva');

-- Web de invitados: DNI obligatorio y sin "a designar"; acepta comentario.
select pg_temp.como('');
select pg_temp.espera(pg_temp.err($$select tenis_invitado_reservar(pg_temp.ca(3), pg_temp.t('2026-11-22 12:00'), 'singles',
  '{"dni": "30111222", "nombre": "Inv", "apellido": "Web", "email": "inv@x.com"}',
  '[{"invitado": {"nombre": "Sin", "apellido": "Dni"}}]', repeat('z', 64))$$), 'dni_invalido', 'web: jugador invitado sin DNI rechazado');
select pg_temp.espera(pg_temp.err($$select tenis_invitado_reservar(pg_temp.ca(3), pg_temp.t('2026-11-22 12:00'), 'singles',
  '{"dni": "30111222", "nombre": "Inv", "apellido": "Web", "email": "inv@x.com"}',
  '[{"a_designar": true}]', repeat('z', 64))$$), 'parametros', 'web: sin "a designar"');
select pg_temp.guardar('web', tenis_invitado_reservar(pg_temp.ca(3), pg_temp.t('2026-11-22 12:00'), 'singles',
  '{"dni": "30111222", "nombre": "Inv", "apellido": "Web", "email": "inv@x.com"}',
  '[{"invitado": {"dni": "30222333", "nombre": "Con", "apellido": "Dni"}}]', repeat('z', 64), 'Desde la web'));
select pg_temp.espera((select comentario from tenis_reservas where id = pg_temp.id('web')), 'Desde la web', 'web: comentario guardado');

-- Reserva telefónica con comentario y "a designar".
select pg_temp.como('gestor');
select pg_temp.guardar('tel', tenis_reservar_staff(pg_temp.ca(4), pg_temp.t('2026-11-21 18:00'), 'singles',
  '[{"a_designar": true}]', '{"socio_id": "b0000000-0000-0000-0000-000000000004"}', 'telefonica', 'Llamó'));
select pg_temp.espera((select comentario from tenis_reservas where id = pg_temp.id('tel')) || '/' || pg_temp.cargo_ad('tel'),
  'Llamó/9000/a_designar', 'telefónica: comentario y a designar a precio socio');
select pg_temp.espera(pg_temp.err($$select tenis_reservar_staff(pg_temp.ca(4), pg_temp.t('2026-11-21 20:00'), 'singles',
  '[{"socio_id": "b0000000-0000-0000-0000-000000000002"}]', '{"a_designar": true}')$$), 'parametros',
  'el titular no puede ser "a designar"');

-- Editar: el titular reemplaza al "a designar" (S3) y conserva a la invitada por invitado_id.
select pg_temp.como('p1');
create temp table t_inv as select invitado_id from tenis_reserva_jugadores where reserva_id = pg_temp.id('ad') and invitado_id is not null;
select tenis_editar_reserva(pg_temp.id('ad'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'dobles',
  jsonb_build_array(jsonb_build_object('socio_id', pg_temp.so(2)), jsonb_build_object('socio_id', pg_temp.so(3)),
    jsonb_build_object('invitado_id', (select invitado_id from t_inv))));
select pg_temp.espera(pg_temp.n_ad('ad') || '/' || pg_temp.cargo('ad', 3), '0/0/carnet_gratis',
  'editar: el "a designar" pasa a ser S3 (carnet gratis)');
select pg_temp.espera((select comentario from tenis_reservas where id = pg_temp.id('ad')), 'Traigo pelotas',
  'editar sin p_comentario conserva el comentario');
select tenis_editar_reserva(pg_temp.id('ad'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'dobles',
  jsonb_build_array(jsonb_build_object('socio_id', pg_temp.so(2)), jsonb_build_object('socio_id', pg_temp.so(3)),
    jsonb_build_object('invitado_id', (select invitado_id from t_inv))), '');
select pg_temp.espera(coalesce((select comentario from tenis_reservas where id = pg_temp.id('ad')), 'null'), 'null',
  'editar con comentario vacío lo borra');
select tenis_editar_reserva(pg_temp.id('ad'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'dobles',
  jsonb_build_array(jsonb_build_object('socio_id', pg_temp.so(2)), jsonb_build_object('a_designar', true),
    jsonb_build_object('invitado_id', (select invitado_id from t_inv))), 'Nuevo');
select pg_temp.espera(pg_temp.n_ad('ad') || '/' || pg_temp.cargo_ad('ad') || '/'
  || (select comentario from tenis_reservas where id = pg_temp.id('ad')), '1/10000/a_designar/Nuevo',
  'editar: vuelve un "a designar" y cambia el comentario');
create temp table t_ad as select id from tenis_reserva_jugadores where reserva_id = pg_temp.id('ad') and a_designar;
select tenis_editar_reserva(pg_temp.id('ad'), pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'dobles',
  jsonb_build_array(jsonb_build_object('socio_id', pg_temp.so(2)), jsonb_build_object('a_designar', true),
    jsonb_build_object('invitado_id', (select invitado_id from t_inv))));
select pg_temp.espera((select (id = (select id from t_ad))::text from tenis_reserva_jugadores
  where reserva_id = pg_temp.id('ad') and a_designar), 'true', 'editar: el "a designar" que sigue no se borra y reinserta');
select pg_temp.espera(pg_temp.versiones('ad'), '1:creada,2:jugadores,3:editada,4:editada',
  'historial: creada, cambio de jugadores, dos ediciones; editar sin cambios no agrega versión');

-- Canchero corrige: el "a designar" pasa a S2, y vuelve.
select pg_temp.como('canchero');
select tenis_jugadores_corregir(pg_temp.id('tel'), '[{"socio_id": "b0000000-0000-0000-0000-000000000002"}]');
select pg_temp.espera(pg_temp.n_ad('tel') || '/' || pg_temp.cargo('tel', 2), '0/9000/socio', 'corregir: reemplaza al "a designar"');
select tenis_jugadores_corregir(pg_temp.id('tel'), '[{"a_designar": true}]');
select pg_temp.espera(pg_temp.n_ad('tel'), '1', 'corregir acepta "a designar"');

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Nombres en la grilla del socio
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('p3');
select pg_temp.espera((select string_agg(e->>'nombre', ',' order by e->>'nombre')
  from jsonb_array_elements(pg_temp.item_disp('2026-11-21', 2, '2026-11-21 14:00')->'jugadores') e),
  'Carla Ruiz,Gómez Ana', 'socio ve los nombres de los jugadores de otra reserva');
select pg_temp.espera((select string_agg(k, ',' order by k) from jsonb_array_elements(
  pg_temp.item_disp('2026-11-21', 2, '2026-11-21 14:00')->'jugadores') e, jsonb_object_keys(e) k), 'nombre,nombre',
  'de otras reservas sólo viaja el nombre (sin ids ni DNI)');
select pg_temp.espera((pg_temp.item_disp('2026-11-21', 2, '2026-11-21 14:00') ? 'reserva_id')::text
  || '/' || (pg_temp.item_disp('2026-11-21', 2, '2026-11-21 14:00') ? 'comentario')::text, 'false/false',
  'ajena: sin reserva_id ni comentario');
select pg_temp.espera((select string_agg(e->>'nombre', ',' order by e->>'nombre')
  from jsonb_array_elements(pg_temp.item_disp('2026-11-21', 1, '2026-11-21 10:00')->'jugadores') e),
  'Carla Ruiz,Gómez Ana,Pérez Juan,Socio a designar', '"Socio a designar" visible en la grilla');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.item_disp('2026-11-21', 1, '2026-11-21 10:00')->>'comentario', 'Nuevo',
  'en la propia reserva viaja el comentario');

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Disponibilidad semanal
-- ═════════════════════════════════════════════════════════════════════════════

create temp table t_sem (k text primary key, v jsonb);
insert into t_sem values ('p1', tenis_disponibilidad_semana('2026-11-20'));
select pg_temp.espera((select string_agg((d->>'fecha') || ':' || (d->>'reservable'), ',' order by d->>'fecha')
  from jsonb_array_elements((select v from t_sem where k = 'p1')) d),
  '2026-11-20:true,2026-11-21:true,2026-11-22:true,2026-11-23:false,2026-11-24:false,2026-11-25:false,2026-11-26:false',
  'semana: 7 días, reservables hasta el 22');
select pg_temp.espera(pg_temp.slot((select v from t_sem where k = 'p1'), '2026-11-20', '10:00'), '0/8', 'semana: turno que ya empezó, 0 libres');
select pg_temp.espera(pg_temp.slot((select v from t_sem where k = 'p1'), '2026-11-20', '10:30'), '8/8', 'semana: hoy 10:30 todas libres');
select pg_temp.espera(pg_temp.slot((select v from t_sem where k = 'p1'), '2026-11-21', '10:00'), '7/8',
  'semana: sábado 10:00 una cancha ocupada');
select pg_temp.espera(pg_temp.slot((select v from t_sem where k = 'p1'), '2026-11-21', '09:30'), '0/8',
  'semana (socio): 09:30 deja media hora suelta antes → 0');
select pg_temp.espera(coalesce(pg_temp.slot((select v from t_sem where k = 'p1'), '2026-11-21', '08:30'), 'null'), 'null',
  'semana: el sábado no hay slots antes de las 09:00');
select pg_temp.espera((select (d->'slots'->-1)->>'hora' from jsonb_array_elements((select v from t_sem where k = 'p1')) d
  where d->>'fecha' = '2026-11-22'), '16:00', 'semana: último singles del domingo 16:00');
select pg_temp.espera((select (d->'slots'->-1)->>'hora' from jsonb_array_elements(tenis_disponibilidad_semana('2026-11-22', 1, 'dobles')) d),
  '15:30', 'semana dobles: último del domingo 15:30');
select pg_temp.espera(pg_temp.slot((select v from t_sem where k = 'p1'), '2026-11-21', '12:00'), '7/8',
  'semana: sábado 12:00, la cancha 01 dejaría 30 min sueltos tras las 11:30 (la 02 deja 1 h antes de las 14:00: ok)');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad_semana('2026-11-27')$$), 'fuera_de_vista', 'semana: fuera de la vista');
select pg_temp.espera(jsonb_array_length(tenis_disponibilidad_semana('2026-11-24', 7))::text, '3', 'semana: se corta en la vista (24..26)');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad_semana('2026-11-21', 7, 'mixto')$$), 'modalidad_invalida', 'semana: modalidad');
select pg_temp.como('gestor');
select pg_temp.espera(pg_temp.slot(tenis_disponibilidad_semana('2026-11-21', 1), '2026-11-21', '09:30'), '7/8',
  'semana (gestor): sin optimizador, 09:30 sólo choca con la cancha 01');
select pg_temp.como('');
select pg_temp.espera(pg_temp.err($$select tenis_disponibilidad_semana('2026-11-21')$$), 'no_autorizado', 'semana: anónimo no');

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Historial
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('canchero');
select tenis_cobro_marcar(pg_temp.fila('ad', 2), true);
select pg_temp.espera(pg_temp.versiones('ad'), '1:creada,2:jugadores,3:editada,4:editada,5:cobro', 'cobrar agrega versión cobro');
update tenis_reserva_jugadores set check_in_at = tenis_ahora() where reserva_id = pg_temp.id('ad') and es_titular;
select pg_temp.espera(pg_temp.versiones('ad'), '1:creada,2:jugadores,3:editada,4:editada,5:cobro', 'el check-in no es una versión');

select pg_temp.como('p1');
create temp table t_h (v jsonb);
insert into t_h select tenis_reserva_historial(pg_temp.id('ad'));
select pg_temp.espera((select (v->'reserva'->>'tipo') || '/' || (v->'reserva'->>'creada_por_nombre') from t_h),
  'reserva_web/Pérez Juan', 'historial: tipo y quién la creó');
select pg_temp.espera((select string_agg((x->>'version') || ':' || coalesce(x->>'hecho_por_nombre', 'null'), ','
  order by (x->>'version')::int) from t_h, jsonb_array_elements(v->'versiones') x),
  '1:Pérez Juan,2:Pérez Juan,3:Pérez Juan,4:Pérez Juan,5:Canchero', 'historial: quién hizo cada versión');
select pg_temp.espera((select string_agg(j->>'nombre', ',' order by j->>'nombre') from t_h,
  jsonb_array_elements(v->'versiones'->0->'snapshot'->'jugadores') j),
  'Carla Ruiz,Gómez Ana,Pérez Juan,Socio a designar', 'historial: la versión 1 guarda los jugadores originales');
select pg_temp.espera((select (v->'versiones'->0->'snapshot'->>'comentario') || '|' || (v->'versiones'->1->'snapshot'->>'cancha')
  || '|' || (v->'versiones'->0->'snapshot'->>'fecha') from t_h), 'Traigo pelotas|01|2026-11-21',
  'historial: snapshot con comentario, cancha y fecha');
select pg_temp.espera((select (v->'versiones'->4->'snapshot'->'jugadores') @> '[{"nombre": "Gómez Ana", "cobrado": true}]' from t_h)::text,
  'true', 'historial: la versión de cobro marca al jugador cobrado');
select pg_temp.como('p2');
select pg_temp.espera(pg_temp.err($$select tenis_reserva_historial(pg_temp.id('ad'))$$), 'no_autorizado',
  'historial: un jugador que no es el titular no lo ve');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_reserva_historial(pg_temp.id('ad'))$$), 'ok', 'historial: canchero lo ve');
select pg_temp.espera(pg_temp.err($$select tenis_reserva_historial(gen_random_uuid())$$), 'reserva_inexistente', 'historial: reserva inexistente');
select pg_temp.espera((select v->'reserva'->>'creada_por_nombre' from (select tenis_reserva_historial(pg_temp.id('web')) v) x),
  'Inv Web', 'historial: la reserva web de un invitado la crea el invitado');

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Canceladas
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('p2');
select pg_temp.guardar('can1', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-22 14:00'), 'singles', pg_temp.j(4)));
select tenis_cancelar(pg_temp.id('can1'), 'No puedo');
select pg_temp.espera((select cancelacion_anticipacion_min::text from tenis_reservas where id = pg_temp.id('can1')), '3120',
  'cancelada 52 h antes = 3120 minutos');
select pg_temp.espera(pg_temp.versiones('can1'), '1:creada,2:cancelada', 'cancelar agrega versión cancelada');
select pg_temp.como('canchero');
select tenis_cancelar(pg_temp.id('tel'), 'Lluvia');
select pg_temp.espera((select cancelacion_anticipacion_min::text from tenis_reservas where id = pg_temp.id('tel')), '1920',
  'el canchero también cancela (staff), 32 h antes');
select pg_temp.como('gestor');

select pg_temp.espera((tenis_canceladas_listar(null, null))->>'total', '2', 'canceladas: dos');
select pg_temp.espera((select (x->>'cancelado_por_tipo') || '/' || (x->>'cancelado_por_nombre') || '/' || (x->>'cancelacion_motivo')
  || '/' || (x->>'cancelacion_anticipacion_min') || '/' || (x->>'cancha_nombre')
  from jsonb_array_elements((tenis_canceladas_listar(null, null, null, null, 'titular'))->'items') x),
  'titular/Gómez Ana/No puedo/3120/01', 'canceladas: filtro por titular, con motivo, quién y anticipación');
select pg_temp.espera((select x->>'cancelado_por_tipo' from jsonb_array_elements((tenis_canceladas_listar(null, null, null, 'lluv'))->'items') x),
  'staff', 'canceladas: filtro por motivo (staff)');
select pg_temp.espera((tenis_canceladas_listar(null, null, 'díaz'))->>'total', '2', 'canceladas: búsqueda por nombre con o sin tildes');
select pg_temp.espera((tenis_canceladas_listar(null, null, '1002'))->>'total', '1', 'canceladas: búsqueda por número de socio');
select pg_temp.espera((tenis_canceladas_listar('2026-11-22', '2026-11-22'))->>'total', '1', 'canceladas: rango de fechas');
select pg_temp.espera(jsonb_array_length((tenis_canceladas_listar(null, null, null, null, null, 1, 1))->'items')::text, '1',
  'canceladas: paginado');
select pg_temp.espera(pg_temp.err($$select tenis_canceladas_listar(null, null, null, null, 'otro')$$), 'parametros',
  'canceladas: cancelado_por inválido');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_canceladas_listar(null, null)$$), 'ok', 'canceladas: canchero sí');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_canceladas_listar(null, null)$$), 'no_autorizado', 'canceladas: socio no');

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Listado de reservas
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('gestor');
select pg_temp.espera((tenis_reservas_listar('2026-11-21', '2026-11-21'))->>'total', '3', 'listado: sábado 21 (ad, inv2, tel)');
select pg_temp.espera((tenis_reservas_listar('2026-11-21', '2026-11-21', null, null, 'telefonica'))->>'total', '1', 'listado: por origen');
select pg_temp.espera((tenis_reservas_listar('2026-11-21', '2026-11-21', null, null, null, 'cancelada'))->>'total', '1', 'listado: por estado');
select pg_temp.espera((tenis_reservas_listar('2026-11-21', '2026-11-21', null, pg_temp.ca(1)))->>'total', '1', 'listado: por cancha');
select pg_temp.espera((tenis_reservas_listar(null, null, 'carla'))->>'total', '2', 'listado: busca por nombre de invitado');
select pg_temp.espera((tenis_reservas_listar(null, null, '20.111.004'))->>'total', '2', 'listado: busca por DNI');
select pg_temp.espera((select (x->>'comentario') || '/' || (x->>'origen') || '/' || (x->>'tipo') || '/' || (x->'titular'->>'nombre')
  from jsonb_array_elements((tenis_reservas_listar(null, null, null, pg_temp.ca(1), null, 'confirmada'))->'items') x),
  'Nuevo/socio/reserva_web/Pérez Juan', 'listado: item con comentario, origen, tipo y titular');
select pg_temp.espera((select (r->>'total') || '/' || jsonb_array_length(r->'items')
  from (select tenis_reservas_listar('2026-11-21', '2026-11-21', null, null, null, null, 2, 0) r) x), '3/2', 'listado: paginado');
select pg_temp.espera(pg_temp.err($$select tenis_reservas_listar(null, null, null, null, 'raro')$$), 'parametros', 'listado: origen inválido');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_reservas_listar(null, null)$$), 'ok', 'listado: canchero sí');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_reservas_listar(null, null)$$), 'no_autorizado', 'listado: socio no');

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. Cancelación masiva
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('gestor');
select pg_temp.guardar('v1', tenis_reservar_staff(pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), 'singles',
  pg_temp.j(4), '{"socio_id": "b0000000-0000-0000-0000-000000000002"}'));
select pg_temp.guardar('v2', tenis_reservar_staff(pg_temp.ca(2), pg_temp.t('2026-11-22 11:00'), 'singles',
  pg_temp.j(2), '{"socio_id": "b0000000-0000-0000-0000-000000000004"}'));
create temp table t_cv (v jsonb);
insert into t_cv select tenis_cancelar_varias(array[pg_temp.id('v1'), pg_temp.id('v2'), pg_temp.id('can1'),
  'f0000000-0000-0000-0000-000000000000'::uuid], 'Torneo');
select pg_temp.espera((select jsonb_array_length(v->'canceladas') || '/' || (select string_agg(o->>'codigo', ',' order by o->>'codigo')
  from jsonb_array_elements(v->'omitidas') o) from t_cv), '2/estado_invalido,reserva_inexistente',
  'cancelar varias: 2 canceladas, ya cancelada e inexistente omitidas con su código');
select pg_temp.espera((select (v->'canceladas'->0->>'motivo') || '/' || (v->'canceladas'->0 ? 'titular')::text from t_cv),
  'Torneo/true', 'cancelar varias: devuelve el aviso de cada una');
select pg_temp.espera(pg_temp.estado('v1') || '/' || pg_temp.estado('v2'), 'cancelada/cancelada', 'cancelar varias: quedan canceladas');
select pg_temp.espera(pg_temp.err($$select tenis_cancelar_varias('{}'::uuid[], 'x')$$), 'parametros', 'cancelar varias: lista vacía');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_cancelar_varias(array[gen_random_uuid()], 'x')$$), 'no_autorizado', 'cancelar varias: canchero no');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_cancelar_varias(array[pg_temp.id('ad')], 'x')$$), 'no_autorizado', 'cancelar varias: socio no');

-- ═════════════════════════════════════════════════════════════════════════════
-- 15. Cotización
-- ═════════════════════════════════════════════════════════════════════════════

create temp table t_cnt as select (select count(*) from tenis_reservas) r, (select count(*) from tenis_invitados) i,
  (select count(*) from tenis_reservas_historial) h;
select pg_temp.como('p1');
select pg_temp.espera((select (c->>'total') || '/' || jsonb_array_length(c->'jugadores') || '/'
  || (select string_agg((x->>'nombre') || ':' || (x->>'cargo') || ':' || (x->>'motivo'), ',' order by x->>'nombre')
      from jsonb_array_elements(c->'jugadores') x)
  from (select tenis_cotizar(pg_temp.ca(7), pg_temp.t('2026-11-22 12:00'), 'singles',
          '[{"invitado": {"nombre": "Ana", "apellido": "Bello"}}]') c) q),
  '16000/2/Ana Bello:16000:no_socio,Pérez Juan:0:carnet_gratis', 'cotizar: precios por jugador y total');
select pg_temp.espera((select (select count(*) from tenis_reservas) = r and (select count(*) from tenis_invitados) = i
  and (select count(*) from tenis_reservas_historial) = h from t_cnt)::text, 'true', 'cotizar no escribe nada');
select pg_temp.espera(pg_temp.err($$select tenis_cotizar(pg_temp.ca(5), pg_temp.t('2026-11-21 16:00'), 'singles', pg_temp.j(2))$$),
  'limite_dia', 'cotizar devuelve el mismo código que reservar');
select pg_temp.espera((tenis_cotizar(pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(2), pg_temp.id('ad')))->>'total',
  '9000', 'cotizar una edición (dobles → singles con S2)');
select pg_temp.espera((select modalidad from tenis_reservas where id = pg_temp.id('ad')), 'dobles', 'cotizar la edición no la cambia');
select pg_temp.como('p7');
select pg_temp.espera(pg_temp.err($$select tenis_cotizar(pg_temp.ca(7), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(2))$$),
  'no_es_socio', 'cotizar: Cliente Gimnasio no');
select pg_temp.espera(pg_temp.err($$select tenis_cotizar(pg_temp.ca(7), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(2), null,
  pg_temp.so(4))$$), 'no_autorizado', 'cotizar con titular: sólo el gestor');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_cotizar(pg_temp.ca(7), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(2))$$),
  'sin_socio', 'cotizar: sin socio no');
select pg_temp.como('gestor');
select pg_temp.espera((tenis_cotizar(pg_temp.ca(7), pg_temp.t('2026-11-22 12:00'), 'singles', '[{"a_designar": true}]', null,
  pg_temp.so(4)))->>'total', '18000', 'cotizar telefónica (gestor) para un titular: S4 9000 + a designar 9000');

-- ═════════════════════════════════════════════════════════════════════════════
-- 13. Cartelera de novedades
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('gestor');
insert into t_ids values ('nov', tenis_novedad_guardar('{"titulo": " Torneo de verano ", "texto": "Inscripción abierta", "destacada": true}'));
select pg_temp.espera((select titulo from tenis_novedades where id = pg_temp.id('nov')), 'Torneo de verano', 'novedad: título sin espacios');
select pg_temp.espera(pg_temp.err($$select tenis_novedad_guardar('{"titulo": " ", "texto": "x"}')$$), 'novedad_invalida', 'novedad sin título');
select pg_temp.espera(pg_temp.err($$select tenis_novedad_guardar(jsonb_build_object('id', gen_random_uuid(), 'titulo', 'x', 'texto', 'y'))$$),
  'novedad_inexistente', 'editar una novedad inexistente');
select pg_temp.ahora('2026-11-20 10:05');
insert into t_ids values ('nov2', tenis_novedad_guardar('{"titulo": "Canchas", "texto": "Cerradas por lluvia"}'));
select tenis_novedad_guardar(jsonb_build_object('id', pg_temp.id('nov'), 'titulo', 'Torneo de verano', 'texto', 'Inscripción hasta el viernes',
  'destacada', true));
select pg_temp.ahora('2026-11-20 10:00');
select pg_temp.como('p3');
select pg_temp.espera((select string_agg((n->>'titulo') || ':' || (n->>'destacada'), ',') from jsonb_array_elements(tenis_novedades_listar()) n),
  'Torneo de verano:true,Canchas:false', 'socio lista novedades: destacadas primero');
select pg_temp.espera((select n->>'texto' from jsonb_array_elements(tenis_novedades_listar(1)) n), 'Inscripción hasta el viernes',
  'novedades: límite y texto editado');
select pg_temp.espera(pg_temp.err($$select tenis_novedad_guardar('{"titulo": "x", "texto": "y"}')$$), 'no_autorizado', 'socio no publica');
select pg_temp.espera(pg_temp.err($$select tenis_novedad_borrar(pg_temp.id('nov'))$$), 'no_autorizado', 'socio no borra');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_novedad_guardar('{"titulo": "x", "texto": "y"}')$$), 'no_autorizado', 'canchero no publica');
select pg_temp.como('');
select pg_temp.espera(pg_temp.err($$select tenis_novedades_listar()$$), 'no_autorizado', 'novedades: anónimo no');
select pg_temp.espera((tenis_novedad_marcar_enviada(pg_temp.id('nov'), 12, 3))->>'push_enviados', '12', 'service: marca la novedad enviada');
select pg_temp.espera((select (enviada_at is not null)::text || '/' || mails_enviados from tenis_novedades where id = pg_temp.id('nov')),
  'true/3', 'novedad enviada: fecha y contadores');
select pg_temp.como('gestor');
select pg_temp.espera(tenis_novedad_borrar(pg_temp.id('nov2'))::text, 'true', 'gestor borra una novedad');
select pg_temp.espera(pg_temp.err($$select tenis_novedad_borrar(pg_temp.id('nov2'))$$), 'novedad_inexistente', 'borrar dos veces');

select pg_temp.espera((select string_agg('S' || right(x::text, 1), ',' order by x) from tenis_audiencia_novedades() x),
  'S1,S2,S3,S4', 'audiencia: carnet (S1, S3) y quienes reservaron en 120 días (S2, S4)');

-- ═════════════════════════════════════════════════════════════════════════════
-- 14. Check-in con pendientes (y el "a designar" del titular)
-- ═════════════════════════════════════════════════════════════════════════════
-- ns: p4 (S4) singles cancha 05 sábado 12:00 con un "a designar".

select pg_temp.como('p4');
select pg_temp.guardar('ns', tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-21 12:00'), 'singles', '[{"a_designar": true}]'));
select pg_temp.ahora('2026-11-21 11:50');
select pg_temp.como('canchero');
create temp table t_ci (n int primary key, v jsonb);
insert into t_ci select 1, tenis_checkin('20111004');
select pg_temp.espera((select (v->>'resultado') || '/' || (v->'jugador'->>'pendiente') || '/' || (v->'jugador'->>'pendiente_propio')
  || '/' || coalesce(v->'jugador'->>'monto_cobrado', 'null') || '/' || (v->'jugador'->>'diferencia') || '/'
  || (v->'jugador'->>'cargo_no_show') || '/' || (v->'jugador'->>'cargo_no_show_cobrado') from t_ci where n = 1),
  'ok/18000/9000/null/0/0/false', 'check-in: el titular debe lo suyo y el "a designar"');
select pg_temp.espera((select (v->'jugador'->'a_designar'->0->>'cargo') || '/' || jsonb_array_length(v->'jugador'->'a_designar')
  from t_ci where n = 1), '9000/1', 'check-in: detalle del "a designar" para cobrarlo');
select tenis_cobro_marcar(pg_temp.fila('ns', 4), true);
insert into t_ci select 2, tenis_checkin('20111004');
select pg_temp.espera((select (v->'jugador'->>'monto_cobrado') || '/' || (v->'jugador'->>'pendiente') from t_ci where n = 2),
  '9000/9000', 'check-in: cobrado lo suyo, queda el "a designar"');
select pg_temp.ahora('2026-11-20 10:00');

-- ═════════════════════════════════════════════════════════════════════════════
-- 5b. No-show con "a designar" (cron) e historial del sistema
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('p3');
select pg_temp.guardar('ns2', tenis_reservar(pg_temp.ca(6), pg_temp.t('2026-11-22 12:00'), 'singles', '[{"a_designar": true}]'));
select pg_temp.ahora('2026-11-22 14:00');
select pg_temp.como('');
select tenis_procesar();
select pg_temp.espera(pg_temp.estado('ns2') || '/' || pg_temp.cargo('ns2', 3) || '/' || pg_temp.cargo_ad('ns2'),
  'no_show/18000/no_show/0/no_show', 'no-show: el "a designar" se le cobra al titular a precio socio');
select pg_temp.espera((select accion || '/' || coalesce(hecho_por::text, 'null') from tenis_reservas_historial
  where reserva_id = pg_temp.id('ns2') order by version desc limit 1), 'estado/null', 'historial del cron: estado, sin autor');
select pg_temp.ahora('2026-11-20 10:00');

-- ═════════════════════════════════════════════════════════════════════════════
-- 12. Reportes (miércoles 25, cargado directo)
-- ═════════════════════════════════════════════════════════════════════════════
-- 08–22 × 8 canchas = 6720 min; bloque clase 08–10 en la 08 → disponibles 6600.
-- rep1 01 10–11 jugada, rep2 01 12–13 jugada, rep3 02 10–11:30 no_show: 210 min reservados.
-- rep4 03 10–11 cancelada por el titular (S2). Titular de todas S2; S4 juega en rep1..rep3.

insert into tenis_reservas (id, cancha_id, inicio, fin, modalidad, origen, titular_socio_id, estado, cancelada_por, cancelada_at) values
  ('e0000000-0000-0000-0000-000000000001', pg_temp.ca(1), pg_temp.t('2026-11-25 10:00'), pg_temp.t('2026-11-25 11:00'), 'singles', 'socio', pg_temp.so(2), 'jugada', null, null),
  ('e0000000-0000-0000-0000-000000000002', pg_temp.ca(1), pg_temp.t('2026-11-25 12:00'), pg_temp.t('2026-11-25 13:00'), 'singles', 'socio', pg_temp.so(2), 'jugada', null, null),
  ('e0000000-0000-0000-0000-000000000003', pg_temp.ca(2), pg_temp.t('2026-11-25 10:00'), pg_temp.t('2026-11-25 11:30'), 'dobles', 'socio', pg_temp.so(2), 'no_show', null, null),
  ('e0000000-0000-0000-0000-000000000004', pg_temp.ca(3), pg_temp.t('2026-11-25 10:00'), pg_temp.t('2026-11-25 11:00'), 'singles', 'socio', pg_temp.so(2), 'cancelada',
   'a0000000-0000-0000-0000-000000000002', pg_temp.t('2026-11-24 10:00'));
insert into tenis_reserva_jugadores (reserva_id, socio_id, es_titular, cargo, motivo_cargo)
select r, s, s = pg_temp.so(2), 9000, 'socio'
from unnest(array['e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002',
                  'e0000000-0000-0000-0000-000000000003']::uuid[]) r, unnest(array[pg_temp.so(2), pg_temp.so(4)]) s;
insert into tenis_reserva_jugadores (reserva_id, socio_id, es_titular, cargo, motivo_cargo)
values ('e0000000-0000-0000-0000-000000000004', pg_temp.so(2), true, 9000, 'socio');
insert into tenis_bloques (cancha_id, tipo, titulo, fecha, hora_desde, hora_hasta)
values (pg_temp.ca(8), 'clase', 'Escuelita', '2026-11-25', '08:00', '10:00');

select pg_temp.como('gestor');
select pg_temp.espera((select (r->'total'->>'minutos_disponibles') || '/' || (r->'total'->>'minutos_reservados') || '/' || (r->'total'->>'uso')
  from (select tenis_reporte('uso_general', '2026-11-25', '2026-11-25') r) x), '6600/210/3.2', 'uso general: total');
select pg_temp.espera(pg_temp.rep('uso_general', 'cancha', '01', 'minutos_disponibles') || '/' || pg_temp.rep('uso_general', 'cancha', '01', 'uso')
  || '/' || pg_temp.rep('uso_general', 'cancha', '08', 'minutos_disponibles'), '840/14.3/720', 'uso general: por cancha');
select pg_temp.espera(pg_temp.rep('uso_mensual', 'mes', '2026-11', 'minutos_reservados') || '/' || pg_temp.rep('uso_mensual', 'mes', '2026-11', 'uso'),
  '210/3.2', 'uso mensual');
select pg_temp.espera(pg_temp.rep('uso_diario', 'dia_semana', '3', 'minutos_disponibles') || '/' || pg_temp.rep('uso_diario', 'dia_semana', '3', 'uso'),
  '6600/3.2', 'uso por día de la semana');
select pg_temp.espera(pg_temp.rep('uso_hora', 'hora', '10:00', 'minutos_disponibles') || '/' || pg_temp.rep('uso_hora', 'hora', '10:00', 'uso')
  || '/' || pg_temp.rep('uso_hora', 'hora', '08:00', 'minutos_disponibles'), '480/25.0/420', 'uso por hora');
select pg_temp.espera(pg_temp.rep('uso_tipo', 'tipo', 'reserva_web', 'minutos') || '/' || pg_temp.rep('uso_tipo', 'tipo', 'reserva_web', 'porcentaje')
  || '/' || pg_temp.rep('uso_tipo', 'tipo', 'clase', 'minutos') || '/' || pg_temp.rep('uso_tipo', 'tipo', 'libre', 'minutos'),
  '210/3.1/120/6390', 'uso por tipo de reserva');
select pg_temp.espera(pg_temp.rep('ranking_reservas', 'numero_socio', '1002', 'reservas') || '/'
  || pg_temp.rep('ranking_reservas', 'numero_socio', '1002', 'cancelaciones') || '/'
  || pg_temp.rep('ranking_reservas', 'numero_socio', '1002', 'no_shows') || '/'
  || pg_temp.rep('ranking_reservas', 'numero_socio', '1002', 'total') || '/'
  || pg_temp.rep('ranking_reservas', 'numero_socio', '1002', 'cumplimiento'), '2/1/1/4/50.0', 'ranking de reservas: S2');
select pg_temp.espera(pg_temp.rep('ranking_reservas', 'numero_socio', '1004', 'cumplimiento') || '/'
  || ((tenis_reporte('ranking_reservas', '2026-11-25', '2026-11-25'))->'filas'->0->>'nombre'), '66.7/Gómez Ana',
  'ranking de reservas: S4 y orden');
select pg_temp.espera((select string_agg((f->>'nombre') || ':' || (f->>'cancelaciones'), ',') from jsonb_array_elements(
  (tenis_reporte('ranking_cancelaciones', '2026-11-25', '2026-11-25'))->'filas') f), 'Gómez Ana:1', 'ranking de cancelaciones');
select pg_temp.espera(pg_temp.err($$select tenis_reporte('raro', '2026-11-25', '2026-11-25')$$), 'reporte_invalido', 'reporte inválido');
select pg_temp.espera(pg_temp.err($$select tenis_reporte('uso_general', '2026-11-25', '2026-11-24')$$), 'rango_invalido', 'rango invertido');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select tenis_reporte('uso_general', '2026-11-25', '2026-11-25')$$), 'no_autorizado', 'reportes: canchero no');

rollback;
