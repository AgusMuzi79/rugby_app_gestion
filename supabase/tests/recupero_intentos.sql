-- Pruebas de escenario para la migración 20261107000000_recupero_password_intentos
-- (límite propio de pedidos de recupero de contraseña de login-dni).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name recupero-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec recupero-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase recupero-pg:/work
--   docker exec recupero-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/recupero_intentos.sql
--   docker rm -f recupero-pg
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos,
-- migración cargada con \ir (dos veces: es idempotente), cada fallo se anota en
-- t_fallos y al final, si hubo alguno, el script aborta. Todo corre dentro de
-- una transacción con ROLLBACK.
--
-- Como en Supabase, las tablas y funciones nuevas de public nacen con permisos
-- para anon/authenticated (default privileges) y service_role tiene BYPASSRLS:
-- la migración tiene que cerrar todo para los dos primeros.
-- now() está fijo dentro de la transacción: el paso del tiempo se simula
-- corriendo inicio_at hacia atrás.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
alter role service_role bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ─── Migración (dos veces: idempotente) ───────────────────────────────────────

\ir ../migrations/20261107000000_recupero_password_intentos.sql
\ir ../migrations/20261107000000_recupero_password_intentos.sql

alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);
grant all on t_fallos to anon, authenticated, service_role;

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

-- Valor de la primera columna de una consulta, como texto (con los permisos del rol actual).
create function t_val(p_sql text) returns text language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
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

grant execute on function t_res(text), t_val(text), t_espera(text, text, text) to anon, authenticated, service_role;

-- ─── Estructura ───────────────────────────────────────────────────────────────

select t_espera((select relrowsecurity::text from pg_class where oid = 'public.recupero_intentos'::regclass), 'true',
  'recupero_intentos tiene RLS activa');
select t_espera((select count(*)::text from pg_policies where tablename = 'recupero_intentos'), '0',
  'recupero_intentos no tiene policies');

-- ─── anon y authenticated: ni leen, ni escriben, ni llaman a la función ──────

set local role anon;
select t_espera(t_res($q$ select * from recupero_intentos $q$), 'rechazado', 'anon: no lee la tabla');
select t_espera(t_res($q$ insert into recupero_intentos values ('x', now(), 1) $q$), 'rechazado', 'anon: no escribe la tabla');
select t_espera(t_res($q$ select registrar_intento_recupero('id:60:aa', interval '60 seconds', 1) $q$), 'rechazado',
  'anon: no llama a registrar_intento_recupero');
reset role;

set local role authenticated;
select t_espera(t_res($q$ select * from recupero_intentos $q$), 'rechazado', 'authenticated: no lee la tabla');
select t_espera(t_res($q$ delete from recupero_intentos $q$), 'rechazado', 'authenticated: no borra la tabla');
select t_espera(t_res($q$ select registrar_intento_recupero('id:60:aa', interval '60 seconds', 1) $q$), 'rechazado',
  'authenticated: no llama a registrar_intento_recupero');
reset role;

-- ─── service_role: ventana y máximo ───────────────────────────────────────────

set local role service_role;

-- 1 por 60 s
select t_espera(t_val($q$ select registrar_intento_recupero('id:60:aa', interval '60 seconds', 1) $q$), 'true',
  '1/60 s: el primer pedido pasa');
select t_espera(t_val($q$ select registrar_intento_recupero('id:60:aa', interval '60 seconds', 1) $q$), 'false',
  '1/60 s: el segundo dentro de la ventana no pasa');
select t_espera(t_val($q$ select registrar_intento_recupero('id:60:bb', interval '60 seconds', 1) $q$), 'true',
  '1/60 s: otra clave no se ve afectada');
update recupero_intentos set inicio_at = inicio_at - interval '59 seconds' where clave = 'id:60:aa';
select t_espera(t_val($q$ select registrar_intento_recupero('id:60:aa', interval '60 seconds', 1) $q$), 'false',
  '1/60 s: a los 59 s sigue cerrado (los rechazados no estiran la ventana)');
update recupero_intentos set inicio_at = inicio_at - interval '1 second' where clave = 'id:60:aa';
select t_espera(t_val($q$ select registrar_intento_recupero('id:60:aa', interval '60 seconds', 1) $q$), 'true',
  '1/60 s: vencida la ventana vuelve a pasar');
select t_espera(t_val($q$ select cuenta from recupero_intentos where clave = 'id:60:aa' $q$), '1',
  '1/60 s: la ventana nueva arranca en 1');

-- 3 por hora
select t_espera(t_val($q$ select registrar_intento_recupero('id:3600:cc', interval '3600 seconds', 3) $q$), 'true', '3/h: 1º pasa');
select t_espera(t_val($q$ select registrar_intento_recupero('id:3600:cc', interval '3600 seconds', 3) $q$), 'true', '3/h: 2º pasa');
select t_espera(t_val($q$ select registrar_intento_recupero('id:3600:cc', interval '3600 seconds', 3) $q$), 'true', '3/h: 3º pasa');
select t_espera(t_val($q$ select registrar_intento_recupero('id:3600:cc', interval '3600 seconds', 3) $q$), 'false', '3/h: 4º no pasa');
update recupero_intentos set inicio_at = inicio_at - interval '3600 seconds' where clave = 'id:3600:cc';
select t_espera(t_val($q$ select registrar_intento_recupero('id:3600:cc', interval '3600 seconds', 3) $q$), 'true',
  '3/h: a la hora vuelve a pasar');

-- 20 por hora (IP)
select t_espera(t_val($q$ select count(*) filter (where ok) from
    (select registrar_intento_recupero('ip:3600:dd', interval '3600 seconds', 20) as ok from generate_series(1, 25)) x $q$),
  '20', '20/h por IP: de 25 pedidos pasan 20');

-- Parámetros inválidos
select t_espera(t_res($q$ select registrar_intento_recupero('', interval '60 seconds', 1) $q$), 'rechazado', 'clave vacía: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero('x', interval '2 days', 1) $q$), 'rechazado', 'ventana de más de un día: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero('x', interval '60 seconds', 0) $q$), 'rechazado', 'máximo 0: rechazado');

-- Limpieza: una fila vencida hace más de un día se borra en el próximo registro
update recupero_intentos set inicio_at = now() - interval '25 hours' where clave = 'id:60:bb';
select registrar_intento_recupero('id:60:ee', interval '60 seconds', 1);
select t_espera(t_val($q$ select count(*) from recupero_intentos where clave = 'id:60:bb' $q$), '0',
  'las filas vencidas hace más de un día se borran');

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
