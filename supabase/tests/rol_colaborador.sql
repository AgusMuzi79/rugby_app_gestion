-- Pruebas de escenario para la migración 20261105000000_rol_colaborador
-- (rol 'colaborador': sólo toma asistencia en sus divisiones de profiles.divisiones).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name colaborador-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec colaborador-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase colaborador-pg:/work
--   docker exec colaborador-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/rol_colaborador.sql
--   docker rm -f colaborador-pg
--
-- Mismas convenciones que los otros archivos de esta carpeta: stubs mínimos del
-- schema real con las policies vigentes antes de la migración (init_schema,
-- 20260506000002/0003, 20260507000000..3, 20260911000002, 20261022000000),
-- migración cargada con \ir (dos veces: es idempotente), cada fallo se anota en
-- t_fallos y al final, si hubo alguno, el script aborta. Todo corre dentro de
-- una transacción con ROLLBACK.
--
-- get_rol() y tiene_acceso_division() son las reales (leen profiles por
-- auth.uid()); auth.uid() sale del GUC test.uid. Las pruebas corren como el rol
-- `authenticated` (el superusuario saltea RLS).
--
-- División A = M15, división B = M16. El colaborador C tiene sólo M15.

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

create table divisiones (
  id      uuid primary key,
  nombre  text not null,
  deporte text not null default 'rugby',
  activa  boolean not null default true
);

-- CHECK de roles vigentes antes de la migración (20261010000000_tutor_menores).
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
  'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio', 'tutor']));
alter table profiles add constraint profiles_roles_check check (roles <@ array[
  'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
  'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio', 'tutor']);

create table jugadores (
  id               uuid default gen_random_uuid() primary key,
  nombre_completo  text not null,
  dni              text not null,
  fecha_nacimiento date not null,
  division_id      uuid not null references divisiones(id),
  activo           boolean not null default true,
  unique (dni, division_id)
);
create table fichajes (
  id             uuid default gen_random_uuid() primary key,
  jugador_id     uuid not null references jugadores(id) on delete cascade,
  fecha_fichaje  date not null default current_date,
  registrado_por uuid not null references profiles(id)
);
create table eventos (
  id          uuid default gen_random_uuid() primary key,
  tipo        text not null check (tipo in ('entrenamiento', 'partido', 'actividad')),
  titulo      text,
  division_id uuid not null references divisiones(id),
  fecha       date not null,
  hora        time,
  lugar       text,
  rival       text,
  creado_por  uuid not null references profiles(id),
  cancelado   boolean not null default false
);
create table asistencias (
  id             uuid default gen_random_uuid() primary key,
  evento_id      uuid not null references eventos(id) on delete cascade,
  jugador_id     uuid not null references jugadores(id),
  division_id    uuid not null references divisiones(id),
  estado         text not null check (estado in ('presente', 'ausente', 'justificado')),
  registrado_por uuid not null references profiles(id),
  unique (evento_id, jugador_id)
);
create table lesiones (
  id             uuid default gen_random_uuid() primary key,
  jugador_id     uuid not null references jugadores(id),
  division_id    uuid not null references divisiones(id),
  fecha          date not null,
  descripcion    text not null,
  grado          integer not null check (grado between 1 and 5),
  registrado_por uuid not null references profiles(id)
);
create table equipos (
  id          uuid default gen_random_uuid() primary key,
  division_id uuid not null references divisiones(id),
  nombre      text not null,
  created_by  uuid not null references profiles(id)
);
create table mesas_de_partido (
  id        uuid default gen_random_uuid() primary key,
  evento_id uuid not null references eventos(id) on delete cascade,
  equipo_id uuid references equipos(id)
);
create table resultados (
  id             uuid default gen_random_uuid() primary key,
  evento_id      uuid not null references eventos(id) on delete cascade,
  puntos_propios integer not null,
  puntos_rival   integer not null,
  registrado_por uuid not null references profiles(id)
);
create table eventos_financieros (
  id          uuid default gen_random_uuid() primary key,
  tipo        text not null check (tipo in ('viaje', 'tercer_tiempo', 'recaudacion')),
  nombre      text not null,
  division_id uuid references divisiones(id),
  creado_por  uuid not null references profiles(id)
);
create table cobranzas (
  id                   uuid default gen_random_uuid() primary key,
  evento_financiero_id uuid not null references eventos_financieros(id),
  jugador_id           uuid not null references jugadores(id),
  registrado_por       uuid not null references profiles(id),
  unique (evento_financiero_id, jugador_id)
);

-- Helpers reales (init_schema + 20260911000002).
create or replace function get_rol() returns text language sql security definer stable as $$
  select rol from profiles where id = auth.uid()
$$;
create or replace function tiene_acceso_division(p_division_id uuid) returns boolean
  language sql stable security definer as $$
  select coalesce(p_division_id = any(divisiones), false) from profiles where id = auth.uid()
$$;

alter table divisiones enable row level security;
alter table profiles enable row level security;
alter table jugadores enable row level security;
alter table fichajes enable row level security;
alter table eventos enable row level security;
alter table asistencias enable row level security;
alter table lesiones enable row level security;
alter table equipos enable row level security;
alter table mesas_de_partido enable row level security;
alter table resultados enable row level security;
alter table eventos_financieros enable row level security;
alter table cobranzas enable row level security;

-- Policies vigentes de los otros roles (las que el colaborador no tiene que heredar).
create policy divisiones_select on divisiones for select to authenticated using (true);
create policy profiles_select_own on profiles for select to authenticated using (id = auth.uid());

create policy "jugadores_select_division" on jugadores for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager') and (select tiene_acceso_division(division_id)));
create policy "jugadores_insert_manager" on jugadores for insert to authenticated
  with check ((select get_rol()) = 'manager' and (select tiene_acceso_division(division_id)));
create policy "jugadores_update_manager" on jugadores for update to authenticated
  using ((select get_rol()) = 'manager' and (select tiene_acceso_division(division_id)));

create policy "fichajes_select_division" on fichajes for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager')
         and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id))));
create policy "fichajes_insert_manager" on fichajes for insert to authenticated
  with check ((select get_rol()) = 'manager' and registrado_por = auth.uid()
              and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id))));

create policy "eventos_select_division" on eventos for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager') and (select tiene_acceso_division(division_id)));
create policy "eventos_insert_coordinador_subcomision" on eventos for insert to authenticated
  with check ((select get_rol()) in ('coordinador', 'subcomision') and (select tiene_acceso_division(division_id)));
create policy "eventos_update_coordinador_subcomision" on eventos for update to authenticated
  using ((select get_rol()) in ('coordinador', 'subcomision') and (select tiene_acceso_division(division_id)));
create policy "eventos_insert_entrenador" on eventos for insert to authenticated
  with check ((select get_rol()) = 'entrenador' and tipo = 'entrenamiento' and (select tiene_acceso_division(division_id)));

create policy "asistencias_select_division" on asistencias for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager') and (select tiene_acceso_division(division_id)));
create policy "asistencias_insert_entrenador" on asistencias for insert to authenticated
  with check ((select get_rol()) = 'entrenador' and registrado_por = auth.uid() and (select tiene_acceso_division(division_id)));
create policy "asistencias_update_entrenador" on asistencias for update to authenticated
  using ((select get_rol()) = 'entrenador' and (select tiene_acceso_division(division_id)));

create policy "lesiones_select_division" on lesiones for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador') and (select tiene_acceso_division(division_id)));
create policy "lesiones_insert_entrenador" on lesiones for insert to authenticated
  with check ((select get_rol()) = 'entrenador' and registrado_por = auth.uid() and (select tiene_acceso_division(division_id)));

create policy "equipos_select_division" on equipos for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager') and (select tiene_acceso_division(division_id)));
create policy "equipos_insert_entrenador" on equipos for insert to authenticated
  with check ((select get_rol()) = 'entrenador' and (select tiene_acceso_division(division_id)));

create policy "mesas_de_partido_select_division" on mesas_de_partido for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager')
         and (select tiene_acceso_division((select division_id from eventos where id = evento_id))));
create policy "mesas_de_partido_insert_entrenador" on mesas_de_partido for insert to authenticated
  with check ((select get_rol()) = 'entrenador'
              and (select tiene_acceso_division((select division_id from eventos where id = evento_id))));

create policy "resultados_select_division" on resultados for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager')
         and (select tiene_acceso_division((select division_id from eventos where id = evento_id))));
create policy "resultados_insert_entrenador" on resultados for insert to authenticated
  with check ((select get_rol()) = 'entrenador' and registrado_por = auth.uid()
              and (select tiene_acceso_division((select division_id from eventos where id = evento_id))));

create policy "eventos_financieros_select_division" on eventos_financieros for select to authenticated
  using ((select get_rol()) in ('coordinador', 'entrenador', 'manager')
         and (division_id is null or (select tiene_acceso_division(division_id))));

create policy "cobranzas_select_division" on cobranzas for select to authenticated
  using ((select get_rol()) in ('coordinador', 'manager')
         and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id))));

-- ─── Datos (cargados como superusuario) ───────────────────────────────────────

insert into divisiones (id, nombre) values
  ('d0000000-0000-0000-0000-000000000015', 'M15'),
  ('d0000000-0000-0000-0000-000000000016', 'M16');

insert into profiles (id, rol, roles, nombre, divisiones) values
  ('a0000000-0000-0000-0000-0000000000ad', 'admin',      '{admin}',      'Admin',          null),
  ('a0000000-0000-0000-0000-000000000015', 'manager',    '{manager}',    'Manager M15',    '{d0000000-0000-0000-0000-000000000015}'),
  ('e0000000-0000-0000-0000-000000000015', 'entrenador', '{entrenador}', 'Entrenador M15', '{d0000000-0000-0000-0000-000000000015}'),
  ('e0000000-0000-0000-0000-000000000016', 'entrenador', '{entrenador}', 'Entrenador M16', '{d0000000-0000-0000-0000-000000000016}');

insert into jugadores (id, nombre_completo, dni, fecha_nacimiento, division_id) values
  ('10000000-0000-0000-0000-000000000001', 'Uno',       '1',  '2011-01-01', 'd0000000-0000-0000-0000-000000000015'),
  ('10000000-0000-0000-0000-000000000002', 'Dos',       '2',  '2011-01-01', 'd0000000-0000-0000-0000-000000000015'),
  ('10000000-0000-0000-0000-000000000003', 'Tres',      '3',  '2011-01-01', 'd0000000-0000-0000-0000-000000000015'),
  ('10000000-0000-0000-0000-000000000016', 'Dieciséis', '16', '2010-01-01', 'd0000000-0000-0000-0000-000000000016');

-- ee0…: partidos; ee1…: entrenamientos de hoy.
insert into eventos (id, tipo, division_id, fecha, rival, creado_por) values
  ('ee000000-0000-0000-0000-000000000015', 'partido',       'd0000000-0000-0000-0000-000000000015', current_date - 7, 'CASI', 'a0000000-0000-0000-0000-0000000000ad'),
  ('ee000000-0000-0000-0000-000000000016', 'partido',       'd0000000-0000-0000-0000-000000000016', current_date - 7, 'SIC',  'a0000000-0000-0000-0000-0000000000ad'),
  ('ee100000-0000-0000-0000-000000000015', 'entrenamiento', 'd0000000-0000-0000-0000-000000000015', current_date,     null,   'a0000000-0000-0000-0000-0000000000ad'),
  ('ee100000-0000-0000-0000-000000000016', 'entrenamiento', 'd0000000-0000-0000-0000-000000000016', current_date,     null,   'a0000000-0000-0000-0000-0000000000ad');

insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por) values
  ('ee100000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000015', 'presente', 'e0000000-0000-0000-0000-000000000015'),
  ('ee100000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000016', 'presente', 'e0000000-0000-0000-0000-000000000016');

insert into fichajes (jugador_id, registrado_por) values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000015');
insert into lesiones (jugador_id, division_id, fecha, descripcion, grado, registrado_por) values
  ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000015', current_date, 'Esguince', 2, 'e0000000-0000-0000-0000-000000000015');
insert into equipos (id, division_id, nombre, created_by) values
  ('eb000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000015', 'M15', 'e0000000-0000-0000-0000-000000000015');
insert into mesas_de_partido (evento_id, equipo_id) values
  ('ee000000-0000-0000-0000-000000000015', 'eb000000-0000-0000-0000-000000000015');
insert into resultados (evento_id, puntos_propios, puntos_rival, registrado_por) values
  ('ee000000-0000-0000-0000-000000000015', 10, 5, 'e0000000-0000-0000-0000-000000000015');
insert into eventos_financieros (id, tipo, nombre, division_id, creado_por) values
  ('ef000000-0000-0000-0000-000000000015', 'viaje', 'Viaje M15', 'd0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000015');
insert into cobranzas (evento_financiero_id, jugador_id, registrado_por) values
  ('ef000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000015');

-- ─── Migración bajo prueba (dos veces: idempotente) ──────────────────────────

\ir ../migrations/20261105000000_rol_colaborador.sql
\ir ../migrations/20261105000000_rol_colaborador.sql

-- Supabase da estos privilegios por default en public; RLS decide el resto.
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, auth to anon, authenticated, service_role;

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

-- ─── Alta del colaborador (como superusuario: lo hace admin-usuarios) ────────

select t_espera(t_res($q$
  insert into profiles (id, rol, roles, nombre, divisiones)
  values ('c0000000-0000-0000-0000-000000000015', 'colaborador', '{colaborador}', 'Colaborador M15',
          '{d0000000-0000-0000-0000-000000000015}') $q$),
  'filas:1', 'alta de un perfil colaborador (CHECK de rol y roles)');
select t_espera(t_res($q$ update profiles set rol = 'inventado' where id = 'c0000000-0000-0000-0000-000000000015' $q$),
  'rechazado', 'un rol inventado sigue rechazado');
select t_espera((select count(*)::text from pg_policies where policyname like '%colaborador%'), '6',
  'la migración crea 6 policies del colaborador');

-- ═════════════════════════════════════════════════════════════════════════════
-- Colaborador de M15
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.uid = 'c0000000-0000-0000-0000-000000000015';

-- ─── Lectura en su división ──────────────────────────────────────────────────

select t_espera(t_cuenta($q$ select 1 from jugadores where division_id = 'd0000000-0000-0000-0000-000000000015' $q$), '3',
  'colaborador: lee los jugadores de M15');
select t_espera(t_cuenta($q$ select 1 from eventos where division_id = 'd0000000-0000-0000-0000-000000000015' $q$), '2',
  'colaborador: lee los eventos de M15 (partido y entrenamiento)');
select t_espera(t_cuenta($q$ select 1 from asistencias where division_id = 'd0000000-0000-0000-0000-000000000015' $q$), '1',
  'colaborador: lee las asistencias de M15');
select t_espera(t_cuenta('select 1 from divisiones'), '2',
  'colaborador: ve las divisiones (divisiones_select abierta)');

-- ─── Fuera de su división, nada ──────────────────────────────────────────────

select t_espera(t_cuenta($q$ select 1 from jugadores where division_id = 'd0000000-0000-0000-0000-000000000016' $q$), '0',
  'colaborador: no lee jugadores de M16');
select t_espera(t_cuenta($q$ select 1 from eventos where division_id = 'd0000000-0000-0000-0000-000000000016' $q$), '0',
  'colaborador: no lee eventos de M16');
select t_espera(t_cuenta($q$ select 1 from asistencias where division_id = 'd0000000-0000-0000-0000-000000000016' $q$), '0',
  'colaborador: no lee asistencias de M16');

-- ─── Ni fichajes, cobranzas, resultados, mesas, lesiones, equipos ni eventos financieros ──

select t_espera(t_cuenta('select 1 from fichajes'), '0', 'colaborador: no lee fichajes');
select t_espera(t_cuenta('select 1 from cobranzas'), '0', 'colaborador: no lee cobranzas');
select t_espera(t_cuenta('select 1 from resultados'), '0', 'colaborador: no lee resultados');
select t_espera(t_cuenta('select 1 from mesas_de_partido'), '0', 'colaborador: no lee mesas');
select t_espera(t_cuenta('select 1 from lesiones'), '0', 'colaborador: no lee lesiones');
select t_espera(t_cuenta('select 1 from equipos'), '0', 'colaborador: no lee equipos');
select t_espera(t_cuenta('select 1 from eventos_financieros'), '0', 'colaborador: no lee eventos financieros');

-- ─── Entrenamiento de hoy ────────────────────────────────────────────────────

select t_espera(t_res($q$
  insert into eventos (id, tipo, division_id, fecha, creado_por)
  values ('ee200000-0000-0000-0000-000000000015', 'entrenamiento', 'd0000000-0000-0000-0000-000000000015', current_date, auth.uid()) $q$),
  'filas:1', 'colaborador: crea el entrenamiento de hoy en M15 a su nombre');
select t_espera(t_res($q$
  insert into eventos (tipo, division_id, fecha, creado_por)
  values ('entrenamiento', 'd0000000-0000-0000-0000-000000000016', current_date, auth.uid()) $q$),
  'rechazado', 'colaborador: no crea un entrenamiento en M16');
select t_espera(t_res($q$
  insert into eventos (tipo, division_id, fecha, rival, creado_por)
  values ('partido', 'd0000000-0000-0000-0000-000000000015', current_date, 'CASI', auth.uid()) $q$),
  'rechazado', 'colaborador: no crea un partido');
select t_espera(t_res($q$
  insert into eventos (tipo, titulo, division_id, fecha, creado_por)
  values ('actividad', 'Charla', 'd0000000-0000-0000-0000-000000000015', current_date, auth.uid()) $q$),
  'rechazado', 'colaborador: no crea una actividad');
select t_espera(t_res($q$
  insert into eventos (tipo, division_id, fecha, creado_por)
  values ('entrenamiento', 'd0000000-0000-0000-0000-000000000015', current_date, 'a0000000-0000-0000-0000-0000000000ad') $q$),
  'rechazado', 'colaborador: no crea un entrenamiento a nombre de otro');
select t_espera(t_res($q$ update eventos set cancelado = true where division_id = 'd0000000-0000-0000-0000-000000000015' $q$),
  'filas:0', 'colaborador: no cancela ni edita eventos (0 filas)');
select t_espera(t_res($q$ delete from eventos where division_id = 'd0000000-0000-0000-0000-000000000015' $q$),
  'filas:0', 'colaborador: no borra eventos (0 filas)');

-- ─── Asistencia: el upsert de la app ─────────────────────────────────────────
-- Payload {evento_id, jugador_id, division_id, estado, registrado_por} con
-- onConflict 'evento_id,jugador_id' (PostgREST pone todas las columnas en el DO UPDATE).

select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  select 'ee200000-0000-0000-0000-000000000015', id, division_id, 'presente', auth.uid()
    from jugadores where division_id = 'd0000000-0000-0000-0000-000000000015'
  on conflict (evento_id, jugador_id) do update
    set evento_id = excluded.evento_id, jugador_id = excluded.jugador_id, division_id = excluded.division_id,
        estado = excluded.estado, registrado_por = excluded.registrado_por $q$),
  'filas:3', 'colaborador: carga la asistencia de M15 (upsert, alta)');
select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  select 'ee200000-0000-0000-0000-000000000015', id, division_id, 'ausente', auth.uid()
    from jugadores where division_id = 'd0000000-0000-0000-0000-000000000015'
  on conflict (evento_id, jugador_id) do update
    set evento_id = excluded.evento_id, jugador_id = excluded.jugador_id, division_id = excluded.division_id,
        estado = excluded.estado, registrado_por = excluded.registrado_por $q$),
  'filas:3', 'colaborador: corrige la asistencia de M15 (mismo upsert)');
select t_espera(t_cuenta($q$ select 1 from asistencias
    where evento_id = 'ee200000-0000-0000-0000-000000000015' and estado = 'ausente' and registrado_por = auth.uid() $q$), '3',
  'colaborador: las marcas quedan corregidas y a su nombre');
select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  values ('ee100000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000015', 'justificado', auth.uid())
  on conflict (evento_id, jugador_id) do update
    set evento_id = excluded.evento_id, jugador_id = excluded.jugador_id, division_id = excluded.division_id,
        estado = excluded.estado, registrado_por = excluded.registrado_por $q$),
  'filas:1', 'colaborador: corrige una marca que había cargado el entrenador de M15');

select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  values ('ee100000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000016', 'ausente', auth.uid())
  on conflict (evento_id, jugador_id) do update
    set evento_id = excluded.evento_id, jugador_id = excluded.jugador_id, division_id = excluded.division_id,
        estado = excluded.estado, registrado_por = excluded.registrado_por $q$),
  'rechazado', 'colaborador: no carga asistencia en M16');
select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  values ('ee100000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000015', 'presente', auth.uid()) $q$),
  'rechazado', 'colaborador: no carga una marca de M15 sobre un evento de M16');
select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  values ('ee000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000015', 'presente', 'e0000000-0000-0000-0000-000000000015') $q$),
  'rechazado', 'colaborador: no carga una marca a nombre de otro');
select t_espera(t_res($q$ update asistencias set division_id = 'd0000000-0000-0000-0000-000000000016'
    where evento_id = 'ee200000-0000-0000-0000-000000000015' $q$),
  'rechazado', 'colaborador: no mueve marcas de M15 a M16');
select t_espera(t_res($q$ update asistencias set estado = 'ausente' where division_id = 'd0000000-0000-0000-0000-000000000016' $q$),
  'filas:0', 'colaborador: no toca marcas de M16 (0 filas)');
select t_espera(t_res('delete from asistencias'), 'filas:0', 'colaborador: no borra asistencias (0 filas)');

-- ─── Escrituras prohibidas ───────────────────────────────────────────────────

select t_espera(t_res($q$ insert into fichajes (jugador_id, registrado_por)
    values ('10000000-0000-0000-0000-000000000002', auth.uid()) $q$),
  'rechazado', 'colaborador: no ficha jugadores');
select t_espera(t_res($q$ insert into jugadores (nombre_completo, dni, fecha_nacimiento, division_id)
    values ('X', '99', '2011-01-01', 'd0000000-0000-0000-0000-000000000015') $q$),
  'rechazado', 'colaborador: no da de alta jugadores');
select t_espera(t_res($q$ update jugadores set activo = false where division_id = 'd0000000-0000-0000-0000-000000000015' $q$),
  'filas:0', 'colaborador: no edita jugadores (0 filas)');
select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
    values ('ef000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000002', auth.uid()) $q$),
  'rechazado', 'colaborador: no carga cobranzas');
select t_espera(t_res($q$ insert into resultados (evento_id, puntos_propios, puntos_rival, registrado_por)
    values ('ee000000-0000-0000-0000-000000000015', 20, 5, auth.uid()) $q$),
  'rechazado', 'colaborador: no carga resultados');
select t_espera(t_res($q$ insert into mesas_de_partido (evento_id) values ('ee000000-0000-0000-0000-000000000015') $q$),
  'rechazado', 'colaborador: no arma mesas de partido');
select t_espera(t_res($q$ insert into lesiones (jugador_id, division_id, fecha, descripcion, grado, registrado_por)
    values ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000015', current_date, 'x', 1, auth.uid()) $q$),
  'rechazado', 'colaborador: no registra lesiones');
select t_espera(t_res($q$ insert into equipos (division_id, nombre, created_by)
    values ('d0000000-0000-0000-0000-000000000015', 'M15 B', auth.uid()) $q$),
  'rechazado', 'colaborador: no crea equipos');

-- ═════════════════════════════════════════════════════════════════════════════
-- El entrenador no cambia
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'e0000000-0000-0000-0000-000000000016';

select t_espera(t_cuenta($q$ select 1 from asistencias where division_id = 'd0000000-0000-0000-0000-000000000016' $q$), '1',
  'entrenador M16: lee su marca');
select t_espera(t_res($q$
  insert into asistencias (evento_id, jugador_id, division_id, estado, registrado_por)
  values ('ee100000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000016', 'ausente', auth.uid())
  on conflict (evento_id, jugador_id) do update
    set evento_id = excluded.evento_id, jugador_id = excluded.jugador_id, division_id = excluded.division_id,
        estado = excluded.estado, registrado_por = excluded.registrado_por $q$),
  'filas:1', 'entrenador M16: corrige su asistencia');
select t_espera(t_res($q$
  insert into eventos (tipo, division_id, fecha, creado_por)
  values ('entrenamiento', 'd0000000-0000-0000-0000-000000000016', current_date, auth.uid()) $q$),
  'filas:1', 'entrenador M16: crea un entrenamiento');
select t_espera(t_cuenta($q$ select 1 from asistencias where division_id = 'd0000000-0000-0000-0000-000000000015' $q$), '0',
  'entrenador M16: no ve las asistencias de M15');

set local test.uid = 'e0000000-0000-0000-0000-000000000015';

select t_espera(t_cuenta($q$ select 1 from asistencias where division_id = 'd0000000-0000-0000-0000-000000000015' $q$), '4',
  'entrenador M15: ve las marcas que cargó y corrigió el colaborador');
select t_espera(t_res($q$ insert into lesiones (jugador_id, division_id, fecha, descripcion, grado, registrado_por)
    values ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000015', current_date, 'Golpe', 1, auth.uid()) $q$),
  'filas:1', 'entrenador M15: sigue registrando lesiones');
select t_espera(t_res($q$ insert into resultados (evento_id, puntos_propios, puntos_rival, registrado_por)
    values ('ee000000-0000-0000-0000-000000000015', 20, 5, auth.uid()) $q$),
  'filas:1', 'entrenador M15: sigue cargando resultados');

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
