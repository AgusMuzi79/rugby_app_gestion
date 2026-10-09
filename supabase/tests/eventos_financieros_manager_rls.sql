-- Pruebas de escenario para la migración 20261015000000_eventos_financieros_manager
-- (Manager crea / cierra viajes y tercer tiempos de su división; Subcomisión sólo
-- crea recaudaciones; trigger guard_evento_financiero_update: el Manager sólo puede
-- pasar estado 'activo' -> 'cerrado', sin tocar ninguna otra columna).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name evf-mgr-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec evf-mgr-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase evf-mgr-pg:/work
--   docker exec evf-mgr-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/eventos_financieros_manager_rls.sql
--   docker rm -f evf-mgr-pg
--
-- El script crea stubs mínimos de lo que la migración necesita (roles, schema auth con
-- auth.uid(), get_rol, tiene_acceso_division, tiene_acceso_deporte, set_updated_at,
-- divisiones, profiles, eventos_financieros con las policies previas), carga la
-- migración con \ir (ruta relativa a este archivo) y verifica.
-- Las pruebas corren como el rol `authenticated` (el superusuario saltea RLS).
-- Rol, usuario, divisiones y disciplinas de la sesión salen de GUCs:
--   test.rol, test.uid, test.divs (uuids separados por coma), test.deportes.
-- Cada fallo se anota en t_fallos; al final, si hubo alguno, el script aborta.
-- Todo corre dentro de una transacción que termina en ROLLBACK.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
-- auth.uid real lee el JWT; acá sale del GUC test.uid ('' = sin usuario, como service_role).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- get_rol real lee profiles por auth.uid(); acá el rol sale de un GUC de la sesión.
create or replace function get_rol() returns text language sql stable as $$
  select nullif(current_setting('test.rol', true), '')
$$;

create or replace function tiene_acceso_division(p_division_id uuid) returns boolean language sql stable as $$
  select p_division_id::text = any(string_to_array(coalesce(current_setting('test.divs', true), ''), ','))
$$;

create or replace function tiene_acceso_deporte(p_deporte text) returns boolean language sql stable as $$
  select p_deporte = any(string_to_array(coalesce(current_setting('test.deportes', true), ''), ','))
$$;

create table divisiones (id uuid primary key, nombre text not null, deporte text not null);
create table profiles   (id uuid primary key, nombre text not null);

-- Copia mínima de init_schema.sql (sin la FK a eventos, que acá no hace falta).
create table eventos_financieros (
  id          uuid        default gen_random_uuid() primary key,
  tipo        text        not null check (tipo in ('viaje', 'tercer_tiempo', 'recaudacion')),
  nombre      text        not null,
  descripcion text,
  fecha       date,
  division_id uuid        references divisiones(id),
  evento_id   uuid,
  creado_por  uuid        not null references profiles(id),
  estado      text        not null default 'activo' check (estado in ('activo', 'cerrado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger eventos_financieros_updated_at
  before update on eventos_financieros
  for each row execute function set_updated_at();

alter table eventos_financieros enable row level security;

-- Policies vigentes antes de la migración bajo prueba (rls_policies + subcomision_deporte).
create policy "eventos_financieros_select_subcomision"
  on eventos_financieros for select to authenticated
  using (
    (select get_rol()) = 'subcomision'
    and (
      eventos_financieros.division_id is null
      or (select tiene_acceso_deporte((select deporte from divisiones where id = eventos_financieros.division_id)))
    )
  );

create policy "eventos_financieros_select_division"
  on eventos_financieros for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (division_id is null or (select tiene_acceso_division(division_id)))
  );

create policy "eventos_financieros_insert_coordinador"
  on eventos_financieros for insert to authenticated
  with check (
    (select get_rol()) = 'coordinador'
    and tipo in ('viaje', 'tercer_tiempo')
    and division_id is not null
    and (select tiene_acceso_division(division_id))
  );

-- Versión previa (sin restricción de tipo): la migración la reemplaza.
create policy "eventos_financieros_insert_subcomision"
  on eventos_financieros for insert to authenticated
  with check (
    (select get_rol()) = 'subcomision'
    and (
      eventos_financieros.division_id is null
      or (select tiene_acceso_deporte((select deporte from divisiones where id = eventos_financieros.division_id)))
    )
  );

create policy "eventos_financieros_update_coordinador"
  on eventos_financieros for update to authenticated
  using (
    (select get_rol()) = 'coordinador'
    and division_id is not null
    and (select tiene_acceso_division(division_id))
  );

create policy "eventos_financieros_update_subcomision"
  on eventos_financieros for update to authenticated
  using (
    (select get_rol()) = 'subcomision'
    and (
      eventos_financieros.division_id is null
      or (select tiene_acceso_deporte((select deporte from divisiones where id = eventos_financieros.division_id)))
    )
  );

-- Supabase da estos privilegios por default en public; RLS decide el resto.
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, auth to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- D1 y D2: rugby. El manager M sólo tiene acceso a D1. S es subcomisión de rugby.

insert into divisiones values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby'),
  ('d0000000-0000-0000-0000-000000000002', 'M17', 'rugby');
insert into profiles values
  ('a0000000-0000-0000-0000-00000000000a', 'Manager M15'),
  ('a0000000-0000-0000-0000-00000000000b', 'Subcomision'),
  ('a0000000-0000-0000-0000-00000000000c', 'Coordinador');

-- Eventos de partida (cargados como superusuario):
--   e02: viaje de D2 (división ajena al manager) · e03: recaudación global.
insert into eventos_financieros (id, tipo, nombre, division_id, creado_por) values
  ('e0000000-0000-0000-0000-000000000002', 'viaje',       'Viaje M17',  'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000b'),
  ('e0000000-0000-0000-0000-000000000003', 'recaudacion', 'Rifa anual', null,                                   'a0000000-0000-0000-0000-00000000000b');

-- ─── Migración bajo prueba ────────────────────────────────────────────────────

\ir ../migrations/20261015000000_eventos_financieros_manager.sql

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

create function t_espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    insert into t_fallos values (p_msg);
    raise notice 'FALLO - % (esperado %, obtenido %)', p_msg, p_esperado, p_real;
  else
    raise notice 'ok   - %', p_msg;
  end if;
end $$;

grant execute on function t_res(text), t_espera(text, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager de D1
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.rol = 'manager';
set local test.uid = 'a0000000-0000-0000-0000-00000000000a';
set local test.divs = 'd0000000-0000-0000-0000-000000000001';
set local test.deportes = '';

-- ─── INSERT ───────────────────────────────────────────────────────────────────

select t_espera(t_res($q$
  insert into eventos_financieros (id, tipo, nombre, descripcion, fecha, division_id, creado_por)
  values ('e0000000-0000-0000-0000-000000000010', 'viaje', 'Viaje Mar del Plata', '2500', '2026-11-01',
          'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'filas:1', 'manager: crea viaje en su division');

select t_espera(t_res($q$
  insert into eventos_financieros (id, tipo, nombre, division_id, creado_por)
  values ('e0000000-0000-0000-0000-000000000011', 'tercer_tiempo', 'Asado M15',
          'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'filas:1', 'manager: crea tercer tiempo en su division');

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('recaudacion', 'Rifa M15', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'rechazado', 'manager: no crea recaudacion');

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('viaje', 'Viaje ajeno', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'rechazado', 'manager: no crea en division ajena');

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('viaje', 'Viaje sin division', null, 'a0000000-0000-0000-0000-00000000000a') $q$),
  'rechazado', 'manager: no crea sin division');

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('viaje', 'Viaje a nombre de otro', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b') $q$),
  'rechazado', 'manager: no crea con creado_por de otro usuario');

-- ─── UPDATE: sólo cerrar, sin tocar otras columnas ───────────────────────────
-- e10: viaje propio activo.

select t_espera(t_res($q$ update eventos_financieros set nombre = 'Renombrado'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no renombra un evento');

select t_espera(t_res($q$ update eventos_financieros set descripcion = '9999'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no cambia descripcion (monto sugerido)');

select t_espera(t_res($q$ update eventos_financieros set fecha = '2027-01-01'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no cambia la fecha');

select t_espera(t_res($q$ update eventos_financieros set creado_por = 'a0000000-0000-0000-0000-00000000000b'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no cambia creado_por');

select t_espera(t_res($q$ update eventos_financieros set evento_id = gen_random_uuid()
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no cambia evento_id');

select t_espera(t_res($q$ update eventos_financieros set tipo = 'tercer_tiempo'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no cambia viaje por tercer tiempo');

select t_espera(t_res($q$ update eventos_financieros set tipo = 'recaudacion'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no convierte en recaudacion');

select t_espera(t_res($q$ update eventos_financieros set division_id = 'd0000000-0000-0000-0000-000000000002'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no mueve el evento a otra division');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado', nombre = 'Cerrado y renombrado'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no cierra y renombra en la misma sentencia');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000002' $q$),
  'filas:0', 'manager: no cierra un evento de division ajena (0 filas)');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000003' $q$),
  'filas:0', 'manager: no cierra una recaudacion global (0 filas)');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'filas:1', 'manager: cierra un evento propio (activo -> cerrado)');

select t_espera(
  (select estado || '|' || nombre || '|' || coalesce(descripcion, '-') from eventos_financieros
    where id = 'e0000000-0000-0000-0000-000000000010'),
  'cerrado|Viaje Mar del Plata|2500', 'manager: el cierre solo cambio el estado');

select t_espera(t_res($q$ update eventos_financieros set estado = 'activo'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'rechazado', 'manager: no reabre un evento cerrado (cerrado -> activo)');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'filas:1', 'manager: repetir el cierre sobre un evento cerrado no falla (sin cambios)');

select t_espera(
  (select string_agg(estado || ':' || nombre, ',' order by id) from eventos_financieros
    where id in ('e0000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000011')),
  'cerrado:Viaje Mar del Plata,activo:Asado M15', 'manager: estado final de sus eventos');

-- ═════════════════════════════════════════════════════════════════════════════
-- Subcomisión de rugby
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'subcomision';
set local test.uid = 'a0000000-0000-0000-0000-00000000000b';
set local test.divs = '';
set local test.deportes = 'rugby';

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('recaudacion', 'Cena del club', null, 'a0000000-0000-0000-0000-00000000000b') $q$),
  'filas:1', 'subcomision: crea recaudacion global');

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('viaje', 'Viaje subco', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b') $q$),
  'rechazado', 'subcomision: no crea viaje');

select t_espera(t_res($q$
  insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('tercer_tiempo', 'Asado subco', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b') $q$),
  'rechazado', 'subcomision: no crea tercer tiempo');

select t_espera(t_res($q$ update eventos_financieros set nombre = 'Asado M15 (editado)'
  where id = 'e0000000-0000-0000-0000-000000000011' $q$),
  'filas:1', 'subcomision: sigue pudiendo editar otras columnas de un tercer tiempo (trigger no aplica)');

select t_espera(t_res($q$ update eventos_financieros set estado = 'activo'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'filas:1', 'subcomision: sigue pudiendo reabrir un viaje cerrado');

-- ═════════════════════════════════════════════════════════════════════════════
-- Coordinador de D1 (sin cambios)
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'coordinador';
set local test.uid = 'a0000000-0000-0000-0000-00000000000c';
set local test.divs = 'd0000000-0000-0000-0000-000000000001';
set local test.deportes = '';

select t_espera(t_res($q$ update eventos_financieros set nombre = 'Viaje MdP'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'filas:1', 'coordinador: sigue pudiendo editar un viaje de su division');

reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Sin usuario (service_role / Edge Functions): el trigger no aplica aunque el GUC diga manager
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'manager';
set local test.uid = '';

select t_espera(t_res($q$ update eventos_financieros set nombre = 'Ajuste de sistema'
  where id = 'e0000000-0000-0000-0000-000000000011' $q$),
  'filas:1', 'sin auth.uid(): el trigger deja pasar cualquier cambio');

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
