-- Pruebas de escenario para las migraciones 20261110000000_club_beneficios y
-- 20261111000000_rol_beneficios (rol 'beneficios': quien lo tiene en
-- profiles.roles administra la tabla beneficios y el bucket 'beneficios' desde
-- el panel web, sin importar su rol activo).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name beneficios-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec beneficios-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase beneficios-pg:/work
--   docker exec beneficios-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/rol_beneficios.sql
--   docker rm -f beneficios-pg
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos del
-- schema real (profiles con los CHECK vigentes de 20261105000000, get_rol() y
-- set_updated_at() reales, schema storage con buckets y objects), migraciones
-- cargadas con \ir (dos veces: son idempotentes), cada fallo se anota en
-- t_fallos y al final, si hubo alguno, el script aborta. Todo corre dentro de
-- una transacción con ROLLBACK.
--
-- get_rol() es la real (lee profiles por auth.uid()); auth.uid() sale del GUC
-- test.uid. Las pruebas corren como el rol `authenticated` (el superusuario
-- saltea RLS).
--
-- Beneficios sembrados: uno vigente, uno inactivo, uno vencido y uno futuro. Un
-- socio común ve sólo el vigente; quien tiene el rol 'beneficios' ve los cuatro.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- CHECK de roles vigentes antes de la migración (20261105000000_rol_colaborador).
create table profiles (
  id         uuid primary key,
  rol        text not null,
  roles      text[],
  nombre     text not null default '',
  divisiones uuid[],
  activo     boolean not null default true
);
alter table profiles add constraint profiles_rol_check check (rol = any (array[
  'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
  'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio', 'tutor',
  'colaborador']));
alter table profiles add constraint profiles_roles_check check (roles <@ array[
  'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
  'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio', 'tutor',
  'colaborador']);

-- Helpers reales (init_schema).
create or replace function get_rol() returns text language sql security definer stable as $$
  select rol from profiles where id = auth.uid()
$$;
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

alter table profiles enable row level security;
create policy profiles_select_own on profiles for select to authenticated using (id = auth.uid());

-- Storage de Supabase (sólo lo que usan las policies).
create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata   jsonb
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

insert into storage.buckets (id, name, public) values ('noticias-imagenes', 'noticias-imagenes', true);

-- ─── Migraciones bajo prueba (dos veces: idempotentes) ────────────────────────

\ir ../migrations/20261110000000_club_beneficios.sql
\ir ../migrations/20261111000000_rol_beneficios.sql
\ir ../migrations/20261110000000_club_beneficios.sql
\ir ../migrations/20261111000000_rol_beneficios.sql

-- Supabase da estos privilegios por default en public; RLS decide el resto.
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema public, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
grant execute on function get_rol(), set_updated_at() to anon, authenticated, service_role;

-- ─── Datos (cargados como superusuario) ───────────────────────────────────────

-- B1: socio con 'beneficios' en roles. BI: igual, pero inactivo.
insert into profiles (id, rol, roles, nombre, activo) values
  ('a0000000-0000-0000-0000-0000000000ad', 'admin',       '{admin}',              'Admin',          true),
  ('b0000000-0000-0000-0000-000000000001', 'socio',       '{socio,beneficios}',   'Beneficios',     true),
  ('b0000000-0000-0000-0000-0000000000ff', 'socio',       '{socio,beneficios}',   'Beneficios baja', false),
  ('50000000-0000-0000-0000-000000000001', 'socio',       '{socio}',              'Socio',          true),
  ('5c000000-0000-0000-0000-000000000001', 'subcomision', '{subcomision}',        'Subcomisión',    true),
  ('5e000000-0000-0000-0000-000000000001', 'secretaria',  '{secretaria}',         'Secretaría',     true);

insert into beneficios (id, nombre, rubro, descuento, activo, vigente_desde, vigente_hasta) values
  ('be000000-0000-0000-0000-000000000001', 'Vigente',  'gastronomia', '20% OFF', true,  current_date - 10, current_date + 10),
  ('be000000-0000-0000-0000-000000000002', 'Inactivo', 'deportes',    '10% OFF', false, null,              null),
  ('be000000-0000-0000-0000-000000000003', 'Vencido',  'salud',       '2x1',     true,  current_date - 60, current_date - 30),
  ('be000000-0000-0000-0000-000000000004', 'Futuro',   'otros',       '15% OFF', true,  current_date + 30, null);

insert into storage.objects (bucket_id, name) values
  ('beneficios',        'be000000-0000-0000-0000-000000000001/logo.png'),
  ('noticias-imagenes', 'otra/foto.png');

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);
grant all on t_fallos to authenticated;

-- Ejecuta una sentencia con los permisos del rol actual (SECURITY INVOKER).
-- Devuelve 'filas:N' o 'rechazado' (error de RLS, trigger o constraint).
create function t_res(p_sql text) returns text language plpgsql as $$
declare
  v_n bigint;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return 'filas:' || v_n;
exception when others then
  raise notice '       (% %)', sqlstate, sqlerrm;
  return 'rechazado';
end $$;

-- Cuenta las filas visibles de una consulta con los permisos del rol actual.
create function t_cuenta(p_sql text) returns text language plpgsql as $$
declare
  v_n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') x' into v_n;
  return v_n::text;
end $$;

create function t_espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    insert into t_fallos values (p_msg || ' → esperado ' || coalesce(p_esperado, 'NULL') || ', real ' || coalesce(p_real, 'NULL'));
    raise notice 'FALLA: % (esperado %, real %)', p_msg, p_esperado, p_real;
  else
    raise notice 'ok: %', p_msg;
  end if;
end $$;

grant execute on function t_res(text), t_cuenta(text), t_espera(text, text, text) to authenticated;

-- ─── Caso 8: CHECK de roles (como superusuario: lo hace admin-usuarios) ──────

select t_espera(t_res($q$
  insert into profiles (id, rol, roles, nombre)
  values ('b0000000-0000-0000-0000-000000000002', 'socio', '{socio,beneficios}', 'Otro beneficios') $q$),
  'filas:1', 'CHECK: acepta roles {socio,beneficios}');
select t_espera(t_res($q$ update profiles set rol = 'beneficios' where id = 'b0000000-0000-0000-0000-000000000002' $q$),
  'filas:1', 'CHECK: acepta rol activo beneficios');
select t_espera(t_res($q$ update profiles set roles = '{socio,inventado}' where id = 'b0000000-0000-0000-0000-000000000002' $q$),
  'rechazado', 'CHECK: rechaza un rol inventado en roles');
select t_espera(t_res($q$ update profiles set rol = 'inventado' where id = 'b0000000-0000-0000-0000-000000000002' $q$),
  'rechazado', 'CHECK: rechaza un rol activo inventado');
select t_espera((select count(*)::text from pg_policies where policyname like '%rol_beneficios%'), '8',
  'la migración crea 8 policies del rol beneficios (4 tabla + 4 storage)');
select t_espera((select count(*)::text from pg_policies where policyname = 'beneficios_storage_select_admin'), '1',
  'la migración crea beneficios_storage_select_admin');

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 1: titular con rol activo 'socio' y roles {socio,beneficios}
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.uid = 'b0000000-0000-0000-0000-000000000001';

select t_espera(t_cuenta('select 1 from beneficios'), '4',
  'titular (rol socio): ve los 4 beneficios (inactivos, vencidos y futuros incluidos)');
select t_espera(t_res($q$
  insert into beneficios (id, nombre, rubro, descuento)
  values ('be100000-0000-0000-0000-000000000001', 'Nuevo 1', 'belleza', '30% OFF') $q$),
  'filas:1', 'titular (rol socio): crea un beneficio');
select t_espera(t_res($q$ update beneficios set orden = orden + 1 where id = 'be000000-0000-0000-0000-000000000002' $q$),
  'filas:1', 'titular (rol socio): edita un beneficio inactivo (1 fila)');
select t_espera(t_res($q$ update beneficios set activo = false where id = 'be100000-0000-0000-0000-000000000001' $q$),
  'filas:1', 'titular (rol socio): desactiva el beneficio que creó (1 fila)');
select t_espera(t_res($q$ delete from beneficios where id = 'be100000-0000-0000-0000-000000000001' $q$),
  'filas:1', 'titular (rol socio): borra un beneficio inactivo (1 fila)');

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 2: el mismo titular con rol activo 'beneficios'
-- ═════════════════════════════════════════════════════════════════════════════

reset role;
update profiles set rol = 'beneficios' where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated;

select t_espera(t_cuenta('select 1 from beneficios'), '4',
  'titular (rol beneficios): ve los 4 beneficios');
select t_espera(t_res($q$
  insert into beneficios (id, nombre, rubro, descuento)
  values ('be100000-0000-0000-0000-000000000002', 'Nuevo 2', 'educacion', '2x1') $q$),
  'filas:1', 'titular (rol beneficios): crea un beneficio');
select t_espera(t_res($q$ update beneficios set orden = orden + 1 where id = 'be000000-0000-0000-0000-000000000003' $q$),
  'filas:1', 'titular (rol beneficios): edita un beneficio vencido (1 fila)');
select t_espera(t_res($q$ delete from beneficios where id = 'be100000-0000-0000-0000-000000000002' $q$),
  'filas:1', 'titular (rol beneficios): borra el beneficio que creó (1 fila)');

reset role;
update profiles set rol = 'socio' where id = 'b0000000-0000-0000-0000-000000000001';
set local role authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 3: titular inactivo (activo = false)
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'b0000000-0000-0000-0000-0000000000ff';

select t_espera(t_cuenta('select 1 from beneficios'), '1',
  'titular inactivo: ve sólo lo que ve un socio (el vigente)');
select t_espera(t_res($q$
  insert into beneficios (nombre, rubro, descuento) values ('X', 'otros', '5% OFF') $q$),
  'rechazado', 'titular inactivo: no crea beneficios');
select t_espera(t_res('update beneficios set orden = orden + 1'), 'filas:0',
  'titular inactivo: no edita beneficios (0 filas)');
select t_espera(t_res('delete from beneficios'), 'filas:0',
  'titular inactivo: no borra beneficios (0 filas)');
select t_espera(t_res($q$ insert into storage.objects (bucket_id, name) values ('beneficios', 'x/inactivo.png') $q$),
  'rechazado', 'titular inactivo: no sube archivos al bucket beneficios');

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 4: socio común (roles {socio})
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = '50000000-0000-0000-0000-000000000001';

select t_espera(t_cuenta('select 1 from beneficios'), '1',
  'socio: ve sólo el beneficio activo y vigente');
select t_espera(t_cuenta($q$ select 1 from beneficios where id = 'be000000-0000-0000-0000-000000000001' $q$), '1',
  'socio: el que ve es el vigente');
select t_espera(t_res($q$
  insert into beneficios (nombre, rubro, descuento) values ('X', 'otros', '5% OFF') $q$),
  'rechazado', 'socio: no crea beneficios');
select t_espera(t_res('update beneficios set orden = orden + 1'), 'filas:0',
  'socio: no edita beneficios (0 filas, ni el que ve)');
select t_espera(t_res('delete from beneficios'), 'filas:0',
  'socio: no borra beneficios (0 filas)');

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 5: subcomisión y secretaría (sin 'beneficios' en roles)
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = '5c000000-0000-0000-0000-000000000001';

select t_espera(t_res($q$
  insert into beneficios (nombre, rubro, descuento) values ('X', 'otros', '5% OFF') $q$),
  'rechazado', 'subcomisión: no crea beneficios');
select t_espera(t_res('update beneficios set orden = orden + 1'), 'filas:0',
  'subcomisión: no edita beneficios (0 filas)');
select t_espera(t_res('delete from beneficios'), 'filas:0',
  'subcomisión: no borra beneficios (0 filas)');

set local test.uid = '5e000000-0000-0000-0000-000000000001';

select t_espera(t_res($q$
  insert into beneficios (nombre, rubro, descuento) values ('X', 'otros', '5% OFF') $q$),
  'rechazado', 'secretaría: no crea beneficios');
select t_espera(t_res('update beneficios set orden = orden + 1'), 'filas:0',
  'secretaría: no edita beneficios (0 filas)');
select t_espera(t_res('delete from beneficios'), 'filas:0',
  'secretaría: no borra beneficios (0 filas)');

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 6: admin sigue con CRUD completo
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'a0000000-0000-0000-0000-0000000000ad';

select t_espera(t_cuenta('select 1 from beneficios'), '4', 'admin: ve los 4 beneficios');
select t_espera(t_res($q$
  insert into beneficios (id, nombre, rubro, descuento)
  values ('be100000-0000-0000-0000-0000000000ad', 'Admin', 'servicios', '25% OFF') $q$),
  'filas:1', 'admin: crea un beneficio');
select t_espera(t_res($q$ update beneficios set destacado = true where id = 'be100000-0000-0000-0000-0000000000ad' $q$),
  'filas:1', 'admin: edita un beneficio (1 fila)');
select t_espera(t_res($q$ delete from beneficios where id = 'be100000-0000-0000-0000-0000000000ad' $q$),
  'filas:1', 'admin: borra un beneficio (1 fila)');

-- ═════════════════════════════════════════════════════════════════════════════
-- Caso 7: bucket 'beneficios'
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'b0000000-0000-0000-0000-000000000001';

select t_espera(t_res($q$ insert into storage.objects (bucket_id, name)
    values ('beneficios', 'be000000-0000-0000-0000-000000000002/logo.png') $q$),
  'filas:1', 'titular: sube un logo al bucket beneficios');
select t_espera(t_res($q$ update storage.objects set metadata = '{"v":2}'
    where bucket_id = 'beneficios' and name = 'be000000-0000-0000-0000-000000000002/logo.png' $q$),
  'filas:1', 'titular: reemplaza el logo (upsert, 1 fila)');
select t_espera(t_res($q$ delete from storage.objects
    where bucket_id = 'beneficios' and name = 'be000000-0000-0000-0000-000000000002/logo.png' $q$),
  'filas:1', 'titular: borra el logo (1 fila)');
select t_espera(t_res($q$ insert into storage.objects (bucket_id, name) values ('noticias-imagenes', 'x/foto.png') $q$),
  'rechazado', 'titular: no sube archivos a otro bucket');
select t_espera(t_res($q$ update storage.objects set metadata = '{}' where bucket_id = 'noticias-imagenes' $q$),
  'filas:0', 'titular: no edita archivos de otro bucket (0 filas)');
select t_espera(t_res($q$ delete from storage.objects where bucket_id = 'noticias-imagenes' $q$),
  'filas:0', 'titular: no borra archivos de otro bucket (0 filas)');

set local test.uid = '50000000-0000-0000-0000-000000000001';

select t_espera(t_res($q$ insert into storage.objects (bucket_id, name) values ('beneficios', 'x/socio.png') $q$),
  'rechazado', 'socio: no sube archivos al bucket beneficios');
select t_espera(t_res($q$ update storage.objects set metadata = '{}' where bucket_id = 'beneficios' $q$),
  'filas:0', 'socio: no edita archivos del bucket beneficios (0 filas)');
select t_espera(t_res($q$ delete from storage.objects where bucket_id = 'beneficios' $q$),
  'filas:0', 'socio: no borra archivos del bucket beneficios (0 filas)');

set local test.uid = 'a0000000-0000-0000-0000-0000000000ad';

select t_espera(t_res($q$ update storage.objects set metadata = '{"v":2}'
    where bucket_id = 'beneficios' and name = 'be000000-0000-0000-0000-000000000001/logo.png' $q$),
  'filas:1', 'admin: reemplaza un logo (1 fila, gracias a beneficios_storage_select_admin)');
select t_espera(t_res($q$ delete from storage.objects
    where bucket_id = 'beneficios' and name = 'be000000-0000-0000-0000-000000000001/logo.png' $q$),
  'filas:1', 'admin: borra un logo (1 fila)');

reset role;

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
