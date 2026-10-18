-- Pruebas de escenario para la migración 20261022000000_eventos_actividad
-- (tipo de evento 'actividad' con título obligatorio).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name actividad-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec actividad-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase actividad-pg:/work
--   docker exec actividad-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/eventos_actividad.sql
--   docker rm -f actividad-pg
--
-- Mismas convenciones que egresos_evento.sql: stubs mínimos, la tabla eventos
-- tal como la crea init_schema (con el check de tipo inline y sin nombre),
-- migración cargada con \ir, cada fallo se anota en t_fallos y al final, si
-- hubo alguno, el script aborta. Todo corre dentro de una transacción con
-- ROLLBACK. Son checks de tabla: se prueban como superusuario, sin RLS.

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table divisiones (id uuid primary key, nombre text not null);
create table profiles   (id uuid primary key, nombre text not null);

-- Copia de init_schema (20260506000000): el check de tipo es inline y sin nombre.
create table eventos (
  id          uuid        default gen_random_uuid() primary key,
  tipo        text        not null check (tipo in ('entrenamiento', 'partido')),
  division_id uuid        not null references divisiones(id),
  fecha       date        not null,
  hora        time,
  lugar       text,
  rival       text,
  creado_por  uuid        not null references profiles(id),
  cancelado   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger eventos_updated_at
  before update on eventos
  for each row execute function set_updated_at();

insert into divisiones values ('d0000000-0000-0000-0000-000000000001', 'Plantel Superior');
insert into profiles   values ('a0000000-0000-0000-0000-00000000000c', 'Coordinador');

-- ─── Migración bajo prueba ────────────────────────────────────────────────────
-- Si todavía no existe, el \ir aborta el script (RED).

\ir ../migrations/20261022000000_eventos_actividad.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create table t_fallos (msg text not null);

-- Ejecuta una sentencia. Devuelve 'filas:N' o 'rechazado'.
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

-- ═════════════════════════════════════════════════════════════════════════════
-- Casos
-- ═════════════════════════════════════════════════════════════════════════════

select t_espera(t_res($q$ insert into eventos (tipo, division_id, fecha, creado_por)
  values ('actividad', 'd0000000-0000-0000-0000-000000000001', '2026-10-20', 'a0000000-0000-0000-0000-00000000000c') $q$),
  'rechazado', 'actividad sin título se rechaza');

select t_espera(t_res($q$ insert into eventos (tipo, titulo, division_id, fecha, creado_por)
  values ('actividad', '   ', 'd0000000-0000-0000-0000-000000000001', '2026-10-20', 'a0000000-0000-0000-0000-00000000000c') $q$),
  'rechazado', 'actividad con título en blanco se rechaza');

select t_espera(t_res($q$ insert into eventos (tipo, titulo, division_id, fecha, creado_por)
  values ('actividad', 'Charla de nutrición', 'd0000000-0000-0000-0000-000000000001', '2026-10-20', 'a0000000-0000-0000-0000-00000000000c') $q$),
  'filas:1', 'actividad con título se inserta');

select t_espera(t_res($q$ insert into eventos (tipo, division_id, fecha, creado_por)
  values ('entrenamiento', 'd0000000-0000-0000-0000-000000000001', '2026-10-21', 'a0000000-0000-0000-0000-00000000000c') $q$),
  'filas:1', 'entrenamiento sin título se sigue insertando');

select t_espera(t_res($q$ insert into eventos (tipo, rival, division_id, fecha, creado_por)
  values ('partido', 'Rival', 'd0000000-0000-0000-0000-000000000001', '2026-10-22', 'a0000000-0000-0000-0000-00000000000c') $q$),
  'filas:1', 'partido sin título se sigue insertando');

select t_espera(t_res($q$ insert into eventos (tipo, titulo, division_id, fecha, creado_por)
  values ('torneo', 'Algo', 'd0000000-0000-0000-0000-000000000001', '2026-10-23', 'a0000000-0000-0000-0000-00000000000c') $q$),
  'rechazado', 'tipo desconocido se rechaza');

select t_espera(t_res($q$ update eventos set titulo = null where tipo = 'actividad' $q$),
  'rechazado', 'no se puede borrar el título de una actividad existente');

select t_espera(
  (select count(*)::text from pg_constraint
    where conrelid = 'eventos'::regclass and contype = 'c' and conname = 'eventos_tipo_check'),
  '1', 'queda un único check de tipo, con nombre fijo');

select t_espera(
  (select count(*)::text from pg_constraint
    where conrelid = 'eventos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%entrenamiento%'),
  '1', 'el check inline original fue reemplazado (no quedan dos)');

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
