-- Pruebas de la migración 20261201000000_tenis_aviso_cancelacion_tardia (push a la gestora
-- cuando un socio cancela su reserva con menos de aviso_cancelacion_horas de anticipación).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_aviso_cancelacion_tardia.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs, datos y utilidades que tenis_paridad.sql (copiados: cada archivo corre solo,
-- dentro de una transacción que termina en ROLLBACK). Carga las migraciones de tenis en orden.
-- auth.uid() sale del GUC test.uid y "ahora" del GUC test.ahora. Por defecto: viernes
-- 2026-11-20 10:00 hora argentina.

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


-- Un perfil admin dado de baja: no recibe avisos.
insert into profiles (id, rol, roles, nombre, activo) values
  ('a0000000-0000-0000-0000-0000000000a5', 'admin', '{admin}', 'Admin Baja', false);

-- ─── Migraciones bajo prueba ──────────────────────────────────────────────────

\ir ../migrations/20261112000000_reservas_tenis.sql
\ir ../migrations/20261125000000_tenis_aviso_jugadores.sql
\ir ../migrations/20261126000000_tenis_editar_reserva.sql
\ir ../migrations/20261127000000_tenis_detalles_edicion.sql
\ir ../migrations/20261128000000_tenis_paridad_ondepor.sql
\ir ../migrations/20261201000000_tenis_aviso_cancelacion_tardia.sql

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

-- Avisos a gestores de una reserva: 'gestor,admin' (orden fijo por perfil).
create function pg_temp.avisos(k text) returns text language sql as $$
  select coalesce(string_agg(case a.profile_id
           when 'a0000000-0000-0000-0000-0000000000a1' then 'gestor'
           when 'a0000000-0000-0000-0000-0000000000a2' then 'rugby'
           when 'a0000000-0000-0000-0000-0000000000a3' then 'canchero'
           when 'a0000000-0000-0000-0000-0000000000a4' then 'admin'
           when 'a0000000-0000-0000-0000-0000000000a5' then 'admin_baja'
           else 'otro' end, ',' order by a.profile_id), '')
  from tenis_avisos_gestores a where a.reserva_id = pg_temp.id(k)
$$;
create function pg_temp.aviso_id(k text, p text) returns uuid language sql as $$
  select id from tenis_avisos_gestores
  where reserva_id = pg_temp.id(k)
    and profile_id = case p when 'gestor' then 'a0000000-0000-0000-0000-0000000000a1'::uuid
                            else 'a0000000-0000-0000-0000-0000000000a4'::uuid end
$$;
create function pg_temp.aviso(k text, p text) returns text language sql as $$
  select case when enviado_at is not null then 'enviado'
              when descartado_at is not null then 'descartado:' || descarte
              else 'pendiente' end
  from tenis_avisos_gestores where id = pg_temp.aviso_id(k, p)
$$;
create temp table t_reclamo (r jsonb);
-- Reclama y devuelve 'clave:perfil,...' de lo reclamado (guarda el json en t_reclamo).
create function pg_temp.reclamar() returns text language plpgsql as $$
declare v jsonb;
begin
  v := tenis_avisos_gestores_reclamar();
  delete from t_reclamo;
  insert into t_reclamo values (v);
  return coalesce((
    select string_agg(t.k || ':' || case (e->>'profile_id')
             when 'a0000000-0000-0000-0000-0000000000a1' then 'gestor' else 'admin' end,
           ',' order by t.k, case (e->>'profile_id')
             when 'a0000000-0000-0000-0000-0000000000a1' then 'gestor' else 'admin' end)
    from jsonb_array_elements(v->'avisos') e join t_ids t on t.id = (e->>'reserva_id')::uuid), '');
end $$;
create function pg_temp.resultado(k text, p text, res text, err text default null) returns jsonb language sql as $$
  select jsonb_build_object('id', pg_temp.aviso_id(k, p), 'resultado', res, 'error', err)
$$;

-- Como en producción: el socio puede cancelar hasta que empieza el turno.
update tenis_config set cancelacion_horas = 0;

-- ═════════════════════════════════════════════════════════════════════════════
-- Tabla, config y permisos
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera((select relrowsecurity::text from pg_class where relname = 'tenis_avisos_gestores' and relkind = 'r'),
  'true', 'RLS activa en la outbox');
select pg_temp.espera((has_table_privilege('authenticated', 'tenis_avisos_gestores', 'select')
  or has_table_privilege('anon', 'tenis_avisos_gestores', 'select'))::text, 'false', 'socios y anon no leen la outbox');
select pg_temp.espera(
  has_function_privilege('authenticated', 'tenis_avisos_gestores_reclamar(int)', 'execute')::text || '/' ||
  has_function_privilege('anon', 'tenis_avisos_gestores_marcar(jsonb)', 'execute')::text || '/' ||
  has_function_privilege('authenticated', 'tenis_avisos_gestores_marcar(jsonb)', 'execute')::text || '/' ||
  has_function_privilege('service_role', 'tenis_avisos_gestores_reclamar(int)', 'execute')::text || '/' ||
  has_function_privilege('service_role', 'tenis_avisos_gestores_marcar(jsonb)', 'execute')::text,
  'false/false/false/true/true', 'reclamar y marcar: sólo service_role');

select pg_temp.espera((select aviso_cancelacion_horas::text from tenis_config), '3', 'aviso por defecto: 3 horas');
select pg_temp.espera(tenis_config_json()->>'aviso_cancelacion_horas', '3', 'la config de los payloads trae el aviso');
select pg_temp.como('p1');
select pg_temp.espera(pg_temp.err($$select tenis_config_guardar('{"aviso_cancelacion_horas": 5}')$$), 'no_autorizado',
  'un socio no cambia el aviso');
select pg_temp.como('gestor');
select pg_temp.espera(tenis_config_guardar('{"aviso_cancelacion_horas": 5}')->>'aviso_cancelacion_horas', '5',
  'la gestora guarda el aviso');
select pg_temp.espera((select aviso_cancelacion_horas || '/' || cancelacion_horas from tenis_config), '5/0',
  'guardar sólo el aviso no toca el resto');
select pg_temp.espera(pg_temp.err($$select tenis_config_guardar('{"aviso_cancelacion_horas": 73}')$$), 'config_invalida',
  'aviso fuera de rango (0 a 72)');
select pg_temp.espera(pg_temp.err($$select tenis_config_guardar('{"aviso_cancelacion_horas": -1}')$$), 'config_invalida',
  'aviso negativo');
select pg_temp.espera(tenis_config_guardar('{"aviso_cancelacion_horas": 3}')->>'aviso_cancelacion_horas', '3', 'vuelve a 3');

-- ═════════════════════════════════════════════════════════════════════════════
-- Encolado
-- ═════════════════════════════════════════════════════════════════════════════

-- El titular cancela 1 h antes: un aviso por gestora y por admin activo.
select pg_temp.como('p1');
select pg_temp.guardar('tarde', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-20 11:00'), 'singles', pg_temp.j(2)));
select pg_temp.espera(pg_temp.avisos('tarde'), '', 'reservar no avisa');
select tenis_cancelar(pg_temp.id('tarde'), 'me surgió algo');
select pg_temp.espera(pg_temp.avisos('tarde'), 'gestor,admin',
  'titular cancela 1 h antes: aviso a la gestora y al admin (no a subcomisión de rugby, canchero ni admin dado de baja)');
select pg_temp.espera(pg_temp.aviso('tarde', 'gestor'), 'pendiente', 'el aviso nace pendiente');

-- Cancelar dos veces no duplica (la segunda ni siquiera pasa).
select pg_temp.espera(pg_temp.err(format('select tenis_cancelar(%L)', pg_temp.id('tarde'))), 'estado_invalido',
  'cancelar de nuevo: rechazado');
select pg_temp.espera(pg_temp.avisos('tarde'), 'gestor,admin', 'cancelar de nuevo no duplica');
select pg_temp.espera((pg_temp.err(format($$insert into tenis_avisos_gestores (reserva_id, profile_id) values (%L, %L)$$,
  pg_temp.id('tarde'), 'a0000000-0000-0000-0000-0000000000a1')) like '%duplicate key%')::text, 'true',
  'unique (reserva, perfil): un aviso por cancelación');

-- 5 h antes: no es tarde.
select pg_temp.como('p2');
select pg_temp.guardar('temprano', tenis_reservar(pg_temp.ca(2), pg_temp.t('2026-11-20 15:00'), 'singles', pg_temp.j(3)));
select tenis_cancelar(pg_temp.id('temprano'));
select pg_temp.espera(pg_temp.avisos('temprano'), '', 'titular cancela 5 h antes: sin aviso');

-- Justo en el límite (3 h antes): no avisa.
select pg_temp.como('p3');
select pg_temp.guardar('limite', tenis_reservar(pg_temp.ca(3), pg_temp.t('2026-11-20 13:00'), 'singles', pg_temp.j(4)));
select tenis_cancelar(pg_temp.id('limite'));
select pg_temp.espera(pg_temp.avisos('limite'), '', 'cancelar con 3 h justas: sin aviso');

-- Aviso apagado (0).
select pg_temp.como('gestor');
select tenis_config_guardar('{"aviso_cancelacion_horas": 0}');
select pg_temp.como('p4');
select pg_temp.guardar('apagado', tenis_reservar(pg_temp.ca(4), pg_temp.t('2026-11-20 11:00'), 'singles', pg_temp.j(1)));
select tenis_cancelar(pg_temp.id('apagado'));
select pg_temp.espera(pg_temp.avisos('apagado'), '', 'aviso en 0: nunca avisa');
select pg_temp.como('gestor');
select tenis_config_guardar('{"aviso_cancelacion_horas": 3}');

-- Staff cancela (gestora y canchero): sin aviso.
select pg_temp.como('p1');
select pg_temp.guardar('gestora', tenis_reservar(pg_temp.ca(5), pg_temp.t('2026-11-21 10:00'), 'singles', pg_temp.j(2)));
select pg_temp.como('p2');
select pg_temp.guardar('canchero', tenis_reservar(pg_temp.ca(6), pg_temp.t('2026-11-21 11:00'), 'singles', pg_temp.j(3)));
select pg_temp.ahora('2026-11-21 09:30');
select pg_temp.como('gestor');
select tenis_cancelar(pg_temp.id('gestora'), 'lluvia');
select pg_temp.como('canchero');
select tenis_cancelar(pg_temp.id('canchero'), 'lluvia');
select pg_temp.espera(pg_temp.avisos('gestora') || '/' || pg_temp.avisos('canchero'), '/',
  'cancela la gestora o el canchero: sin aviso');
select pg_temp.ahora('2026-11-20 10:00');

-- Sistema: invitado que no sube el comprobante a tiempo (lo cancela tenis_procesar).
select pg_temp.guardar('web', tenis_invitado_reservar(pg_temp.ca(7), pg_temp.t('2026-11-20 16:00'), 'singles',
  '{"dni":"30111222","nombre":"Carla","apellido":"Invitada","email":"carla@example.com"}',
  '[{"dni":"20111004"}]', repeat('a', 64)));
select tenis_invitado_confirmar(repeat('a', 64));
select pg_temp.espera(pg_temp.estado('web'), 'pendiente_comprobante', 'invitado confirmado por mail');
select pg_temp.ahora('2026-11-20 13:01');
select tenis_procesar();
select pg_temp.espera(pg_temp.estado('web') || '/' || pg_temp.avisos('web'), 'cancelada/',
  'cancelación del sistema (sin comprobante): sin aviso');
select pg_temp.ahora('2026-11-20 10:00');

-- ═════════════════════════════════════════════════════════════════════════════
-- Reclamo y marcado (cron)
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.ahora('2026-11-20 10:05');
select pg_temp.espera(pg_temp.reclamar(), 'tarde:admin,tarde:gestor', 'reclamo: los dos avisos pendientes');
select pg_temp.espera(
  (select (e->>'titular_nombre') || '|' || (e->>'cancha') || '|' || (e->>'anticipacion_min') || '|'
          || ((e->>'inicio')::timestamptz = pg_temp.t('2026-11-20 11:00'))::text
     from t_reclamo, jsonb_array_elements(r->'avisos') e
    where (e->>'profile_id')::uuid = 'a0000000-0000-0000-0000-0000000000a1'),
  'Pérez Juan|01|60|true', 'reclamo: titular, cancha, anticipación y turno');
select pg_temp.espera(pg_temp.reclamar(), '', 'un aviso reclamado no se vuelve a reclamar enseguida');

select tenis_avisos_gestores_marcar(jsonb_build_array(
  pg_temp.resultado('tarde', 'gestor', 'entregado'),
  pg_temp.resultado('tarde', 'admin', 'error', 'expo 500')));
select pg_temp.espera(pg_temp.aviso('tarde', 'gestor') || ',' || pg_temp.aviso('tarde', 'admin'), 'enviado,pendiente',
  'marcar: entregado y error para reintentar');
select pg_temp.espera((select error from tenis_avisos_gestores where id = pg_temp.aviso_id('tarde', 'admin')), 'expo 500',
  'marcar: guarda el error');
select pg_temp.espera(pg_temp.reclamar(), 'tarde:admin', 'el error se reintenta en la corrida siguiente');
select tenis_avisos_gestores_marcar(jsonb_build_array(pg_temp.resultado('tarde', 'admin', 'sin_dispositivo')));
select pg_temp.espera(pg_temp.aviso('tarde', 'admin'), 'descartado:sin_dispositivo', 'sin teléfono: descartado');
select pg_temp.espera(
  (tenis_avisos_gestores_marcar(jsonb_build_array(pg_temp.resultado('tarde', 'gestor', 'error', 'tarde'))))->>'actualizados',
  '0', 'marcar un aviso ya enviado no lo toca');
select pg_temp.espera(pg_temp.err($$select tenis_avisos_gestores_marcar('{}')$$), 'parametros', 'marcar sin lista: error');

-- Reintentos agotados al tercer error.
select pg_temp.como('p2');
select pg_temp.guardar('reint', tenis_reservar(pg_temp.ca(8), pg_temp.t('2026-11-20 12:00'), 'singles', pg_temp.j(1)));
select tenis_cancelar(pg_temp.id('reint'));
select pg_temp.espera(pg_temp.reclamar(), 'reint:admin,reint:gestor', 'nueva cancelación tardía reclamada');
select tenis_avisos_gestores_marcar(jsonb_build_array(pg_temp.resultado('reint', 'gestor', 'entregado'),
  pg_temp.resultado('reint', 'admin', 'error', 'x')));
select pg_temp.espera(pg_temp.reclamar(), 'reint:admin', 'segundo intento');
select tenis_avisos_gestores_marcar(jsonb_build_array(pg_temp.resultado('reint', 'admin', 'error', 'x')));
select pg_temp.espera(pg_temp.reclamar(), 'reint:admin', 'tercer intento');
select tenis_avisos_gestores_marcar(jsonb_build_array(pg_temp.resultado('reint', 'admin', 'error', 'x')));
select pg_temp.espera(pg_temp.aviso('reint', 'admin'), 'descartado:reintentos_agotados', 'al tercer error se deja de intentar');

-- Reclamo sin marcar vuelve a los 10 minutos; turno terminado y gestora que dejó de serlo se descartan.
select pg_temp.como('p3');
select pg_temp.guardar('viejo', tenis_reservar(pg_temp.ca(1), pg_temp.t('2026-11-20 12:30'), 'singles', pg_temp.j(4)));
select tenis_cancelar(pg_temp.id('viejo'));
select pg_temp.espera(pg_temp.avisos('viejo'), 'gestor,admin', 'cancelación tardía encolada');
select pg_temp.espera(pg_temp.reclamar(), 'viejo:admin,viejo:gestor', 'reclamado');
select pg_temp.espera(pg_temp.reclamar(), '', 'sin marcar: no vuelve enseguida');
select pg_temp.ahora('2026-11-20 10:16');
update profiles set deporte = 'rugby' where id = 'a0000000-0000-0000-0000-0000000000a1';
select pg_temp.espera(pg_temp.reclamar(), 'viejo:admin', 'a los 10 minutos vuelve; la ex gestora ya no');
select pg_temp.espera(pg_temp.aviso('viejo', 'gestor'), 'descartado:sin_permiso', 'ex gestora: descartado');
update profiles set deporte = 'tenis' where id = 'a0000000-0000-0000-0000-0000000000a1';
select pg_temp.ahora('2026-11-20 13:31');
select pg_temp.espera(pg_temp.reclamar(), '', 'turno terminado: no se reclama');
select pg_temp.espera(pg_temp.aviso('viejo', 'admin'), 'descartado:turno_pasado', 'turno terminado: descartado');

rollback;
