-- Pruebas de la migración 20261130000000_tenis_sin_turnos_seguidos: nadie juega dos turnos
-- seguidos (pegados) en ninguna cancha, salvo reservas de staff.
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_sin_turnos_seguidos.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs, datos y utilidades que tenis_paridad.sql (copiados: cada archivo corre solo,
-- dentro de una transacción que termina en ROLLBACK). Todo pasa el viernes 2026-11-20 (hoy, a
-- las 10:00): el mismo día no aplica el optimizador de huecos, así que los turnos se pueden
-- poner donde haga falta. S1 está pendiente y S5 en rojo: se usan S2, S3 y S4.

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
-- Un horario general distinto del de siempre, para ver que lunes a viernes lo heredan.
update tenis_config set hora_desde = '07:30', hora_hasta = '21:00';
\ir ../migrations/20261128000000_tenis_paridad_ondepor.sql
\ir ../migrations/20261130000000_tenis_sin_turnos_seguidos.sql

-- Semilla de tenis_horarios: lunes a viernes = tenis_config; sábado y domingo con horario propio.
do $$ begin
  if (select string_agg(dia_semana || ' ' || to_char(hora_desde, 'HH24:MI') || '-' || to_char(hora_hasta, 'HH24:MI'), ',' order by dia_semana)
        from tenis_horarios)
     is distinct from '1 07:30-21:00,2 07:30-21:00,3 07:30-21:00,4 07:30-21:00,5 07:30-21:00,6 09:00-22:00,7 10:00-17:00' then
    raise exception 'FALLO [semilla de horarios]: %', (select string_agg(dia_semana || ' ' || hora_desde || '-' || hora_hasta, ',' order by dia_semana) from tenis_horarios);
  end if;
  raise notice 'ok   - semilla de horarios: lunes a viernes heredan tenis_config, sábado y domingo con horario propio';
end $$;
-- El resto de las pruebas usa el horario de siempre (08–22).
update tenis_config set hora_desde = '08:00', hora_hasta = '22:00';
update tenis_horarios set hora_desde = '08:00', hora_hasta = '22:00' where dia_semana between 1 and 5;

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

-- '<código>|<nombre>' esperado para una persona (socio n).
create function pg_temp.cod(p_codigo text, n int) returns text language sql as $$
  select p_codigo || '|' || tenis_nombre_persona(pg_temp.so(n), null)
$$;
-- Intenta y deshace, con el DETAIL del error: 'ok' o '<código>|<detail>'.
create function pg_temp.intento_detalle(p_sql text) returns text language plpgsql as $$
declare
  v_det text;
begin
  begin
    execute p_sql;
    raise exception using errcode = 'TQ999', message = 'deshacer';
  exception
    when sqlstate 'TQ999' then return 'ok';
    when others then
      get stacked diagnostics v_det = pg_exception_detail;
      return sqlerrm || '|' || coalesce(v_det, '');
  end;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Turnos seguidos
-- ═════════════════════════════════════════════════════════════════════════════

-- Base: telefónica de la gestora, cancha 1 de 14:00 a 15:00, titular S2 y jugador S3.
select pg_temp.como('gestor');
select pg_temp.guardar('base', tenis_reservar_staff(pg_temp.ca(1), pg_temp.t('2026-11-20 14:00'), 'singles',
  pg_temp.j(3), '{"socio_id": "b0000000-0000-0000-0000-000000000002"}'));
-- "A designar": cancha 8 de 11:00 a 12:00, titular S2 con un "a designar".
select pg_temp.guardar('ad', tenis_reservar_staff(pg_temp.ca(8), pg_temp.t('2026-11-20 11:00'), 'singles',
  '[{"a_designar": true}]', '{"socio_id": "b0000000-0000-0000-0000-000000000002"}'));

-- Otro socio de la reserva, pegado después y antes.
select pg_temp.como('p4');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-20 15:00'), 'singles', pg_temp.j(2))$$),
  pg_temp.cod('turno_seguido', 2), 'socio: jugador que termina a las 15:00 no juega a las 15:00 en otra cancha');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-20 13:00'), 'singles', pg_temp.j(3))$$),
  pg_temp.cod('turno_seguido', 3), 'socio: jugador que empieza a las 14:00 no juega de 13:00 a 14:00');
-- Lo que se pisa sigue siendo jugador_ocupado.
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-20 14:30'), 'singles', pg_temp.j(2))$$),
  pg_temp.cod('jugador_ocupado', 2), 'superpuesto: sigue jugador_ocupado');
-- Con 30 minutos en el medio, pasa.
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-20 15:30'), 'singles', pg_temp.j(2))$$),
  'ok', 'media hora después: permitido');
-- "A designar" no tiene identidad: uno pegado a otro "a designar" pasa.
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(8), pg_temp.t('2026-11-20 12:00'), 'singles', '[{"a_designar": true}]')$$),
  'ok', '"a designar" pegado a otro "a designar": permitido');
-- La cotización da el mismo código.
select pg_temp.espera(pg_temp.err_detalle($$select tenis_cotizar(pg_temp.ca(2), pg_temp.t('2026-11-20 15:00'), 'singles', pg_temp.j(2))$$),
  pg_temp.cod('turno_seguido', 2), 'cotizar: mismo código');

-- El titular, pegado después y antes (S3 juega en la base; no es titular de nada ese día).
select pg_temp.como('p3');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-20 15:00'), 'singles', pg_temp.j(4))$$),
  pg_temp.cod('turno_seguido', 3), 'titular: no reserva justo después de jugar');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-20 13:00'), 'singles', pg_temp.j(4))$$),
  pg_temp.cod('turno_seguido', 3), 'titular: no reserva justo antes de jugar');
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-20 12:30'), 'singles', pg_temp.j(4))$$),
  'ok', 'titular: terminando media hora antes, permitido');

-- La gestora está exenta.
select pg_temp.como('gestor');
select pg_temp.espera(pg_temp.intento($$select tenis_reservar_staff(pg_temp.ca(2), pg_temp.t('2026-11-20 15:00'), 'singles',
  pg_temp.j(2), '{"socio_id": "b0000000-0000-0000-0000-000000000004"}')$$), 'ok', 'telefónica de la gestora: exenta');
select pg_temp.espera(pg_temp.intento($$select tenis_cotizar(pg_temp.ca(2), pg_temp.t('2026-11-20 15:00'), 'singles',
  pg_temp.j(2), null, pg_temp.so(4))$$), 'ok', 'cotizar una telefónica: exenta');

-- Invitado por DNI: juega de 16:00 a 17:00 (telefónica, titular S2).
select pg_temp.guardar('g', tenis_reservar_staff(pg_temp.ca(4), pg_temp.t('2026-11-20 16:00'), 'singles',
  '[{"invitado": {"dni": "30111222", "nombre": "Gui", "apellido": "Dni"}}]',
  '{"socio_id": "b0000000-0000-0000-0000-000000000002"}'));
create temp table t_gui as
  select invitado_id from tenis_reserva_jugadores where reserva_id = pg_temp.id('g') and invitado_id is not null;
select pg_temp.como('');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_invitado_reservar(pg_temp.ca(5), pg_temp.t('2026-11-20 17:00'), 'singles',
  '{"dni": "30999888", "nombre": "Tita", "apellido": "Web", "email": "tita@x.com"}',
  '[{"invitado": {"dni": "30111222", "nombre": "Gui", "apellido": "Dni"}}]', repeat('z', 64))$$),
  'turno_seguido|' || tenis_nombre_persona(null, (select invitado_id from t_gui)), 'web: jugador invitado (por DNI) pegado rechazado');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_invitado_reservar(pg_temp.ca(5), pg_temp.t('2026-11-20 17:00'), 'singles',
  '{"dni": "30111222", "nombre": "Gui", "apellido": "Dni", "email": "gui@x.com"}',
  '[{"invitado": {"dni": "30777666", "nombre": "Otro", "apellido": "Inv"}}]', repeat('y', 64))$$),
  'turno_seguido|' || tenis_nombre_persona(null, (select invitado_id from t_gui)), 'web: titular invitado pegado rechazado');
select pg_temp.como('p4');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-20 15:00'), 'singles',
  '[{"invitado": {"dni": "30111222", "nombre": "Gui", "apellido": "Dni"}}]')$$),
  'turno_seguido|' || tenis_nombre_persona(null, (select invitado_id from t_gui)), 'socio: invitado por DNI pegado rechazado');

-- Editar: la reserva 'e' de S4 (con S3) de 17:00 a 18:00 en la cancha 6.
select pg_temp.guardar('e', tenis_reservar(pg_temp.ca(6), pg_temp.t('2026-11-20 17:00'), 'singles', pg_temp.j(3)));
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_editar_reserva(pg_temp.id('e'), pg_temp.ca(6), pg_temp.t('2026-11-20 15:00'), 'singles', pg_temp.j(3))$$),
  pg_temp.cod('turno_seguido', 3), 'editar: mover pegado a otra reserva rechazado');
select pg_temp.espera(pg_temp.err_detalle($$select tenis_cotizar(pg_temp.ca(6), pg_temp.t('2026-11-20 15:00'), 'singles', pg_temp.j(3), pg_temp.id('e'))$$),
  pg_temp.cod('turno_seguido', 3), 'cotizar la edición: mismo código');
select pg_temp.espera(pg_temp.intento($$select tenis_editar_reserva(pg_temp.id('e'), pg_temp.ca(6), pg_temp.t('2026-11-20 17:30'), 'singles', pg_temp.j(3))$$),
  'ok', 'editar: correrse media hora sobre sí misma, permitido (no se compara con ella)');
-- La gestora pega una reserva con S4 a las 18:00: editar 'e' en el lugar sigue andando.
select pg_temp.como('gestor');
select pg_temp.guardar('adj', tenis_reservar_staff(pg_temp.ca(7), pg_temp.t('2026-11-20 18:00'), 'singles',
  pg_temp.j(4), '{"socio_id": "b0000000-0000-0000-0000-000000000002"}'));
select pg_temp.como('p4');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('e'), pg_temp.ca(6), pg_temp.t('2026-11-20 17:00'), 'singles',
  pg_temp.j(3), 'Comentario nuevo')$$), 'ok', 'editar en el lugar (sólo comentario) con algo pegado de antes: permitido');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_editar_reserva(pg_temp.id('e'), pg_temp.ca(5), pg_temp.t('2026-11-20 17:00'), 'singles', pg_temp.j(3))$$),
  pg_temp.cod('turno_seguido', 4), 'editar: cambiar de cancha revalida, y el titular pegado lo traba');

-- Extensión del canchero: no valida la regla y cuenta como turno vivo.
select pg_temp.ahora('2026-11-20 14:30');
select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err($$select pg_temp.guardar('ext', tenis_extension(pg_temp.ca(1), pg_temp.t('2026-11-20 15:30'), pg_temp.id('base')))$$),
  'ok', 'extensión: pegada a su propia reserva, permitida');
select pg_temp.como('p3');
select pg_temp.espera(pg_temp.intento_detalle($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-20 15:30'), 'singles', pg_temp.j(4))$$),
  pg_temp.cod('turno_seguido', 3), 'extensión: un turno que arranca cuando termina la extensión queda pegado');
-- (S3 juega a las 17:00 en 'e': se mira el helper con un tramo 16:00–16:30, sin nada pegado.)
select pg_temp.espera(tenis_jugador_turno_seguido(pg_temp.so(3), null, pg_temp.t('2026-11-20 16:00'),
  pg_temp.t('2026-11-20 16:30'))::text, 'false', 'extensión: media hora después de la extensión, permitido');
select pg_temp.ahora('2026-11-20 10:00');

-- Canceladas no cuentan.
select pg_temp.como('gestor');
select tenis_cancelar(pg_temp.id('base'), 'prueba');
select pg_temp.como('p3');
select pg_temp.espera(pg_temp.intento($$select tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-20 13:00'), 'singles', pg_temp.j(4))$$),
  'ok', 'cancelada: ya no traba el turno pegado');

rollback;
