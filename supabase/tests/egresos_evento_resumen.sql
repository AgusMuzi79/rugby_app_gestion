-- Pruebas de escenario para la migración 20261018000000_egresos_evento_resumen
-- (resumen del evento completo con resumen_egresos_evento y lectura de egresos
-- de Subcomisión sobre todos los eventos).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name egresos-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec egresos-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase egresos-pg:/work
--   docker exec egresos-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/egresos_evento_resumen.sql
--   docker rm -f egresos-pg
--
-- Mismas convenciones que egresos_evento.sql: stubs mínimos, migraciones con \ir,
-- pruebas como `authenticated` con test.rol / test.uid / test.divs / test.deportes.
-- Todo corre dentro de una transacción con ROLLBACK.

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

-- Cobranzas: el manager sólo lee las de jugadores de sus divisiones (no se amplía).
create policy "cobranzas_select_division"
  on cobranzas for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'manager')
    and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id)))
  );

grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Rugby: D1 (M15), D2 (M16). Hockey: H1.
-- Manager A: D1. Manager B: D2. Manager H: H1. S: subcomisión. K: coordinador de D1.

insert into divisiones (id, nombre, deporte) values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby'),
  ('d0000000-0000-0000-0000-000000000002', 'M16', 'rugby'),
  ('d0000000-0000-0000-0000-0000000000a1', 'Hockey Primera', 'hockey');

insert into profiles values
  ('a0000000-0000-0000-0000-00000000000a', 'Manager A', '{d0000000-0000-0000-0000-000000000001}'),
  ('a0000000-0000-0000-0000-00000000000b', 'Manager B', '{d0000000-0000-0000-0000-000000000002}'),
  ('a0000000-0000-0000-0000-00000000000d', 'Manager H', '{d0000000-0000-0000-0000-0000000000a1}'),
  ('a0000000-0000-0000-0000-00000000000e', 'Subcomision', null),
  ('a0000000-0000-0000-0000-00000000000f', 'Coordinador M15', '{d0000000-0000-0000-0000-000000000001}');

insert into jugadores values
  ('b0000000-0000-0000-0000-000000000001', 'Jugador M15 a', 'd0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000011', 'Jugador M15 b', 'd0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000002', 'Jugador M16',   'd0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-0000000000a1', 'Jugadora H',    'd0000000-0000-0000-0000-0000000000a1', true);

-- ─── Migraciones ──────────────────────────────────────────────────────────────

\ir ../migrations/20261015000000_eventos_financieros_manager.sql
\ir ../migrations/20261016000000_eventos_financieros_multi_division.sql
\ir ../migrations/20261017000000_egresos_evento.sql

-- Migración bajo prueba. Si todavía no existe, el \ir aborta el script (RED).
\ir ../migrations/20261018000000_egresos_evento_resumen.sql

-- Eventos (superusuario):
--   e20: viaje de rugby con D1 y D2, creado por A
--   e21: viaje de hockey, creado por H
insert into eventos_financieros (id, tipo, nombre, division_id, creado_por) values
  ('e0000000-0000-0000-0000-000000000020', 'viaje', 'Viaje MdP',    'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-000000000021', 'viaje', 'Viaje hockey', 'd0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000d');
insert into eventos_financieros_divisiones (evento_financiero_id, division_id) values
  ('e0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000002');

-- Cobranzas: en e20 pagaron 1000 (D1) y 2500 (D2); un pendiente de D1 no suma.
insert into cobranzas (evento_financiero_id, jugador_id, estado, monto, registrado_por) values
  ('e0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000001', 'pagado',    1000, 'a0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000011', 'pendiente', 1000, 'a0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000002', 'pagado',    2500, 'a0000000-0000-0000-0000-00000000000b'),
  ('e0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-0000000000a1', 'pagado',     700, 'a0000000-0000-0000-0000-00000000000d');

insert into egresos_evento (evento_financiero_id, concepto, monto) values
  ('e0000000-0000-0000-0000-000000000020', 'Micro', 500),
  ('e0000000-0000-0000-0000-000000000020', 'Comida', 250.50),
  ('e0000000-0000-0000-0000-000000000021', 'Micro hockey', 300);

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);
grant all on t_fallos to authenticated;

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

-- Resumen como 'cobrado|egresos', o 'sin filas' si la función no devuelve nada.
create function t_resumen(p_evento uuid) returns text language plpgsql as $$
declare
  v text;
begin
  select r.total_cobrado::text || '|' || r.total_egresos::text into v
  from resumen_egresos_evento(p_evento) r;
  return coalesce(v, 'sin filas');
exception when others then
  raise notice '       (% %)', sqlstate, sqlerrm;
  return 'error';
end $$;
grant execute on function t_resumen(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager A (D1): resumen del evento completo, sin ampliar la RLS de cobranzas
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.rol = 'manager';
set local test.uid = 'a0000000-0000-0000-0000-00000000000a';
set local test.divs = 'd0000000-0000-0000-0000-000000000001';
set local test.deportes = '';

select t_espera(t_val($q$ select coalesce(sum(monto), 0)::text from cobranzas
  where estado = 'pagado' and evento_financiero_id = 'e0000000-0000-0000-0000-000000000020' $q$),
  '1000.00', 'manager A: la RLS de cobranzas sigue mostrando sólo lo de sus jugadores');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000020'),
  '3500.00|750.50', 'manager A: el resumen incluye lo pagado en D2 (evento completo)');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000021'),
  'sin filas', 'manager A: no obtiene el resumen de un evento de hockey');

select t_espera(t_resumen('e0000000-0000-0000-0000-0000000000ff'),
  'sin filas', 'manager A: evento inexistente no devuelve filas');

-- Manager B (D2): no creó el viaje pero D2 está en el evento.
set local test.uid = 'a0000000-0000-0000-0000-00000000000b';
set local test.divs = 'd0000000-0000-0000-0000-000000000002';

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000020'),
  '3500.00|750.50', 'manager B: mismo resumen del evento completo');

-- Manager H (hockey)
set local test.uid = 'a0000000-0000-0000-0000-00000000000d';
set local test.divs = 'd0000000-0000-0000-0000-0000000000a1';

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000020'),
  'sin filas', 'manager H: no obtiene el resumen de un viaje de rugby');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000021'),
  '700.00|300.00', 'manager H: resumen de su viaje de hockey');

-- ═════════════════════════════════════════════════════════════════════════════
-- Subcomisión de hockey: lee egresos y resumen de todos los eventos
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'subcomision';
set local test.uid = 'a0000000-0000-0000-0000-00000000000e';
set local test.divs = '';
set local test.deportes = 'hockey';

select t_espera(t_val($q$ select count(*)::text from egresos_evento $q$),
  '3', 'subcomision de hockey: ve los egresos de todos los eventos (incluido rugby)');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000020'),
  '3500.00|750.50', 'subcomision de hockey: obtiene el resumen de un viaje de rugby');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000021', 'Subco', 1000) $q$),
  'rechazado', 'subcomision: sigue sin poder cargar egresos');

select t_espera(t_res($q$ delete from egresos_evento $q$),
  'filas:0', 'subcomision: sigue sin poder borrar egresos');

-- ═════════════════════════════════════════════════════════════════════════════
-- Coordinador de D1: ni egresos ni resumen
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'coordinador';
set local test.uid = 'a0000000-0000-0000-0000-00000000000f';
set local test.divs = 'd0000000-0000-0000-0000-000000000001';
set local test.deportes = '';

select t_espera(t_val($q$ select count(*)::text from egresos_evento $q$),
  '0', 'coordinador: no ve egresos');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000020'),
  'sin filas', 'coordinador: no obtiene el resumen');

-- ═════════════════════════════════════════════════════════════════════════════
-- Admin
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'admin';
set local test.uid = 'a0000000-0000-0000-0000-00000000000e';
set local test.divs = '';

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000021'),
  '700.00|300.00', 'admin: obtiene cualquier resumen');

reset role;

-- anon no puede ejecutar la función
select t_espera(
  has_function_privilege('anon', 'resumen_egresos_evento(uuid)', 'execute')::text,
  'false', 'anon: sin EXECUTE sobre resumen_egresos_evento');

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
