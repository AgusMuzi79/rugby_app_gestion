-- Pruebas de escenario para la migración 20261109000000_guard_roles_subcomision
-- (subcomisión sólo pone o quita los roles que gestiona y no toca cuentas de
-- admin; admin, service_role y el resto de los roles sin cambios).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name guard-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec guard-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase guard-pg:/work
--   docker exec guard-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/guard_roles_subcomision.sql
--   docker rm -f guard-pg
-- Con -v sin_migracion=1 corre contra el guard vigente (copia de
-- 20260914000000) sin cargar la migración: así se ve el RED.
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos,
-- migración cargada con \ir (dos veces: es idempotente), cada fallo se anota en
-- t_fallos y al final, si hubo alguno, el script aborta. Todo corre dentro de
-- una transacción con ROLLBACK. El trigger corre igual como superusuario, así
-- que no hace falta cambiar de rol: el caller sale de los GUC test.uid
-- (auth.uid(); '' = sin usuario, como service_role) y test.rol (get_rol()).

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

create schema if not exists auth;
-- auth.uid real lee el JWT; acá sale del GUC test.uid.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- get_rol real lee profiles.rol por auth.uid(); acá sale del GUC test.rol.
create or replace function get_rol() returns text language sql stable as $$
  select nullif(current_setting('test.rol', true), '')
$$;

create table profiles (
  id         uuid primary key,
  nombre     text not null,
  rol        text not null,
  roles      text[] not null default '{}',
  divisiones uuid[],
  activo     boolean not null default true,
  deporte    text
);

-- Guard vigente antes de la migración (copia de 20260914000000, líneas 55-108)
-- y el trigger de 20260731000000.
create or replace function guard_profile_role_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_caller_rol text;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_caller_rol := get_rol();

  if v_caller_rol = 'admin' then
    return new;
  end if;

  if v_caller_rol = 'subcomision' then
    if new.deporte is distinct from old.deporte then
      raise exception 'No autorizado para modificar deporte';
    end if;
    return new;
  end if;

  if new.roles is distinct from old.roles then
    raise exception 'No autorizado para modificar roles';
  end if;

  if new.divisiones is distinct from old.divisiones then
    raise exception 'No autorizado para modificar divisiones';
  end if;

  if new.activo is distinct from old.activo then
    raise exception 'No autorizado para modificar activo';
  end if;

  if new.deporte is distinct from old.deporte then
    raise exception 'No autorizado para modificar deporte';
  end if;

  if new.rol is distinct from old.rol and not (new.rol = any (old.roles)) then
    raise exception 'No autorizado para cambiar a ese rol';
  end if;

  return new;
end;
$$;

create trigger guard_profiles_role_update
  before update on profiles
  for each row execute function guard_profile_role_update();

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- 01 subco (el caller), 02 admin, 03 coordinador, 04 coordinador en vista socio,
-- 05 secretaría, 06 coordinador viejo con roles[] vacío.

insert into profiles (id, nombre, rol, roles, deporte) values
  ('a0000000-0000-0000-0000-000000000001', 'Subco',       'subcomision', '{subcomision,socio}', 'rugby'),
  ('a0000000-0000-0000-0000-000000000002', 'Admin',       'admin',       '{admin,socio}',       null),
  ('a0000000-0000-0000-0000-000000000003', 'Coord',       'coordinador', '{coordinador}',       null),
  ('a0000000-0000-0000-0000-000000000004', 'Coord socio', 'socio',       '{coordinador,socio}', null),
  ('a0000000-0000-0000-0000-000000000005', 'Secretaria',  'secretaria',  '{secretaria}',        null),
  ('a0000000-0000-0000-0000-000000000006', 'Coord viejo', 'coordinador', '{}',                  null);

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);

-- Corre un UPDATE y lo deshace siempre (cada caso arranca de los mismos datos).
-- Devuelve 'sin error', 'sin filas' o el mensaje de error del guard.
create function t_error(p_sql text) returns text language plpgsql as $$
declare
  v_n bigint;
begin
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
    raise exception using errcode = 'P0099', message = case when v_n = 0 then 'sin filas' else 'sin error' end;
  exception when sqlstate 'P0099' then
    return sqlerrm;
  end;
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

create function t_caller(p_uid text, p_rol text) returns void language sql as $$
  select set_config('test.uid', p_uid, true), set_config('test.rol', p_rol, true)
$$;

-- ─── Migración (dos veces: idempotente) ───────────────────────────────────────

\if :{?sin_migracion}
\echo '*** sin_migracion: se prueba el guard vigente (RED esperado) ***'
\else
\ir ../migrations/20261109000000_guard_roles_subcomision.sql
\ir ../migrations/20261109000000_guard_roles_subcomision.sql
\endif

-- ─── Subcomisión: lo que no puede ─────────────────────────────────────────────

select t_caller('a0000000-0000-0000-0000-000000000001', 'subcomision');

select t_espera(t_error($q$ update profiles set roles = roles || 'admin'::text where id = 'a0000000-0000-0000-0000-000000000001' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no se agrega admin a sí misma');
select t_espera(t_error($q$ update profiles set rol = 'admin' where id = 'a0000000-0000-0000-0000-000000000001' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no se pone rol = admin');
select t_espera(t_error($q$ update profiles set roles = roles || 'admin'::text where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no le agrega admin a otra cuenta');
select t_espera(t_error($q$ update profiles set roles = '{coordinador,socio}', rol = 'coordinador' where id = 'a0000000-0000-0000-0000-000000000002' $q$),
  'No autorizado para modificar una cuenta de administrador', 'subco: no le saca admin al admin');
select t_espera(t_error($q$ update profiles set activo = false where id = 'a0000000-0000-0000-0000-000000000002' $q$),
  'No autorizado para modificar una cuenta de administrador', 'subco: no desactiva al admin');
select t_espera(t_error($q$ update profiles set rol = 'socio' where id = 'a0000000-0000-0000-0000-000000000002' $q$),
  'No autorizado para modificar una cuenta de administrador', 'subco: no cambia el rol activo del admin (aunque ya lo tenga)');
select t_espera(t_error($q$ update profiles set roles = roles || 'entrenador'::text where id = 'a0000000-0000-0000-0000-000000000002' $q$),
  'No autorizado para modificar una cuenta de administrador', 'subco: no le agrega un rol de staff al admin');
select t_espera(t_error($q$ update profiles set roles = roles || 'secretaria'::text where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no agrega un rol que no gestiona (secretaria)');
select t_espera(t_error($q$ update profiles set roles = '{coordinador}', rol = 'coordinador' where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no quita un rol que no gestiona (socio)');
select t_espera(t_error($q$ update profiles set rol = 'porteria' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no pone un rol activo fuera de A y de los que gestiona');
select t_espera(t_error($q$ update profiles set roles = '{coordinador}', rol = 'coordinador' where id = 'a0000000-0000-0000-0000-000000000005' $q$),
  'No autorizado para asignar o quitar ese rol', 'subco: no reemplaza secretaria por coordinador');
select t_espera(t_error($q$ update profiles set deporte = 'hockey' where id = 'a0000000-0000-0000-0000-000000000001' $q$),
  'No autorizado para modificar deporte', 'subco: sigue sin poder cambiar deporte');

-- ─── Subcomisión: lo que sí puede ─────────────────────────────────────────────

select t_espera(t_error($q$ update profiles set roles = '{entrenador}', rol = 'entrenador' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'subco: coordinador → entrenador (reemplazarRolStaff)');
select t_espera(t_error($q$ update profiles set roles = '{colaborador}', rol = 'colaborador' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'subco: coordinador → colaborador');
select t_espera(t_error($q$ update profiles set roles = '{subcomision}', rol = 'subcomision' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'subco: coordinador → subcomision');
select t_espera(t_error($q$ update profiles set roles = '{manager,socio}' where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'sin error', 'subco: coordinador → manager en una cuenta en vista socio (rol queda socio)');
select t_espera(t_error($q$ update profiles set roles = '{entrenador}', rol = 'entrenador' where id = 'a0000000-0000-0000-0000-000000000006' $q$),
  'sin error', 'subco: cuenta vieja con roles[] vacío, coordinador → entrenador');
select t_espera(t_error($q$ update profiles set divisiones = '{d0000000-0000-0000-0000-000000000001}' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'subco: edita divisiones');
select t_espera(t_error($q$ update profiles set activo = false where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'subco: desactiva una cuenta que no es admin');
update profiles set activo = false where id = 'a0000000-0000-0000-0000-000000000005';
select t_espera(t_error($q$ update profiles set activo = true where id = 'a0000000-0000-0000-0000-000000000005' $q$),
  'sin error', 'subco: reactiva una cuenta que no es admin');
select t_espera(t_error($q$ update profiles set rol = 'socio' where id = 'a0000000-0000-0000-0000-000000000001' $q$),
  'sin error', 'subco: pasa su propia vista a socio (rol que ya tiene)');
select t_espera(t_error($q$ update profiles set nombre = 'Admin 2' where id = 'a0000000-0000-0000-0000-000000000002' $q$),
  'sin error', 'subco: un cambio sin roles/rol/activo en la cuenta de admin pasa');

-- ─── Admin y service_role: sin cambios ────────────────────────────────────────

select t_caller('a0000000-0000-0000-0000-000000000002', 'admin');
select t_espera(t_error($q$ update profiles set roles = roles || 'admin'::text where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'admin: agrega admin a otra cuenta');
select t_espera(t_error($q$ update profiles set roles = '{secretaria,porteria}' where id = 'a0000000-0000-0000-0000-000000000005' $q$),
  'sin error', 'admin: agrega roles que subco no gestiona');
select t_espera(t_error($q$ update profiles set activo = false, deporte = 'hockey' where id = 'a0000000-0000-0000-0000-000000000001' $q$),
  'sin error', 'admin: desactiva y cambia deporte');

select t_caller('', '');
select t_espera(t_error($q$ update profiles set roles = '{admin}', rol = 'admin' where id = 'a0000000-0000-0000-0000-000000000003' $q$),
  'sin error', 'service_role: el guard deja pasar cualquier cambio');

-- ─── Otros roles: siguen sin tocar roles ──────────────────────────────────────

select t_caller('a0000000-0000-0000-0000-000000000004', 'socio');
select t_espera(t_error($q$ update profiles set roles = roles || 'admin'::text where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'No autorizado para modificar roles', 'socio/coordinador: no se agrega admin');
select t_espera(t_error($q$ update profiles set rol = 'admin' where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'No autorizado para cambiar a ese rol', 'socio/coordinador: no cambia a un rol que no tiene');
select t_espera(t_error($q$ update profiles set rol = 'coordinador' where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'sin error', 'socio/coordinador: cambia a un rol que ya tiene');
select t_espera(t_error($q$ update profiles set activo = false where id = 'a0000000-0000-0000-0000-000000000004' $q$),
  'No autorizado para modificar activo', 'socio/coordinador: no se desactiva');

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
