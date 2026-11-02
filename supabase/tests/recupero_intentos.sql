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

-- Un pedido como los arma login-dni: 1/60 s y 3/h por identificador, 20/h por IP,
-- en ese orden. Devuelve 0 si pasa o el índice (desde 1) de la clave que rechazó.
create function t_pedido(p_id text, p_ip text) returns int language sql as $f$
  select registrar_intento_recupero(
    array['id:60:' || p_id, 'id:3600:' || p_id, 'ip:3600:' || p_ip],
    array[interval '60 seconds', interval '3600 seconds', interval '3600 seconds'],
    array[1, 3, 20])
$f$;
create function t_cuenta(p_clave text) returns text language sql as $f$
  select coalesce((select cuenta::text from recupero_intentos where clave = p_clave), 'sin fila')
$f$;
-- Corre las ventanas de un identificador hacia atrás (simula que pasa el tiempo).
create function t_pasan(p_id text, p_seg int) returns void language sql as $f$
  update recupero_intentos set inicio_at = inicio_at - make_interval(secs => p_seg)
  where clave in ('id:60:' || p_id, 'id:3600:' || p_id)
$f$;
grant execute on function t_pedido(text, text), t_cuenta(text), t_pasan(text, int) to service_role;

-- ─── anon y authenticated: ni leen, ni escriben, ni llaman a la función ──────

set local role anon;
select t_espera(t_res($q$ select * from recupero_intentos $q$), 'rechazado', 'anon: no lee la tabla');
select t_espera(t_res($q$ insert into recupero_intentos values ('x', now(), 1) $q$), 'rechazado', 'anon: no escribe la tabla');
select t_espera(t_res($q$ select registrar_intento_recupero(array['id:60:aa'], array[interval '60 seconds'], array[1]) $q$), 'rechazado',
  'anon: no llama a registrar_intento_recupero');
reset role;

set local role authenticated;
select t_espera(t_res($q$ select * from recupero_intentos $q$), 'rechazado', 'authenticated: no lee la tabla');
select t_espera(t_res($q$ delete from recupero_intentos $q$), 'rechazado', 'authenticated: no borra la tabla');
select t_espera(t_res($q$ select registrar_intento_recupero(array['id:60:aa'], array[interval '60 seconds'], array[1]) $q$), 'rechazado',
  'authenticated: no llama a registrar_intento_recupero');
reset role;

-- La versión de una sola clave (borrador anterior) no queda.
select t_espera((select count(*)::text from pg_proc where proname = 'registrar_intento_recupero'), '1',
  'una sola registrar_intento_recupero (la de arrays)');

-- ─── service_role: orden, ventanas y máximos ──────────────────────────────────

set local role service_role;

-- Doble toque: el segundo lo frena la ventana de 60 s y no gasta la hora ni la IP.
select t_espera(t_pedido('aa', 'ipA')::text, '0', 'doble toque: el primer pedido pasa');
select t_espera(t_pedido('aa', 'ipA')::text, '1', 'doble toque: el segundo lo frena la ventana de 60 s');
select t_espera(t_cuenta('id:3600:aa'), '1', 'doble toque: la cuenta por hora no se toca');
select t_espera(t_cuenta('ip:3600:ipA'), '1', 'doble toque: la cuenta por IP no se toca');
select t_pedido('aa', 'ipA');
select t_espera(t_cuenta('id:60:aa'), '2', 'los rechazados no suben la cuenta más allá de máximo + 1');
select t_espera(t_pedido('bb', 'ipA')::text, '0', 'otro identificador no se ve afectado');

select t_pasan('aa', 59);
select t_espera(t_pedido('aa', 'ipA')::text, '1', '1/60 s: a los 59 s sigue cerrado (los rechazados no estiran la ventana)');
select t_pasan('aa', 1);
select t_espera(t_pedido('aa', 'ipA')::text, '0', '1/60 s: vencida la ventana vuelve a pasar (2º de la hora)');
select t_espera(t_cuenta('id:60:aa'), '1', '1/60 s: la ventana nueva arranca en 1');
select t_espera(t_cuenta('id:3600:aa'), '2', '3/h: van 2');

-- 3 por hora: el 4º de la hora no pasa, aunque respete los 60 s.
select t_pasan('aa', 60);
select t_espera(t_pedido('aa', 'ipA')::text, '0', '3/h: el 3º pasa');
select t_pasan('aa', 60);
select t_espera(t_pedido('aa', 'ipA')::text, '2', '3/h: el 4º dentro de la hora lo frena la ventana de una hora');
select t_espera(t_cuenta('ip:3600:ipA'), '4', '3/h: el 4º rechazado no gasta la IP');
select t_pasan('aa', 60);
select t_pedido('aa', 'ipA');
select t_espera(t_cuenta('id:3600:aa'), '4', '3/h: la cuenta queda en máximo + 1');

-- Un tercero que repite el DNI no lo bloquea más que la hora: vencida, pasa.
update recupero_intentos set inicio_at = now() - interval '3600 seconds' where clave = 'id:3600:aa';
select t_pasan('aa', 60);
select t_espera(t_pedido('aa', 'ipA')::text, '0', 'vencida la hora, el DNI vuelve a pasar');
select t_espera(t_cuenta('id:3600:aa'), '1', 'la hora nueva arranca en 1');

-- 20 por hora por IP (cada pedido con otro DNI).
select t_espera((select count(*) filter (where r = 0)::text from
    (select t_pedido('ipdni' || g, 'ipD') as r from generate_series(1, 25) g) x),
  '20', '20/h por IP: de 25 pedidos pasan 20');
select t_espera(t_pedido('ipdni99', 'ipD')::text, '3', '20/h por IP: lo frena la tercera clave');
select t_espera(t_cuenta('ip:3600:ipD'), '21', '20/h por IP: la cuenta queda en máximo + 1');

-- Parámetros inválidos
select t_espera(t_res($q$ select registrar_intento_recupero(array[''], array[interval '60 seconds'], array[1]) $q$), 'rechazado', 'clave vacía: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array['x'], array[interval '2 days'], array[1]) $q$), 'rechazado', 'ventana de más de un día: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array['x'], array[interval '0 seconds'], array[1]) $q$), 'rechazado', 'ventana 0: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array['x'], array[interval '60 seconds'], array[0]) $q$), 'rechazado', 'máximo 0: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array['x', 'y'], array[interval '60 seconds'], array[1]) $q$), 'rechazado', 'arrays de distinto largo: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array[]::text[], array[]::interval[], array[]::int[]) $q$), 'rechazado', 'sin claves: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(null, null, null) $q$), 'rechazado', 'nulls: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array[null::text], array[interval '60 seconds'], array[1]) $q$), 'rechazado', 'clave null: rechazado');
select t_espera(t_res($q$ select registrar_intento_recupero(array(select 'k' || g from generate_series(1, 11) g),
    array(select interval '60 seconds' from generate_series(1, 11)), array(select 1 from generate_series(1, 11))) $q$),
  'rechazado', 'más de 10 claves: rechazado');
select t_espera(t_cuenta('x'), 'sin fila', 'un pedido rechazado por parámetros no cuenta nada');

-- Nunca borra: una fila vencida hace más de un día sigue ahí, y su próximo
-- intento reinicia la ventana en la misma fila (cuenta vuelve a 1).
update recupero_intentos set inicio_at = now() - interval '25 hours' where clave = 'id:60:bb';
select t_pedido('ee', 'ipE');
select t_espera((select count(*)::text from recupero_intentos where clave = 'id:60:bb'), '1',
  'una fila vencida no se borra');
select t_espera(t_val($q$ select registrar_intento_recupero(array['id:60:bb'], array[interval '60 seconds'], array[1])::text $q$), '0',
  'la ventana vencida se reinicia en la misma fila');
select t_espera(t_cuenta('id:60:bb'), '1', 'la cuenta vuelve a 1');

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
