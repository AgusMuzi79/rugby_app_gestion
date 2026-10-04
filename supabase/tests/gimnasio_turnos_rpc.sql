-- Pruebas de escenario para la migración 20261005000000_gimnasio_turnos.
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name gim-turnos-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker cp supabase gim-turnos-pg:/work
--   docker exec gim-turnos-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/gimnasio_turnos_rpc.sql
--   docker rm -f gim-turnos-pg
--
-- El script crea stubs mínimos de lo que la migración necesita (roles, get_rol,
-- set_updated_at, socios, categorias_socio, servicios_opcionales, socio_servicios), carga la
-- migración con \ir (ruta relativa a este archivo) y verifica con RAISE EXCEPTION.
-- Todo corre dentro de una transacción que termina en ROLLBACK.
--
-- "Ahora" se fija en lunes 2026-10-05 10:00 (hora local) redefiniendo gimnasio_ahora().

\set ON_ERROR_STOP on

begin;

-- ─── Stubs de lo que existe en el proyecto real ───────────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- get_rol real lee profiles por auth.uid(); acá el rol sale de un GUC de la sesión.
create or replace function get_rol() returns text language sql stable as $$
  select nullif(current_setting('test.rol', true), '')
$$;

create table categorias_socio (id uuid primary key, nombre text not null);
create table socios (
  id uuid primary key, profile_id uuid, numero_socio text, dni text,
  estado text not null default 'activo', categoria_id uuid references categorias_socio(id)
);
create table servicios_opcionales (
  id uuid primary key default gen_random_uuid(), nombre text not null, activo boolean not null default true
);
create table socio_servicios (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references socios(id) on delete cascade,
  servicio_id uuid not null references servicios_opcionales(id) on delete cascade,
  unique (socio_id, servicio_id)
);

-- Supabase da estos privilegios por default privileges en public; RLS decide el resto.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

insert into categorias_socio values
  ('c0000000-0000-0000-0000-000000000001', 'Socio Activo'),
  ('c0000000-0000-0000-0000-000000000002', 'Cliente Gimnasio');

insert into servicios_opcionales (id, nombre) values
  ('50000000-0000-0000-0000-000000000001', 'Gimnasio'),
  ('50000000-0000-0000-0000-000000000002', 'Gimnasio Menor'),
  ('50000000-0000-0000-0000-000000000003', 'Rugby');

-- Socios: s01..s08 con Gimnasio (tope 3), s09 Gimnasio Menor (sin fila de límite),
-- s10 Cliente Gimnasio (categoría), s11 Gimnasio + Gimnasio Menor, s12 sin servicios.
insert into socios (id, numero_socio, dni, categoria_id)
select ('50c10000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'N' || n, 'D' || n,
       case when n = 10 then 'c0000000-0000-0000-0000-000000000002'::uuid
            else 'c0000000-0000-0000-0000-000000000001'::uuid end
from generate_series(1, 12) n;

insert into socio_servicios (socio_id, servicio_id)
select ('50c10000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '50000000-0000-0000-0000-000000000001'::uuid
from generate_series(1, 8) n;
insert into socio_servicios values
  (gen_random_uuid(), '50c10000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000002'),
  (gen_random_uuid(), '50c10000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '50c10000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000002'),
  (gen_random_uuid(), '50c10000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000003');

-- ─── Migración bajo prueba ────────────────────────────────────────────────────

\ir ../migrations/20261005000000_gimnasio_turnos.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create or replace function gimnasio_ahora() returns timestamp language sql stable as $$
  select timestamp '2026-10-05 10:00:00'
$$;

-- Ids cortos: socio(n) y franja(n).
create function pg_temp.so(n int) returns uuid language sql as $$
  select ('50c10000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.fr(n int) returns uuid language sql as $$
  select ('f0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- Reserva y devuelve el codigo ('ok' si salió bien).
create function pg_temp.res(p_socio int, p_franja int, p_fecha date, p_origen text default 'socio')
returns text language sql as $$
  select coalesce(r->>'codigo', 'ok')
  from (select gimnasio_reservar(pg_temp.so(p_socio), pg_temp.fr(p_franja), p_fecha, p_origen) as r) x
$$;

create function pg_temp.espera(p_real text, p_esperado text, p_msg text) returns void language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLO [%]: esperado %, obtenido %', p_msg, p_esperado, p_real;
  end if;
  raise notice 'ok   - %', p_msg;
end $$;

-- ─── Seeds ────────────────────────────────────────────────────────────────────

select pg_temp.espera((select count(*)::text from gimnasio_config), '1', 'seed: una fila de config');
select pg_temp.espera((select count(*)::text from gimnasio_franjas), '0', 'seed: sin franjas');
select pg_temp.espera(
  (select dias_por_semana::text from gimnasio_limites where servicio_id = '50000000-0000-0000-0000-000000000001'),
  '3', 'seed: Gimnasio = 3 dias');

-- Config determinística para las pruebas.
update gimnasio_config set pct_cupo_fijos = 50, anticipacion_dias = 7;

-- ─── Constraints ──────────────────────────────────────────────────────────────

do $$
declare
  v_ok boolean;
begin
  -- Cada sentencia debe fallar con check_violation (23514) o unique_violation (23505).
  begin insert into gimnasio_config (id) values (2); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: config permite una segunda fila'; end if;

  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (8, '10:00', '11:00', 5); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: dia_semana 8 aceptado'; end if;

  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (1, '11:00', '10:00', 5); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: hora_desde >= hora_hasta aceptado'; end if;

  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (1, '10:00', '11:00', 0); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: cupo 0 aceptado'; end if;

  begin insert into gimnasio_limites (dias_por_semana) values (2); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: limite sin servicio ni categoria aceptado'; end if;

  begin insert into gimnasio_limites (servicio_id, categoria_nombre, dias_por_semana)
        values ('50000000-0000-0000-0000-000000000003', 'X', 2); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: limite con servicio y categoria aceptado'; end if;

  begin insert into gimnasio_franjas_excepciones (fecha, cerrado) values ('2026-12-25', false); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: excepcion abierta sin cupo_override aceptada'; end if;

  raise notice 'ok   - constraints (config unica, dia 1..7, horas, cupo>0, limites, excepciones)';
end $$;

-- ─── Franjas de prueba ────────────────────────────────────────────────────────
-- Hoy es lunes 2026-10-05 10:00. Semana ISO: 10-05 (lun) .. 10-11 (dom).

insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo) values
  (pg_temp.fr(1),  2, '18:00', '19:00', 4),   -- martes 10-06, cupo 4 (fijos max = 2)
  (pg_temp.fr(2),  1, '19:00', '20:00', 10),  -- lunes 10-12 (cerrada por excepcion)
  (pg_temp.fr(3),  3, '18:00', '19:00', 10),  -- miercoles 10-07 (cupo override 1)
  (pg_temp.fr(4),  6, '09:00', '10:00', 10),  -- sabado 10-10 (cierre general)
  (pg_temp.fr(5),  1, '09:00', '10:00', 10),  -- lunes hoy 09:00: ya paso
  (pg_temp.fr(6),  1, '10:00', '11:00', 10),  -- lunes hoy 10:00: empieza justo ahora = pasado
  (pg_temp.fr(7),  1, '11:00', '12:00', 10),  -- lunes hoy 11:00: aun no empezo
  (pg_temp.fr(8),  4, '17:00', '18:00', 10),  -- jueves 10-08
  (pg_temp.fr(9),  5, '17:00', '18:00', 10),  -- viernes 10-09
  (pg_temp.fr(10), 7, '10:00', '11:00', 10),  -- domingo 10-11
  (pg_temp.fr(11), 4, '18:00', '19:00', 10);  -- jueves 10-08 (segunda franja del mismo dia)
insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo, activa)
values (pg_temp.fr(12), 2, '07:00', '08:00', 10, false);

-- ─── Validaciones basicas ─────────────────────────────────────────────────────

select pg_temp.espera(pg_temp.res(1, 1, '2026-10-06', 'otro'), 'origen_invalido', 'origen invalido');
select pg_temp.espera(
  (select coalesce(gimnasio_reservar(null, pg_temp.fr(1), '2026-10-06', 'socio')->>'codigo', 'ok')),
  'parametros', 'parametros nulos');
select pg_temp.espera(
  (select coalesce(gimnasio_reservar(gen_random_uuid(), pg_temp.fr(1), '2026-10-06', 'socio')->>'codigo', 'ok')),
  'socio_inexistente', 'socio inexistente');
select pg_temp.espera(
  (select coalesce(gimnasio_reservar(pg_temp.so(1), gen_random_uuid(), '2026-10-06', 'socio')->>'codigo', 'ok')),
  'franja_inexistente', 'franja inexistente');
select pg_temp.espera(pg_temp.res(1, 12, '2026-10-06'), 'franja_inactiva', 'franja inactiva');
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-07'), 'dia_invalido', 'fecha de otro dia de semana');

-- ─── Cupo, duplicados, cancelacion, split de fijos ────────────────────────────

select pg_temp.espera(pg_temp.res(1, 1, '2026-10-06'), 'ok', 'reserva suelta s1 (1/4)');
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-06'), 'duplicada', 'duplicada: mismo socio, franja y fecha');
select pg_temp.espera(pg_temp.res(2, 1, '2026-10-06', 'fijo'), 'ok', 'fijo s2 (2/4, fijos 1/2)');
select pg_temp.espera(pg_temp.res(3, 1, '2026-10-06', 'fijo'), 'ok', 'fijo s3 (3/4, fijos 2/2)');
select pg_temp.espera(pg_temp.res(4, 1, '2026-10-06', 'fijo'), 'cupo_fijos_lleno', 'fijo s4 supera floor(4*50%)=2');
select pg_temp.espera(pg_temp.res(4, 1, '2026-10-06', 'socio'), 'ok', 'suelta s4 usa el resto (4/4)');
select pg_temp.espera(pg_temp.res(5, 1, '2026-10-06', 'socio'), 'cupo_lleno', 'suelta s5 con cupo lleno');
select pg_temp.espera(pg_temp.res(5, 1, '2026-10-06', 'encargado'), 'cupo_lleno', 'el encargado tampoco sobrepasa el cupo');

update gimnasio_reservas set estado = 'cancelada'
 where socio_id = pg_temp.so(1) and franja_id = pg_temp.fr(1) and fecha = '2026-10-06';
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-06'), 'ok', 'tras cancelar, s1 puede volver a reservar (indice parcial)');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(1) and franja_id = pg_temp.fr(1)),
  '2', 's1 tiene 2 filas (una cancelada, una viva)');
select pg_temp.espera(pg_temp.res(5, 1, '2026-10-06'), 'cupo_lleno', 'cupo lleno de nuevo (4/4)');

-- Un socio puede reservar otra franja el mismo dia y eso no suma un dia nuevo al tope.
select pg_temp.espera(pg_temp.res(6, 8, '2026-10-08'), 'ok', 's6 jueves franja 8 (dia 1 de 3: jueves)');
select pg_temp.espera(pg_temp.res(6, 11, '2026-10-08'), 'ok', 's6 segunda franja el mismo jueves no suma dia');

-- ─── Excepciones ──────────────────────────────────────────────────────────────

insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado) values ('2026-10-12', pg_temp.fr(2), true);
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, cupo_override)
  values ('2026-10-07', pg_temp.fr(3), false, 1);
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, motivo) values ('2026-10-10', null, true, 'feriado');

select pg_temp.espera(pg_temp.res(1, 2, '2026-10-12'), 'cerrado', 'cerrado por excepcion de la franja');
select pg_temp.espera(pg_temp.res(1, 4, '2026-10-10'), 'cerrado', 'cerrado por excepcion general de la fecha');
select pg_temp.espera(pg_temp.res(1, 3, '2026-10-07'), 'ok', 'cupo_override 1: primera reserva ok');
select pg_temp.espera(pg_temp.res(2, 3, '2026-10-07'), 'cupo_lleno', 'cupo_override 1: segunda reserva rechazada');
select pg_temp.espera(
  (select capacidad::text from gimnasio_disponibilidad('2026-10-07', '2026-10-07') where franja_id = pg_temp.fr(3)),
  '1', 'disponibilidad refleja el cupo_override');

-- Excepcion especifica gana sobre la general: franja 4 abierta con cupo 2 el sabado cerrado en general.
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, cupo_override)
  values ('2026-10-10', pg_temp.fr(4), false, 2);
select pg_temp.espera(pg_temp.res(7, 4, '2026-10-10'), 'ok', 'excepcion especifica abierta gana a la general cerrada');
delete from gimnasio_franjas_excepciones where fecha = '2026-10-10' and franja_id = pg_temp.fr(4);
select pg_temp.espera(pg_temp.res(8, 4, '2026-10-10'), 'cerrado', 'sin la especifica vuelve a regir la general');

-- ─── Pasado y anticipacion ────────────────────────────────────────────────────

select pg_temp.espera(pg_temp.res(1, 5, '2026-10-05'), 'pasado', 'franja de hoy 09:00 ya paso');
select pg_temp.espera(pg_temp.res(1, 6, '2026-10-05'), 'pasado', 'franja que empieza justo ahora cuenta como empezada');
select pg_temp.espera(pg_temp.res(1, 5, '2026-09-28'), 'pasado', 'fecha anterior a hoy');
select pg_temp.espera(pg_temp.res(1, 7, '2026-10-05'), 'ok', 'franja de hoy 11:00 todavia no empezo');
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-13'), 'anticipacion', 'socio mas alla de anticipacion_dias (hoy+7)');
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-13', 'encargado'), 'ok', 'el encargado omite la anticipacion');
select pg_temp.espera(pg_temp.res(2, 1, '2026-10-13', 'fijo'), 'ok', 'origen fijo omite la anticipacion (materializacion de semanas)');
select pg_temp.espera(pg_temp.res(2, 1, '2026-10-12'), 'dia_invalido', 'lunes en franja de martes');

-- ─── Tope semanal ─────────────────────────────────────────────────────────────
-- s6 ya tiene el jueves 10-08. Semana 10-05..10-11, limite 3 dias distintos.

select pg_temp.espera(pg_temp.res(6, 7, '2026-10-05'), 'ok', 's6 lunes (2 dias distintos)');
select pg_temp.espera(pg_temp.res(6, 9, '2026-10-09'), 'ok', 's6 viernes (3 dias distintos)');
select pg_temp.espera(pg_temp.res(6, 10, '2026-10-11'), 'tope_semanal', 's6 domingo: 4to dia distinto bloqueado');
-- Reserva en semana ISO siguiente: no cuenta contra la semana anterior.
select pg_temp.espera(pg_temp.res(6, 7, '2026-10-12'), 'ok', 's6 lunes de la semana siguiente (otra semana ISO)');
-- Una reserva cancelada libera el dia.
update gimnasio_reservas set estado = 'cancelada'
 where socio_id = pg_temp.so(6) and fecha = '2026-10-09';
select pg_temp.espera(pg_temp.res(6, 10, '2026-10-11'), 'ok', 's6: cancelado el viernes, el domingo entra');
select pg_temp.espera(
  (select (gimnasio_limite_socio(pg_temp.so(6)))::text), '3', 'limite de s6 = 3');

-- ─── Ilimitado y resolucion de limites ────────────────────────────────────────

select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(9)) is null)::text, 'true',
  'Gimnasio Menor sin fila de limite = ilimitado');
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(10)) is null)::text, 'true',
  'Cliente Gimnasio sin fila de limite = ilimitado');
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(12)) is null)::text, 'true',
  'sin servicios de gimnasio = null (sin fuentes)');
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(11)) is null)::text, 'true',
  's11 (Gimnasio=3 + Menor sin fila): el ilimitado gana');

-- s9 (ilimitado) reserva 4 dias distintos de la semana: lun, jue, vie, dom.
select pg_temp.espera(pg_temp.res(9, 7, '2026-10-05'), 'ok', 's9 ilimitado: lunes');
select pg_temp.espera(pg_temp.res(9, 8, '2026-10-08'), 'ok', 's9 ilimitado: jueves');
select pg_temp.espera(pg_temp.res(9, 9, '2026-10-09'), 'ok', 's9 ilimitado: viernes');
select pg_temp.espera(pg_temp.res(9, 10, '2026-10-11'), 'ok', 's9 ilimitado: domingo (4 dias)');

-- Mas permisivo: Gimnasio=3 y Menor=2 -> 3; Menor con fila null -> ilimitado.
insert into gimnasio_limites (servicio_id, dias_por_semana)
  values ('50000000-0000-0000-0000-000000000002', 2);
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(11)))::text, '3', 's11: max(3, 2) = 3');
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(9)))::text, '2', 's9: solo Menor = 2');
update gimnasio_limites set dias_por_semana = null where servicio_id = '50000000-0000-0000-0000-000000000002';
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(11)) is null)::text, 'true',
  's11: Menor con fila null = ilimitado gana');

-- Cliente Gimnasio por categoria: fila con tope 1.
insert into gimnasio_limites (categoria_nombre, dias_por_semana) values ('Cliente Gimnasio', 1);
select pg_temp.espera((select gimnasio_limite_socio(pg_temp.so(10)))::text, '1', 's10: limite por categoria = 1');
select pg_temp.espera(pg_temp.res(10, 7, '2026-10-05'), 'ok', 's10 primer dia ok');
select pg_temp.espera(pg_temp.res(10, 8, '2026-10-08'), 'tope_semanal', 's10 segundo dia bloqueado por tope de categoria');
select pg_temp.espera(pg_temp.res(10, 7, '2026-10-12'), 'ok', 's10 semana siguiente ok');

-- ─── Disponibilidad ───────────────────────────────────────────────────────────

select pg_temp.espera(
  (select capacidad || '/' || ocupados || '/' || ocupados_fijos || '/' || cerrado
     from gimnasio_disponibilidad('2026-10-06', '2026-10-06') where franja_id = pg_temp.fr(1)),
  '4/4/2/false', 'disponibilidad franja 1 (cap 4, ocupados 4, fijos 2, abierta)');
select pg_temp.espera(
  (select cerrado::text from gimnasio_disponibilidad('2026-10-12', '2026-10-12') where franja_id = pg_temp.fr(2)),
  'true', 'disponibilidad marca cerrado');
select pg_temp.espera(
  (select count(*)::text from gimnasio_disponibilidad('2026-10-06', '2026-10-06') where franja_id = pg_temp.fr(12)),
  '0', 'disponibilidad omite franjas inactivas');
select pg_temp.espera(
  (select max(fecha)::text from gimnasio_disponibilidad('2026-10-05', '2026-12-31')),
  '2026-11-04', 'rango acotado a 31 dias (desde + 30)');
select pg_temp.espera(
  (select count(*)::text from gimnasio_disponibilidad('2026-10-10', '2026-10-05')), '0', 'rango invertido = vacio');

-- ─── Permisos y RLS ───────────────────────────────────────────────────────────

set local role authenticated;
do $$
begin
  begin
    perform gimnasio_reservar('50c10000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '2026-10-06', 'socio');
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_reservar';
  exception when insufficient_privilege then null; end;
  begin
    perform * from gimnasio_disponibilidad('2026-10-06', '2026-10-06');
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_disponibilidad';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - authenticated no puede ejecutar las RPC';
end $$;

set local test.rol = 'socio';
do $$
begin
  if (select count(*) from gimnasio_franjas) <> 0 or (select count(*) from gimnasio_reservas) <> 0 then
    raise exception 'FALLO RLS: un socio ve franjas o reservas';
  end if;
  begin
    insert into gimnasio_reservas (socio_id, franja_id, fecha) values
      ('50c10000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '2026-10-06');
    raise exception 'FALLO RLS: un socio pudo insertar una reserva';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - RLS: socio no lee ni escribe';
end $$;

set local test.rol = 'porteria';
do $$
begin
  if (select count(*) from gimnasio_franjas) = 0 or (select count(*) from gimnasio_reservas) = 0 then
    raise exception 'FALLO RLS: porteria no ve franjas o reservas';
  end if;
  if (select count(*) from gimnasio_config) <> 1 or (select count(*) from gimnasio_limites) = 0 then
    raise exception 'FALLO RLS: porteria no ve config o limites';
  end if;
  begin
    update gimnasio_franjas set cupo = 99;
    -- Sin policy de UPDATE: RLS filtra todas las filas, no hay error pero tampoco cambios.
    if exists (select 1 from gimnasio_franjas where cupo = 99) then
      raise exception 'FALLO RLS: porteria modifico franjas';
    end if;
  end;
  raise notice 'ok   - RLS: porteria lee y no escribe';
end $$;
reset role;

-- service_role SI puede ejecutar la RPC.
set local role service_role;
select pg_temp.espera(pg_temp.res(12, 7, '2026-10-05'), 'ok', 'service_role ejecuta gimnasio_reservar (s12 sin servicios: sin tope)');
reset role;

rollback;

\echo 'TODAS LAS PRUEBAS PASARON'
