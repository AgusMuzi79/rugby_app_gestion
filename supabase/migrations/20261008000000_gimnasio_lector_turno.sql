-- Migration: 20261008000000_gimnasio_lector_turno
--
-- T7 — Lector + turnos. Dos piezas:
--   1. `accesos.sin_reserva`: true cuando el socio escaneó en el gimnasio dentro de una
--      franja vigente sin tener reserva en ella (el ingreso se registra igual; es un dato
--      para el encargado y los profes). Default false: las filas existentes no cambian.
--   2. RPC `gimnasio_turno_actual(socio)`: decide TODO en SQL para `socios-qr` (franja
--      vigente ahora, reserva del socio, ocupación, modo y si corresponde bloquear).
--
-- Es un no-op total mientras no haya franjas activas (hoy hay 0): devuelve `sin_franja`
-- y nunca bloquea. Orden de deploy: esta migración ANTES que `socios-qr` (el insert de
-- accesos escribe `sin_reserva`).

alter table accesos
  add column sin_reserva boolean not null default false;

-- Franja vigente ahora (hora local del club, ver gimnasio_ahora()): la franja ACTIVA del
-- día ISO de hoy que contiene el instante actual en [hora_desde - tolerancia, hora_hasta).
-- Si coinciden dos (una termina y la siguiente ya abre por la tolerancia), gana la que ya
-- empezó (la de hora_desde más tardía).
--
-- Devuelve:
--   { ok: true, modo, estado, franja, reserva_id, ocupados, capacidad, bloquear, mensaje }
--   · modo:   'informativo' | 'bloqueante' (gimnasio_config.modo_cupos)
--   · estado: 'sin_franja' | 'cerrada' | 'con_reserva' | 'sin_reserva'
--   · franja: { id, hora_desde, hora_hasta, profesor } | null (sólo sin_franja)
--   · ocupados: reservas 'reservada' o 'asistio' de esa franja hoy; capacidad: cupo efectivo
--     (con cupo_override de la excepción). Ambos null en sin_franja.
--   · bloquear: true SÓLO con modo 'bloqueante' y estado 'sin_reserva'.
--   · mensaje: texto para la tablet ('' en sin_franja).
-- La excepción por fecha (cierre o cupo especial) sale de gimnasio_estado_franja: la
-- específica de la franja gana sobre la general, igual que al reservar. Un socio
-- inexistente o sin reservas no falla: simplemente no tiene reserva.
create or replace function gimnasio_turno_actual(p_socio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ahora     timestamp := gimnasio_ahora();
  v_fecha     date      := v_ahora::date;
  v_modo      text;
  v_tol       integer;
  v_franja    gimnasio_franjas%rowtype;
  v_cerrado   boolean;
  v_capacidad integer;
  v_motivo    text;
  v_ocupados  integer;
  v_reserva   uuid;
  v_estado    text;
  v_prof      text;
  v_horario   text;
  v_mensaje   text;
begin
  select c.modo_cupos, c.tolerancia_min into v_modo, v_tol from gimnasio_config c limit 1;
  v_modo := coalesce(v_modo, 'informativo');
  v_tol  := coalesce(v_tol, 15);

  select f.* into v_franja
  from gimnasio_franjas f
  where f.activa
    and f.dia_semana = extract(isodow from v_ahora)::int
    and v_ahora >= (v_fecha + f.hora_desde) - make_interval(mins => v_tol)
    and v_ahora <  (v_fecha + f.hora_hasta)
  order by f.hora_desde desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true, 'modo', v_modo, 'estado', 'sin_franja', 'franja', null, 'reserva_id', null,
      'ocupados', null, 'capacidad', null, 'bloquear', false, 'mensaje', '');
  end if;

  select e.cerrado, e.capacidad, e.motivo into v_cerrado, v_capacidad, v_motivo
  from gimnasio_estado_franja(v_franja.id, v_fecha) e;
  v_capacidad := coalesce(v_capacidad, v_franja.cupo);

  select count(*) into v_ocupados
  from gimnasio_reservas r
  where r.franja_id = v_franja.id and r.fecha = v_fecha and r.estado in ('reservada', 'asistio');

  select r.id into v_reserva
  from gimnasio_reservas r
  where r.socio_id = p_socio_id and r.franja_id = v_franja.id and r.fecha = v_fecha
    and r.estado in ('reservada', 'asistio')
  limit 1;

  v_horario := to_char(v_franja.hora_desde, 'HH24:MI') || '–' || to_char(v_franja.hora_hasta, 'HH24:MI');
  v_prof    := nullif(btrim(coalesce(v_franja.profesor, '')), '');

  if coalesce(v_cerrado, false) then
    v_estado  := 'cerrada';
    v_reserva := null;
    v_mensaje := 'Franja cerrada: ' || coalesce(v_motivo, '');
  elsif v_reserva is not null then
    v_estado  := 'con_reserva';
    v_mensaje := 'Reserva: ' || v_horario || coalesce(' · Prof. ' || v_prof, '');
  else
    v_estado  := 'sin_reserva';
    v_mensaje := case v_modo
      when 'bloqueante' then 'No tenés una reserva para este horario. Reservá desde la app.'
      else 'Sin reserva en este horario (' || v_horario || ').'
    end;
  end if;

  return jsonb_build_object(
    'ok', true, 'modo', v_modo, 'estado', v_estado,
    'franja', jsonb_build_object(
      'id', v_franja.id,
      'hora_desde', to_char(v_franja.hora_desde, 'HH24:MI'),
      'hora_hasta', to_char(v_franja.hora_hasta, 'HH24:MI'),
      'profesor', v_prof),
    'reserva_id', v_reserva,
    'ocupados', v_ocupados,
    'capacidad', v_capacidad,
    'bloquear', (v_modo = 'bloqueante' and v_estado = 'sin_reserva'),
    'mensaje', v_mensaje);
end;
$$;

revoke execute on function gimnasio_turno_actual(uuid) from public, anon, authenticated;
grant  execute on function gimnasio_turno_actual(uuid) to service_role;
