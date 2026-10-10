-- Pruebas de escenario para la migración 20261019000000_subcomision_eventos_propios
-- (la Subcomisión sólo ve sus recaudaciones de su disciplina, registra quién
-- paga y sus egresos; los managers siguen igual).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name egresos-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec egresos-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase egresos-pg:/work
--   docker exec egresos-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/subcomision_eventos_propios.sql
--   docker rm -f egresos-pg
--
-- Mismas convenciones que eventos_financieros_multi_division.sql. La disciplina
-- de la subcomisión sale de test.deportes (stub de tiene_acceso_deporte) y la del
-- creador de un evento global de profiles.deporte (columna real del proyecto).

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
create table profiles   (id uuid primary key, nombre text not null, divisiones uuid[], deporte text);
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
  forma_de_pago         text,
  fecha_pago            date,
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

create policy "eventos_financieros_insert_subcomision"
  on eventos_financieros for insert to authenticated
  with check (
    (select get_rol()) = 'subcomision'
    and (
      eventos_financieros.division_id is null
      or (select tiene_acceso_deporte((select deporte from divisiones where id = eventos_financieros.division_id)))
    )
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

create policy "eventos_financieros_delete_subcomision"
  on eventos_financieros for delete to authenticated
  using (
    (select get_rol()) = 'subcomision'
    and (
      eventos_financieros.division_id is null
      or (select tiene_acceso_deporte((select deporte from divisiones where id = eventos_financieros.division_id)))
    )
  );

create policy "eventos_financieros_select_admin" on eventos_financieros
  for select to authenticated using ((select get_rol()) = 'admin');

create policy "cobranzas_select_subcomision"
  on cobranzas for select to authenticated
  using (
    (select get_rol()) = 'subcomision'
    and (select tiene_acceso_deporte((
      select d.deporte from jugadores j join divisiones d on d.id = j.division_id
      where j.id = cobranzas.jugador_id
    )))
  );

create policy "cobranzas_delete_subcomision"
  on cobranzas for delete to authenticated
  using (
    (select get_rol()) = 'subcomision'
    and (select tiene_acceso_deporte((
      select d.deporte from jugadores j join divisiones d on d.id = j.division_id
      where j.id = cobranzas.jugador_id
    )))
  );

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

grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Rugby: D1 (M15), D2 (M16). Hockey: H1.
-- Manager A: D1. Manager H: H1. S: subcomisión de rugby. SH: subcomisión de hockey.

insert into divisiones (id, nombre, deporte) values
  ('d0000000-0000-0000-0000-000000000001', 'M15', 'rugby'),
  ('d0000000-0000-0000-0000-000000000002', 'M16', 'rugby'),
  ('d0000000-0000-0000-0000-0000000000a1', 'Hockey Primera', 'hockey');

insert into profiles values
  ('a0000000-0000-0000-0000-00000000000a', 'Manager A', '{d0000000-0000-0000-0000-000000000001}', null),
  ('a0000000-0000-0000-0000-00000000000d', 'Manager H', '{d0000000-0000-0000-0000-0000000000a1}', null),
  ('a0000000-0000-0000-0000-00000000000e', 'Subcomision rugby', null, 'rugby'),
  ('a0000000-0000-0000-0000-0000000000e2', 'Subcomision hockey', null, 'hockey');

insert into jugadores values
  ('b0000000-0000-0000-0000-000000000001', 'Jugador M15', 'd0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000002', 'Jugador M16', 'd0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-0000000000a1', 'Jugadora H',  'd0000000-0000-0000-0000-0000000000a1', true);

-- ─── Migraciones ──────────────────────────────────────────────────────────────

\ir ../migrations/20261015000000_eventos_financieros_manager.sql
\ir ../migrations/20261016000000_eventos_financieros_multi_division.sql
\ir ../migrations/20261017000000_egresos_evento.sql
\ir ../migrations/20261018000000_egresos_evento_resumen.sql

-- Migración bajo prueba. Si todavía no existe, el \ir aborta el script (RED).
\ir ../migrations/20261019000000_subcomision_eventos_propios.sql

-- Eventos (superusuario):
--   e..01: recaudación activa de M15 (subco rugby)   e..02: recaudación cerrada de M15
--   e..03: recaudación global de la subco rugby      e..04: recaudación de hockey (subco hockey)
--   e..05: viaje de M15 creado por el Manager A
insert into eventos_financieros (id, tipo, nombre, division_id, creado_por, estado) values
  ('e0000000-0000-0000-0000-000000000001', 'recaudacion', 'Pizzas M15',     'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e', 'activo'),
  ('e0000000-0000-0000-0000-000000000002', 'recaudacion', 'Pizzas cerrado', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e', 'cerrado'),
  ('e0000000-0000-0000-0000-000000000003', 'recaudacion', 'Cena rugby',     null,                                   'a0000000-0000-0000-0000-00000000000e', 'activo'),
  ('e0000000-0000-0000-0000-000000000004', 'recaudacion', 'Pizzas hockey',  'd0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000e2', 'activo'),
  ('e0000000-0000-0000-0000-000000000005', 'viaje',       'Viaje MdP',      'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'activo');

insert into cobranzas (evento_financiero_id, jugador_id, estado, monto, registrado_por) values
  ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'pagado', 2000, 'a0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-0000000000a1', 'pagado',  900, 'a0000000-0000-0000-0000-0000000000e2');

insert into egresos_evento (evento_financiero_id, concepto, monto) values
  ('e0000000-0000-0000-0000-000000000005', 'Micro', 1000),
  ('e0000000-0000-0000-0000-000000000004', 'Harina', 100);

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

grant execute on function t_res(text), t_val(text), t_espera(text, text, text), t_resumen(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Subcomisión de rugby
-- ═════════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local test.rol = 'subcomision';
set local test.uid = 'a0000000-0000-0000-0000-00000000000e';
set local test.divs = '';
set local test.deportes = 'rugby';

select t_espera(t_val($q$ select string_agg(nombre, ',' order by nombre) from eventos_financieros $q$),
  'Cena rugby,Pizzas cerrado,Pizzas M15', 'subco rugby: ve sólo sus recaudaciones (ni el viaje del manager ni hockey)');

select t_espera(t_val($q$ select count(*)::text from cobranzas $q$),
  '0', 'subco rugby: no ve las cobranzas del viaje del manager');

select t_espera(t_val($q$ select count(*)::text from egresos_evento $q$),
  '0', 'subco rugby: no ve egresos del viaje del manager ni de hockey');

-- Cobros
select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, estado, registrado_por)
  values ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'pendiente',
          'a0000000-0000-0000-0000-00000000000e') $q$),
  'filas:1', 'subco rugby: registra la cobranza de un jugador de la division del evento');

select t_espera(t_res($q$ update cobranzas set estado = 'pagado', monto = 500, forma_de_pago = 'efectivo'
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000001'
    and jugador_id = 'b0000000-0000-0000-0000-000000000001' $q$),
  'filas:1', 'subco rugby: marca pagado con monto');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-00000000000e') $q$),
  'rechazado', 'subco rugby: no cobra a un jugador fuera de las divisiones del evento');

select t_espera(t_res($q$ update cobranzas set jugador_id = 'b0000000-0000-0000-0000-000000000002'
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000001' $q$),
  'rechazado', 'subco rugby: no mueve la cobranza a un jugador fuera del evento');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-00000000000e') $q$),
  'rechazado', 'subco rugby: no cobra en una recaudacion cerrada');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-0000000000e2') $q$),
  'rechazado', 'subco rugby: no registra a nombre de otro usuario');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-00000000000e') $q$),
  'filas:1', 'subco rugby: en su recaudacion global cobra a un jugador de rugby');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000a1',
          'a0000000-0000-0000-0000-00000000000e') $q$),
  'rechazado', 'subco rugby: en su recaudacion global no cobra a una jugadora de hockey');

select t_espera(t_res($q$ update cobranzas set monto = 1
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000005' $q$),
  'filas:0', 'subco rugby: no toca cobranzas del viaje del manager');

select t_espera(t_res($q$ delete from cobranzas
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000005' $q$),
  'filas:0', 'subco rugby: no borra cobranzas del viaje del manager');

-- Egresos
select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000001', 'Muzzarella', 120) $q$),
  'filas:1', 'subco rugby: carga un egreso en su recaudacion activa');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000001', 'Cajas', 30) $q$),
  'filas:1', 'subco rugby: carga un segundo egreso');

select t_espera(t_res($q$ delete from egresos_evento where concepto = 'Cajas' $q$),
  'filas:1', 'subco rugby: borra un egreso de su recaudacion activa');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000002', 'Tarde', 10) $q$),
  'rechazado', 'subco rugby: no carga egresos en una recaudacion cerrada');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000005', 'Colado', 10) $q$),
  'rechazado', 'subco rugby: no carga egresos en el viaje del manager');

select t_espera(t_res($q$ delete from egresos_evento where concepto = 'Micro' $q$),
  'filas:0', 'subco rugby: no borra egresos del viaje del manager');

-- Resumen
select t_espera(t_resumen('e0000000-0000-0000-0000-000000000001'),
  '500.00|120.00', 'subco rugby: resumen de su recaudacion');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000005'),
  'sin filas', 'subco rugby: sin resumen del viaje del manager');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000004'),
  'sin filas', 'subco rugby: sin resumen de una recaudacion de hockey');

-- Cierre
select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000005' $q$),
  'filas:0', 'subco rugby: no cierra el viaje del manager');

select t_espera(t_res($q$ update eventos_financieros set estado = 'cerrado'
  where id = 'e0000000-0000-0000-0000-000000000001' $q$),
  'filas:1', 'subco rugby: cierra su recaudacion');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000001', 'Post cierre', 10) $q$),
  'rechazado', 'subco rugby: tras cerrar no carga egresos');

select t_espera(t_res($q$ update cobranzas set monto = 600
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000001' $q$),
  'filas:0', 'subco rugby: tras cerrar no edita cobranzas');

select t_espera(t_val($q$ select count(*)::text from cobranzas
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000001' $q$),
  '1', 'subco rugby: las cobranzas del evento cerrado siguen visibles');

select t_espera(t_res($q$ delete from eventos_financieros where id = 'e0000000-0000-0000-0000-000000000005' $q$),
  'filas:0', 'subco rugby: no borra el viaje del manager');

-- ═════════════════════════════════════════════════════════════════════════════
-- Subcomisión de hockey
-- ═════════════════════════════════════════════════════════════════════════════

set local test.uid = 'a0000000-0000-0000-0000-0000000000e2';
set local test.deportes = 'hockey';

select t_espera(t_val($q$ select string_agg(nombre, ',' order by nombre) from eventos_financieros $q$),
  'Pizzas hockey', 'subco hockey: no ve nada de rugby (ni la recaudacion global de rugby)');

select t_espera(t_val($q$ select count(*)::text from cobranzas $q$),
  '1', 'subco hockey: sólo ve la cobranza de su recaudacion');

select t_espera(t_val($q$ select string_agg(concepto, ',') from egresos_evento $q$),
  'Harina', 'subco hockey: sólo ve los egresos de su recaudacion');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000003', 'Colada', 10) $q$),
  'rechazado', 'subco hockey: no carga egresos en la recaudacion global de rugby');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000004'),
  '900.00|100.00', 'subco hockey: resumen de su recaudacion');

-- ═════════════════════════════════════════════════════════════════════════════
-- Manager A (D1): flujos sin cambios
-- ═════════════════════════════════════════════════════════════════════════════

set local test.rol = 'manager';
set local test.uid = 'a0000000-0000-0000-0000-00000000000a';
set local test.divs = 'd0000000-0000-0000-0000-000000000001';
set local test.deportes = '';

select t_espera(t_val($q$ select string_agg(nombre, ',' order by nombre) from eventos_financieros $q$),
  'Cena rugby,Pizzas cerrado,Pizzas M15,Viaje MdP', 'manager A: ve su viaje, las recaudaciones de D1 y la global');

select t_espera(t_res($q$ insert into cobranzas (evento_financiero_id, jugador_id, registrado_por)
  values ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-00000000000a') $q$),
  'filas:1', 'manager A: sigue cobrando en una recaudacion que toca su division');

select t_espera(t_res($q$ update cobranzas set monto = 2500
  where evento_financiero_id = 'e0000000-0000-0000-0000-000000000005' $q$),
  'filas:1', 'manager A: sigue editando cobranzas de su viaje');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000005', 'Peajes', 300) $q$),
  'filas:1', 'manager A: sigue cargando egresos en su viaje');

select t_espera(t_res($q$ insert into egresos_evento (evento_financiero_id, concepto, monto)
  values ('e0000000-0000-0000-0000-000000000003', 'Colado', 10) $q$),
  'rechazado', 'manager A: no carga egresos en una recaudacion');

select t_espera(t_resumen('e0000000-0000-0000-0000-000000000005'),
  '2500.00|1300.00', 'manager A: resumen de su viaje');

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
