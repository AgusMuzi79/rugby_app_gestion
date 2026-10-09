-- Pruebas de escenario para la migración 20261016000000_eventos_financieros_multi_division
-- (eventos financieros con varias divisiones: tabla eventos_financieros_divisiones,
-- RPC crear_evento_financiero, helper deportes_del_usuario, visibilidad por división,
-- cierre por cualquier manager de una división del evento y cobranzas acotadas a los
-- jugadores de las divisiones del evento).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name evf-multi-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec evf-multi-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase evf-multi-pg:/work
--   docker exec evf-multi-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/eventos_financieros_multi_division.sql
--   docker rm -f evf-multi-pg
--
-- Mismas convenciones que eventos_financieros_manager_rls.sql: stubs mínimos (roles,
-- auth.uid(), get_rol, tiene_acceso_division, tiene_acceso_deporte, tablas y policies
-- previas), las migraciones se cargan con \ir en orden, las pruebas corren como
-- `authenticated` y el rol / usuario / divisiones / disciplinas salen de GUCs:
--   test.rol, test.uid, test.divs (uuids separados por coma), test.deportes.
-- profiles.divisiones se carga igual que test.divs (deportes_del_usuario lee profiles).
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

-- Policies vigentes antes de las migraciones bajo prueba
-- (rls_policies + subcomision_deporte + add_admin_role).
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

create policy "eventos_financieros_select_admin" on eventos_financieros
  for select to authenticated using ((select get_rol()) = 'admin');
create policy "eventos_financieros_insert_admin" on eventos_financieros
  for insert to authenticated with check ((select get_rol()) = 'admin');

create policy "cobranzas_select_division"
  on cobranzas for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'manager')
    and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id)))
  );

create policy "cobranzas_insert_manager"
  on cobranzas for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id)))
  );

create policy "cobranzas_update_manager"
  on cobranzas for update to authenticated
  using (
    (select get_rol()) = 'manager'
    and (select tiene_acceso_division((select division_id from jugadores where id = jugador_id)))
  );

-- Supabase da estos privilegios por default en public (también a tablas futuras).
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Rugby: D1 (M15), D2 (M16), D3 (M17). Hockey: H1.
-- Manager A: D1 y D3. Manager B: D2. Manager C: D3. Manager H: H1.
-- S: subcomisión de rugby. K: coordinador de D1.

insert into divisiones (id, nombre, deporte) values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby'),
  ('d0000000-0000-0000-0000-000000000002', 'M16', 'rugby'),
  ('d0000000-0000-0000-0000-000000000003', 'M17', 'rugby'),
  ('d0000000-0000-0000-0000-0000000000a1', 'Hockey Primera', 'hockey');

insert into profiles values
  ('a0000000-0000-0000-0000-00000000000a', 'Manager A', '{d0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000003}'),
  ('a0000000-0000-0000-0000-00000000000b', 'Manager B', '{d0000000-0000-0000-0000-000000000002}'),
  ('a0000000-0000-0000-0000-00000000000c', 'Manager C', '{d0000000-0000-0000-0000-000000000003}'),
  ('a0000000-0000-0000-0000-00000000000d', 'Manager H', '{d0000000-0000-0000-0000-0000000000a1}'),
  ('a0000000-0000-0000-0000-00000000000e', 'Subcomision rugby', null),
  ('a0000000-0000-0000-0000-00000000000f', 'Coordinador M15', '{d0000000-0000-0000-0000-000000000001}');

insert into jugadores values
  ('b0000000-0000-0000-0000-000000000001', 'Jugador M15', 'd0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000002', 'Jugador M16', 'd0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-000000000003', 'Jugador M17', 'd0000000-0000-0000-0000-000000000003', true);

-- Eventos previos a la migración (cargados como superusuario):
--   e01: viaje de D3 (legado, una sola división) · e02: recaudación global.
insert into eventos_financieros (id, tipo, nombre, division_id, creado_por) values
  ('e0000000-0000-0000-0000-000000000001', 'viaje',       'Viaje M17 legado', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000e'),
  ('e0000000-0000-0000-0000-000000000002', 'recaudacion', 'Rifa anual',       null,                                   'a0000000-0000-0000-0000-00000000000e');

-- ─── Migraciones bajo prueba ──────────────────────────────────────────────────

\ir ../migrations/20261015000000_eventos_financieros_manager.sql
\ir ../migrations/20261016000000_eventos_financieros_multi_division.sql

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

-- Evalúa una consulta escalar con los permisos del rol actual. Devuelve su valor como
-- texto o 'error' (p. ej. si la tabla o la función todavía no existen).
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

-- ─── Backfill (superusuario) ──────────────────────────────────────────────────

select t_espera(t_val($q$ select string_agg(division_id::text, ',') from eventos_financieros_divisiones
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000001' $q$),
  'd0000000-0000-0000-0000-000000000003', 'backfill: el viaje legado tiene su division en la tabla nueva');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros_divisiones
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000002' $q$),
  '0', 'backfill: la recaudacion global no tiene divisiones');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager A (D1 y D3, rugby)
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.rol = 'manager';
set local test.uid = 'a0000000-0000-0000-0000-00000000000a';
set local test.divs = 'd0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000003';
set local test.deportes = '';

select t_espera(t_val($q$ select array_to_string(deportes_del_usuario(), ',') $q$),
  'rugby', 'deportes_del_usuario: disciplinas de las divisiones del manager');

select t_espera(t_res($q$ select crear_evento_financiero('Viaje MdP', 'viaje', '2500',
  array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
        'd0000000-0000-0000-0000-000000000001']::uuid[]) $q$),
  'filas:1', 'manager: crea viaje multi-division de su disciplina (incluye una division ajena de rugby)');

select t_espera(t_val($q$ select division_id::text || '|' || creado_por::text || '|' || estado
  from eventos_financieros where nombre = 'Viaje MdP' $q$),
  'd0000000-0000-0000-0000-000000000001|a0000000-0000-0000-0000-00000000000a|activo',
  'manager: division_id = primera elegida, creado_por = el manager');

select t_espera(t_val($q$ select string_agg(efd.division_id::text, ',' order by efd.division_id)
  from eventos_financieros_divisiones efd join eventos_financieros ef on ef.id = efd.evento_financiero_id
  where ef.nombre = 'Viaje MdP' $q$),
  'd0000000-0000-0000-0000-000000000001,d0000000-0000-0000-0000-000000000002',
  'manager: el viaje queda con D1 y D2 (sin duplicados)');

select t_espera(t_res($q$ select crear_evento_financiero('Viaje mixto', 'viaje', null,
  array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000a1']::uuid[]) $q$),
  'rechazado', 'manager: no crea con una division de otra disciplina');

select t_espera(t_res($q$ select crear_evento_financiero('Viaje hockey primero', 'viaje', null,
  array['d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001']::uuid[]) $q$),
  'rechazado', 'manager: no crea con una division de otra disciplina en primer lugar');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where nombre in ('Viaje mixto', 'Viaje hockey primero') $q$),
  '0', 'manager: el rechazo no deja nada persistido');

select t_espera(t_res($q$ select crear_evento_financiero('Viaje vacio', 'viaje', null, array[]::uuid[]) $q$),
  'rechazado', 'manager: no crea viaje sin divisiones');

select t_espera(t_res($q$ select crear_evento_financiero('Viaje null', 'tercer_tiempo', null, null) $q$),
  'rechazado', 'manager: no crea tercer tiempo con divisiones null');

select t_espera(t_res($q$ select crear_evento_financiero('Rifa manager', 'recaudacion', null,
  array['d0000000-0000-0000-0000-000000000001']::uuid[]) $q$),
  'rechazado', 'manager: no crea recaudacion');

select t_espera(t_res($q$ insert into eventos_financieros_divisiones (evento_financiero_id, division_id)
  values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001') $q$),
  'rechazado', 'manager: no agrega divisiones a un evento que no creo');

select t_espera(t_res($q$ insert into eventos_financieros_divisiones (evento_financiero_id, division_id)
  select id, 'd0000000-0000-0000-0000-0000000000a1' from eventos_financieros where nombre = 'Viaje MdP' $q$),
  'rechazado', 'manager: no agrega a su evento una division de otra disciplina');

select t_espera(t_res($q$ insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('viaje', 'Viaje directo hockey', 'd0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'rechazado', 'manager: insert directo con division de otra disciplina rechazado');

-- ─── Cobranzas de Manager A ───────────────────────────────────────────────────

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  select id, 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'
  from eventos_financieros where nombre = 'Viaje MdP' $q$),
  'filas:1', 'cobranza: jugador de una division del evento (D1) aceptado');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  select id, 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a'
  from eventos_financieros where nombre = 'Viaje MdP' $q$),
  'rechazado', 'cobranza: jugador propio (D3) fuera de las divisiones del evento rechazado');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'filas:1', 'cobranza: evento global acepta cualquier jugador del manager (D3)');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'rechazado', 'cobranza: viaje legado de D3 no acepta jugador de D1');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a') $q$),
  'filas:1', 'cobranza: viaje legado de D3 acepta jugador de D3');

select t_espera(t_res($q$ update cobranzas set jugador_id = 'b0000000-0000-0000-0000-000000000003'
  where jugador_id = 'b0000000-0000-0000-0000-000000000001'
    and evento_financiero_id = (select id from eventos_financieros where nombre = 'Viaje MdP') $q$),
  'rechazado', 'cobranza: update no puede mover la cobranza a un jugador fuera del evento');

select t_espera(t_res($q$ update cobranzas set estado = 'pagado', monto = 2500
  where jugador_id = 'b0000000-0000-0000-0000-000000000001'
    and evento_financiero_id = (select id from eventos_financieros where nombre = 'Viaje MdP') $q$),
  'filas:1', 'cobranza: update de un jugador dentro del evento');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager B (D2): no creó el viaje, pero D2 está en el evento
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'a0000000-0000-0000-0000-00000000000b';
set local test.divs = 'd0000000-0000-0000-0000-000000000002';

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where nombre = 'Viaje MdP' $q$),
  '1', 'manager B: ve el viaje que incluye su division');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros_divisiones efd
  join eventos_financieros ef on ef.id = efd.evento_financiero_id where ef.nombre = 'Viaje MdP' $q$),
  '2', 'manager B: ve todas las divisiones del viaje');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where id = 'e0000000-0000-0000-0000-000000000001' $q$),
  '0', 'manager B: no ve el viaje legado de D3');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  select id, 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000b'
  from eventos_financieros where nombre = 'Viaje MdP' $q$),
  'filas:1', 'manager B: cobra a un jugador de su division en el viaje');

select t_espera(t_res($q$ update eventos_financieros set division_id = 'd0000000-0000-0000-0000-000000000002'
  where nombre = 'Viaje MdP' $q$),
  'rechazado', 'manager B: no cambia division_id');

select t_espera(t_res($q$ delete from eventos_financieros_divisiones
  where evento_financiero_id = (select id from eventos_financieros where nombre = 'Viaje MdP') $q$),
  'filas:0', 'manager B: no borra divisiones del evento');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado' where nombre = 'Viaje MdP' $q$),
  'filas:1', 'manager B: cierra el viaje que incluye su division');

select t_espera(t_res($q$ update eventos_financieros set estado = 'activo' where nombre = 'Viaje MdP' $q$),
  'rechazado', 'manager B: no reabre el viaje');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager C (D3): ninguna división suya en el viaje
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'a0000000-0000-0000-0000-00000000000c';
set local test.divs = 'd0000000-0000-0000-0000-000000000003';

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where nombre = 'Viaje MdP' $q$),
  '0', 'manager C: no ve un viaje sin divisiones suyas');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros_divisiones efd
  join divisiones d on d.id = efd.division_id where d.nombre in ('M15', 'M16') $q$),
  '0', 'manager C: no ve las divisiones de un evento que no ve');

select t_espera(t_val($q$ select string_agg(nombre, ',' order by nombre) from eventos_financieros $q$),
  'Rifa anual,Viaje M17 legado', 'manager C: ve el legado de su division y la recaudacion global');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = (select id from eventos_financieros where nombre = 'Viaje MdP') $q$),
  'filas:0', 'manager C: no cierra un viaje sin divisiones suyas');

-- ═════════════════════════════════════════════════════════════════════════════
-- Subcomisión de rugby
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'subcomision';
set local test.uid = 'a0000000-0000-0000-0000-00000000000e';
set local test.divs = '';
set local test.deportes = 'rugby';

select t_espera(t_res($q$ select crear_evento_financiero('Cena del club', 'recaudacion', null, array[]::uuid[]) $q$),
  'filas:1', 'subcomision: crea recaudacion para todo el club');

select t_espera(t_val($q$ select coalesce(ef.division_id::text, 'null') || '|' || count(efd.division_id)
  from eventos_financieros ef left join eventos_financieros_divisiones efd on efd.evento_financiero_id = ef.id
  where ef.nombre = 'Cena del club' group by ef.division_id $q$),
  'null|0', 'subcomision: la recaudacion global no tiene divisiones');

select t_espera(t_res($q$ select crear_evento_financiero('Rifa juveniles', 'recaudacion', '1000',
  array['d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003']::uuid[]) $q$),
  'filas:1', 'subcomision: crea recaudacion para divisiones elegidas');

select t_espera(t_val($q$ select ef.division_id::text || '|' || count(efd.division_id)
  from eventos_financieros ef join eventos_financieros_divisiones efd on efd.evento_financiero_id = ef.id
  where ef.nombre = 'Rifa juveniles' group by ef.division_id $q$),
  'd0000000-0000-0000-0000-000000000002|2', 'subcomision: la recaudacion queda con D2 y D3');

select t_espera(t_res($q$ select crear_evento_financiero('Rifa mixta', 'recaudacion', null,
  array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000a1']::uuid[]) $q$),
  'rechazado', 'subcomision de rugby: no incluye una division de hockey');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where nombre = 'Rifa mixta' $q$),
  '0', 'subcomision: el rechazo no deja nada persistido');

select t_espera(t_res($q$ select crear_evento_financiero('Viaje subco', 'viaje', null,
  array['d0000000-0000-0000-0000-000000000001']::uuid[]) $q$),
  'rechazado', 'subcomision: no crea viajes');

select t_espera(t_res($q$ insert into eventos_financieros (tipo, nombre, division_id, creado_por)
  values ('recaudacion', 'Rifa app vieja', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e') $q$),
  'filas:1', 'subcomision: insert directo (app publicada) sigue funcionando');

select t_espera(t_val($q$ select string_agg(efd.division_id::text, ',') from eventos_financieros_divisiones efd
  join eventos_financieros ef on ef.id = efd.evento_financiero_id where ef.nombre = 'Rifa app vieja' $q$),
  'd0000000-0000-0000-0000-000000000001', 'insert directo: la division_id se copia a la tabla nueva');

-- ═════════════════════════════════════════════════════════════════════════════
-- Visibilidad de las recaudaciones para managers
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'manager';
set local test.deportes = '';
set local test.uid = 'a0000000-0000-0000-0000-00000000000b';
set local test.divs = 'd0000000-0000-0000-0000-000000000002';

select t_espera(t_val($q$ select string_agg(nombre, ',' order by nombre) from eventos_financieros where tipo = 'recaudacion' $q$),
  'Cena del club,Rifa anual,Rifa juveniles', 'manager B: ve las globales y la que incluye D2');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  select id, 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000b'
  from eventos_financieros where nombre = 'Rifa juveniles' $q$),
  'filas:1', 'manager B: cobra la recaudacion de divisiones elegidas a su jugador');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado' where nombre = 'Rifa juveniles' $q$),
  'filas:0', 'manager B: no cierra una recaudacion');

set local test.uid = 'a0000000-0000-0000-0000-00000000000d';
set local test.divs = 'd0000000-0000-0000-0000-0000000000a1';

select t_espera(t_val($q$ select string_agg(nombre, ',' order by nombre) from eventos_financieros $q$),
  'Cena del club,Rifa anual', 'manager H (hockey): solo ve las recaudaciones globales');

select t_espera(t_res($q$ select crear_evento_financiero('Tercer tiempo hockey', 'tercer_tiempo', null,
  array['d0000000-0000-0000-0000-0000000000a1']::uuid[]) $q$),
  'filas:1', 'manager H: crea tercer tiempo de su disciplina');

select t_espera(t_res($q$ select crear_evento_financiero('Tercer tiempo rugby', 'tercer_tiempo', null,
  array['d0000000-0000-0000-0000-000000000001']::uuid[]) $q$),
  'rechazado', 'manager H: no crea en una division de rugby');

-- ═════════════════════════════════════════════════════════════════════════════
-- Coordinador de D1
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'coordinador';
set local test.uid = 'a0000000-0000-0000-0000-00000000000f';
set local test.divs = 'd0000000-0000-0000-0000-000000000001';

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where nombre in ('Viaje MdP', 'Rifa app vieja') $q$),
  '2', 'coordinador: ve los eventos que incluyen su division');

select t_espera(t_val($q$ select count(*)::text from eventos_financieros where nombre = 'Rifa juveniles' $q$),
  '0', 'coordinador: no ve una recaudacion de otras divisiones');

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
