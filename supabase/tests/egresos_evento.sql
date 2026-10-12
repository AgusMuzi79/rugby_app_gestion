-- Pruebas de escenario para la migración 20261017000000_egresos_evento
-- (egresos de viajes y tercer tiempos cargados por el Manager).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name egresos-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec egresos-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase egresos-pg:/work
--   docker exec egresos-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/egresos_evento.sql
--   docker rm -f egresos-pg
--
-- Mismas convenciones que eventos_financieros_multi_division.sql: stubs mínimos,
-- migraciones cargadas con \ir en orden, pruebas como `authenticated` con rol /
-- usuario / divisiones / disciplinas tomados de GUCs (test.rol, test.uid,
-- test.divs, test.deportes). Cada fallo se anota en t_fallos; al final, si hubo
-- alguno, el script aborta. Todo corre dentro de una transacción con ROLLBACK.

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
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function get_rol() returns text language sql stable as $$
  select nullif(current_setting('test.rol', true), '')
$$;

create or replace function tiene_acceso_division(p_division_id uuid) returns boolean language sql stable as $$
  select p_division_id::text = any(string_to_array(coalesce(current_setting('test.divs', true), ''), ','))
$$;

create or replace function tiene_acceso_deporte(p_deporte text) returns boolean language sql stable as $$
  select p_deporte = any(string_to_array(coalesce(current_setting('test.deportes', true), ''), ','))
$$;

create table divisiones (id uuid primary key, nombre text not null, deporte text not null, activa boolean not null default true);
create table profiles   (id uuid primary key, nombre text not null, divisiones uuid[]);
create table jugadores  (id uuid primary key, nombre_completo text not null,
                         division_id uuid not null references divisiones(id), activo boolean not null default true);

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

create table cobranzas (
  id                    uuid           default gen_random_uuid() primary key,
  evento_financiero_id  uuid           not null references eventos_financieros(id),
  jugador_id            uuid           not null references jugadores(id),
  estado                text           not null default 'pendiente' check (estado in ('pagado', 'pendiente')),
  monto                 numeric(10,2),
  registrado_por        uuid           not null references profiles(id),
  unique (evento_financiero_id, jugador_id)
);

alter table eventos_financieros enable row level security;
alter table cobranzas enable row level security;

-- Policies de eventos_financieros vigentes antes de las migraciones bajo prueba.
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

create policy "eventos_financieros_select_admin" on eventos_financieros
  for select to authenticated using ((select get_rol()) = 'admin');

-- Supabase da estos privilegios por default en public (también a tablas futuras).
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Rugby: D1 (M15), D3 (M17). Hockey: H1.
-- Manager A: D1 y D3. Manager B: D2 (rugby, ninguna división en los viajes). Manager H: H1.
-- S: subcomisión de rugby.

insert into divisiones (id, nombre, deporte) values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby'),
  ('d0000000-0000-0000-0000-000000000002', 'M16', 'rugby'),
  ('d0000000-0000-0000-0000-000000000003', 'M17', 'rugby'),
  ('d0000000-0000-0000-0000-0000000000a1', 'Hockey Primera', 'hockey');

insert into profiles values
  ('a0000000-0000-0000-0000-00000000000a', 'Manager A', '{d0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000003}'),
  ('a0000000-0000-0000-0000-00000000000b', 'Manager B', '{d0000000-0000-0000-0000-000000000002}'),
  ('a0000000-0000-0000-0000-00000000000d', 'Manager H', '{d0000000-0000-0000-0000-0000000000a1}'),
  ('a0000000-0000-0000-0000-00000000000e', 'Subcomision rugby', null);

-- ─── Migraciones ──────────────────────────────────────────────────────────────

\ir ../migrations/20261015000000_eventos_financieros_manager.sql
\ir ../migrations/20261016000000_eventos_financieros_multi_division.sql

-- Migración bajo prueba. Si todavía no existe, el \ir aborta el script (RED).
\ir ../migrations/20261017000000_egresos_evento.sql

-- Eventos (cargados como superusuario; el trigger copia division_id a la tabla nueva):
--   e10: viaje activo de D1 creado por A
--   e11: viaje cerrado de D1 creado por A
--   e12: recaudación activa de D1
--   e13: viaje activo de hockey creado por H
--   e14: tercer tiempo activo de D3 creado por la subcomisión (A lo ve por su división)
insert into eventos_financieros (id, tipo, nombre, division_id, creado_por, estado) values
  ('e0000000-0000-0000-0000-000000000010', 'viaje',         'Viaje MdP',      'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'activo'),
  ('e0000000-0000-0000-0000-000000000011', 'viaje',         'Viaje cerrado',  'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'cerrado'),
  ('e0000000-0000-0000-0000-000000000012', 'recaudacion',   'Rifa M15',       'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e', 'activo'),
  ('e0000000-0000-0000-0000-000000000013', 'viaje',         'Viaje hockey',   'd0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000d', 'activo'),
  ('e0000000-0000-0000-0000-000000000014', 'tercer_tiempo', 'Tercer tiempo',  'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000e', 'activo');

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);
grant all on t_fallos to authenticated;

-- Ejecuta una sentencia con los permisos del rol actual. Devuelve 'filas:N' o 'rechazado'.
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

-- Evalúa una consulta escalar con los permisos del rol actual. Devuelve su valor o 'error'.
create function t_val(p_sql text) returns text language plpgsql as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  raise notice '       (% %)', sqlstate, sqlerrm;
  return 'error';
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

grant execute on function t_res(text), t_val(text), t_espera(text, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager A (D1 y D3, rugby)
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.rol = 'manager';
set local test.uid = 'a0000000-0000-0000-0000-00000000000a';
set local test.divs = 'd0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000003';
set local test.deportes = '';

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000010', 'Micro', 150000) $q$),
  'filas:1', 'manager: carga un egreso en su viaje activo');

select t_espera(t_val($q$ select registrado_por::text || '|' || fecha::text from egresos_evento where concepto = 'Micro' $q$),
  'a0000000-0000-0000-0000-00000000000a|' || current_date::text,
  'manager: registrado_por y fecha por default');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto, fecha)
  values ('e0000000-0000-0000-0000-000000000010', 'Comida', 80000.50, '2026-10-01') $q$),
  'filas:1', 'manager: carga un segundo egreso con fecha');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000014', 'Asado', 50000) $q$),
  'filas:1', 'manager: carga en un tercer tiempo que incluye su division (no lo creo)');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000011', 'Micro', 1000) $q$),
  'rechazado', 'manager: no carga en un evento cerrado');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000012', 'Premios', 1000) $q$),
  'rechazado', 'manager: no carga en una recaudacion');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000013', 'Micro', 1000) $q$),
  'rechazado', 'manager: no carga en un evento de otra disciplina');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000010', '   ', 1000) $q$),
  'rechazado', 'manager: concepto vacio rechazado');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000010', 'Gratis', 0) $q$),
  'rechazado', 'manager: monto 0 rechazado');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto, registrado_por)
  values ('e0000000-0000-0000-0000-000000000010', 'Suplantado', 1000, 'a0000000-0000-0000-0000-00000000000b') $q$),
  'rechazado', 'manager: no registra a nombre de otro usuario');

select t_espera(t_res($q$ update egresos_evento set monto = 1 where concepto = 'Micro' $q$),
  'filas:0', 'manager: no edita egresos (sin policy de UPDATE)');

select t_espera(t_val($q$ select count(*)::text from egresos_evento $q$),
  '3', 'manager A: ve los egresos de sus eventos');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager B (D2): no creó los eventos ni tiene divisiones en ellos
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'a0000000-0000-0000-0000-00000000000b';
set local test.divs = 'd0000000-0000-0000-0000-000000000002';

select t_espera(t_val($q$ select count(*)::text from egresos_evento $q$),
  '0', 'manager B: no ve egresos de eventos ajenos');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000010', 'Colado', 1000) $q$),
  'rechazado', 'manager B: no carga en un evento sin divisiones suyas');

select t_espera(t_res($q$ delete from egresos_evento $q$),
  'filas:0', 'manager B: no borra egresos de eventos ajenos');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager H (hockey)
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'a0000000-0000-0000-0000-00000000000d';
set local test.divs = 'd0000000-0000-0000-0000-0000000000a1';

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000013', 'Micro hockey', 2000) $q$),
  'filas:1', 'manager H: carga en su viaje de hockey');

select t_espera(t_val($q$ select string_agg(concepto, ',') from egresos_evento $q$),
  'Micro hockey', 'manager H: solo ve los egresos de su evento');

-- ═════════════════════════════════════════════════════════════════════════════
-- Subcomisión de rugby: sólo lectura
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'subcomision';
set local test.uid = 'a0000000-0000-0000-0000-00000000000e';
set local test.divs = '';
set local test.deportes = 'rugby';

select t_espera(t_val($q$ select count(*)::text from egresos_evento $q$),
  '3', 'subcomision: ve los egresos de eventos de su disciplina');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000014', 'Subco', 1000) $q$),
  'rechazado', 'subcomision: no carga egresos');

select t_espera(t_res($q$ delete from egresos_evento $q$),
  'filas:0', 'subcomision: no borra egresos');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager A: borrado mientras el evento está activo, no después de cerrarlo
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'manager';
set local test.uid = 'a0000000-0000-0000-0000-00000000000a';
set local test.divs = 'd0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000003';
set local test.deportes = '';

select t_espera(t_res($q$ delete from egresos_evento where concepto = 'Comida' $q$),
  'filas:1', 'manager: borra un egreso de su viaje activo');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000010' $q$),
  'filas:1', 'manager: cierra su viaje');

select t_espera(t_res($q$ delete from egresos_evento where concepto = 'Micro' $q$),
  'filas:0', 'manager: no borra egresos de un viaje cerrado');

select t_espera(t_val($q$ select count(*)::text from egresos_evento
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000010' $q$),
  '1', 'manager: el egreso del viaje cerrado sigue visible');

reset role;

-- ─── Cascada al borrar el evento (superusuario) ───────────────────────────────

set local test.uid = '';
set local test.rol = '';

delete from eventos_financieros where id = 'e0000000-0000-0000-0000-000000000014';

select t_espera(t_val($q$ select count(*)::text from egresos_evento
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000014' $q$),
  '0', 'cascada: borrar el evento borra sus egresos');

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
