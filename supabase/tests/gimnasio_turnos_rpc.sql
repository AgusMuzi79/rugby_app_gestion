-- Pruebas de escenario para la migración 20261005000000_gimnasio_turnos.
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

rollback;

\echo 'TODAS LAS PRUEBAS PASARON'
