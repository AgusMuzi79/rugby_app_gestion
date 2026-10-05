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

-- Franja a reportar ahora (hora local del club, ver gimnasio_ahora()).
-- Candidatas: TODAS las franjas ACTIVAS del día ISO de hoy cuya ventana
-- [hora_desde - tolerancia, hora_hasta) contiene el instante actual. Con franjas pegadas
-- (17-18 y 18-19, tolerancia 15) las ventanas se superponen en los últimos minutos de la
-- primera, así que puede haber dos candidatas.
--   1. Si el socio tiene una reserva 'reservada'/'asistio' en alguna candidata NO cerrada por
--      excepción -> con_reserva con esa franja (si tiene en más de una: la que ya empezó y,
--      luego, la más temprana). Una reserva en una franja cerrada no cuenta.
--   2. Si no, se reporta una candidata: la que ya empezó (la de hora_desde más tardía <= ahora)
--      o, si ninguna empezó, la más próxima. Cerrada por excepción -> cerrada; si no -> sin_reserva.
-- Así quien reservó la franja en curso nunca figura sin reserva por el solapamiento.
--
-- Devuelve:
--   { ok: true, modo, estado, franja, reserva_id, ocupados, capacidad, bloquear, mensaje }
--   · modo:   'informativo' | 'bloqueante' (gimnasio_config.modo_cupos)
--   · estado: 'sin_franja' | 'cerrada' | 'con_reserva' | 'sin_reserva'
--   · franja: { id, hora_desde, hora_hasta, profesor } | null (sólo sin_franja)
--   · ocupados: reservas 'reservada' o 'asistio' de la franja reportada hoy; capacidad: su cupo
--     efectivo (con cupo_override de la excepción). Ambos null en sin_franja.
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
  v_franja_id uuid;
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

  -- 1. Reserva del socio en alguna candidata no cerrada.
  select f.id, r.id, e.capacidad
    into v_franja_id, v_reserva, v_capacidad
  from gimnasio_franjas f
  cross join lateral gimnasio_estado_franja(f.id, v_fecha) e
  join gimnasio_reservas r
    on r.franja_id = f.id and r.fecha = v_fecha and r.socio_id = p_socio_id
   and r.estado in ('reservada', 'asistio')
  where f.activa
    and f.dia_semana = extract(isodow from v_ahora)::int
    and v_ahora >= (v_fecha + f.hora_desde) - make_interval(mins => v_tol)
    and v_ahora <  (v_fecha + f.hora_hasta)
    and not coalesce(e.cerrado, false)
  order by ((v_fecha + f.hora_desde) > v_ahora), f.hora_desde
  limit 1;

  if found then
    select * into v_franja from gimnasio_franjas where id = v_franja_id;
    v_estado  := 'con_reserva';
    v_cerrado := false;
  else
    v_reserva := null;
    -- 2. Sin reserva utilizable: se reporta la que ya empezó (la más tardía) o, si ninguna
    --    empezó, la más próxima.
    select f.* into v_franja
    from gimnasio_franjas f
    where f.activa
      and f.dia_semana = extract(isodow from v_ahora)::int
      and v_ahora >= (v_fecha + f.hora_desde) - make_interval(mins => v_tol)
      and v_ahora <  (v_fecha + f.hora_hasta)
    order by case when (v_fecha + f.hora_desde) <= v_ahora then f.hora_desde end desc nulls last,
             f.hora_desde
    limit 1;

    if not found then
      return jsonb_build_object(
        'ok', true, 'modo', v_modo, 'estado', 'sin_franja', 'franja', null, 'reserva_id', null,
        'ocupados', null, 'capacidad', null, 'bloquear', false, 'mensaje', '');
    end if;

    select e.cerrado, e.capacidad, e.motivo into v_cerrado, v_capacidad, v_motivo
    from gimnasio_estado_franja(v_franja.id, v_fecha) e;
    v_estado := case when coalesce(v_cerrado, false) then 'cerrada' else 'sin_reserva' end;
  end if;

  v_capacidad := coalesce(v_capacidad, v_franja.cupo);

  select count(*) into v_ocupados
  from gimnasio_reservas r
  where r.franja_id = v_franja.id and r.fecha = v_fecha and r.estado in ('reservada', 'asistio');

  v_horario := to_char(v_franja.hora_desde, 'HH24:MI') || '–' || to_char(v_franja.hora_hasta, 'HH24:MI');
  v_prof    := nullif(btrim(coalesce(v_franja.profesor, '')), '');

  v_mensaje := case v_estado
    when 'cerrada'     then 'Franja cerrada: ' || coalesce(v_motivo, '')
    when 'con_reserva' then 'Reserva: ' || v_horario || coalesce(' · Prof. ' || v_prof, '')
    else case v_modo
      when 'bloqueante' then 'No tenés una reserva para este horario. Reservá desde la app.'
      else 'Sin reserva en este horario (' || v_horario || ').'
    end
  end;

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
