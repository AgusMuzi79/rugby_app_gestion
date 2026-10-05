-- Pruebas de escenario para las migraciones 20261005000000_gimnasio_turnos y
-- 20261006000000_gimnasio_franjas_profesor_import (profesor por franja + importación) y
-- 20261007000000_gimnasio_turnos_fijos_auto (materialización de fijos y proceso de faltas).
--
-- SQL plano para correr en un Postgres DESCARTABLE (nunca contra producción):
--   docker run --rm -d --name gim-turnos-pg -e POSTGRES_PASSWORD=x postgres:17
--   docker cp supabase gim-turnos-pg:/work
--   docker exec gim-turnos-pg psql -U postgres -v ON_ERROR_STOP=1 -f /work/tests/gimnasio_turnos_rpc.sql
--   docker rm -f gim-turnos-pg
--
-- El script crea stubs mínimos de lo que la migración necesita (roles, get_rol,
-- set_updated_at, socios, categorias_socio), carga la migración con \ir (ruta relativa a
-- este archivo) y verifica con RAISE EXCEPTION.
-- Todo corre dentro de una transacción que termina en ROLLBACK.
--
-- 'Ahora' se fija redefiniendo gimnasio_ahora(): por defecto lunes 2026-10-05 10:00 (hora
-- local) y, para las pruebas de fin de mes, el GUC `test.ahora` lo cambia en la sesión.

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

-- Supabase da estos privilegios por default privileges en public; RLS decide el resto.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

insert into categorias_socio values ('c0000000-0000-0000-0000-000000000001', 'Socio Activo');

-- Socios s01..s12: todos iguales (no hay tope semanal ni distinción por servicio).
insert into socios (id, numero_socio, dni, categoria_id)
select ('50c10000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'N' || n, 'D' || n,
       'c0000000-0000-0000-0000-000000000001'::uuid
from generate_series(1, 12) n;

-- ─── Migración bajo prueba ────────────────────────────────────────────────────

\ir ../migrations/20261005000000_gimnasio_turnos.sql
\ir ../migrations/20261006000000_gimnasio_franjas_profesor_import.sql
\ir ../migrations/20261007000000_gimnasio_turnos_fijos_auto.sql

-- ─── Utilidades de prueba ─────────────────────────────────────────────────────

create or replace function gimnasio_ahora() returns timestamp language sql stable as $$
  select coalesce(nullif(current_setting('test.ahora', true), ''), '2026-10-05 10:00:00')::timestamp
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

-- ─── Seeds y defaults ─────────────────────────────────────────────────────────

select pg_temp.espera((select count(*)::text from gimnasio_config), '1', 'seed: una fila de config');
select pg_temp.espera((select count(*)::text from gimnasio_franjas), '0', 'seed: sin franjas');
select pg_temp.espera(
  (select ventana_reserva || '/' || anticipacion_dias || '/' || pct_cupo_fijos || '/' || faltas_aviso || '/' ||
          faltas_baja || '/' || semanas_fijos || '/' || tolerancia_min || '/' || modo_cupos
     from gimnasio_config),
  'mes/7/70/2/3/4/15/informativo',
  'defaults de config: ventana mes, anticipacion 7, fijos 70, faltas 2/3, semanas 4, tolerancia 15, informativo');
select pg_temp.espera(
  (select count(*)::text from pg_tables where tablename = 'gimnasio_limites'), '0',
  'no existe la tabla gimnasio_limites (sin tope semanal)');
select pg_temp.espera(
  (select count(*)::text from pg_proc where proname = 'gimnasio_limite_socio'), '0',
  'no existe gimnasio_limite_socio');

-- Config determinística para las pruebas: modo 'dias' (la regla vieja) hasta la sección de mes.
update gimnasio_config set pct_cupo_fijos = 50, anticipacion_dias = 7, ventana_reserva = 'dias';

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

  begin insert into gimnasio_franjas_excepciones (fecha, cerrado) values ('2026-12-25', false); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: excepcion abierta sin cupo_override aceptada'; end if;

  raise notice 'ok   - constraints (config unica, dia 1..7, horas, cupo>0, excepciones)';
end $$;

-- Config: faltas_baja siempre mayor que faltas_aviso, ventana válida.
do $$
declare
  v_ok boolean;
begin
  begin update gimnasio_config set faltas_baja = 2; v_ok := true;   -- aviso = 2 -> baja debe ser > 2
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: faltas_baja = faltas_aviso aceptado'; end if;

  begin update gimnasio_config set faltas_aviso = 3; v_ok := true;  -- baja = 3
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: faltas_aviso >= faltas_baja aceptado'; end if;

  begin update gimnasio_config set faltas_baja = 1; v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: faltas_baja < faltas_aviso aceptado'; end if;

  begin update gimnasio_config set faltas_aviso = 0; v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: faltas_aviso 0 aceptado'; end if;

  begin update gimnasio_config set ventana_reserva = 'semana'; v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: ventana_reserva invalida aceptada'; end if;

  -- Un cambio válido de ambos a la vez entra, y se restaura el default.
  update gimnasio_config set faltas_aviso = 1, faltas_baja = 5;
  update gimnasio_config set faltas_aviso = 2, faltas_baja = 3;
  raise notice 'ok   - config: faltas_baja > faltas_aviso y ventana_reserva mes|dias';
end $$;

-- El origen 'encargado' ya no existe: ni en la tabla ni en la RPC.
do $$
declare
  v_ok boolean;
begin
  insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
    values ('f0000000-0000-0000-0000-0000000000aa', 1, '05:00', '06:00', 3);
  begin
    insert into gimnasio_reservas (socio_id, franja_id, fecha, origen)
      values ('50c10000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-0000000000aa', '2026-10-12', 'encargado');
    v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: origen encargado aceptado en la tabla'; end if;
  delete from gimnasio_franjas where id = 'f0000000-0000-0000-0000-0000000000aa';
  raise notice 'ok   - origen encargado rechazado por el CHECK de la tabla';
end $$;

-- Un cierre exige mensaje (3 a 300 caracteres tras recortar espacios).
do $$
declare
  v_ok boolean;
begin
  begin insert into gimnasio_franjas_excepciones (fecha, cerrado) values ('2026-12-24', true); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: cierre sin motivo aceptado'; end if;

  begin insert into gimnasio_franjas_excepciones (fecha, cerrado, motivo) values ('2026-12-24', true, '   '); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: cierre con motivo en blanco aceptado'; end if;

  begin insert into gimnasio_franjas_excepciones (fecha, cerrado, motivo) values ('2026-12-24', true, ' ab '); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: cierre con motivo de 2 caracteres aceptado'; end if;

  begin insert into gimnasio_franjas_excepciones (fecha, cerrado, motivo) values ('2026-12-24', true, repeat('x', 301)); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: cierre con motivo de 301 caracteres aceptado'; end if;

  insert into gimnasio_franjas_excepciones (fecha, cerrado, motivo) values ('2026-12-24', true, 'abc');
  insert into gimnasio_franjas_excepciones (fecha, cerrado, motivo) values ('2026-12-26', true, repeat('x', 300));
  -- Una excepción de cupo (abierta) no necesita motivo.
  insert into gimnasio_franjas_excepciones (fecha, cerrado, cupo_override) values ('2026-12-27', false, 3);
  delete from gimnasio_franjas_excepciones where fecha in ('2026-12-24', '2026-12-26', '2026-12-27');
  raise notice 'ok   - cierre exige motivo de 3 a 300 caracteres; la excepcion de cupo no';
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
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-06', 'encargado'), 'origen_invalido', 'origen encargado ya no es valido en la RPC');
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

update gimnasio_reservas set estado = 'cancelada'
 where socio_id = pg_temp.so(1) and franja_id = pg_temp.fr(1) and fecha = '2026-10-06';
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-06'), 'ok', 'tras cancelar, s1 puede volver a reservar (indice parcial)');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(1) and franja_id = pg_temp.fr(1)),
  '2', 's1 tiene 2 filas (una cancelada, una viva)');
select pg_temp.espera(pg_temp.res(5, 1, '2026-10-06'), 'cupo_lleno', 'cupo lleno de nuevo (4/4)');

-- Un socio puede reservar dos franjas el mismo dia.
select pg_temp.espera(pg_temp.res(6, 8, '2026-10-08'), 'ok', 's6 jueves franja 8');
select pg_temp.espera(pg_temp.res(6, 11, '2026-10-08'), 'ok', 's6 segunda franja el mismo jueves');

-- ─── Excepciones ──────────────────────────────────────────────────────────────

insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, motivo)
  values ('2026-10-12', pg_temp.fr(2), true, 'Feriado: Día de la Diversidad Cultural');
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
select pg_temp.espera(
  (select coalesce(motivo_cierre, 'null') from gimnasio_disponibilidad('2026-10-12', '2026-10-12') where franja_id = pg_temp.fr(2)),
  'Feriado: Día de la Diversidad Cultural', 'disponibilidad devuelve el motivo del cierre de la franja');
select pg_temp.espera(
  (select coalesce(motivo_cierre, 'null') from gimnasio_disponibilidad('2026-10-10', '2026-10-10') where franja_id = pg_temp.fr(4)),
  'feriado', 'disponibilidad devuelve el motivo del cierre general');
select pg_temp.espera(
  (select coalesce(motivo_cierre, 'null') from gimnasio_disponibilidad('2026-10-07', '2026-10-07') where franja_id = pg_temp.fr(3)),
  'null', 'una franja abierta no trae motivo de cierre');

-- Excepcion especifica gana sobre la general: franja 4 abierta con cupo 2 el sabado cerrado en general.
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, cupo_override)
  values ('2026-10-10', pg_temp.fr(4), false, 2);
select pg_temp.espera(pg_temp.res(7, 4, '2026-10-10'), 'ok', 'excepcion especifica abierta gana a la general cerrada');
select pg_temp.espera(
  (select coalesce(motivo_cierre, 'null') from gimnasio_disponibilidad('2026-10-10', '2026-10-10') where franja_id = pg_temp.fr(4)),
  'null', 'franja abierta por excepcion propia no hereda el motivo del cierre general');
delete from gimnasio_franjas_excepciones where fecha = '2026-10-10' and franja_id = pg_temp.fr(4);
select pg_temp.espera(pg_temp.res(8, 4, '2026-10-10'), 'cerrado', 'sin la especifica vuelve a regir la general');

-- ─── Pasado y modo 'dias' ─────────────────────────────────────────────────────

select pg_temp.espera(pg_temp.res(1, 5, '2026-10-05'), 'pasado', 'franja de hoy 09:00 ya paso');
select pg_temp.espera(pg_temp.res(1, 6, '2026-10-05'), 'pasado', 'franja que empieza justo ahora cuenta como empezada');
select pg_temp.espera(pg_temp.res(1, 5, '2026-09-28'), 'pasado', 'fecha anterior a hoy');
select pg_temp.espera(pg_temp.res(1, 7, '2026-10-05'), 'ok', 'franja de hoy 11:00 todavia no empezo');
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-13'), 'anticipacion', 'modo ''dias'': mas alla de hoy + anticipacion_dias (7)');
select pg_temp.espera(pg_temp.res(1, 1, '2026-10-12'), 'dia_invalido', 'lunes en franja de martes');
select pg_temp.espera(pg_temp.res(2, 1, '2026-10-13', 'fijo'), 'ok', 'origen fijo omite la ventana (materializacion de semanas)');
-- Borde del modo 'dias': hoy + 7 = lunes 10-12 (franja 7) entra; hoy + 8 no.
select pg_temp.espera(pg_temp.res(3, 7, '2026-10-12'), 'ok', 'modo ''dias'': hoy + 7 entra');
update gimnasio_config set anticipacion_dias = 30;
select pg_temp.espera(pg_temp.res(3, 3, '2026-11-04'), 'ok', 'modo ''dias'' con 30: hoy + 30 (miercoles 11-04) entra');
select pg_temp.espera(pg_temp.res(3, 8, '2026-11-05'), 'anticipacion', 'modo ''dias'' con 30: hoy + 31 se rechaza');
update gimnasio_config set anticipacion_dias = 7;

-- ─── Varios dias de la misma semana (sin tope semanal) ────────────────────────
-- s6 ya tiene el jueves 10-08. Semana ISO 10-05..10-11: lunes, viernes, domingo, y sabado.
-- Con tope serian 4 dias distintos; ahora todos entran.

select pg_temp.espera(pg_temp.res(6, 7, '2026-10-05'), 'ok', 's6 lunes');
select pg_temp.espera(pg_temp.res(6, 9, '2026-10-09'), 'ok', 's6 viernes');
select pg_temp.espera(pg_temp.res(6, 10, '2026-10-11'), 'ok', 's6 domingo (4to dia distinto de la misma semana ISO)');
select pg_temp.espera(
  (select count(distinct fecha)::text from gimnasio_reservas
    where socio_id = pg_temp.so(6) and estado <> 'cancelada' and fecha between '2026-10-05' and '2026-10-11'),
  '4', 's6 tiene 4 dias distintos reservados en una semana');
-- Mismo socio en cada dia de la semana: s9 reserva lunes, jueves, viernes y domingo.
select pg_temp.espera(pg_temp.res(9, 7, '2026-10-05'), 'ok', 's9 lunes');
select pg_temp.espera(pg_temp.res(9, 8, '2026-10-08'), 'ok', 's9 jueves');
select pg_temp.espera(pg_temp.res(9, 9, '2026-10-09'), 'ok', 's9 viernes');
select pg_temp.espera(pg_temp.res(9, 10, '2026-10-11'), 'ok', 's9 domingo');

-- ─── Ventana por mes ──────────────────────────────────────────────────────────
-- Hoy lunes 2026-10-05. Mes en curso: hasta sabado 2026-10-31 inclusive.

update gimnasio_config set ventana_reserva = 'mes';
select pg_temp.espera(pg_temp.res(11, 7, '2026-10-05'), 'ok', 'modo ''mes'': hoy entra');
select pg_temp.espera(pg_temp.res(11, 1, '2026-10-13'), 'ok', 'modo ''mes'': pasada la anticipacion de 7 dias igual entra');
select pg_temp.espera(pg_temp.res(11, 3, '2026-10-28'), 'ok', 'modo ''mes'': fin de mes menos 3');
select pg_temp.espera(pg_temp.res(11, 4, '2026-10-31'), 'ok', 'modo ''mes'': ultimo dia del mes (31) entra');
select pg_temp.espera(pg_temp.res(11, 10, '2026-11-01'), 'fuera_de_mes', 'modo ''mes'': el 1 del mes siguiente se rechaza');
select pg_temp.espera(pg_temp.res(11, 7, '2026-11-02'), 'fuera_de_mes', 'modo ''mes'': el 2 del mes siguiente se rechaza');
select pg_temp.espera(
  (select gimnasio_reservar(pg_temp.so(12), pg_temp.fr(10), '2026-11-01', 'socio')->>'motivo'),
  'Todavía no se pueden reservar turnos del mes que viene.', 'modo ''mes'': motivo en castellano');
select pg_temp.espera(pg_temp.res(12, 10, '2026-11-01', 'fijo'), 'ok', 'modo ''mes'': el turno fijo omite la ventana');
select pg_temp.espera(pg_temp.res(11, 7, '2026-09-28'), 'pasado', 'modo ''mes'': el pasado sigue rechazado');

-- Meses de 28, 30 y 31 dias, y 29 (bisiesto), con 'ahora' movido por el GUC de la prueba.
set local test.ahora = '2027-02-10 10:00:00';   -- febrero de 2027: 28 dias; 02-28 domingo, 03-01 lunes
select pg_temp.espera(pg_temp.res(1, 10, '2027-02-28'), 'ok', 'febrero (28 dias): el 28 entra');
select pg_temp.espera(pg_temp.res(1, 7, '2027-03-01'), 'fuera_de_mes', 'febrero (28 dias): el 1 de marzo se rechaza');

set local test.ahora = '2028-02-10 10:00:00';   -- febrero de 2028: 29 dias; 02-29 martes, 03-01 miercoles
select pg_temp.espera(pg_temp.res(1, 1, '2028-02-29'), 'ok', 'febrero bisiesto (29 dias): el 29 entra');
select pg_temp.espera(pg_temp.res(1, 3, '2028-03-01'), 'fuera_de_mes', 'febrero bisiesto: el 1 de marzo se rechaza');

set local test.ahora = '2026-11-10 10:00:00';   -- noviembre de 2026: 30 dias; 11-30 lunes, 12-01 martes
select pg_temp.espera(pg_temp.res(1, 7, '2026-11-30'), 'ok', 'noviembre (30 dias): el 30 entra');
select pg_temp.espera(pg_temp.res(1, 1, '2026-12-01'), 'fuera_de_mes', 'noviembre (30 dias): el 1 de diciembre se rechaza');

set local test.ahora = '2026-12-10 10:00:00';   -- diciembre de 2026: 31 dias; 12-31 jueves, 01-01 viernes
select pg_temp.espera(pg_temp.res(1, 8, '2026-12-31'), 'ok', 'diciembre (31 dias): el 31 entra');
select pg_temp.espera(pg_temp.res(1, 9, '2027-01-01'), 'fuera_de_mes', 'diciembre: el 1 de enero (otro año) se rechaza');

-- Primer dia de un mes: ya se puede reservar todo ese mes (y hoy mismo si la franja no empezo).
set local test.ahora = '2026-11-01 08:00:00';   -- domingo 1 de noviembre
select pg_temp.espera(pg_temp.res(2, 10, '2026-11-01'), 'ok', 'el dia 1 se abre el mes nuevo: hoy entra');
select pg_temp.espera(pg_temp.res(2, 7, '2026-11-30'), 'ok', 'el dia 1 se abre el mes nuevo: el 30 entra');
select pg_temp.espera(pg_temp.res(2, 1, '2026-12-01'), 'fuera_de_mes', 'el dia 1: el mes siguiente sigue cerrado');

-- Vuelve al 'ahora' por defecto y a modo 'dias' (la ventana por dias sigue funcionando).
set local test.ahora = '2026-10-05 10:00:00';
update gimnasio_config set ventana_reserva = 'dias', anticipacion_dias = 7;
select pg_temp.espera(pg_temp.res(12, 1, '2026-10-13'), 'anticipacion', 'vuelta al modo ''dias'': hoy + 8 rechazado');
select pg_temp.espera(pg_temp.res(12, 9, '2026-10-09'), 'ok', 'vuelta al modo ''dias'': dentro de la ventana entra');
update gimnasio_config set ventana_reserva = 'mes';

-- ─── Cierre de franja / de dia: reservas afectadas y cancelacion ──────────────
-- Jueves 2026-10-08: franja 8 (17:00) con s6 y s9; franja 11 (18:00) con s6. Se suma s2 en la 11.

select pg_temp.espera(pg_temp.res(2, 11, '2026-10-08'), 'ok', 's2 jueves franja 11');
select pg_temp.espera(
  (select count(*)::text from gimnasio_cierre_afectadas('2026-10-08', pg_temp.fr(8))),
  '2', 'afectadas por cerrar solo la franja 8: 2 reservas');
select pg_temp.espera(
  (select count(*)::text || '/' || count(distinct socio_id)::text from gimnasio_cierre_afectadas('2026-10-08', null)),
  '4/3', 'afectadas por cerrar todo el jueves: 4 reservas, 3 socios');
select pg_temp.espera(
  (select count(*)::text from gimnasio_cierre_afectadas('2026-10-05', pg_temp.fr(5))),
  '0', 'una franja que ya empezo no cuenta como afectada');
select pg_temp.espera(
  (select (count(*) > 0)::text from gimnasio_cierre_afectadas('2026-10-05', pg_temp.fr(7))),
  'true', 'una franja de hoy que todavia no empezo si cuenta');

-- La franja 11 queda abierta con excepcion propia (cupo especial): el cierre general no la toca.
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, cupo_override)
  values ('2026-10-08', pg_temp.fr(11), false, 5);
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, motivo)
  values ('2026-10-08', null, true, 'Mantenimiento de equipos');
select pg_temp.espera(
  (select count(*)::text from gimnasio_cierre_afectadas('2026-10-08', null)),
  '2', 'cierre general: no incluye la franja con excepcion propia');

-- Una reserva 'asistio' no se cancela.
update gimnasio_reservas set estado = 'asistio'
 where socio_id = pg_temp.so(9) and franja_id = pg_temp.fr(8) and fecha = '2026-10-08';
select pg_temp.espera(
  (select count(*)::text from gimnasio_cierre_afectadas('2026-10-08', null)),
  '1', 'las reservas con asistencia registrada no cuentan');
update gimnasio_reservas set estado = 'reservada'
 where socio_id = pg_temp.so(9) and franja_id = pg_temp.fr(8) and fecha = '2026-10-08';

select pg_temp.espera(
  (select count(*)::text || '/' || count(distinct socio_id)::text from gimnasio_cancelar_por_cierre('2026-10-08', null)),
  '2/2', 'cancelar_por_cierre devuelve exactamente las 2 filas canceladas (2 socios)');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas
    where fecha = '2026-10-08' and franja_id = pg_temp.fr(8) and estado = 'cancelada'),
  '2', 'las 2 reservas de la franja 8 quedaron canceladas');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas
    where fecha = '2026-10-08' and franja_id = pg_temp.fr(11) and estado = 'reservada'),
  '2', 'las reservas de la franja 11 (excepcion propia) siguen vivas');
select pg_temp.espera(
  (select count(*)::text from gimnasio_cancelar_por_cierre('2026-10-08', null)),
  '0', 'repetir la cancelacion no devuelve nada (idempotente)');
select pg_temp.espera(pg_temp.res(8, 8, '2026-10-08'), 'cerrado', 'despues del cierre no se puede reservar la franja 8');
select pg_temp.espera(
  (select coalesce(motivo_cierre, 'null') from gimnasio_disponibilidad('2026-10-08', '2026-10-08') where franja_id = pg_temp.fr(8)),
  'Mantenimiento de equipos', 'el mensaje del cierre llega a disponibilidad');

-- Borrar el cierre NO restaura las reservas canceladas.
delete from gimnasio_franjas_excepciones where fecha = '2026-10-08' and franja_id is null;
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas
    where fecha = '2026-10-08' and franja_id = pg_temp.fr(8) and estado = 'cancelada'),
  '2', 'borrar el cierre no restaura las reservas canceladas');

-- Cierre de una sola franja (franja_id explicito).
select pg_temp.espera(pg_temp.res(3, 8, '2026-10-08'), 'ok', 's3 reserva de nuevo la franja 8 (tras reabrir)');
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, motivo)
  values ('2026-10-08', pg_temp.fr(8), true, 'Clase especial');
select pg_temp.espera(
  (select count(*)::text from gimnasio_cancelar_por_cierre('2026-10-08', pg_temp.fr(8))),
  '1', 'cierre de una sola franja cancela solo sus reservas');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas
    where fecha = '2026-10-08' and franja_id = pg_temp.fr(11) and estado = 'reservada'),
  '2', 'y no toca las de otra franja');

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
  begin
    perform * from gimnasio_cierre_afectadas('2026-10-08', null);
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_cierre_afectadas';
  exception when insufficient_privilege then null; end;
  begin
    perform * from gimnasio_cancelar_por_cierre('2026-10-08', null);
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_cancelar_por_cierre';
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
  if (select count(*) from gimnasio_config) <> 1 then
    raise exception 'FALLO RLS: porteria no ve config';
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

-- service_role SI puede ejecutar las RPC.
set local role service_role;
select pg_temp.espera(pg_temp.res(12, 7, '2026-10-05'), 'ok', 'service_role ejecuta gimnasio_reservar');
select pg_temp.espera(
  (select count(*)::text from gimnasio_cierre_afectadas('2026-10-08', null)), '0',
  'service_role ejecuta gimnasio_cierre_afectadas');
reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Profesor por franja + sin solapes + importación de calendario (migración 20261006000000)
-- Arranca de cero: se vacían las tablas (todo se deshace con el ROLLBACK final).
-- Hoy sigue siendo lunes 2026-10-05 10:00.
-- ═════════════════════════════════════════════════════════════════════════════

delete from gimnasio_reservas;
delete from gimnasio_turnos_fijos;
delete from gimnasio_franjas_excepciones;
delete from gimnasio_franjas;

-- Utilidades: foto del estado de las franjas, y guardar/leer el último resultado del import.
create function pg_temp.snap() returns text language sql as $$
  select coalesce(md5(string_agg(concat_ws('|', id, dia_semana, hora_desde, hora_hasta, cupo, activa,
                                           coalesce(profesor, '~')), ',' order by id)), 'vacio')
  from gimnasio_franjas
$$;
-- Al aplicar sin huella explícita se usa la de la vista previa del mismo archivo (lo que hace la web).
create function pg_temp.imp(p_filas jsonb, p_modo text, p_aplicar boolean, p_hash text default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  if p_aplicar and p_hash is null then
    p_hash := gimnasio_importar_franjas(p_filas, p_modo, false)->>'plan_hash';
  end if;
  v := gimnasio_importar_franjas(p_filas, p_modo, p_aplicar, p_hash);
  perform set_config('test.r', v::text, true);
  return v;
end $$;
create function pg_temp.r(p_path text) returns text language sql as $$
  select current_setting('test.r')::jsonb #>> string_to_array(p_path, ',')
$$;
create temp table _f (k text primary key, j jsonb);

-- ─── Columna profesor ─────────────────────────────────────────────────────────

do $$
declare
  v_ok boolean;
begin
  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo, profesor)
        values (1, '06:00', '07:00', 5, repeat('x', 81)); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: profesor de 81 caracteres aceptado'; end if;

  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo, profesor)
        values (1, '06:00', '07:00', 5, '   '); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: profesor en blanco aceptado'; end if;

  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo, profesor)
        values (1, '06:00', '07:00', 5, ''); v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: profesor vacio aceptado'; end if;

  insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo, profesor)
  values ('f0000000-0000-0000-0000-0000000000a1', 1, '06:00', '07:00', 5, repeat('x', 80));
  delete from gimnasio_franjas where id = 'f0000000-0000-0000-0000-0000000000a1';
  raise notice 'ok   - profesor: nullable, max 80, no vacio ni en blanco';
end $$;

-- ─── Datos de partida ─────────────────────────────────────────────────────────
-- A lun 09-10 (cupo 10, 'Ana', activa) | B lun 18-19 (cupo 8, activa) |
-- C mar 10-11 (cupo 5, INACTIVA)       | D vie 17-18 (cupo 6, activa)

insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo, profesor, activa) values
  (pg_temp.fr(21), 1, '09:00', '10:00', 10, 'Ana', true),
  (pg_temp.fr(22), 1, '18:00', '19:00', 8,  null,  true),
  (pg_temp.fr(23), 2, '10:00', '11:00', 5,  null,  false),
  (pg_temp.fr(24), 5, '17:00', '18:00', 6,  null,  true);

insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values
  ('f1000000-0000-0000-0000-000000000001', pg_temp.so(1), pg_temp.fr(21)),
  ('f1000000-0000-0000-0000-000000000002', pg_temp.so(4), pg_temp.fr(22));
insert into gimnasio_reservas (socio_id, franja_id, fecha, estado) values
  (pg_temp.so(1), pg_temp.fr(21), '2026-10-12', 'reservada'),   -- A, futura
  (pg_temp.so(4), pg_temp.fr(22), '2026-10-12', 'reservada'),   -- B, futura
  (pg_temp.so(2), pg_temp.fr(23), '2026-10-13', 'reservada'),   -- C (inactiva), futura
  (pg_temp.so(3), pg_temp.fr(24), '2026-10-09', 'reservada'),   -- D, futura
  (pg_temp.so(3), pg_temp.fr(24), '2026-10-02', 'reservada');   -- D, PASADA: no cuenta

-- gimnasio_disponibilidad devuelve el profesor y sigue omitiendo inactivas.
select pg_temp.espera(
  (select profesor from gimnasio_disponibilidad('2026-10-12', '2026-10-12') where franja_id = pg_temp.fr(21)),
  'Ana', 'disponibilidad devuelve el profesor');
select pg_temp.espera(
  (select coalesce(profesor, '(null)') from gimnasio_disponibilidad('2026-10-12', '2026-10-12') where franja_id = pg_temp.fr(22)),
  '(null)', 'disponibilidad devuelve profesor null cuando no hay');
select pg_temp.espera(
  (select capacidad || '/' || ocupados || '/' || cerrado
     from gimnasio_disponibilidad('2026-10-12', '2026-10-12') where franja_id = pg_temp.fr(21)),
  '10/1/false', 'disponibilidad conserva capacidad, ocupados y cerrado');
select pg_temp.espera(
  (select count(*)::text from gimnasio_disponibilidad('2026-10-13', '2026-10-13') where franja_id = pg_temp.fr(23)),
  '0', 'disponibilidad sigue omitiendo franjas inactivas');

insert into _f values ('f1', $j$[
  {"dia_semana":1,"hora_desde":"09:00","hora_hasta":"10:00","cupo":12,"profesor":"Ana / Luis"},
  {"dia_semana":1,"hora_desde":"10:00","hora_hasta":"11:00","cupo":10,"profesor":null},
  {"dia_semana":2,"hora_desde":"10:00:00","hora_hasta":"11:00","cupo":7,"profesor":"  Marta "},
  {"dia_semana":5,"hora_desde":"17:00","hora_hasta":"18:00","cupo":6,"profesor":"   "}
]$j$::jsonb);

-- ─── Importar: vista previa (agregar) no escribe nada ────────────────────────

select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(pg_temp.imp((select j from _f where k = 'f1'), 'agregar', false)->>'ok', 'true', 'preview agregar: ok');
select pg_temp.espera(pg_temp.r('aplicado'), 'false', 'preview: aplicado = false');
select pg_temp.espera(
  pg_temp.r('resumen,crear') || '/' || pg_temp.r('resumen,actualizar') || '/' || pg_temp.r('resumen,sin_cambios') || '/' ||
  pg_temp.r('resumen,desactivar') || '/' || pg_temp.r('resumen,reservas_futuras_afectadas') || '/' ||
  pg_temp.r('resumen,turnos_fijos_afectados'),
  '1/2/1/0/0/0', 'preview agregar: crea 1, actualiza 2, 1 sin cambios, nada que desactivar');
select pg_temp.espera(
  pg_temp.r('detalle,actualizar,0,cupo_antes') || '>' || pg_temp.r('detalle,actualizar,0,cupo') || ' ' ||
  pg_temp.r('detalle,actualizar,0,profesor_antes') || '>' || pg_temp.r('detalle,actualizar,0,profesor'),
  '10>12 Ana>Ana / Luis', 'preview: detalle de la actualizacion (cupo y profesor antes/despues)');
select pg_temp.espera(
  pg_temp.r('detalle,actualizar,1,reactivada') || '/' || pg_temp.r('detalle,actualizar,0,reactivada'),
  'true/false', 'preview: marca la franja inactiva como reactivada');
select pg_temp.espera(pg_temp.r('detalle,crear,0,hora_desde') || '-' || pg_temp.r('detalle,crear,0,hora_hasta'),
  '10:00-11:00', 'preview: la franja a crear sale en formato HH:MM');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'preview no escribe nada');

-- ─── Importar: aplicar (agregar) ──────────────────────────────────────────────

select pg_temp.espera(pg_temp.imp((select j from _f where k = 'f1'), 'agregar', true)->>'ok', 'true', 'aplicar agregar: ok');
select pg_temp.espera(pg_temp.r('aplicado'), 'true', 'aplicar: aplicado = true');
select pg_temp.espera(
  (select cupo || '/' || profesor || '/' || activa from gimnasio_franjas where id = pg_temp.fr(21)),
  '12/Ana / Luis/true', 'aplicar: actualiza en el lugar (mismo id) cupo y profesor');
select pg_temp.espera(
  (select cupo || '/' || profesor || '/' || activa from gimnasio_franjas where id = pg_temp.fr(23)),
  '7/Marta/true', 'aplicar: reactiva la inactiva que coincide, con profesor recortado');
select pg_temp.espera(
  (select count(*)::text from gimnasio_franjas where dia_semana = 1 and hora_desde = '10:00' and hora_hasta = '11:00' and cupo = 10 and profesor is null and activa),
  '1', 'aplicar: crea la franja nueva');
select pg_temp.espera(
  (select cupo || '/' || activa from gimnasio_franjas where id = pg_temp.fr(22)),
  '8/true', 'agregar: no toca la franja que el archivo no menciona');
select pg_temp.espera(
  (select coalesce(profesor, '(null)') from gimnasio_franjas where id = pg_temp.fr(24)),
  '(null)', 'profesor en blanco se guarda como null');
select pg_temp.espera((select count(*)::text from gimnasio_franjas), '5', 'aplicar: 5 franjas en total (4 + 1 creada)');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas where estado = 'reservada'), '5',
  'aplicar: las reservas de las franjas actualizadas/reactivadas se conservan');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas where franja_id = pg_temp.fr(23) and estado = 'reservada'), '1',
  'la reserva de la franja reactivada sigue viva');

-- Idempotencia: aplicar lo mismo otra vez no cambia nada.
select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(pg_temp.imp((select j from _f where k = 'f1'), 'agregar', true)->>'ok', 'true', 'segunda aplicacion: ok');
select pg_temp.espera(
  pg_temp.r('resumen,crear') || '/' || pg_temp.r('resumen,actualizar') || '/' || pg_temp.r('resumen,sin_cambios'),
  '0/0/4', 'idempotencia: todo sin_cambios');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'idempotencia: el estado no cambia');

-- ─── Importar: reemplazar ─────────────────────────────────────────────────────
-- Archivo = A, N (lun 10-11, la recien creada) y C. Faltan B y D: se desactivan.

insert into _f values ('f2', $j$[
  {"dia_semana":1,"hora_desde":"09:00","hora_hasta":"10:00","cupo":12,"profesor":"Ana / Luis"},
  {"dia_semana":1,"hora_desde":"10:00","hora_hasta":"11:00","cupo":10,"profesor":null},
  {"dia_semana":2,"hora_desde":"10:00","hora_hasta":"11:00","cupo":7,"profesor":"Marta"}
]$j$::jsonb);

select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(pg_temp.imp((select j from _f where k = 'f2'), 'reemplazar', false)->>'ok', 'true', 'preview reemplazar: ok');
select pg_temp.espera(
  pg_temp.r('resumen,crear') || '/' || pg_temp.r('resumen,actualizar') || '/' || pg_temp.r('resumen,sin_cambios') || '/' ||
  pg_temp.r('resumen,desactivar') || '/' || pg_temp.r('resumen,reservas_futuras_afectadas') || '/' ||
  pg_temp.r('resumen,turnos_fijos_afectados'),
  '0/0/3/2/2/1', 'preview reemplazar: desactiva B y D; cuenta 2 reservas futuras (la pasada no) y 1 turno fijo');
select pg_temp.espera(
  pg_temp.r('detalle,desactivar,0,reservas_futuras') || '/' || pg_temp.r('detalle,desactivar,0,turnos_fijos') || '/' ||
  pg_temp.r('detalle,desactivar,1,reservas_futuras') || '/' || pg_temp.r('detalle,desactivar,1,turnos_fijos'),
  '1/1/1/0', 'preview reemplazar: detalle por franja a desactivar');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'preview reemplazar no escribe nada');

select pg_temp.espera(pg_temp.imp((select j from _f where k = 'f2'), 'reemplazar', true)->>'ok', 'true', 'aplicar reemplazar: ok');
select pg_temp.espera(
  (select string_agg(activa::text, ',' order by id) from gimnasio_franjas where id in (pg_temp.fr(22), pg_temp.fr(24))),
  'false,false', 'reemplazar: B y D desactivadas (baja logica)');
select pg_temp.espera((select count(*)::text from gimnasio_franjas), '5', 'reemplazar: no borra franjas');
select pg_temp.espera(
  (select count(*)::text from gimnasio_franjas where activa), '3', 'reemplazar: quedan 3 activas (A, N, C)');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas where estado = 'reservada'), '5',
  'reemplazar: las reservas de las desactivadas no se tocan');
select pg_temp.espera(
  (select count(*)::text from gimnasio_turnos_fijos where activo), '2',
  'reemplazar: no toca los turnos fijos');
select pg_temp.espera(pg_temp.imp((select j from _f where k = 'f2'), 'reemplazar', true)->>'ok', 'true', 'reemplazar otra vez: ok');
select pg_temp.espera(
  pg_temp.r('resumen,desactivar') || '/' || pg_temp.r('resumen,sin_cambios') || '/' || pg_temp.r('resumen,reservas_futuras_afectadas'),
  '0/3/0', 'reemplazar es idempotente: las ya desactivadas no se vuelven a contar');

-- ─── Importar: errores (se reportan TODOS y no se escribe nada) ──────────────
-- Estado: A lun 09-10, N lun 10-11 y C mar 10-11 activas.

insert into _f values ('mala', $j$[
  {"dia_semana":9,"hora_desde":"09:00","hora_hasta":"10:00","cupo":5},
  {"dia_semana":1,"hora_desde":"25:00","hora_hasta":"10:00","cupo":5},
  {"dia_semana":1,"hora_desde":"10:00","hora_hasta":"09:00","cupo":5},
  {"dia_semana":1,"hora_desde":"14:00","hora_hasta":"15:00","cupo":0},
  {"dia_semana":4,"hora_desde":"08:00","hora_hasta":"09:00","cupo":5,"profesor":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},
  {"dia_semana":2,"hora_desde":"08:00","hora_hasta":"09:00","cupo":5},
  {"dia_semana":2,"hora_desde":"08:00","hora_hasta":"09:00","cupo":6},
  {"dia_semana":3,"hora_desde":"10:00","hora_hasta":"12:00","cupo":5},
  {"dia_semana":3,"hora_desde":"11:00","hora_hasta":"13:00","cupo":5},
  {"dia_semana":1,"hora_desde":"09:30","hora_hasta":"10:30","cupo":5},
  {"dia_semana":1,"hora_desde":"12:00","hora_hasta":"13:00","cupo":"5"}
]$j$::jsonb);

select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(
  pg_temp.imp((select j from _f where k = 'mala'), 'agregar', true)->>'codigo', 'errores',
  'archivo con errores en agregar con p_aplicar=true: rechazado');
select pg_temp.espera(pg_temp.r('ok'), 'false', 'archivo con errores: ok=false');
select pg_temp.espera(jsonb_array_length(current_setting('test.r')::jsonb->'errores')::text, '10',
  'agregar: 10 errores reportados juntos (dia, hora, hasta<=desde, cupo, profesor, repetida, solapada, 2 contra existentes, cupo texto)');
select pg_temp.espera(
  (select array_agg(distinct (e->>'fila')::int order by (e->>'fila')::int)::text
     from jsonb_array_elements(current_setting('test.r')::jsonb->'errores') e),
  '{1,2,3,4,5,7,9,10,11}', 'agregar: filas con error');
select pg_temp.espera(
  (select count(*)::text from jsonb_array_elements(current_setting('test.r')::jsonb->'errores') e
    where e->>'motivo' is null or e->>'motivo' = ''), '0', 'todos los errores traen motivo');
select pg_temp.espera(
  (select (e->>'fila')::int::text from jsonb_array_elements(current_setting('test.r')::jsonb->'errores') e limit 1),
  '1', 'los errores salen ordenados por fila');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'errores en agregar: no escribe nada aunque p_aplicar sea true');

select pg_temp.espera(
  pg_temp.imp((select j from _f where k = 'mala'), 'reemplazar', true)->>'codigo', 'errores',
  'archivo con errores en reemplazar: rechazado');
select pg_temp.espera(jsonb_array_length(current_setting('test.r')::jsonb->'errores')::text, '8',
  'reemplazar: 8 errores (sin los 2 contra franjas existentes, que ahi no siguen activas)');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'errores en reemplazar: no escribe nada');

-- En reemplazar, una fila que pisa una franja existente es valida (esa franja se desactiva).
select pg_temp.espera(
  pg_temp.imp('[{"dia_semana":1,"hora_desde":"09:30","hora_hasta":"10:30","cupo":5}]'::jsonb, 'reemplazar', false)->>'ok',
  'true', 'reemplazar: solaparse con una franja existente no es error');
select pg_temp.espera(pg_temp.r('resumen,crear') || '/' || pg_temp.r('resumen,desactivar'), '1/3',
  'reemplazar: crea la nueva y desactiva las 3 activas');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'ese preview tampoco escribe');

-- Reactivar una franja inactiva que pisa una activa que SIGUE activa (agregar) es error.
insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
values (pg_temp.fr(25), 1, '18:30', '19:30', 5);   -- E activa, pisa a B (inactiva)
select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(
  pg_temp.imp('[{"dia_semana":1,"hora_desde":"18:00","hora_hasta":"19:00","cupo":8}]'::jsonb, 'agregar', true)->>'codigo',
  'errores', 'agregar: reactivar B pisando a E (que sigue activa) es error');
select pg_temp.espera(pg_temp.r('errores,0,fila'), '1', 'ese error apunta a la fila 1');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'ese rechazo no escribe nada');
delete from gimnasio_franjas where id = pg_temp.fr(25);

-- Errores estructurales.
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas('[]'::jsonb, 'agregar', false)->>'codigo', 'ok'), 'sin_filas', 'calendario vacio rechazado');
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas('{"a":1}'::jsonb, 'agregar', false)->>'codigo', 'ok'), 'parametros', 'p_filas que no es lista rechazado');
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas(null, 'agregar', false)->>'codigo', 'ok'), 'parametros', 'p_filas nulo rechazado');
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas('[{"dia_semana":1}]'::jsonb, 'otro', false)->>'codigo', 'ok'), 'modo_invalido', 'modo invalido rechazado');
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas('[{"dia_semana":1}]'::jsonb, 'agregar', null)->>'codigo', 'ok'), 'parametros', 'p_aplicar nulo rechazado');
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas(
    (select jsonb_agg(jsonb_build_object('dia_semana', 1, 'hora_desde', '09:00', 'hora_hasta', '10:00', 'cupo', 5))
       from generate_series(1, 301)), 'agregar', false)->>'codigo', 'ok'),
  'demasiadas_filas', 'mas de 300 filas rechazado');
select pg_temp.espera(
  coalesce(gimnasio_importar_franjas('[1, "x"]'::jsonb, 'agregar', false)->'errores'->0->>'fila', 'ok'),
  '1', 'filas que no son objetos se reportan como error');

-- 80 caracteres exactos y profesor recortado se aceptan.
select pg_temp.espera(
  pg_temp.imp(jsonb_build_array(
    jsonb_build_object('dia_semana', 6, 'hora_desde', '09:00', 'hora_hasta', '10:00', 'cupo', 3, 'profesor', '  Pedro  '),
    jsonb_build_object('dia_semana', 6, 'hora_desde', '10:00', 'hora_hasta', '11:00', 'cupo', 3, 'profesor', repeat('y', 80))
  ), 'agregar', true)->>'ok', 'true', 'aplicar con profesor recortado y de 80 caracteres');
select pg_temp.espera(
  (select profesor from gimnasio_franjas where dia_semana = 6 and hora_desde = '09:00'), 'Pedro', 'el profesor se guarda recortado');
select pg_temp.espera(
  (select char_length(profesor)::text from gimnasio_franjas where dia_semana = 6 and hora_desde = '10:00'), '80', 'profesor de 80 caracteres aceptado');

-- ─── Sin solapes entre franjas activas (EXCLUDE gimnasio_franjas_sin_solape) ──
-- Miércoles (3) y jueves (4) están libres en este punto del script.

select pg_temp.espera(
  (select count(*)::text from pg_constraint
    where conname = 'gimnasio_franjas_sin_solape' and contype = 'x' and conrelid = 'gimnasio_franjas'::regclass),
  '1', 'existe el EXCLUDE gimnasio_franjas_sin_solape');

insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
values (pg_temp.fr(31), 3, '09:00', '11:00', 5);

do $$
declare
  v_ok boolean;
begin
  -- Solape parcial con una activa: rechazado.
  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (3, '10:00', '12:00', 5); v_ok := true;
  exception when exclusion_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: franja activa solapada aceptada'; end if;
  raise notice 'ok   - EXCLUDE: una franja activa que pisa a otra activa del mismo dia se rechaza (23P01)';

  -- Contenida dentro de otra y que contiene a otra: rechazadas.
  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (3, '09:30', '10:00', 5); v_ok := true;
  exception when exclusion_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: franja contenida en otra aceptada'; end if;
  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (3, '08:00', '12:00', 5); v_ok := true;
  exception when exclusion_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: franja que contiene a otra aceptada'; end if;
  raise notice 'ok   - EXCLUDE: contenida y contenedora tambien se rechazan';

  -- Misma franja exacta: rechazada.
  begin insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (3, '09:00', '11:00', 5); v_ok := true;
  exception when exclusion_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: franja duplicada activa aceptada'; end if;
  raise notice 'ok   - EXCLUDE: la misma franja activa dos veces se rechaza';

  -- Pegadas (11:00 contra 11:00 y 09:00 contra 09:00 por el otro lado): permitido.
  insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
  values ('f0000000-0000-0000-0000-000000000032', 3, '11:00', '13:00', 5),
         ('f0000000-0000-0000-0000-000000000033', 3, '07:00', '09:00', 5);
  raise notice 'ok   - EXCLUDE: franjas pegadas (07-09, 09-11, 11-13) conviven';

  -- Mismo horario en otro dia: permitido.
  insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (4, '09:00', '11:00', 5);
  raise notice 'ok   - EXCLUDE: el mismo horario en otro dia conviven';

  -- Superpuesta pero INACTIVA: permitido.
  insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo, activa)
  values ('f0000000-0000-0000-0000-000000000034', 3, '10:00', '12:00', 5, false);
  raise notice 'ok   - EXCLUDE: una franja inactiva puede solaparse con una activa';

  -- Reactivarla pisando a una activa: rechazado. Y editar horarios de una activa para pisar: rechazado.
  begin update gimnasio_franjas set activa = true where id = 'f0000000-0000-0000-0000-000000000034'; v_ok := true;
  exception when exclusion_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: reactivar una franja pisando a una activa fue aceptado'; end if;
  begin update gimnasio_franjas set hora_hasta = '12:00' where id = pg_temp.fr(31); v_ok := true;
  exception when exclusion_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: estirar una franja activa sobre otra fue aceptado'; end if;
  raise notice 'ok   - EXCLUDE: reactivar o estirar una franja pisando a una activa se rechaza';

  -- Desactivar una activa libera el lugar para una nueva.
  update gimnasio_franjas set activa = false where id = pg_temp.fr(31);
  insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (3, '09:30', '10:30', 5);
  raise notice 'ok   - EXCLUDE: desactivar una franja libera su horario para otra nueva';
end $$;

-- Se deja el miércoles/jueves limpio para lo que sigue.
delete from gimnasio_franjas where dia_semana in (3, 4);

-- ─── Huella del plan (plan_hash) ──────────────────────────────────────────────

insert into _f values ('h1', $j$[
  {"dia_semana":4,"hora_desde":"15:00","hora_hasta":"16:00","cupo":9,"profesor":"Lía"},
  {"dia_semana":4,"hora_desde":"17:00","hora_hasta":"18:00","cupo":9,"profesor":null},
  {"dia_semana":1,"hora_desde":"09:00","hora_hasta":"10:00","cupo":14,"profesor":"Ana / Luis"}
]$j$::jsonb);
-- Mismo archivo en otro orden de filas.
insert into _f values ('h1b', $j$[
  {"dia_semana":1,"hora_desde":"09:00","hora_hasta":"10:00","cupo":14,"profesor":"Ana / Luis"},
  {"dia_semana":4,"hora_desde":"17:00","hora_hasta":"18:00","cupo":9,"profesor":null},
  {"dia_semana":4,"hora_desde":"15:00","hora_hasta":"16:00","cupo":9,"profesor":"Lía"}
]$j$::jsonb);

select pg_temp.espera(
  length(gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash')::text,
  '32', 'la vista previa devuelve plan_hash (md5, 32 caracteres)');
select pg_temp.espera(
  (gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash' =
   gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash')::text,
  'true', 'el plan_hash es estable: la misma vista previa dos veces da la misma huella');
select pg_temp.espera(
  (gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash' =
   gimnasio_importar_franjas((select j from _f where k = 'h1b'), 'agregar', false)->>'plan_hash')::text,
  'true', 'el plan_hash no depende del orden de las filas del archivo');
select pg_temp.espera(
  (gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash' =
   gimnasio_importar_franjas((select j from _f where k = 'h1'), 'reemplazar', false)->>'plan_hash')::text,
  'false', 'el plan_hash cambia con el modo');

-- Aplicar sin huella o con una huella equivocada: plan_cambio y no escribe nada.
select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(
  gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', true)->>'codigo',
  'plan_cambio', 'aplicar sin plan_hash: plan_cambio');
select pg_temp.espera(
  gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', true, 'no-es-la-huella')->>'codigo',
  'plan_cambio', 'aplicar con un plan_hash equivocado: plan_cambio');
select pg_temp.espera(
  gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', true, '')->>'codigo',
  'plan_cambio', 'aplicar con plan_hash vacio: plan_cambio');
select pg_temp.espera(
  gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', true, 'no-es-la-huella')->>'motivo',
  'El calendario cambió mientras revisabas la vista previa. Volvé a hacer la vista previa.', 'plan_cambio trae el motivo para el usuario');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'plan_cambio no escribe nada');

-- Vista previa vieja: el calendario cambia entre la vista previa y la confirmación.
select set_config('test.hash', gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash', true);
insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
values (pg_temp.fr(41), 4, '15:00', '16:00', 3);   -- otro encargado la creó con otro cupo
select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(
  gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', true, current_setting('test.hash'))->>'codigo',
  'plan_cambio', 'vista previa vieja (alguien creo una franja del archivo): plan_cambio');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'la vista previa vieja no escribe nada');
delete from gimnasio_franjas where id = pg_temp.fr(41);

-- Con la huella correcta aplica y devuelve la misma huella.
select pg_temp.espera(
  pg_temp.imp((select j from _f where k = 'h1'), 'agregar', true,
              gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash')->>'ok',
  'true', 'aplicar con la plan_hash de la vista previa: ok');
select pg_temp.espera(
  (pg_temp.r('plan_hash') = gimnasio_importar_franjas((select j from _f where k = 'h1'), 'agregar', false)->>'plan_hash')::text,
  'false', 'despues de aplicar el plan cambia (ya no hay nada que crear): la huella vieja no sirve de nuevo');
select pg_temp.espera(
  (select count(*)::text from gimnasio_franjas where dia_semana = 4 and activa), '2', 'aplicar con huella correcta crea las 2 franjas del jueves');
select pg_temp.espera(
  (select cupo::text from gimnasio_franjas where id = pg_temp.fr(21)), '14', 'aplicar con huella correcta actualiza el cupo de A');

-- ─── Carrera con un alta concurrente (EXCLUDE dentro de la importación) ───────
-- 1) La franja solapada ya existe al validar: la importación lo informa como error de la fila.
insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
values (pg_temp.fr(42), 3, '15:30', '16:30', 4);
select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(
  pg_temp.imp('[{"dia_semana":3,"hora_desde":"15:00","hora_hasta":"16:00","cupo":5}]'::jsonb, 'agregar', true)->>'codigo',
  'errores', 'solape con una franja activa ya existente: error de validacion de la fila');
select pg_temp.espera((pg_temp.snap() = current_setting('test.snap'))::text, 'true', 'ese rechazo no escribe nada');
delete from gimnasio_franjas where id = pg_temp.fr(42);

-- 2) La franja solapada aparece DESPUES de validar y justo antes del insert: se simula con un trigger
--    que, al crear la franja del jueves 16:00, mete antes una franja activa que la pisa (es lo que haria
--    un franja-guardar concurrente). El archivo ademas actualiza A: eso tambien debe deshacerse.
create function pg_temp.carrera() returns trigger language plpgsql as $$
begin
  if new.dia_semana = 3 and new.hora_desde = '20:00' then
    insert into gimnasio_franjas (dia_semana, hora_desde, hora_hasta, cupo) values (3, '20:30', '21:30', 1);
  end if;
  return new;
end $$;
create trigger carrera_alta before insert on gimnasio_franjas
  for each row execute function pg_temp.carrera();

insert into _f values ('carrera', $j$[
  {"dia_semana":1,"hora_desde":"09:00","hora_hasta":"10:00","cupo":20,"profesor":"Ana / Luis"},
  {"dia_semana":3,"hora_desde":"20:00","hora_hasta":"21:00","cupo":5}
]$j$::jsonb);
select set_config('test.snap', pg_temp.snap(), true);
select pg_temp.espera(
  pg_temp.imp((select j from _f where k = 'carrera'), 'agregar', true)->>'codigo',
  'solape', 'alta concurrente que se solapa durante la importacion: codigo solape');
select pg_temp.espera(pg_temp.r('ok'), 'false', 'solape: ok=false');
select pg_temp.espera(
  (pg_temp.snap() = current_setting('test.snap'))::text, 'true',
  'solape: no queda nada escrito (ni la actualizacion de A ni la franja que metio la carrera)');
drop trigger carrera_alta on gimnasio_franjas;
drop function pg_temp.carrera();

-- ─── Orden de escritura bajo el EXCLUDE (se prueba dentro de un savepoint) ────
-- E (lun 18:30-19:30, activa) pisa a B (lun 18-19, inactiva). Un reemplazar que reactiva B y desactiva
-- E sólo funciona si se desactiva ANTES de reactivar. Además crea una franja nueva sobre una activa
-- que se desactiva (lun 09:30-10:30 pisa a A).
savepoint orden_escritura;
insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo)
values (pg_temp.fr(26), 1, '18:30', '19:30', 5);
select pg_temp.espera(
  pg_temp.imp('[{"dia_semana":1,"hora_desde":"18:00","hora_hasta":"19:00","cupo":8},
                {"dia_semana":1,"hora_desde":"09:30","hora_hasta":"10:30","cupo":5}]'::jsonb, 'reemplazar', true)->>'ok',
  'true', 'reemplazar: desactiva primero, reactiva y crea despues (sin choque con el EXCLUDE)');
select pg_temp.espera(
  (select string_agg(id::text || ':' || activa::text, ',' order by id) from gimnasio_franjas
    where id in (pg_temp.fr(22), pg_temp.fr(26), pg_temp.fr(21))),
  pg_temp.fr(21)::text || ':false,' || pg_temp.fr(22)::text || ':true,' || pg_temp.fr(26)::text || ':false',
  'reemplazar: B reactivada, E y A desactivadas');
select pg_temp.espera(
  (select count(*)::text from gimnasio_franjas where dia_semana = 1 and hora_desde = '09:30' and activa), '1',
  'reemplazar: la franja nueva que pisaba a una desactivada se creo');
rollback to savepoint orden_escritura;
release savepoint orden_escritura;

-- ─── Permisos de la importación ───────────────────────────────────────────────

set local role authenticated;
do $$
begin
  begin
    perform gimnasio_importar_franjas('[]'::jsonb, 'agregar', false);
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_importar_franjas';
  exception when insufficient_privilege then null; end;
  begin
    perform * from gimnasio_disponibilidad('2026-10-06', '2026-10-06');
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_disponibilidad recreada';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - authenticated no puede ejecutar gimnasio_importar_franjas ni la disponibilidad recreada';
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform gimnasio_importar_franjas('[]'::jsonb, 'agregar', false);
    raise exception 'FALLO: anon pudo ejecutar gimnasio_importar_franjas';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - anon no puede ejecutar gimnasio_importar_franjas';
end $$;
reset role;

set local role service_role;
select pg_temp.espera(
  gimnasio_importar_franjas('[{"dia_semana":7,"hora_desde":"09:00","hora_hasta":"10:00","cupo":5}]'::jsonb, 'agregar', false)->>'ok',
  'true', 'service_role ejecuta gimnasio_importar_franjas');
select pg_temp.espera(
  (select count(*)::text from gimnasio_disponibilidad('2026-10-12', '2026-10-12')), '2',
  'service_role ejecuta gimnasio_disponibilidad recreada (A y N el lunes)');
reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- T6 — Turnos fijos automáticos: materialización y proceso de faltas
-- (migración 20261007000000_gimnasio_turnos_fijos_auto). Sección independiente: arranca de una
-- base limpia de franjas/reservas/fijos y maneja el "ahora" con pg_temp.ahora().
-- ═════════════════════════════════════════════════════════════════════════════

reset role;
select set_config('test.rol', '', true);

delete from gimnasio_reservas;
delete from gimnasio_turnos_fijos;
delete from gimnasio_franjas_excepciones;
delete from gimnasio_franjas;

-- La tabla real (20260902000000_accesos_gimnasio) no está en el stub inicial.
create table accesos (
  id        uuid        primary key default gen_random_uuid(),
  socio_id  uuid        references socios(id) on delete cascade,
  punto     text        not null default 'gimnasio',
  semaforo  text,
  creado_en timestamptz not null default now()
);

create function pg_temp.fx(n int) returns uuid language sql as $$
  select ('f7000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.tf(n int) returns uuid language sql as $$
  select ('d7000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;
create function pg_temp.ahora(p text) returns void language sql as $$
  select set_config('test.ahora', p, true)
$$;
-- Inserta una reserva directo (para fechas pasadas / estados ya evaluados).
create function pg_temp.rv(p_socio int, p_franja int, p_fecha date, p_estado text default 'reservada',
                           p_origen text default 'socio', p_fijo uuid default null)
returns void language sql as $$
  insert into gimnasio_reservas (socio_id, franja_id, fecha, estado, origen, turno_fijo_id)
  values (pg_temp.so(p_socio), pg_temp.fx(p_franja), p_fecha, p_estado, p_origen, p_fijo)
$$;
-- Ingreso al gimnasio a una hora LOCAL ('AAAA-MM-DD HH:MI:SS'); se guarda en UTC (+3 h).
create function pg_temp.acc(p_socio int, p_local text, p_punto text default 'gimnasio')
returns void language sql as $$
  insert into accesos (socio_id, punto, creado_en)
  values (pg_temp.so(p_socio), p_punto, ((p_local::timestamp + interval '3 hours') at time zone 'UTC'))
$$;
create temp table t6 (k text primary key, v jsonb);

select pg_temp.ahora('2026-10-05 10:00:00');   -- lunes
update gimnasio_config set ventana_reserva = 'mes', pct_cupo_fijos = 50, semanas_fijos = 2,
  faltas_aviso = 2, faltas_baja = 3, tolerancia_min = 15;

select pg_temp.espera((select faltas_activas::text from gimnasio_config), 'false', 'T6: faltas_activas arranca apagado');
select pg_temp.espera((select (faltas_activas_desde is null)::text from gimnasio_config), 'true', 'T6: faltas_activas_desde arranca en null');

insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo, activa) values
  (pg_temp.fx(1), 1, '18:00', '19:00', 10, true),    -- lunes 18-19
  (pg_temp.fx(2), 2, '18:00', '19:00', 10, true),    -- martes 18-19
  (pg_temp.fx(3), 3, '07:00', '08:00', 10, true),    -- miércoles 07-08
  (pg_temp.fx(4), 4, '18:00', '19:00', 4,  true),    -- jueves 18-19, cupo 4 -> máx 2 fijos
  (pg_temp.fx(5), 5, '18:00', '19:00', 10, false),   -- viernes, INACTIVA
  (pg_temp.fx(6), 1, '09:00', '10:00', 10, true);    -- lunes 09-10: ya empezó hoy (10:00)

-- ─── Materialización ──────────────────────────────────────────────────────────
-- Hoy lunes 2026-10-05 10:00, semanas_fijos = 2 -> horizonte hasta 2026-10-19 inclusive.

insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(1), pg_temp.so(1), pg_temp.fx(1));
insert into t6 select 'm1', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'ok' from t6 where k = 'm1'), 'true', 'materializar: ok');
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm1'), '3', 'materializar: lunes 10-05 (hoy 18:00), 10-12 y 10-19');
select pg_temp.espera((select v->>'fijos_procesados' from t6 where k = 'm1'), '1', 'materializar: 1 fijo procesado');
select pg_temp.espera((select jsonb_array_length(v->'errores')::text from t6 where k = 'm1'), '0', 'materializar: sin errores');
select pg_temp.espera(
  (select count(*)::text from gimnasio_reservas
    where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(1) and origen = 'fijo'
      and turno_fijo_id = pg_temp.tf(1) and estado = 'reservada'),
  '3', 'materializar: 3 reservas origen fijo con turno_fijo_id');

insert into t6 select 'm2', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm2'), '0', 'materializar idempotente: segunda corrida no crea nada');
select pg_temp.espera((select v->'omitidas'->>'ya_existia' from t6 where k = 'm2'), '3', 'materializar idempotente: 3 ya existian');
select pg_temp.espera((select count(*)::text from gimnasio_reservas), '3', 'materializar idempotente: siguen 3 reservas');

-- El socio cancela 10-12 y un cierre canceló 10-19: no se recrean.
update gimnasio_reservas set estado = 'cancelada' where fecha in ('2026-10-12', '2026-10-19');
insert into t6 select 'm3', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm3'), '0', 'no recrea ocurrencias canceladas (por el socio o por cierre)');
select pg_temp.espera((select v->'omitidas'->>'ya_existia' from t6 where k = 'm3'), '3', 'las canceladas cuentan como ya existentes');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado = 'reservada'), '1', 'sólo queda viva la de hoy');

-- Horizonte: por defecto hoy + semanas_fijos*7 (10-19); martes -> 10-06 y 10-13, no 10-20.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(2), pg_temp.so(2), pg_temp.fx(2));
insert into t6 select 'm4a', gimnasio_materializar_fijos(pg_temp.tf(2), '2026-10-06');
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm4a'), '1', 'p_hasta acota el horizonte (solo 10-06)');
insert into t6 select 'm4b', gimnasio_materializar_fijos(pg_temp.tf(2));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm4b'), '1', 'horizonte por defecto: suma 10-13');
select pg_temp.espera(
  (select string_agg(fecha::text, ',' order by fecha) from gimnasio_reservas where socio_id = pg_temp.so(2)),
  '2026-10-06,2026-10-13', 'horizonte semanas_fijos=2: no llega a 10-20');
update gimnasio_config set semanas_fijos = 3;
insert into t6 select 'm4c', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm4c'), '2', 'semanas_fijos=3: suma martes 10-20 y lunes 10-26');
update gimnasio_config set semanas_fijos = 2;

-- Un solo turno fijo por id.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values
  (pg_temp.tf(3), pg_temp.so(3), pg_temp.fx(1)), (pg_temp.tf(4), pg_temp.so(4), pg_temp.fx(1));
insert into t6 select 'm5', gimnasio_materializar_fijos(pg_temp.tf(3));
select pg_temp.espera((select v->>'fijos_procesados' from t6 where k = 'm5'), '1', 'por id: procesa sólo ese fijo');
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm5'), '3', 'por id: 3 reservas del fijo pedido');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(4)), '0', 'por id: el otro fijo no se toca');

-- Fecha cerrada: se saltea y se cuenta por codigo.
insert into gimnasio_franjas_excepciones (fecha, cerrado, motivo) values ('2026-10-12', true, 'Feriado');
insert into t6 select 'm6a', gimnasio_materializar_fijos(pg_temp.tf(4));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm6a'), '2', 'cierre: reserva 10-05 y 10-19');
select pg_temp.espera((select v->'omitidas'->'por_codigo'->>'cerrado' from t6 where k = 'm6a'), '1', 'cierre: 10-12 omitida por codigo cerrado');
delete from gimnasio_franjas_excepciones;
insert into t6 select 'm6b', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm6b'), '1', 'al reabrir, la corrida siguiente crea la fecha que faltaba (nunca hubo fila)');

-- Tope de cupo de fijos: franja de cupo 4 -> máx floor(4*50%) = 2 fijos por fecha.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values
  (pg_temp.tf(5), pg_temp.so(5), pg_temp.fx(4)),
  (pg_temp.tf(6), pg_temp.so(6), pg_temp.fx(4)),
  (pg_temp.tf(7), pg_temp.so(7), pg_temp.fx(4));
insert into t6 select 'm7', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm7'), '4', 'tope de fijos: 2 por fecha x 2 jueves');
select pg_temp.espera((select v->'omitidas'->'por_codigo'->>'cupo_fijos_lleno' from t6 where k = 'm7'), '2', 'tope de fijos: el tercero queda afuera cada jueves');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where franja_id = pg_temp.fx(4)), '4', 'tope de fijos: 4 reservas en la franja');

-- Un turno fijo que revienta no aborta a los demás.
create function public.t6_boom() returns trigger language plpgsql as $$
begin
  if new.socio_id = '50c10000-0000-0000-0000-000000000009' then raise exception 'boom de prueba'; end if;
  return new;
end $$;
create trigger t6_boom before insert on gimnasio_reservas for each row execute function public.t6_boom();
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values
  (pg_temp.tf(9), pg_temp.so(9), pg_temp.fx(2)), (pg_temp.tf(10), pg_temp.so(10), pg_temp.fx(2));
insert into t6 select 'm8', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'ok' from t6 where k = 'm8'), 'true', 'fijo fallido: la corrida termina ok');
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm8'), '2', 'fijo fallido: el otro fijo igual se materializa');
select pg_temp.espera((select jsonb_array_length(v->'errores')::text from t6 where k = 'm8'), '1', 'fijo fallido: se informa 1 error');
select pg_temp.espera((select v->'errores'->0->>'turno_fijo_id' from t6 where k = 'm8'), pg_temp.tf(9)::text, 'fijo fallido: error identifica al turno fijo');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(9)), '0', 'fijo fallido: no deja reservas a medias');
drop trigger t6_boom on gimnasio_reservas;
drop function public.t6_boom();
insert into t6 select 'm8b', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm8b'), '2', 'fijo fallido: sin el trigger se materializa en la corrida siguiente');

-- Se ignoran fijos inactivos, franjas inactivas y se informa 'pasado'.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id, activo) values
  (pg_temp.tf(11), pg_temp.so(11), pg_temp.fx(2), false),
  (pg_temp.tf(12), pg_temp.so(12), pg_temp.fx(5), true);
insert into t6 select 'm9', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm9'), '0', 'ignora fijos inactivos y franjas inactivas');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id in (pg_temp.so(11), pg_temp.so(12))), '0', 'inactivos: sin reservas');
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(13), pg_temp.so(12), pg_temp.fx(6));
insert into t6 select 'm9b', gimnasio_materializar_fijos(pg_temp.tf(13));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm9b'), '2', 'franja que ya empezó hoy: reserva 10-12 y 10-19');
select pg_temp.espera((select v->'omitidas'->'por_codigo'->>'pasado' from t6 where k = 'm9b'), '1', 'franja que ya empezó hoy: hoy omitida como pasado');
insert into t6 select 'm10', gimnasio_materializar_fijos(gen_random_uuid());
select pg_temp.espera((select v->>'fijos_procesados' from t6 where k = 'm10'), '0', 'turno fijo inexistente: nada que procesar');

-- Dry-run de la materialización: informa lo que crearía y no escribe.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(14), pg_temp.so(12), pg_temp.fx(2));
select count(*) as antes from gimnasio_reservas \gset
insert into t6 select 'm11', gimnasio_materializar_fijos(pg_temp.tf(14), null, false);
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm11'), '2', 'dry-run materializar: informa las 2 que crearía (10-06 y 10-13)');
select pg_temp.espera((select v->>'aplicado' from t6 where k = 'm11'), 'false', 'dry-run materializar: aplicado=false');
select pg_temp.espera((select count(*)::text from gimnasio_reservas), :'antes', 'dry-run materializar: no escribe ninguna reserva');
insert into t6 select 'm12', gimnasio_materializar_fijos(pg_temp.tf(14));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'm12'), '2', 'materializar real tras el dry-run: crea las mismas 2');

-- ─── Proceso de faltas ────────────────────────────────────────────────────────

delete from gimnasio_reservas;
delete from gimnasio_turnos_fijos;

-- Fixtures (franja 1 = lunes 18-19, franja 3 = miércoles 07-08; ventana de ingreso = franja ± 15 min).
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values
  (pg_temp.tf(21), pg_temp.so(1), pg_temp.fx(1)),
  (pg_temp.tf(22), pg_temp.so(1), pg_temp.fx(3));
-- s1: racha en F1 y en F3 (independientes), con fijos y reservas futuras.
select pg_temp.rv(1, 1, d::date, 'reservada', 'fijo', pg_temp.tf(21))
  from unnest(array['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']) d;
select pg_temp.rv(1, 3, d::date, 'reservada', 'fijo', pg_temp.tf(22))
  from unnest(array['2026-09-23', '2026-09-30', '2026-10-07']) d;
-- s2: asistió el 09-21 -> la racha se corta.
select pg_temp.rv(2, 1, d::date) from unnest(array['2026-09-14', '2026-09-21', '2026-09-28']) d;
select pg_temp.acc(2, '2026-09-21 18:30:00');
-- s3: una cancelada en el medio no corta ni suma.
select pg_temp.rv(3, 1, '2026-09-14');
select pg_temp.rv(3, 1, '2026-09-21', 'cancelada');
select pg_temp.rv(3, 1, '2026-09-28');
-- s4: una falta y una cancelada -> racha 1.
select pg_temp.rv(4, 1, '2026-09-21');
select pg_temp.rv(4, 1, '2026-09-28', 'cancelada');
-- s5..s9: bordes de la ventana de ingreso del lunes 09-28 (17:45:00 .. 19:15:00).
select pg_temp.rv(n, 1, '2026-09-28') from generate_series(5, 9) n;
select pg_temp.acc(5, '2026-09-28 17:45:00');                 -- justo al inicio de la ventana: asiste
select pg_temp.acc(6, '2026-09-28 19:15:00');                 -- justo al final de la ventana: asiste
select pg_temp.acc(7, '2026-09-28 17:44:59');                 -- 1 s antes: falta
select pg_temp.acc(8, '2026-09-28 19:15:01');                 -- 1 s después: falta
select pg_temp.acc(9, '2026-09-28 18:30:00', 'otro-punto');   -- otro punto de acceso: falta

-- Corte en null (el interruptor nunca se encendió): el dry-run no evalúa NADA, ni la historia.
select pg_temp.ahora('2026-09-28 19:14:59');
insert into t6 select 'p0', gimnasio_procesar_faltas(false);
select pg_temp.espera((select (v->>'evaluadas') || '/' || (v->>'falto') from t6 where k = 'p0'), '0/0', 'corte null: dry-run no evalúa nada');
select pg_temp.espera((select (v->'desde' = 'null'::jsonb)::text from t6 where k = 'p0'), 'true', 'corte null: desde = null');
select pg_temp.espera((select ((v->>'nota') like 'Todavía no se activó%')::text from t6 where k = 'p0'), 'true', 'corte null: trae la nota aclaratoria');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado in ('asistio', 'falto')), '0', 'corte null: no cambia reservas');
-- Se enciende (y apaga) antes de todos los fixtures: el corte queda en 2026-09-14 00:00.
select pg_temp.ahora('2026-09-14 00:00:00');
update gimnasio_config set faltas_activas = true;
select pg_temp.espera((select faltas_activas_desde::text from gimnasio_config), '2026-09-14 00:00:00', 'encender el interruptor fija faltas_activas_desde = ahora');
update gimnasio_config set faltas_activas = false;
select pg_temp.espera((select faltas_activas_desde::text from gimnasio_config), '2026-09-14 00:00:00', 'apagar el interruptor conserva faltas_activas_desde');
select pg_temp.ahora('2026-09-28 19:14:59');

-- Se evalúa sólo después de fin + tolerancia. Dry-run (no escribe), interruptor apagado.
insert into t6 select 'p1', gimnasio_procesar_faltas(false);
select pg_temp.espera((select v->>'evaluadas' from t6 where k = 'p1'), '6',
  'antes de fin+tolerancia no se evalúa el lunes 09-28 (sólo 6 reservas anteriores)');
select pg_temp.ahora('2026-09-28 19:15:00');
insert into t6 select 'p2', gimnasio_procesar_faltas(false);
select pg_temp.espera((select v->>'evaluadas' from t6 where k = 'p2'), '14', 'a fin+tolerancia exactos ya se evalúa (14 reservas)');
select pg_temp.espera((select v->>'activo' from t6 where k = 'p2'), 'false', 'dry-run con interruptor apagado informa activo=false');
select pg_temp.espera((select v->>'aplicado' from t6 where k = 'p2'), 'false', 'dry-run informa aplicado=false');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado in ('asistio', 'falto')), '0', 'dry-run no cambia ninguna reserva');
select pg_temp.espera((select count(*)::text from gimnasio_faltas_eventos), '0', 'dry-run no registra eventos');

-- Interruptor apagado + aplicar: no hace nada.
select pg_temp.ahora('2026-09-29 12:00:00');
insert into t6 select 'p3', gimnasio_procesar_faltas();
select pg_temp.espera((select v::text from t6 where k = 'p3'), '{"ok": true, "activo": false}', 'interruptor apagado: devuelve sólo activo=false');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado in ('asistio', 'falto')), '0', 'interruptor apagado: no evalúa nada');

-- Dry-run con el interruptor encendido: calcula todo y no escribe.
select pg_temp.ahora('2026-09-14 00:00:00');
update gimnasio_config set faltas_activas = true;   -- el corte vuelve a quedar en 09-14 00:00
select pg_temp.ahora('2026-09-29 12:00:00');
insert into t6 select 'p4', gimnasio_procesar_faltas(false);
select pg_temp.espera((select jsonb_array_length(v->'avisos')::text from t6 where k = 'p4'), '2', 'dry-run: informa 2 avisos que aplicaría');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado in ('asistio', 'falto')), '0', 'dry-run (encendido): sigue sin escribir reservas');
select pg_temp.espera((select count(*)::text from gimnasio_faltas_eventos), '0', 'dry-run (encendido): sigue sin registrar eventos');
select pg_temp.espera((select string_agg(faltas_consecutivas::text, ',' order by franja_id) from gimnasio_turnos_fijos), '0,0', 'dry-run: no toca faltas_consecutivas');

-- Aplicado.
insert into t6 select 'p5', gimnasio_procesar_faltas();
select pg_temp.espera((select v->>'evaluadas' from t6 where k = 'p5'), '14', 'aplicado: 14 reservas evaluadas');
select pg_temp.espera((select v->>'asistio' from t6 where k = 'p5'), '3', 'aplicado: 3 asistieron (s2 el 09-21 y los dos bordes de ventana)');
select pg_temp.espera((select v->>'falto' from t6 where k = 'p5'), '11', 'aplicado: 11 faltaron');
select pg_temp.espera(
  (select string_agg(estado, ',' order by socio_id) from gimnasio_reservas
    where fecha = '2026-09-28' and socio_id in (pg_temp.so(5), pg_temp.so(6), pg_temp.so(7), pg_temp.so(8), pg_temp.so(9))),
  'asistio,asistio,falto,falto,falto', 'bordes: 17:45:00 y 19:15:00 asisten; 1 s afuera y otro punto faltan');
select pg_temp.espera((select jsonb_array_length(v->'avisos')::text from t6 where k = 'p5'), '2', 'aviso a racha 2: s1/F1 y s3/F1 (cancelada en el medio no corta)');
select pg_temp.espera((select jsonb_array_length(v->'bajas')::text from t6 where k = 'p5'), '0', 'todavía ninguna baja');
select pg_temp.espera(
  (select string_agg((a->>'socio_id') || ':' || (a->>'racha') || ':' || (a->>'fecha') || ':' || (a->>'dia_semana') || ':' || (a->>'hora_desde'), '|' order by a->>'socio_id')
     from t6, jsonb_array_elements(v->'avisos') a where k = 'p5'),
  pg_temp.so(1)::text || ':2:2026-09-28:1:18:00:00|' || pg_temp.so(3)::text || ':2:2026-09-28:1:18:00:00',
  'aviso: trae socio, racha, fecha de la falta que lo disparó y datos de la franja');
select pg_temp.espera((select v->'avisos'->0->>'faltas_baja' from t6 where k = 'p5'), '3', 'aviso: trae faltas_baja para armar el texto del push');
select pg_temp.espera((select string_agg(faltas_consecutivas::text, ',' order by dia_f) from (
    select tf.faltas_consecutivas, f.dia_semana as dia_f from gimnasio_turnos_fijos tf join gimnasio_franjas f on f.id = tf.franja_id) q),
  '2,1', 'faltas_consecutivas del fijo: 2 en F1 y 1 en F3');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(2) and estado = 'falto'), '2', 's2: dos faltas sueltas, la racha vigente es 1');
select pg_temp.espera((select largo::text from gimnasio_rachas() where socio_id = pg_temp.so(2)), '1', 'asistio reinicia la racha: s2 racha 1');
select pg_temp.espera((select largo::text from gimnasio_rachas() where socio_id = pg_temp.so(4)), '1', 'cancelada no suma: s4 racha 1');

-- Idempotencia: misma corrida otra vez.
insert into t6 select 'p6', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'avisos') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'p6'),
  '0/0/0', 'idempotente: segunda corrida no evalúa, no avisa ni da de baja');
select pg_temp.espera((select count(*)::text from gimnasio_faltas_eventos), '2', 'idempotente: 2 eventos de aviso en total');

-- Racha 3 -> baja. Martes 10-06 12:00: vencen s1 F1 10-05 y s1 F3 09-30.
select pg_temp.ahora('2026-10-06 12:00:00');
insert into t6 select 'p7', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || (v->>'falto') from t6 where k = 'p7'), '2/2', 'baja: se evalúan 2 faltas nuevas');
select pg_temp.espera((select jsonb_array_length(v->'bajas')::text from t6 where k = 'p7'), '1', 'baja: 1 socio liberado');
select pg_temp.espera((select v->'bajas'->0->>'franja_id' from t6 where k = 'p7'), pg_temp.fx(1)::text, 'baja: en la franja del lunes');
select pg_temp.espera((select v->'bajas'->0->>'reservas_eliminadas' from t6 where k = 'p7'), '2', 'baja: borra las 2 ocurrencias futuras del fijo (10-12 y 10-19)');
select pg_temp.espera((select v->'bajas'->0->>'reservas_canceladas' from t6 where k = 'p7'), '0', 'baja: no había reservas sueltas que cancelar');
select pg_temp.espera((select v->'bajas'->0->>'fijo_desactivado' from t6 where k = 'p7'), 'true', 'baja: informa fijo desactivado');
select pg_temp.espera((select v->'bajas'->0->>'racha' from t6 where k = 'p7'), '3', 'baja: racha 3');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(1) and fecha >= '2026-10-12'),
  '0', 'baja: las ocurrencias futuras del fijo en la franja se eliminan (no quedan canceladas)');
select pg_temp.espera((select activo::text from gimnasio_turnos_fijos where id = pg_temp.tf(21)), 'false', 'baja: turno fijo de la franja desactivado');
select pg_temp.espera((select activo::text from gimnasio_turnos_fijos where id = pg_temp.tf(22)), 'true', 'baja: el fijo de OTRA franja sigue activo');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(3) and fecha = '2026-10-07'),
  'reservada', 'baja: reservas futuras de OTRA franja intactas');
select pg_temp.espera((select jsonb_array_length(v->'avisos')::text from t6 where k = 'p7'), '1', 'F3 llega a racha 2: 1 aviso nuevo (F1 fue directo a baja)');
select pg_temp.espera((select v->'avisos'->0->>'franja_id' from t6 where k = 'p7'), pg_temp.fx(3)::text, 'el aviso nuevo es de la franja del miércoles');
select pg_temp.espera((select count(*)::text from gimnasio_faltas_eventos where tipo = 'baja'), '1', 'un evento de baja');
select pg_temp.espera((select count(*)::text from gimnasio_faltas_eventos where tipo = 'aviso'), '3', 'tres eventos de aviso (s1/F1, s3/F1, s1/F3)');

insert into t6 select 'p8', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'avisos') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'p8'),
  '0/0/0', 'baja idempotente: nada nuevo en la segunda corrida');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado = 'cancelada' and socio_id = pg_temp.so(1)), '0', 'baja idempotente: no queda nada cancelado ni se borra más');

-- La baja reinicia el conteo de la franja; la de F3 llega a 3 con 10-07.
select pg_temp.ahora('2026-10-13 12:00:00');
select pg_temp.rv(1, 1, '2026-10-12');   -- nueva reserva suelta tras la baja (la ocurrencia del fijo se había borrado)
insert into t6 select 'p9', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'avisos') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'p9'),
  '2/0/1', 'tras la baja: F1 vuelve a empezar (racha 1) y F3 llega a baja');
select pg_temp.espera((select v->'bajas'->0->>'franja_id' from t6 where k = 'p9'), pg_temp.fx(3)::text, 'la nueva baja es de F3');
select pg_temp.espera((select largo::text from gimnasio_rachas() where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(1)), '1', 'F1: la racha post-baja es 1');
select pg_temp.espera((select activo::text from gimnasio_turnos_fijos where id = pg_temp.tf(22)), 'false', 'F3: fijo desactivado por su propia baja');

-- ─── Corte de evaluación (faltas_activas_desde) ───────────────────────────────

-- El UPDATE no puede pisar el corte a mano; encender de nuevo lo mueve al momento actual.
update gimnasio_config set faltas_activas_desde = null, faltas_activas = false;
select pg_temp.espera((select faltas_activas_desde::text from gimnasio_config), '2026-09-14 00:00:00', 'el trigger impide pisar faltas_activas_desde con un UPDATE');
select pg_temp.ahora('2026-10-20 12:00:00');
update gimnasio_config set faltas_activas = true;
select pg_temp.espera((select faltas_activas_desde::text from gimnasio_config), '2026-10-20 12:00:00', 'encender de nuevo mueve el corte al nuevo momento');
update gimnasio_config set pct_cupo_fijos = 50;   -- otro cambio: el corte no se toca
select pg_temp.espera((select faltas_activas_desde::text from gimnasio_config), '2026-10-20 12:00:00', 'un UPDATE sin cambiar el interruptor no mueve el corte');

-- Franjas de martes 10-20 pegadas al corte (12:00): A termina 10 minutos antes, B 10 minutos después.
insert into gimnasio_franjas (id, dia_semana, hora_desde, hora_hasta, cupo) values
  (pg_temp.fx(7), 2, '10:00', '11:50', 10),
  (pg_temp.fx(8), 2, '11:50', '12:10', 10);
select pg_temp.rv(1, 7, '2026-10-20');   -- termina 11:50 < corte: NO se evalúa
select pg_temp.rv(2, 8, '2026-10-20');   -- termina 12:10 >= corte: se evalúa
-- Historia previa al corte: racha de 2 faltas ya evaluadas de s3 en la franja del martes 18-19, y un
-- fijo activo con un contador viejo.
select pg_temp.rv(3, 2, '2026-10-06', 'falto');
select pg_temp.rv(3, 2, '2026-10-13', 'falto');
insert into gimnasio_turnos_fijos (id, socio_id, franja_id, faltas_consecutivas) values (pg_temp.tf(30), pg_temp.so(5), pg_temp.fx(2), 2);
-- Reservas posteriores al corte, las evalúa el proceso según avance el reloj.
select pg_temp.rv(3, 2, d::date) from unnest(array['2026-10-20', '2026-10-27', '2026-11-03']) d;

select pg_temp.ahora('2026-10-20 12:30:00');
insert into t6 select 'c1', gimnasio_procesar_faltas(false);
select pg_temp.espera((select v->>'evaluadas' from t6 where k = 'c1'), '1', 'corte: dry-run evalúa sólo la franja que terminó después del corte (B)');
select pg_temp.espera((select v->>'desde' from t6 where k = 'c1'), '2026-10-20T12:00:00', 'corte: el resultado informa desde');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(2) and franja_id = pg_temp.fx(8)), 'reservada', 'corte: el dry-run no escribió');
insert into t6 select 'c2', gimnasio_procesar_faltas();
select pg_temp.espera((select v->>'evaluadas' from t6 where k = 'c2'), '1', 'corte: aplicado evalúa 1 (B, termina 10 min después del corte)');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(2) and franja_id = pg_temp.fx(8)), 'falto', 'corte: B (termina después) quedó evaluada como falto');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(7)), 'reservada', 'corte: A (terminó 10 min antes) NO se evalúa y queda como estaba');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where estado = 'reservada' and fecha < '2026-10-20'), '0',
  'corte: no se tocó ninguna reserva anterior (no hay actualización masiva)');
select pg_temp.espera((select faltas_consecutivas::text from gimnasio_turnos_fijos where id = pg_temp.tf(30)), '0',
  'corte: el contador faltas_consecutivas viejo del fijo se reinicia (la historia no cuenta)');

-- La historia previa no cuenta para rachas: 2 faltas viejas + 1 nueva = racha 1 (no baja).
select pg_temp.ahora('2026-10-20 19:30:00');
insert into t6 select 'c3', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'avisos') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'c3'),
  '1/0/0', 'corte: las faltas previas no suman; 1 falta nueva = sin aviso ni baja');
select pg_temp.espera((select largo::text from gimnasio_rachas() where socio_id = pg_temp.so(3) and franja_id = pg_temp.fx(2)), '1',
  'corte: la racha de s3 ignora lo anterior al corte');
-- Después del corte todo funciona normal: aviso a racha 2 y baja a racha 3.
select pg_temp.ahora('2026-10-27 19:30:00');
insert into t6 select 'c4', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'avisos') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'c4'),
  '1/1/0', 'corte: 2da falta posterior da el aviso');
select pg_temp.espera((select v->'avisos'->0->>'racha' from t6 where k = 'c4'), '2', 'corte: el aviso es de racha 2');
select pg_temp.ahora('2026-11-03 19:30:00');
insert into t6 select 'c5', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'avisos') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'c5'),
  '1/0/1', 'corte: 3ra falta posterior da la baja');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(7)), 'reservada', 'corte: A sigue sin evaluar al final');

-- INSERT de la fila de config ya activa: el corte arranca en ese momento.
select pg_temp.ahora('2026-12-01 08:00:00');
delete from gimnasio_config;
insert into gimnasio_config (id, faltas_activas) values (1, true);
select pg_temp.espera((select faltas_activas_desde::text from gimnasio_config), '2026-12-01 08:00:00', 'INSERT ya activo fija el corte en ahora');
update gimnasio_config set ventana_reserva = 'mes', pct_cupo_fijos = 50, semanas_fijos = 2, tolerancia_min = 15;

-- ─── Recrear un turno fijo: se vuelven a generar sus reservas ─────────────────
-- Hoy martes 2026-12-01 08:00, semanas_fijos = 2 -> horizonte hasta 12-15 (martes: 12-01, 12-08, 12-15;
-- lunes: 12-07, 12-14). Interruptor de faltas encendido desde 12-01 08:00 (INSERT de arriba).

delete from gimnasio_reservas;
delete from gimnasio_turnos_fijos;
delete from gimnasio_faltas_eventos;
select pg_temp.ahora('2026-12-01 08:00:00');

-- (a) cancelar el fijo y crearlo de nuevo: todas las fechas futuras se re-materializan.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(40), pg_temp.so(1), pg_temp.fx(2));
insert into t6 select 'r1', gimnasio_materializar_fijos(pg_temp.tf(40));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'r1'), '3', 'recrear: el fijo original materializa 12-01, 12-08 y 12-15');
insert into t6 select 'r2', gimnasio_liberar_fijo(pg_temp.tf(40));
select pg_temp.espera((select v->>'reservas_eliminadas' from t6 where k = 'r2'), '3', 'liberar fijo: borra las 3 ocurrencias futuras');
select pg_temp.espera((select v->>'fijo_desactivado' from t6 where k = 'r2'), 'true', 'liberar fijo: lo desactiva');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(1)), '0', 'liberar fijo: no quedan filas (ni canceladas) del socio en la franja');
-- (g) crear-fijo de nuevo: el índice único es parcial (sólo activos), así que entra una fila NUEVA con
-- faltas_consecutivas = 0; la vieja queda inactiva como historia (no se reactiva).
update gimnasio_turnos_fijos set faltas_consecutivas = 2 where id = pg_temp.tf(40);
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(41), pg_temp.so(1), pg_temp.fx(2));
select pg_temp.espera((select faltas_consecutivas::text from gimnasio_turnos_fijos where id = pg_temp.tf(41)), '0', 'recrear: el fijo nuevo arranca con faltas_consecutivas = 0');
select pg_temp.espera((select count(*)::text from gimnasio_turnos_fijos where socio_id = pg_temp.so(1) and franja_id = pg_temp.fx(2) and activo), '1', 'recrear: un solo fijo activo para el socio y la franja');
select pg_temp.espera((select activo::text from gimnasio_turnos_fijos where id = pg_temp.tf(40)), 'false', 'recrear: el fijo viejo sigue inactivo');
insert into t6 select 'r3', gimnasio_materializar_fijos(pg_temp.tf(41));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'r3'), '3', 'recrear tras cancelar: se re-materializan las 3 fechas');
select pg_temp.espera((select v->'omitidas'->>'ya_existia' from t6 where k = 'r3'), '0', 'recrear tras cancelar: ninguna fecha quedó como ya existente');

-- (c) cancelada individualmente con el fijo ACTIVO: no se recrea.
update gimnasio_reservas set estado = 'cancelada' where socio_id = pg_temp.so(1) and fecha = '2026-12-08';
insert into t6 select 'r4', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'r4'), '0', 'fijo activo: la ocurrencia cancelada por el socio no se recrea');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(1) and fecha = '2026-12-08'), 'cancelada', 'fijo activo: sigue cancelada');
-- (d) cancelada por un cierre con el fijo ACTIVO: tampoco.
insert into gimnasio_franjas_excepciones (fecha, franja_id, cerrado, motivo) values ('2026-12-15', pg_temp.fx(2), true, 'Mantenimiento');
select count(*) as cancel_cierre from gimnasio_cancelar_por_cierre('2026-12-15', pg_temp.fx(2)) \gset
select pg_temp.espera(:'cancel_cierre', '1', 'el cierre canceló la ocurrencia del 12-15');
delete from gimnasio_franjas_excepciones;
insert into t6 select 'r5', gimnasio_materializar_fijos();
select pg_temp.espera((select v->>'creadas' from t6 where k = 'r5'), '0', 'fijo activo: la ocurrencia cancelada por un cierre no se recrea');
-- Al cancelar el fijo, las canceladas también se borran, y el fijo nuevo las recibe.
insert into t6 select 'r6', gimnasio_liberar_fijo(pg_temp.tf(41));
select pg_temp.espera((select v->>'reservas_eliminadas' from t6 where k = 'r6'), '3', 'liberar fijo: borra reservadas y canceladas (12-01, 12-08, 12-15)');
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(42), pg_temp.so(1), pg_temp.fx(2));
insert into t6 select 'r7', gimnasio_materializar_fijos(pg_temp.tf(42));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'r7'), '3', 'recrear tras cancelaciones y cierre: las 3 fechas vuelven');
-- Idempotencia con el fijo nuevo.
insert into t6 select 'r8', gimnasio_materializar_fijos();
select pg_temp.espera((select (v->>'creadas') || '/' || (v->'omitidas'->>'ya_existia') from t6 where k = 'r8'), '0/3', 'recrear: idempotente');

-- (e) borrar ocurrencias futuras no toca historia ni a otros socios/franjas.
delete from gimnasio_reservas;
delete from gimnasio_turnos_fijos;
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values
  (pg_temp.tf(43), pg_temp.so(2), pg_temp.fx(1)),   -- se libera
  (pg_temp.tf(44), pg_temp.so(3), pg_temp.fx(1)),   -- otro socio, misma franja
  (pg_temp.tf(45), pg_temp.so(2), pg_temp.fx(3));   -- mismo socio, otra franja
select gimnasio_materializar_fijos()->>'creadas' as creadas_e \gset
select pg_temp.espera(:'creadas_e', '6', 'preparación: 2 lunes + 2 lunes + 2 miércoles');
select pg_temp.rv(2, 1, '2026-11-30', 'asistio', 'fijo', pg_temp.tf(43));
select pg_temp.rv(2, 1, '2026-11-23', 'falto', 'fijo', pg_temp.tf(43));
select pg_temp.rv(2, 1, '2026-11-16', 'cancelada', 'fijo', pg_temp.tf(43));   -- pasada: no se borra
insert into t6 select 'e1', gimnasio_liberar_fijo(pg_temp.tf(43));
select pg_temp.espera((select v->>'reservas_eliminadas' from t6 where k = 'e1'), '2', 'liberar: borra sólo las 2 ocurrencias futuras');
select pg_temp.espera((select string_agg(estado, ',' order by fecha) from gimnasio_reservas where socio_id = pg_temp.so(2) and franja_id = pg_temp.fx(1)),
  'cancelada,falto,asistio', 'liberar: conserva asistio, falto y lo pasado');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(3) and franja_id = pg_temp.fx(1)), '2', 'liberar: otro socio intacto');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(2) and franja_id = pg_temp.fx(3)), '2', 'liberar: otra franja del mismo socio intacta');
select pg_temp.espera((select activo::text from gimnasio_turnos_fijos where id = pg_temp.tf(44)), 'true', 'liberar: no desactiva fijos ajenos');

-- (b) y (f) baja: borra las ocurrencias del fijo y cancela las sueltas que no empezaron; la de hoy ya
-- terminada (dentro de la tolerancia, sin evaluar) no se toca. Se baja el umbral a 1/2 para armarlo.
delete from gimnasio_reservas;
delete from gimnasio_turnos_fijos;
delete from gimnasio_faltas_eventos;
update gimnasio_config set faltas_aviso = 1;
update gimnasio_config set faltas_baja = 2;
-- Martes 12-15 19:10: la franja 18-19 terminó pero la tolerancia (15 min) corre hasta las 19:15.
select pg_temp.ahora('2026-12-15 19:10:00');
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(46), pg_temp.so(4), pg_temp.fx(2));
select pg_temp.rv(4, 2, d::date, 'reservada', 'fijo', pg_temp.tf(46)) from unnest(array['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22']) d;
select pg_temp.rv(4, 2, '2026-12-29');   -- suelta (origen socio), futura
select pg_temp.rv(5, 2, '2026-12-22');   -- otro socio: no se toca
insert into t6 select 'b1', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'bajas') from t6 where k = 'b1'), '2/1', 'baja: se evalúan las 2 faltas anteriores (12-01 y 12-08) y hay 1 baja');
select pg_temp.espera((select v->'bajas'->0->>'reservas_eliminadas' from t6 where k = 'b1'), '1', 'baja: borra la ocurrencia futura del fijo (12-22)');
select pg_temp.espera((select v->'bajas'->0->>'reservas_canceladas' from t6 where k = 'b1'), '1', 'baja: cancela la reserva suelta futura (12-29)');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(4) and fecha = '2026-12-15'), 'reservada',
  'baja: la de hoy, ya terminada pero sin evaluar, no se cancela ni se borra');
select pg_temp.espera((select count(*)::text from gimnasio_reservas where socio_id = pg_temp.so(4) and fecha = '2026-12-22'), '0', 'baja: la ocurrencia 12-22 del fijo ya no existe');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(4) and fecha = '2026-12-29'), 'cancelada', 'baja: la suelta queda cancelada');
select pg_temp.espera((select estado from gimnasio_reservas where socio_id = pg_temp.so(5) and fecha = '2026-12-22'), 'reservada', 'baja: reservas de otro socio intactas');
select pg_temp.espera((select activo::text from gimnasio_turnos_fijos where id = pg_temp.tf(46)), 'false', 'baja: fijo desactivado');
-- Idempotencia de la baja.
insert into t6 select 'b2', gimnasio_procesar_faltas();
select pg_temp.espera((select (v->>'evaluadas') || '/' || jsonb_array_length(v->'bajas') || '/' || jsonb_array_length(v->'avisos') from t6 where k = 'b2'), '0/0/0', 'baja: segunda corrida sin cambios');
-- Crear el fijo de nuevo tras la baja: la ocurrencia borrada vuelve (12-22); 12-15 (hoy, ya existente) y
-- 12-29 (suelta cancelada) se informan como ya existentes.
insert into gimnasio_turnos_fijos (id, socio_id, franja_id) values (pg_temp.tf(47), pg_temp.so(4), pg_temp.fx(2));
insert into t6 select 'b3', gimnasio_materializar_fijos(pg_temp.tf(47));
select pg_temp.espera((select v->>'creadas' from t6 where k = 'b3'), '1', 'baja y fijo nuevo: se re-materializa 12-22');
select pg_temp.espera((select v->'omitidas'->>'ya_existia' from t6 where k = 'b3'), '2', 'baja y fijo nuevo: 12-15 y 12-29 figuran como ya existentes');
select pg_temp.espera((select turno_fijo_id::text from gimnasio_reservas where socio_id = pg_temp.so(4) and fecha = '2026-12-22'), pg_temp.tf(47)::text, 'baja y fijo nuevo: la reserva 12-22 pertenece al fijo nuevo');
update gimnasio_config set faltas_baja = 3;
update gimnasio_config set faltas_aviso = 2;

-- ─── Permisos y RLS (T6) ──────────────────────────────────────────────────────

set local role authenticated;
do $$
begin
  begin
    perform gimnasio_materializar_fijos();
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_materializar_fijos';
  exception when insufficient_privilege then null; end;
  begin
    perform gimnasio_procesar_faltas(false);
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_procesar_faltas';
  exception when insufficient_privilege then null; end;
  begin
    perform * from gimnasio_rachas();
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_rachas';
  exception when insufficient_privilege then null; end;
  begin
    perform gimnasio_liberar_fijo(gen_random_uuid());
    raise exception 'FALLO: authenticated pudo ejecutar gimnasio_liberar_fijo';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - authenticated no puede ejecutar las RPC de turnos fijos';
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform gimnasio_materializar_fijos();
    raise exception 'FALLO: anon pudo ejecutar gimnasio_materializar_fijos';
  exception when insufficient_privilege then null; end;
  begin
    perform gimnasio_procesar_faltas(false);
    raise exception 'FALLO: anon pudo ejecutar gimnasio_procesar_faltas';
  exception when insufficient_privilege then null; end;
  begin
    perform * from gimnasio_rachas();
    raise exception 'FALLO: anon pudo ejecutar gimnasio_rachas';
  exception when insufficient_privilege then null; end;
  begin
    perform gimnasio_liberar_fijo(gen_random_uuid());
    raise exception 'FALLO: anon pudo ejecutar gimnasio_liberar_fijo';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - anon no puede ejecutar las RPC de turnos fijos';
end $$;
reset role;

set local role service_role;
select pg_temp.espera(gimnasio_materializar_fijos()->>'ok', 'true', 'service_role ejecuta gimnasio_materializar_fijos');
select pg_temp.espera(gimnasio_procesar_faltas(false)->>'ok', 'true', 'service_role ejecuta gimnasio_procesar_faltas');
select pg_temp.espera((select count(*)::text from gimnasio_rachas()), '0', 'service_role ejecuta gimnasio_rachas (el corte de 12-01 deja la historia afuera)');
select pg_temp.espera(gimnasio_liberar_fijo(gen_random_uuid())->>'ok', 'true', 'service_role ejecuta gimnasio_liberar_fijo');
reset role;

-- RLS de gimnasio_faltas_eventos: lectura sólo para el staff, sin escritura.
select pg_temp.espera((select (count(*) > 0)::text from gimnasio_faltas_eventos), 'true', 'hay eventos para probar RLS');
set local role authenticated;
set local test.rol = 'socio';
do $$
begin
  if (select count(*) from gimnasio_faltas_eventos) <> 0 then
    raise exception 'FALLO RLS: un socio ve eventos de faltas';
  end if;
  begin
    insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
    values ('50c10000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'aviso', '2026-11-02');
    raise exception 'FALLO RLS: un socio pudo insertar un evento';
  exception when insufficient_privilege then null; end;
  raise notice 'ok   - RLS eventos: socio no lee ni escribe';
end $$;
set local test.rol = 'porteria';
do $$
begin
  if (select count(*) from gimnasio_faltas_eventos) = 0 then
    raise exception 'FALLO RLS: porteria no ve eventos';
  end if;
  begin
    insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
    values ('50c10000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'aviso', '2026-11-02');
    raise exception 'FALLO RLS: porteria pudo insertar un evento';
  exception when insufficient_privilege then null; end;
  delete from gimnasio_faltas_eventos;   -- sin policy de DELETE: RLS filtra todo, sin error ni cambios
  if (select count(*) from gimnasio_faltas_eventos) = 0 then
    raise exception 'FALLO RLS: porteria borro eventos';
  end if;
  raise notice 'ok   - RLS eventos: porteria lee y no escribe';
end $$;
set local test.rol = 'admin';
select pg_temp.espera((select (count(*) > 0)::text from gimnasio_faltas_eventos), 'true', 'RLS eventos: admin lee');
reset role;
select set_config('test.rol', '', true);
set local role anon;
select pg_temp.espera((select count(*)::text from gimnasio_faltas_eventos), '0', 'RLS eventos: anon no ve nada');
reset role;

-- Constraints de eventos.
do $$
declare
  v_ok boolean;
begin
  begin
    insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
    values (pg_temp.so(5), pg_temp.fx(1), 'otro', '2026-11-02');
    v_ok := true;
  exception when check_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: tipo de evento inválido aceptado'; end if;

  insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
  values (pg_temp.so(5), pg_temp.fx(1), 'aviso', '2026-11-02');
  begin
    insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
    values (pg_temp.so(5), pg_temp.fx(1), 'aviso', '2026-11-02');
    v_ok := true;
  exception when unique_violation then v_ok := false; end;
  if v_ok then raise exception 'FALLO: evento duplicado aceptado'; end if;
  raise notice 'ok   - eventos: tipo válido y único por (socio, franja, tipo, fecha_ref)';
end $$;

rollback;

\echo 'TODAS LAS PRUEBAS PASARON'
