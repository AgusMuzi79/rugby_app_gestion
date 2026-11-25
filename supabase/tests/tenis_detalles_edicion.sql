-- Pruebas de la migración 20261127000000_tenis_detalles_edicion: editar una reserva de tenis
-- no pierde lo cobrado (monto_cobrado, diferencia, ajustes para staff) y avisa a los jugadores
-- que siguen cuando cambia el turno ("Cambió tu turno de tenis", motivo 'cambio').
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_detalles_edicion.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs y utilidades que tenis_editar_reserva.sql (copiados: cada archivo corre solo,
-- dentro de una transacción que termina en ROLLBACK). Carga las cuatro migraciones de tenis en
-- orden; la de esta feature después de crear una reserva ya cobrada (prueba el backfill).
-- auth.uid() sale del GUC test.uid y "ahora" del GUC test.ahora. Por defecto: viernes
-- 2026-11-20 10:00 hora argentina (se puede reservar hasta el 22).

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

\ir ../migrations/20261112000000_reservas_tenis.sql
\ir ../migrations/20261125000000_tenis_aviso_jugadores.sql
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

-- ─── Backfill: lo cobrado antes de la migración queda como monto_cobrado ──────
-- bf: p4 (S4) con S2, cancha 08 el domingo 22 18:00; S2 ya cobrado.

select pg_temp.como('p4');
select pg_temp.guardar('bf', tenis_reservar(pg_temp.ca(8), pg_temp.t('2026-11-22 18:00'), 'singles', pg_temp.j(2)));
update tenis_reserva_jugadores set cobrado = true where reserva_id = pg_temp.id('bf') and socio_id = pg_temp.so(2);

\ir ../migrations/20261127000000_tenis_detalles_edicion.sql

-- Estado de cobro de un jugador: 'cobrado/monto_cobrado/cargo'.
create function pg_temp.cobro(k text, p_socio int) returns text language sql as $$
  select cobrado::text || '/' || coalesce(monto_cobrado::text, 'null') || '/' || cargo
  from tenis_reserva_jugadores where reserva_id = pg_temp.id(k) and socio_id = pg_temp.so(p_socio)
$$;
-- Campo de un jugador en el resumen (socio n).
create function pg_temp.res_jug(k text, p_socio int, p_campo text) returns text language sql as $$
  select e->>p_campo from jsonb_array_elements((tenis_reserva_resumen(pg_temp.id(k)))->'jugadores') e
  where (e->>'socio_id')::uuid = pg_temp.so(p_socio)
$$;
-- 'total/total_cobrado/total_pendiente' del resumen.
create function pg_temp.totales(k text) returns text language sql as $$
  select r->>'total' || '/' || (r->>'total_cobrado') || '/' || (r->>'total_pendiente')
  from (select tenis_reserva_resumen(pg_temp.id(k)) r) x
$$;
-- Ajustes abiertos de una reserva: 'motivo:monto:S<n>' en orden alfabético ('' si no hay).
create function pg_temp.ajustes(k text) returns text language sql as $$
  select coalesce(string_agg(x, ',' order by x), '') from (
    select a.motivo || ':' || a.monto || ':S' || right(a.socio_id::text, 1) as x
    from tenis_cobros_ajustes a where a.reserva_id = pg_temp.id(k) and a.resuelto_at is null) s
$$;
-- Avisos de un socio en una reserva: 'motivo:estado' en orden alfabético.
create function pg_temp.avisos_de(k text, p_socio int) returns text language sql as $$
  select coalesce(string_agg(x, ',' order by x), '') from (
    select a.motivo || ':' || case
      when a.enviado_at is not null then 'enviado'
      when a.descartado_at is not null then 'descartado-' || a.descarte
      else 'pendiente' end as x
    from tenis_avisos_jugadores a where a.reserva_id = pg_temp.id(k) and a.socio_id = pg_temp.so(p_socio)) s
$$;
-- El cron mandó los avisos pendientes de un socio en una reserva.
create function pg_temp.entregar(k text, p_socio int) returns void language plpgsql as $$
begin
  perform tenis_avisos_jugadores_marcar(coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'resultado', 'entregado'))
    from tenis_avisos_jugadores a
    where a.reserva_id = pg_temp.id(k) and a.socio_id = pg_temp.so(p_socio)
      and a.enviado_at is null and a.descartado_at is null), '[]'::jsonb));
end $$;

select pg_temp.espera(pg_temp.cobro('bf', 2), 'true/9000/9000', 'backfill: lo ya cobrado queda como monto_cobrado = cargo');
select pg_temp.espera(pg_temp.cobro('bf', 4), 'false/null/9000', 'backfill: lo no cobrado queda sin monto');

-- ─── Tabla de ajustes y permisos ──────────────────────────────────────────────

select pg_temp.espera((select relrowsecurity::text from pg_class where relname = 'tenis_cobros_ajustes'),
  'true', 'RLS activa en tenis_cobros_ajustes');
select pg_temp.espera(has_table_privilege('authenticated', 'tenis_cobros_ajustes', 'select')::text,
  'false', 'authenticated no lee la tabla de ajustes');
select pg_temp.espera(has_function_privilege('anon', 'tenis_cobros_ajustes_pendientes()', 'execute')::text
  || '/' || has_function_privilege('authenticated', 'tenis_cobros_ajustes_pendientes()', 'execute')::text,
  'false/true', 'ajustes pendientes: authenticated sí (rol adentro), anon no');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_cobro_ajuste_resolver(uuid)', 'execute')::text,
  'true', 'authenticated ejecuta tenis_cobro_ajuste_resolver (rol adentro)');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_cobro_ajuste_sincronizar(uuid)', 'execute')::text,
  'false', 'authenticated no ejecuta el helper interno');
select pg_temp.espera(has_function_privilege('authenticated', 'tenis_avisos_jugadores_reclamar(int)', 'execute')::text
  || '/' || has_function_privilege('service_role', 'tenis_avisos_jugadores_reclamar(int)', 'execute')::text,
  'false/true', 'reclamar sigue sólo para service_role');
select pg_temp.espera(has_function_privilege('anon',
  'tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb)', 'execute')::text, 'false', 'anon sigue sin editar');

-- ─── 1. Editar no pierde lo cobrado ───────────────────────────────────────────
-- m: p1 (S1, carnet) con S2, cancha 01 sábado 21 10:00 singles.

select pg_temp.como('p1');
select pg_temp.guardar('m', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(2)));
select pg_temp.como('canchero');
select tenis_cobro_marcar(pg_temp.fila('m', 2), true);
select pg_temp.espera(pg_temp.cobro('m', 2), 'true/9000/9000', 'marcar cobro: monto_cobrado = cargo');
update tenis_reserva_jugadores set check_in_at = now() where reserva_id = pg_temp.id('m') and es_titular;

-- Mover a cancha 03 12:00 dobles con S2, S3 y S4.
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('m'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'dobles', pg_temp.j(2, 3, 4))$$),
  'ok', 'mover a dobles en otra cancha y horario');
select pg_temp.espera(pg_temp.cobro('m', 2), 'true/9000/10000', 'el que sigue conserva el cobro (monto viejo, cargo nuevo)');
select pg_temp.espera(
  (select (cobrado_por is not null)::text || '/' || (cobrado_at is not null)::text from tenis_reserva_jugadores
    where reserva_id = pg_temp.id('m') and socio_id = pg_temp.so(2)), 'true/true', 'conserva quién y cuándo cobró');
select pg_temp.espera(
  (select (check_in_at is null)::text from tenis_reserva_jugadores where reserva_id = pg_temp.id('m') and es_titular),
  'true', 'turno nuevo: el check-in sí se borra');
select pg_temp.espera(pg_temp.res_jug('m', 2, 'diferencia') || '/' || pg_temp.res_jug('m', 2, 'pendiente'),
  '1000/1000', 'resumen: debe la diferencia de dobles');
select pg_temp.espera(pg_temp.res_jug('m', 2, 'cobrado'), 'true', 'resumen: sigue figurando como cobrado');
select pg_temp.espera(pg_temp.totales('m'), '20000/9000/11000', 'totales: total = cobrado + pendiente');
select pg_temp.espera(pg_temp.ajustes('m'), 'cambio_turno:-1000:S2', 'ajuste abierto: S2 debe 1000');

select pg_temp.como('canchero');
select pg_temp.espera((tenis_cobro_marcar(pg_temp.fila('m', 2), true))->>'diferencia', '0', 'cobrar la diferencia: saldado');
select pg_temp.espera(pg_temp.cobro('m', 2), 'true/10000/10000', 'cobrar de nuevo: monto = cargo');
select pg_temp.espera(pg_temp.ajustes('m'), '', 'saldar cierra el ajuste de cambio de turno');
select tenis_cobro_marcar(pg_temp.fila('m', 4), true);

-- Volver a singles con S4: S2 (pagó 10000) sale; S4 pagó 10000 y ahora debe 9000.
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('m'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(4))$$),
  'ok', 'volver a singles con S4');
select pg_temp.espera(pg_temp.cobro('m', 4), 'true/10000/9000', 'S4 conserva lo cobrado con el cargo nuevo');
select pg_temp.espera(pg_temp.res_jug('m', 4, 'diferencia') || '/' || pg_temp.res_jug('m', 4, 'pendiente'),
  '-1000/-1000', 'resumen: a S4 hay que devolverle 1000');
select pg_temp.espera(pg_temp.totales('m'), '9000/10000/-1000', 'totales con devolución pendiente');
select pg_temp.espera(pg_temp.ajustes('m'), 'cambio_turno:1000:S4,jugador_quitado:10000:S2',
  'ajustes: devolver 10000 a S2 (salió) y 1000 a S4');
select pg_temp.espera(
  (select created_by::text || '|' || nombre from tenis_cobros_ajustes
    where reserva_id = pg_temp.id('m') and motivo = 'jugador_quitado'),
  'a0000000-0000-0000-0000-000000000001|Gómez Ana', 'el ajuste guarda quién editó y el nombre de quien salió');

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('m'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'singles', pg_temp.j(4))$$),
  'ok', 'editar sin cambios');
select pg_temp.espera((select count(*)::text from tenis_cobros_ajustes where reserva_id = pg_temp.id('m')), '3',
  'editar sin cambios no agrega ajustes');

-- Staff ve los ajustes; el socio no.
select pg_temp.espera(pg_temp.err($$select tenis_cobros_ajustes_pendientes()$$), 'no_autorizado', 'un socio no ve los ajustes');
select pg_temp.como('canchero');
select pg_temp.espera(
  (select string_agg(e->>'motivo' || ':' || (e->>'monto') || ':' || (e->>'nombre') || ':' || (e->>'numero_socio')
                     || ':' || (e->>'cancha_nombre'), ',' order by e->>'motivo')
     from jsonb_array_elements(tenis_cobros_ajustes_pendientes()) e where (e->>'reserva_id')::uuid = pg_temp.id('m')),
  'cambio_turno:1000:Díaz Sofía:1004:03,jugador_quitado:10000:Gómez Ana:1002:03', 'canchero ve los ajustes pendientes');

-- Corrección del canchero: sale S4 (pagó 10000), entra S2.
select tenis_jugadores_corregir(pg_temp.id('m'), pg_temp.j(2));
select pg_temp.espera(pg_temp.ajustes('m'), 'jugador_quitado:10000:S2,jugador_quitado:10000:S4',
  'corrección: S4 sale con todo lo pagado a devolver; su cambio de turno se cierra');
select pg_temp.espera(
  (select coalesce(resuelto_por::text, 'null') from tenis_cobros_ajustes
    where reserva_id = pg_temp.id('m') and socio_id = pg_temp.so(4) and motivo = 'cambio_turno'),
  'null', 'cierre automático del cambio de turno: sin resuelto_por de staff');

select pg_temp.espera(
  (tenis_cobro_ajuste_resolver((select id from tenis_cobros_ajustes where reserva_id = pg_temp.id('m')
     and socio_id = pg_temp.so(2) and resuelto_at is null)))->>'resuelto', 'true', 'resolver un ajuste');
select pg_temp.espera(pg_temp.ajustes('m'), 'jugador_quitado:10000:S4', 'el resuelto ya no está pendiente');
select pg_temp.espera(
  (select resuelto_por::text from tenis_cobros_ajustes where reserva_id = pg_temp.id('m') and socio_id = pg_temp.so(2)
    and motivo = 'jugador_quitado'), 'a0000000-0000-0000-0000-0000000000a3', 'guarda quién lo resolvió');
select pg_temp.espera(
  (tenis_cobro_ajuste_resolver((select id from tenis_cobros_ajustes where reserva_id = pg_temp.id('m')
     and socio_id = pg_temp.so(2) and motivo = 'jugador_quitado')))->>'resuelto', 'false', 'resolver dos veces no hace nada');
select pg_temp.como('gestor');
select pg_temp.espera((select count(*)::text from jsonb_array_elements(tenis_cobros_ajustes_pendientes()) e
  where (e->>'reserva_id')::uuid = pg_temp.id('m')), '1', 'la gestora también ve los ajustes');

-- Desmarcar el cobro borra el monto.
select pg_temp.como('canchero');
select tenis_cobro_marcar(pg_temp.fila('m', 2), true);
select tenis_cobro_marcar(pg_temp.fila('m', 2), false);
select pg_temp.espera(pg_temp.cobro('m', 2) || ' ' || pg_temp.res_jug('m', 2, 'pendiente'), 'false/null/9000 9000',
  'desmarcar: sin monto y debe el cargo');
select pg_temp.espera((pg_temp.err($$update tenis_reserva_jugadores set monto_cobrado = 5 where reserva_id = pg_temp.id('m') and socio_id = pg_temp.so(2)$$)),
  'ok', 'monto sin cobrar: el trigger lo limpia');
select pg_temp.espera(pg_temp.cobro('m', 2), 'false/null/9000', 'no cobrado nunca tiene monto');

-- Aprobar el comprobante de un invitado: cada jugador queda cobrado por su cargo.
select pg_temp.guardar('g', tenis_invitado_reservar(pg_temp.ca(7), pg_temp.t('2026-11-21 16:00'), 'singles',
  '{"dni":"30111222","nombre":"Carla","apellido":"Invitada","email":"carla@example.com"}',
  '[{"dni":"20111004"}]', repeat('a', 64)));
select tenis_invitado_confirmar(repeat('a', 64));
select tenis_invitado_comprobante(pg_temp.id('g'), repeat('a', 64), pg_temp.id('g')::text || '/c.jpg');
select pg_temp.como('canchero');
select tenis_comprobante_resolver(pg_temp.id('g'), true);
select pg_temp.espera(
  (select string_agg(cobrado::text || '/' || (monto_cobrado = cargo)::text, ',') from tenis_reserva_jugadores
    where reserva_id = pg_temp.id('g')), 'true/true,true/true', 'aprobar comprobante: monto_cobrado = cargo de cada uno');
select pg_temp.espera(pg_temp.totales('g'), '25000/25000/0', 'comprobante aprobado: todo cobrado');

-- DESHACER con un ajuste de cambio de turno abierto: el ajuste sigue abierto (no lo saldó
-- nadie) y la reserva muestra el cargo entero pendiente; cobrar de nuevo sí lo cierra.
select tenis_cobro_marcar(pg_temp.fila('m', 2), true);
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('m'), pg_temp.ca(3), pg_temp.t('2026-11-21 12:00'), 'dobles', pg_temp.j(2, 3, 4))$$),
  'ok', 'pasar m a dobles con S2 cobrado');
select pg_temp.espera(pg_temp.ajustes('m'), 'cambio_turno:-1000:S2,jugador_quitado:10000:S4', 'S2 debe la diferencia');
select pg_temp.como('canchero');
select tenis_cobro_marcar(pg_temp.fila('m', 2), false);
select pg_temp.espera(pg_temp.ajustes('m'), 'cambio_turno:-1000:S2,jugador_quitado:10000:S4',
  'deshacer el cobro no cierra el ajuste abierto');
select pg_temp.espera(pg_temp.cobro('m', 2) || ' ' || pg_temp.res_jug('m', 2, 'pendiente'), 'false/null/10000 10000',
  'deshacer: debe el cargo entero');
select tenis_cobro_marcar(pg_temp.fila('m', 2), true);
select pg_temp.espera(pg_temp.ajustes('m'), 'jugador_quitado:10000:S4', 'cobrar el cargo entero cierra el ajuste');
select pg_temp.espera(
  (select count(*) || '/' || count(*) filter (where resuelto_at is not null and resuelto_por is null)
     from tenis_cobros_ajustes
    where reserva_id = pg_temp.id('m') and socio_id = pg_temp.so(2) and motivo = 'cambio_turno'),
  '2/2', 'cierres automáticos al saldar: sin resuelto_por de staff');

-- ─── 2. Aviso "Cambió tu turno de tenis" ──────────────────────────────────────
-- n: p2 (S2) con S3, cancha 05 domingo 22 14:00 singles.

select pg_temp.como('p2');
select pg_temp.guardar('n', tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-22 14:00'), 'singles', pg_temp.j(3)));
select pg_temp.espera(pg_temp.avisos_de('n', 3), 'agregado:pendiente', 'S3: te sumaron');
select pg_temp.entregar('n', 3);

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('n'), pg_temp.ca(5), pg_temp.t('2026-11-22 15:00'), 'singles', pg_temp.j(3))$$),
  'ok', 'mover n a las 15:00');
select pg_temp.espera(pg_temp.avisos_de('n', 3), 'agregado:enviado,cambio:pendiente', 'mover: aviso de cambio al que sigue');
select pg_temp.espera(pg_temp.avisos_de('n', 2), '', 'el titular no recibe aviso');

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('n'), pg_temp.ca(5), pg_temp.t('2026-11-22 15:00'), 'singles', pg_temp.j(3))$$),
  'ok', 'editar n sin cambiar el turno');
select pg_temp.espera(pg_temp.avisos_de('n', 3), 'agregado:enviado,cambio:pendiente', 'sin cambio de turno no hay aviso nuevo');

select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('n'), pg_temp.ca(6), pg_temp.t('2026-11-22 16:00'), 'singles', pg_temp.j(3))$$),
  'ok', 'mover n de nuevo (cancha 06 16:00)');
select pg_temp.espera(pg_temp.avisos_de('n', 3), 'agregado:enviado,cambio:descartado-reemplazado,cambio:pendiente',
  'una movida nueva reemplaza el cambio pendiente');
select pg_temp.espera((pg_temp.err(format($$insert into tenis_avisos_jugadores (reserva_id, socio_id, motivo) values (%L, %L, 'cambio')$$,
  pg_temp.id('n'), pg_temp.so(3))) like '%duplicate key%')::text, 'true', 'un solo cambio pendiente por jugador');
select pg_temp.espera((pg_temp.err(format($$insert into tenis_avisos_jugadores (reserva_id, socio_id, motivo) values (%L, %L, 'agregado')$$,
  pg_temp.id('n'), pg_temp.so(3))) like '%duplicate key%')::text, 'true', 'nunca dos "te sumaron"');

select pg_temp.ahora('2026-11-20 10:05');
select pg_temp.espera(
  (select e->>'motivo' || '|' || (e->>'cancha') || '|' || ((e->>'inicio')::timestamptz = pg_temp.t('2026-11-22 16:00'))::text
          || '|' || (e->>'titular_nombre')
     from jsonb_array_elements((tenis_avisos_jugadores_reclamar(100))->'avisos') e
    where (e->>'reserva_id')::uuid = pg_temp.id('n')),
  'cambio|06|true|Gómez Ana', 'reclamo: motivo cambio con el turno nuevo y el titular');
select pg_temp.entregar('n', 3);
select pg_temp.ahora('2026-11-20 10:00');

-- Mover a dobles 10:00 sumando a S4 y S1: S3 recibe cambio; S4 y S1 sólo "te sumaron".
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('n'), pg_temp.ca(5), pg_temp.t('2026-11-22 10:00'), 'dobles', pg_temp.j(3, 4, 1))$$),
  'ok', 'mover n a dobles sumando jugadores');
select pg_temp.espera(pg_temp.avisos_de('n', 3), 'agregado:enviado,cambio:descartado-reemplazado,cambio:enviado,cambio:pendiente',
  'el que sigue: otro aviso de cambio (cada movida avisa)');
select pg_temp.espera(pg_temp.avisos_de('n', 4) || ' ' || pg_temp.avisos_de('n', 1), 'agregado:pendiente agregado:pendiente',
  'los que se suman: sólo "te sumaron"');

-- Mover y sacar a S3 y S1: el cambio pendiente de S3 se borra; S4 (te sumaron sin mandar) no suma cambio.
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('n'), pg_temp.ca(5), pg_temp.t('2026-11-22 12:00'), 'singles', pg_temp.j(4))$$),
  'ok', 'mover n a singles sólo con S4');
select pg_temp.espera(pg_temp.avisos_de('n', 3),
  'agregado:enviado,cambio:descartado-reemplazado,cambio:descartado-reemplazado,cambio:enviado',
  'el que sale no queda con un cambio pendiente (el anterior reemplazado, el nuevo borrado al salir)');
select pg_temp.espera(pg_temp.avisos_de('n', 4), 'agregado:pendiente', '"te sumaron" sin mandar ya muestra el turno nuevo: sin cambio');

-- Cambio pendiente de una reserva cancelada: se descarta al reclamar.
select pg_temp.entregar('n', 4);
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('n'), pg_temp.ca(5), pg_temp.t('2026-11-22 13:00'), 'singles', pg_temp.j(4))$$),
  'ok', 'mover n a las 13:00');
select pg_temp.espera(pg_temp.avisos_de('n', 4), 'agregado:enviado,cambio:pendiente', 'S4: aviso de cambio');
select tenis_cancelar(pg_temp.id('n'), 'no puedo');
select tenis_avisos_jugadores_reclamar(100);
select pg_temp.espera(pg_temp.avisos_de('n', 4), 'agregado:enviado,cambio:descartado-reserva_inactiva',
  'reserva cancelada: el cambio pendiente se descarta');

-- Mover cambiando sólo la modalidad también avisa. o: p3 (S3) con S2, cancha 02 22 16:00.
select pg_temp.como('p3');
select pg_temp.guardar('o', tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-22 16:00'), 'singles', pg_temp.j(2)));
select pg_temp.entregar('o', 2);
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('o'), pg_temp.ca(2), pg_temp.t('2026-11-22 16:00'), 'dobles', pg_temp.j(2, 1, 4))$$),
  'ok', 'pasar o a dobles en el mismo horario');
select pg_temp.espera(pg_temp.avisos_de('o', 2), 'agregado:enviado,cambio:pendiente', 'sólo la modalidad: aviso de cambio');

-- Un "te sumaron" que el cron ya reclamó (texto armado con el turno viejo) no tapa el cambio.
select pg_temp.espera(pg_temp.avisos_de('o', 1), 'agregado:pendiente', 'S1: te sumaron sin mandar');
select pg_temp.ahora('2026-11-20 10:05');
select tenis_avisos_jugadores_reclamar(100);
select pg_temp.ahora('2026-11-20 10:06');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('o'), pg_temp.ca(2), pg_temp.t('2026-11-22 15:00'), 'dobles', pg_temp.j(2, 1, 4))$$),
  'ok', 'mover o con el "te sumaron" reclamado');
select pg_temp.espera(pg_temp.avisos_de('o', 1), 'agregado:pendiente,cambio:pendiente',
  '"te sumaron" en vuelo: también recibe el cambio');
-- Reclamo vencido (10 min): el "te sumaron" se vuelve a armar con el turno nuevo.
select pg_temp.ahora('2026-11-20 10:20');
select pg_temp.espera(pg_temp.err($$select tenis_editar_reserva(pg_temp.id('o'), pg_temp.ca(2), pg_temp.t('2026-11-22 14:00'), 'dobles', pg_temp.j(2, 1, 4))$$),
  'ok', 'mover o con el reclamo vencido');
select pg_temp.espera(pg_temp.avisos_de('o', 1), 'agregado:pendiente,cambio:descartado-reemplazado',
  'reclamo vencido: sin cambio nuevo (el "te sumaron" sale con el turno nuevo)');
select pg_temp.ahora('2026-11-20 10:00');

rollback;
