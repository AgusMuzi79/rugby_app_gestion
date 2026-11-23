-- Pruebas de escenario para la migración 20261120000000_rol_pileta (rol de
-- lector 'pileta' en los CHECK de profiles + servicio "Pileta" en el catálogo;
-- subcomisión no puede poner ni quitar el rol, admin sí).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name pileta-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec pileta-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase pileta-pg:/work
--   docker exec pileta-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/rol_pileta.sql
--   docker rm -f pileta-pg
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos del
-- schema real (profiles con los CHECK vigentes de 20261111000000,
-- servicios_opcionales de 20260609000000, guard real de 20261109000000 con su
-- trigger de 20260731000000), migración cargada con \ir (dos veces: es
-- idempotente), cada fallo se anota en t_fallos y al final, si hubo alguno, el
-- script aborta. Todo corre dentro de una transacción con ROLLBACK. El trigger
-- corre igual como superusuario: el caller sale de los GUC test.uid
-- (auth.uid(); '' = sin usuario, como service_role) y test.rol (get_rol()).

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function get_rol() returns text language sql stable as $$
  select nullif(current_setting('test.rol', true), '')
$$;

-- CHECK de roles vigentes antes de la migración (20261111000000_rol_beneficios).
create table profiles (
  id         uuid primary key,
  nombre     text not null,
  rol        text not null,
  roles      text[] not null default '{}',
  divisiones uuid[],
  activo     boolean not null default true,
  deporte    text
);
alter table profiles add constraint profiles_rol_check check (rol = any (array[
  'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
  'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
  'tutor', 'colaborador', 'beneficios']));
alter table profiles add constraint profiles_roles_check check (roles <@ array[
  'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
  'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
  'tutor', 'colaborador', 'beneficios']);

-- Catálogo de servicios (20260609000000_servicios_opcionales).
create table servicios_opcionales (
  id            uuid default gen_random_uuid() primary key,
  nombre        text not null,
  descripcion   text,
  monto_mensual numeric(10,2) not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz default now() not null
);
insert into servicios_opcionales (nombre, monto_mensual) values
  ('Gimnasio', 18750), ('Rugby', 25000), ('Tenis', 25000);

-- Guard real y su trigger.
\ir ../migrations/20261109000000_guard_roles_subcomision.sql
create trigger guard_profiles_role_update
  before update on profiles
  for each row execute function guard_profile_role_update();

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);

-- Devuelve 'filas:N' o 'rechazado' (error de trigger o constraint).
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

create function t_espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    insert into t_fallos values (p_msg || ' → esperado ' || coalesce(p_esperado, 'NULL') || ', real ' || coalesce(p_real, 'NULL'));
    raise notice 'FALLA: % (esperado %, real %)', p_msg, p_esperado, p_real;
  else
    raise notice 'ok: %', p_msg;
  end if;
end $$;

-- ─── RED: antes de la migración el CHECK rechaza 'pileta' ─────────────────────

select t_espera(t_res($q$
  insert into profiles (id, nombre, rol, roles)
  values ('f0000000-0000-0000-0000-000000000001', 'Antes', 'pileta', '{pileta}') $q$),
  'rechazado', 'antes de la migración: el CHECK rechaza el rol pileta');

-- ─── Migración bajo prueba (dos veces: idempotente) ───────────────────────────

\ir ../migrations/20261120000000_rol_pileta.sql
\ir ../migrations/20261120000000_rol_pileta.sql

-- ─── Datos (como service_role: sin usuario) ───────────────────────────────────

set local test.uid = '';
set local test.rol = '';

insert into profiles (id, nombre, rol, roles) values
  ('a0000000-0000-0000-0000-000000000001', 'Subco',  'subcomision', '{subcomision,socio}'),
  ('a0000000-0000-0000-0000-000000000002', 'Admin',  'admin',       '{admin,socio}'),
  ('a0000000-0000-0000-0000-000000000003', 'Socio',  'socio',       '{socio}'),
  ('a0000000-0000-0000-0000-000000000004', 'Pileta', 'pileta',      '{pileta}');

-- ─── Caso 1: CHECK de roles ───────────────────────────────────────────────────

select t_espera(t_res($q$
  insert into profiles (id, nombre, rol, roles)
  values ('a0000000-0000-0000-0000-000000000005', 'Otra', 'pileta', '{socio,pileta}') $q$),
  'filas:1', 'CHECK: acepta rol activo pileta y roles {socio,pileta}');
select t_espera(t_res($q$ update profiles set roles = '{pileta,inventado}' where id = 'a0000000-0000-0000-0000-000000000005' $q$),
  'rechazado', 'CHECK: sigue rechazando un rol inventado en roles');
select t_espera(t_res($q$ update profiles set rol = 'inventado' where id = 'a0000000-0000-0000-0000-000000000005' $q$),
  'rechazado', 'CHECK: sigue rechazando un rol activo inventado');
select t_espera(t_res($q$ update profiles set rol = 'beneficios', roles = '{socio,beneficios}' where id = 'a0000000-0000-0000-0000-000000000005' $q$),
  'filas:1', 'CHECK: los roles anteriores siguen aceptados (beneficios)');

-- ─── Caso 2: servicio "Pileta" en el catálogo ─────────────────────────────────

select t_espera((select count(*)::text from servicios_opcionales where lower(nombre) = 'pileta'), '1',
  'catálogo: una sola fila Pileta aunque la migración corra dos veces');
select t_espera((select monto_mensual::text || '/' || activo::text from servicios_opcionales where nombre = 'Pileta'),
  '0.00/true', 'catálogo: Pileta con monto 0 y activo');
select t_espera((select count(*)::text from servicios_opcionales where nombre ilike '%pileta%'), '1',
  'catálogo: el gate de socios-qr (ILIKE %pileta%) encuentra el servicio');

-- Si ya existía (con otra capitalización) no se duplica.
delete from servicios_opcionales where nombre = 'Pileta';
insert into servicios_opcionales (nombre, monto_mensual) values ('PILETA', 5000);
\ir ../migrations/20261120000000_rol_pileta.sql
select t_espera((select count(*)::text from servicios_opcionales where lower(nombre) = 'pileta'), '1',
  'catálogo: no duplica una fila PILETA cargada antes a mano');
select t_espera((select monto_mensual::text from servicios_opcionales where lower(nombre) = 'pileta'), '5000.00',
  'catálogo: no pisa la fila existente');

-- ─── Caso 3: subcomisión no pone ni quita 'pileta' ────────────────────────────

set local test.uid = 'a0000000-0000-0000-0000-000000000001';
set local test.rol = 'subcomision';

select t_espera(t_res($q$ update profiles set roles = '{socio,pileta}', rol = 'pileta' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'rechazado', 'subcomisión: no le pone el rol pileta a un socio');
select t_espera(t_res($q$ update profiles set roles = '{socio}', rol = 'socio' where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'rechazado', 'subcomisión: no le quita el rol pileta a una cuenta');

-- ─── Caso 4: admin sí ─────────────────────────────────────────────────────────

set local test.uid = 'a0000000-0000-0000-0000-000000000002';
set local test.rol = 'admin';

select t_espera(t_res($q$ update profiles set roles = '{socio,pileta}', rol = 'pileta' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'filas:1', 'admin: le pone el rol pileta a un socio');
select t_espera(t_res($q$ update profiles set roles = '{socio}', rol = 'socio' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'filas:1', 'admin: se lo quita');

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
