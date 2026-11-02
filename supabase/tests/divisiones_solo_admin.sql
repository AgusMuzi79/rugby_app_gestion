-- Pruebas de escenario para la migración 20261108000000_divisiones_solo_admin
-- (crear y editar divisiones sólo admin + una sola división activa que recibe
-- adultos por deporte y rama).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name divs-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec divs-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase divs-pg:/work
--   docker exec divs-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/divisiones_solo_admin.sql
--   docker rm -f divs-pg
-- El chequeo previo de duplicados lee la migración con pg_read_file (hace falta
-- superusuario). Si la carpeta migrations no quedó en /work/migrations, pasar
-- su ruta absoluta con -v migdir=/ruta/migrations.
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos,
-- migración cargada con \ir (dos veces: es idempotente), cada fallo se anota en
-- t_fallos y al final, si hubo alguno, el script aborta. Todo corre dentro de
-- una transacción con ROLLBACK.

\set ON_ERROR_STOP on
\if :{?migdir}
\else
  \set migdir /work/migrations
\endif

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

grant usage on schema public to authenticated;

-- get_rol() real devuelve profiles.rol del usuario logueado; acá sale de una
-- variable de sesión para poder cambiar de rol entre casos.
create function get_rol() returns text language sql stable as $f$
  select current_setting('t.rol', true)
$f$;
create function tiene_acceso_deporte(p_deporte text) returns boolean language sql stable as $f$
  select true
$f$;
grant execute on function get_rol(), tiene_acceso_deporte(text) to authenticated;

create table divisiones (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  deporte        text not null default 'rugby',
  rama           text check (rama is null or rama in ('damas', 'caballeros', 'mixto')),
  activa         boolean not null default true,
  recibe_adultos boolean not null default false
);
alter table divisiones enable row level security;
grant all on divisiones to authenticated;

-- Policies vigentes antes de la migración (20260506000003 y 20260914000000).
create policy "divisiones_select" on divisiones for select to authenticated
  using ((select get_rol()) <> 'subcomision' or (select tiene_acceso_deporte(deporte)));
create policy "divisiones_insert" on divisiones for insert to authenticated
  with check ((select get_rol()) = 'subcomision' and (select tiene_acceso_deporte(deporte)));
create policy "divisiones_update" on divisiones for update to authenticated
  using ((select get_rol()) = 'subcomision' and (select tiene_acceso_deporte(deporte)));
create policy "divisiones_delete" on divisiones for delete to authenticated
  using ((select get_rol()) = 'subcomision' and (select tiene_acceso_deporte(deporte)));
create policy "divisiones_insert_admin" on divisiones for insert to authenticated
  with check ((select get_rol()) = 'admin');
create policy "divisiones_update_admin" on divisiones for update to authenticated
  using ((select get_rol()) = 'admin');
create policy "divisiones_delete_admin" on divisiones for delete to authenticated
  using ((select get_rol()) = 'admin');

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);
grant all on t_fallos to authenticated;

-- Ejecuta una sentencia con los permisos del rol actual (SECURITY INVOKER).
-- Devuelve 'filas:N' o 'rechazado' (error de permisos, RLS o validación).
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

-- Ejecuta un script y devuelve el mensaje de error, o 'sin error'. Lo que haya
-- hecho el script se deshace si falla (subtransacción del bloque exception).
create function t_error(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'sin error';
exception when others then
  return sqlerrm;
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

grant execute on function t_res(text), t_espera(text, text, text) to authenticated;

create function t_policies() returns text language sql as $f$
  select string_agg(policyname, ',' order by policyname) from pg_policies where tablename = 'divisiones'
$f$;
create function t_hay_indice() returns text language sql as $f$
  select (to_regclass('public.divisiones_recibe_adultos_unico') is not null)::text
$f$;

-- ─── Chequeo previo: con duplicados la migración falla y no toca nada ─────────

insert into divisiones (nombre, deporte, rama, activa, recibe_adultos) values
  ('Mayores',       'rugby',  'caballeros', true,  true),
  ('Plantel B',     'rugby',  'caballeros', true,  true),
  ('Primera Damas', 'hockey', 'damas',      true,  true),
  ('Sin rama 1',    'tenis',  null,         true,  true),
  ('Sin rama 2',    'tenis',  null,         true,  true);

select pg_read_file(:'migdir' || '/20261108000000_divisiones_solo_admin.sql') as mig_sql \gset

select t_espera(
  (t_error(:'mig_sql') like 'Hay más de una división activa que recibe adultos%rugby/caballeros (Mayores, Plantel B)%')::text,
  'true', 'duplicados: la migración falla con un mensaje que nombra deporte/rama y divisiones');
select t_espera((t_error(:'mig_sql') like '%tenis%')::text, 'false',
  'duplicados: las sin rama no cuentan (el índice tampoco las alcanza)');
select t_espera(t_hay_indice(), 'false', 'duplicados: el índice no se crea');
select t_espera(t_policies(),
  'divisiones_delete,divisiones_delete_admin,divisiones_insert,divisiones_insert_admin,divisiones_select,divisiones_update,divisiones_update_admin',
  'duplicados: las policies quedan como estaban');
select t_espera((select count(*)::text from divisiones), '5', 'duplicados: no se borra ni modifica ningún dato');

delete from divisiones;

-- ─── Migración (dos veces: idempotente) ───────────────────────────────────────

insert into divisiones (id, nombre, deporte, rama, activa, recibe_adultos) values
  ('d0000000-0000-0000-0000-000000000001', 'Mayores',       'rugby',  'caballeros', true,  true),
  ('d0000000-0000-0000-0000-000000000002', 'M19',           'rugby',  'caballeros', true,  false),
  ('d0000000-0000-0000-0000-000000000003', 'Intermedia',    'rugby',  'caballeros', false, true);

\ir ../migrations/20261108000000_divisiones_solo_admin.sql
\ir ../migrations/20261108000000_divisiones_solo_admin.sql

-- ─── Estructura ───────────────────────────────────────────────────────────────

select t_espera(t_policies(),
  'divisiones_delete,divisiones_delete_admin,divisiones_insert_admin,divisiones_select,divisiones_update_admin',
  'quedan select, delete y las de admin; no las de insert/update de subcomisión');
select t_espera(t_hay_indice(), 'true', 'existe divisiones_recibe_adultos_unico');

-- ─── Subcomisión: no crea ni edita ────────────────────────────────────────────

set local role authenticated;
select set_config('t.rol', 'subcomision', true);

select t_espera((select count(*)::text from divisiones), '3', 'subcomisión: sigue viendo las divisiones');
select t_espera(t_res($q$ insert into divisiones (nombre, deporte) values ('Nueva subco', 'rugby') $q$), 'rechazado',
  'subcomisión: no crea divisiones');
select t_espera(t_res($q$ update divisiones set nombre = 'Cambiada' where id = 'd0000000-0000-0000-0000-000000000002' $q$), 'filas:0',
  'subcomisión: no edita divisiones');
select t_espera(t_res($q$ update divisiones set activa = false where id = 'd0000000-0000-0000-0000-000000000002' $q$), 'filas:0',
  'subcomisión: no desactiva divisiones');

select set_config('t.rol', 'coordinador', true);
select t_espera(t_res($q$ insert into divisiones (nombre, deporte) values ('Nueva coord', 'rugby') $q$), 'rechazado',
  'coordinador: no crea divisiones');

-- ─── Admin: crea y edita ──────────────────────────────────────────────────────

select set_config('t.rol', 'admin', true);

select t_espera(t_res($q$ insert into divisiones (nombre, deporte, rama) values ('M17', 'rugby', 'caballeros') $q$), 'filas:1',
  'admin: crea divisiones');
select t_espera(t_res($q$ update divisiones set nombre = 'M19 A' where id = 'd0000000-0000-0000-0000-000000000002' $q$), 'filas:1',
  'admin: edita divisiones');

-- ─── Una sola activa que recibe adultos por deporte y rama ───────────────────

select t_espera(t_res($q$ insert into divisiones (nombre, deporte, rama, recibe_adultos) values ('Primera', 'rugby', 'caballeros', true) $q$), 'rechazado',
  'segunda activa que recibe adultos (mismo deporte y rama): rechazada');
select t_espera(t_res($q$ update divisiones set recibe_adultos = true where id = 'd0000000-0000-0000-0000-000000000002' $q$), 'rechazado',
  'marcar recibe adultos en otra activa del mismo deporte y rama: rechazado');
select t_espera(t_res($q$ update divisiones set activa = true where id = 'd0000000-0000-0000-0000-000000000003' $q$), 'rechazado',
  'reactivar una que recibe adultos con otra activa igual: rechazado');
select t_espera(t_res($q$ insert into divisiones (nombre, deporte, rama, activa, recibe_adultos) values ('Vieja', 'rugby', 'caballeros', false, true) $q$), 'filas:1',
  'una inactiva que recibe adultos: permitida');
select t_espera(t_res($q$ insert into divisiones (nombre, deporte, rama, recibe_adultos) values ('Primera Damas', 'rugby', 'damas', true) $q$), 'filas:1',
  'otra rama del mismo deporte: permitida');
select t_espera(t_res($q$ insert into divisiones (nombre, deporte, rama, recibe_adultos) values ('Primera Hockey', 'hockey', 'caballeros', true) $q$), 'filas:1',
  'misma rama en otro deporte: permitida');
select t_espera(t_res($q$ update divisiones set activa = false where id = 'd0000000-0000-0000-0000-000000000001' $q$), 'filas:1',
  'desactivar la que recibe adultos: permitido');
select t_espera(t_res($q$ update divisiones set activa = true where id = 'd0000000-0000-0000-0000-000000000003' $q$), 'filas:1',
  'después, reactivar otra de la misma rama: permitido');

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
