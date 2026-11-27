-- Pruebas de la migración 20261203000000_tenis_editar_bloques: la gestora edita un bloque
-- puntual (tipo, título, fecha, horario, cancha) con tenis_bloqueo_puntual_editar. Si el bloque
-- editado pisa reservas vivas, se cancelan y vuelven en la respuesta para avisar a los jugadores,
-- igual que al crear un bloqueo puntual.
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name tenis-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker exec tenis-pg pg_isready -U postgres   (repetir hasta "accepting connections")
--   docker cp supabase tenis-pg:/work
--   docker exec tenis-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/tenis_editar_bloques.sql
--   docker rm -f tenis-pg
--
-- Mismos stubs y utilidades que tenis_paridad.sql (copiados: cada archivo corre solo, dentro de
-- una transacción que termina en ROLLBACK). "Ahora": viernes 2026-11-20 10:00 hora argentina.
\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create extension if not exists unaccent;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table profiles (
  id         uuid primary key,
  rol        text not null,
  roles      text[],
  nombre     text not null default '',
  activo     boolean not null default true,
  deporte    text
);

create or replace function get_rol() returns text language sql security definer stable as $$
  select rol from profiles where id = auth.uid()
$$;

create table categorias_socio (id uuid primary key, nombre text not null);
create table socios (
  id            uuid primary key,
  profile_id    uuid references profiles(id),
  numero_socio  text,
  dni           text not null,
  estado        text not null default 'pendiente',
  categoria_id  uuid references categorias_socio(id),
  semaforo      text,
  nombre_padron text
);

create or replace function get_socio_id() returns uuid language sql security definer stable as $$
  select id from socios where profile_id = auth.uid()
$$;

create table servicios_opcionales (id uuid primary key, nombre text not null, activo boolean not null default true);
create table socio_servicios (
  socio_id    uuid references socios(id),
  servicio_id uuid references servicios_opcionales(id),
  primary key (socio_id, servicio_id)
);

-- Real (20261026000000_recordatorio_eventos).
create or replace function socio_habilitado_deporte(p_socio_id uuid, p_deporte text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from socio_servicios ss
    join servicios_opcionales so on so.id = ss.servicio_id
    where ss.socio_id = p_socio_id and so.activo and so.nombre ilike '%' || p_deporte || '%'
  ) or exists (
    select 1 from socios s
    join categorias_socio cs on cs.id = s.categoria_id
    where s.id = p_socio_id and cs.nombre ilike 'becado%' and cs.nombre ilike '%' || p_deporte || '%'
  )
$$;

create table accesos (
  id        uuid primary key default gen_random_uuid(),
  socio_id  uuid references socios(id),
  punto     text not null default 'gimnasio',
  semaforo  text,
  creado_en timestamptz not null default now()
);

create schema if not exists storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ─── Datos ────────────────────────────────────────────────────────────────────
-- Perfiles: p1..p7 socios, pg gestor (subcomisión tenis), pr subcomisión rugby,
-- pc canchero, pa admin.
-- Socios: S1 y S3 con Carnet Tenis; S2 y S4 sin carnet; S5 semáforo rojo;
-- S6 dado de baja; S7 Cliente Gimnasio.

insert into categorias_socio values
  ('c0000000-0000-0000-0000-000000000001', 'Socio Activo'),
  ('c0000000-0000-0000-0000-000000000002', 'Cliente Gimnasio');

insert into profiles (id, rol, roles, nombre, deporte) values
  ('a0000000-0000-0000-0000-000000000001', 'socio', '{socio}', 'Perfil Uno', null),
  ('a0000000-0000-0000-0000-000000000002', 'socio', '{socio}', 'Perfil Dos', null),
  ('a0000000-0000-0000-0000-000000000003', 'socio', '{socio}', 'Perfil Tres', null),
  ('a0000000-0000-0000-0000-000000000004', 'socio', '{socio}', 'Perfil Cuatro', null),
  ('a0000000-0000-0000-0000-000000000005', 'socio', '{socio}', 'Perfil Cinco', null),
  ('a0000000-0000-0000-0000-000000000006', 'socio', '{socio}', 'Perfil Seis', null),
  ('a0000000-0000-0000-0000-000000000007', 'cliente_gimnasio', '{cliente_gimnasio}', 'Perfil Siete', null),
  ('a0000000-0000-0000-0000-0000000000a1', 'subcomision', '{subcomision,socio}', 'Gestora Tenis', 'tenis'),
  ('a0000000-0000-0000-0000-0000000000a2', 'subcomision', '{subcomision}', 'Subco Rugby', 'rugby'),
  ('a0000000-0000-0000-0000-0000000000a3', 'canchero', '{canchero}', 'Canchero', null),
  ('a0000000-0000-0000-0000-0000000000a4', 'admin', '{admin}', 'Admin', null);

insert into socios (id, profile_id, numero_socio, dni, estado, categoria_id, semaforo, nombre_padron) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '1001', '20.111.001', 'pendiente', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Pérez Juan'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '1002', '20111002', 'activo', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Gómez Ana'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '1003', '20111003', 'activo', 'c0000000-0000-0000-0000-000000000001', 'amarillo', 'López Tomás'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', '1004', '20111004', 'activo', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Díaz Sofía'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', '1005', '20111005', 'activo', 'c0000000-0000-0000-0000-000000000001', 'rojo', 'Ruiz Pablo'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', '1006', '20111006', 'inactivo', 'c0000000-0000-0000-0000-000000000001', 'verde', 'Sosa Laura'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000007', '1007', '20111007', 'activo', 'c0000000-0000-0000-0000-000000000002', 'verde', 'Vera Marta');

insert into servicios_opcionales values
  ('d0000000-0000-0000-0000-000000000001', 'Tenis Carnet', true),
  ('d0000000-0000-0000-0000-000000000002', 'Gimnasio', true);
insert into socio_servicios values
  ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002');

-- ─── Migraciones bajo prueba ──────────────────────────────────────────────────

\ir ../migrations/20261112000000_reservas_tenis.sql
\ir ../migrations/20261125000000_tenis_aviso_jugadores.sql
\ir ../migrations/20261126000000_tenis_editar_reserva.sql
\ir ../migrations/20261127000000_tenis_detalles_edicion.sql
-- Un horario general distinto del de siempre, para ver que lunes a viernes lo heredan.
update tenis_config set hora_desde = '07:30', hora_hasta = '21:00';
\ir ../migrations/20261128000000_tenis_paridad_ondepor.sql

-- Semilla de tenis_horarios: lunes a viernes = tenis_config; sábado y domingo con horario propio.
do $$ begin
  if (select string_agg(dia_semana || ' ' || to_char(hora_desde, 'HH24:MI') || '-' || to_char(hora_hasta, 'HH24:MI'), ',' order by dia_semana)
        from tenis_horarios)
     is distinct from '1 07:30-21:00,2 07:30-21:00,3 07:30-21:00,4 07:30-21:00,5 07:30-21:00,6 09:00-22:00,7 10:00-17:00' then
    raise exception 'FALLO [semilla de horarios]: %', (select string_agg(dia_semana || ' ' || hora_desde || '-' || hora_hasta, ',' order by dia_semana) from tenis_horarios);
  end if;
  raise notice 'ok   - semilla de horarios: lunes a viernes heredan tenis_config, sábado y domingo con horario propio';
end $$;
-- El resto de las pruebas usa el horario de siempre (08–22).
update tenis_config set hora_desde = '08:00', hora_hasta = '22:00';
update tenis_horarios set hora_desde = '08:00', hora_hasta = '22:00' where dia_semana between 1 and 5;
\ir ../migrations/20261203000000_tenis_editar_bloques.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create or replace function tenis_ahora() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('test.ahora', true), ''), '2026-11-20 10:00:00-03')::timestamptz
$$;

create function pg_temp.ahora(p text) returns void language sql as $$
  select set_config('test.ahora', p || '-03', false)
$$;
create function pg_temp.como(p text) returns void language sql as $$
  select set_config('test.uid', case p
    when 'p1' then 'a0000000-0000-0000-0000-000000000001'
    when 'p2' then 'a0000000-0000-0000-0000-000000000002'
    when 'p3' then 'a0000000-0000-0000-0000-000000000003'
    when 'p4' then 'a0000000-0000-0000-0000-000000000004'
    when 'p7' then 'a0000000-0000-0000-0000-000000000007'
    when 'gestor' then 'a0000000-0000-0000-0000-0000000000a1'
    when 'rugby' then 'a0000000-0000-0000-0000-0000000000a2'
    when 'canchero' then 'a0000000-0000-0000-0000-0000000000a3'
    when 'admin' then 'a0000000-0000-0000-0000-0000000000a4'
    else '' end, false)
$$;
-- socio n → uuid; cancha n → id; t('2026-11-21 18:00') → timestamptz local.
create function pg_temp.so(n int) returns uuid language sql as $$
  select ('b0000000-0000-0000-0000-00000000000' || n)::uuid
$$;
create function pg_temp.ca(n int) returns uuid language sql as $$
  select id from tenis_canchas where nombre = lpad(n::text, 2, '0')
$$;
create function pg_temp.t(p text) returns timestamptz language sql as $$
  select (p || '-03')::timestamptz
$$;
create function pg_temp.j(variadic p int[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('socio_id', pg_temp.so(n))) from unnest(p) n
$$;

-- Ejecuta y devuelve 'ok' o el mensaje de error (código estable).
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- Igual, pero con el DETAIL del error: '<código>|<detail>'.
create function pg_temp.err_detalle(p_sql text) returns text language plpgsql as $$
declare
  v_det text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_det = pg_exception_detail;
  return sqlerrm || '|' || coalesce(v_det, '');
end $$;

create function pg_temp.espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLO [%]: esperado %, obtenido %', p_msg, p_esperado, p_real;
  end if;
  raise notice 'ok   - %', p_msg;
end $$;

create temp table t_ids (k text primary key, id uuid);
create function pg_temp.guardar(k text, r jsonb) returns jsonb language sql as $$
  insert into t_ids values (k, (r->>'reserva_id')::uuid) on conflict (k) do update set id = excluded.id;
  select r;
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from t_ids where t_ids.k = $1 $$;
create function pg_temp.estado(k text) returns text language sql as $$
  select estado from tenis_reservas where id = pg_temp.id(k)
$$;
-- cargo/motivo de un jugador (socio n o invitado por dni) en una reserva.
create function pg_temp.cargo(k text, p_socio int) returns text language sql as $$
  select cargo || '/' || motivo_cargo from tenis_reserva_jugadores
  where reserva_id = pg_temp.id(k) and socio_id = pg_temp.so(p_socio)
$$;
-- Turno de una reserva: 'cancha HH:MM dd/mm modalidad', en hora local.
create function pg_temp.turno(k text) returns text language sql as $$
  select c.nombre || ' ' || to_char(tenis_local(r.inicio), 'HH24:MI DD/MM') || ' ' || r.modalidad
  from tenis_reservas r join tenis_canchas c on c.id = r.cancha_id where r.id = pg_temp.id(k)
$$;
create function pg_temp.njug(k text) returns text language sql as $$
  select count(*)::text from tenis_reserva_jugadores where reserva_id = pg_temp.id(k)
$$;

create temp table t_bloques (k text primary key, id uuid);
create function pg_temp.bloque(k text) returns uuid language sql as $$ select id from t_bloques where t_bloques.k = $1 $$;
-- Bloque como texto: 'cancha fecha HH:MM-HH:MM tipo titulo' ('*' = todas las canchas).
create function pg_temp.desc_bloque(k text) returns text language sql as $$
  select coalesce(c.nombre, '*') || ' ' || b.fecha || ' ' || to_char(b.hora_desde, 'HH24:MI') || '-'
         || to_char(b.hora_hasta, 'HH24:MI') || ' ' || b.tipo || ' ' || b.titulo
  from tenis_bloques b left join tenis_canchas c on c.id = b.cancha_id where b.id = pg_temp.bloque(k)
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Permisos
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera(
  has_function_privilege('anon', 'tenis_bloqueo_puntual_editar(uuid, uuid, timestamptz, timestamptz, text, text)', 'execute')::text
  || '/' || has_function_privilege('authenticated', 'tenis_bloqueo_puntual_editar(uuid, uuid, timestamptz, timestamptz, text, text)', 'execute')::text,
  'false/true', 'editar bloque puntual: authenticated sí (valida el rol adentro), anon no');

-- ═════════════════════════════════════════════════════════════════════════════
-- Datos: un bloque puntual y una reserva el sábado 21
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.como('gestor');
insert into t_bloques select 'puntual', (r->>'bloque_id')::uuid
  from tenis_bloqueo_puntual(pg_temp.ca(1), pg_temp.t('2026-11-21 15:00'), pg_temp.t('2026-11-21 16:00'),
                             'no_disponible', 'Lluvia') r;
insert into t_bloques values ('fijo', tenis_bloque_guardar(jsonb_build_object(
  'cancha_id', pg_temp.ca(3), 'tipo', 'clase', 'titulo', 'Academia', 'dia_semana', 1,
  'hora_desde', '18:00', 'hora_hasta', '20:00')));
select pg_temp.guardar('r1', tenis_reservar_staff(pg_temp.ca(1), pg_temp.t('2026-11-21 17:00'), 'singles',
  pg_temp.j(3), '{"socio_id":"b0000000-0000-0000-0000-000000000002"}'));
select pg_temp.guardar('r2', tenis_reservar_staff(pg_temp.ca(2), pg_temp.t('2026-11-21 17:00'), 'singles',
  pg_temp.j(4), '{"socio_id":"b0000000-0000-0000-0000-000000000001"}'));
select pg_temp.espera(pg_temp.estado('r1') || '/' || pg_temp.estado('r2'), 'confirmada/confirmada', 'reservas de prueba');

-- ═════════════════════════════════════════════════════════════════════════════
-- Editar sin pisar reservas
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera(
  (select jsonb_array_length(r->'reservas_canceladas') || '/' || jsonb_array_length(r->'reservas') || '/'
          || ((r->>'bloque_id')::uuid = pg_temp.bloque('puntual'))::text
     from tenis_bloqueo_puntual_editar(pg_temp.bloque('puntual'), pg_temp.ca(1), pg_temp.t('2026-11-21 15:00'),
                                       pg_temp.t('2026-11-21 16:00'), 'torneo', 'Torneo interno') r),
  '0/0/true', 'editar tipo y título: mismo bloque, no cancela nada');
select pg_temp.espera(pg_temp.desc_bloque('puntual'), '01 2026-11-21 15:00-16:00 torneo Torneo interno',
  'el bloque quedó con el tipo y el título nuevos');
select pg_temp.espera((select count(*)::text from tenis_bloques where fecha = '2026-11-21'), '1',
  'editar no crea otro bloque');
select pg_temp.espera((select string_agg(i->>'tipo' || ':' || (i->>'titulo'), ',') from jsonb_array_elements(
  tenis_grilla('2026-11-21')->'items') i where i->>'bloque_id' = pg_temp.bloque('puntual')::text),
  'torneo:Torneo interno', 'la grilla muestra el bloque editado');

-- ═════════════════════════════════════════════════════════════════════════════
-- Mover el horario encima de una reserva: se cancela y vuelve para avisar
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera(
  (select (r->'reservas_canceladas'->>0)::uuid = pg_temp.id('r1') and jsonb_array_length(r->'reservas_canceladas') = 1
          and (r->'reservas'->0->>'reserva_id')::uuid = pg_temp.id('r1')
     from tenis_bloqueo_puntual_editar(pg_temp.bloque('puntual'), pg_temp.ca(1), pg_temp.t('2026-11-21 16:30'),
                                       pg_temp.t('2026-11-21 18:00'), 'torneo', 'Torneo interno') r)::text,
  'true', 'mover el bloque encima de r1: la cancela y la devuelve con el aviso');
select pg_temp.espera(
  (select estado || '/' || cancelacion_motivo || '/' || (cancelada_por = 'a0000000-0000-0000-0000-0000000000a1')::text
     from tenis_reservas where id = pg_temp.id('r1')),
  'cancelada/Torneo interno/true', 'r1 cancelada con el título del bloque, por la gestora');
select pg_temp.espera(pg_temp.estado('r2'), 'confirmada', 'r2 (otra cancha) sigue confirmada');
select pg_temp.espera(pg_temp.desc_bloque('puntual'), '01 2026-11-21 16:30-18:00 torneo Torneo interno',
  'el bloque quedó en el horario nuevo');

-- Pasarlo a todas las canchas pisa r2.
select pg_temp.espera(
  (select string_agg(x, ',') from tenis_bloqueo_puntual_editar(pg_temp.bloque('puntual'), null,
     pg_temp.t('2026-11-21 16:30'), pg_temp.t('2026-11-21 18:00'), 'en_suspenso', 'Cancha en revisión') r,
     jsonb_array_elements_text(r->'reservas_canceladas') x),
  pg_temp.id('r2')::text, 'pasarlo a todas las canchas cancela r2 (r1 ya estaba cancelada)');
select pg_temp.espera(pg_temp.desc_bloque('puntual'), '* 2026-11-21 16:30-18:00 en_suspenso Cancha en revisión',
  'el bloque quedó en todas las canchas');

-- Cambiarlo de día.
select pg_temp.espera(
  (select jsonb_array_length(r->'reservas_canceladas')::text from tenis_bloqueo_puntual_editar(pg_temp.bloque('puntual'),
     pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'Escuelita') r),
  '0', 'cambiarlo de día');
select pg_temp.espera(pg_temp.desc_bloque('puntual'), '02 2026-11-22 10:00-11:00 clase Escuelita', 'el bloque quedó el domingo');

-- ═════════════════════════════════════════════════════════════════════════════
-- Rechazos
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'X')$$, pg_temp.bloque('fijo'))),
  'bloque_invalido', 'un bloque fijo no se edita por acá');
select pg_temp.espera(pg_temp.err($$select tenis_bloqueo_puntual_editar(gen_random_uuid(), null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'X')$$),
  'bloque_inexistente', 'bloque inexistente');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 11:00'), pg_temp.t('2026-11-22 10:00'), 'clase', 'X')$$, pg_temp.bloque('puntual'))),
  'bloque_invalido', 'horario invertido');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-23 11:00'), 'clase', 'X')$$, pg_temp.bloque('puntual'))),
  'bloque_invalido', 'más de un día');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'raro', 'X')$$, pg_temp.bloque('puntual'))),
  'bloque_invalido', 'tipo inválido');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, gen_random_uuid(),
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'X')$$, pg_temp.bloque('puntual'))),
  'cancha_inexistente', 'cancha inexistente');

select pg_temp.como('canchero');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'X')$$, pg_temp.bloque('puntual'))),
  'no_autorizado', 'el canchero no edita bloques');
select pg_temp.como('rugby');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'X')$$, pg_temp.bloque('puntual'))),
  'no_autorizado', 'subcomisión de otro deporte no edita bloques');
select pg_temp.como('p2');
select pg_temp.espera(pg_temp.err(format($$select tenis_bloqueo_puntual_editar(%L, null,
  pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:00'), 'clase', 'X')$$, pg_temp.bloque('puntual'))),
  'no_autorizado', 'un socio no edita bloques');
select pg_temp.espera(pg_temp.desc_bloque('puntual'), '02 2026-11-22 10:00-11:00 clase Escuelita',
  'los rechazos no tocaron el bloque');

select pg_temp.como('admin');
select pg_temp.espera(
  (select jsonb_array_length(r->'reservas_canceladas')::text from tenis_bloqueo_puntual_editar(pg_temp.bloque('puntual'),
     pg_temp.ca(2), pg_temp.t('2026-11-22 10:00'), pg_temp.t('2026-11-22 11:30'), 'clase', 'Escuelita') r),
  '0', 'admin también edita');

rollback;
