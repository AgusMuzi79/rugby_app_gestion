-- Migration: 20261203000000_tenis_editar_bloques
--
-- La gestora edita un bloque puntual (torneo, clase, entrenamiento, no disponible, en
-- suspenso) desde la grilla: tipo, título, fecha, horario y cancha (una o todas). Hasta acá
-- un bloque puntual sólo se podía borrar.
--
-- tenis_bloqueo_puntual_editar hace lo mismo que tenis_bloqueo_puntual pero sobre el bloque
-- existente: mismas validaciones, mismo lock por cancha y, en la misma transacción, cancela
-- las reservas vivas que pisa el bloque editado y las devuelve ({bloque_id,
-- reservas_canceladas, reservas}) para que tenis-gestion avise a los jugadores. Sólo gestor.
-- Los bloques fijos se siguen editando con tenis_bloque_guardar (no tocan reservas).
--
-- No redefine ninguna función existente.
--
-- Deploy: aplicar ANTES de deployar la tenis-gestion nueva (que la llama cuando el
-- bloqueo-puntual trae id).

create or replace function tenis_bloqueo_puntual_editar(
  p_id        uuid,
  p_cancha_id uuid,
  p_desde     timestamptz,
  p_hasta     timestamptz,
  p_tipo      text,
  p_titulo    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha  date;
  v_hasta  time;
  v_titulo text := coalesce(nullif(btrim(p_titulo), ''), 'No disponible');
  v_ids    uuid[];
  v_c      uuid;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p_id is null or not exists (select 1 from tenis_bloques b where b.id = p_id) then
    perform tenis_error('bloque_inexistente');
  end if;
  -- Un bloque fijo (dia_semana) se edita con tenis_bloque_guardar.
  if not exists (select 1 from tenis_bloques b where b.id = p_id and b.fecha is not null) then
    perform tenis_error('bloque_invalido');
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or tenis_local(p_hasta - interval '1 microsecond')::date <> tenis_local(p_desde)::date then
    perform tenis_error('bloque_invalido');
  end if;
  if p_cancha_id is not null and not exists (select 1 from tenis_canchas c where c.id = p_cancha_id) then
    perform tenis_error('cancha_inexistente');
  end if;

  -- Mismo lock que toma una reserva en curso: ninguna se cuela entre el bloque y la cancelación.
  for v_c in select c.id from tenis_canchas c
              where p_cancha_id is null or c.id = p_cancha_id order by c.id loop
    perform tenis_lock('cancha:' || v_c::text);
  end loop;

  v_fecha := tenis_local(p_desde)::date;
  v_hasta := case when tenis_local(p_hasta)::date > v_fecha then '24:00'::time
                  else tenis_local(p_hasta)::time end;

  begin
    update tenis_bloques set
      cancha_id  = p_cancha_id,
      tipo       = coalesce(p_tipo, 'no_disponible'),
      titulo     = v_titulo,
      fecha      = v_fecha,
      hora_desde = tenis_local(p_desde)::time,
      hora_hasta = v_hasta
    where id = p_id and fecha is not null;
    if not found then
      -- Borrado entre la validación y el lock.
      perform tenis_error('bloque_inexistente');
    end if;
  exception when check_violation then
    perform tenis_error('bloque_invalido');
  end;

  with canceladas as (
    update tenis_reservas r
       set estado = 'cancelada',
           cancelada_por = auth.uid(),
           cancelada_at = tenis_ahora(),
           cancelacion_motivo = v_titulo,
           hold_vence_at = null
     where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada')
       and r.fin > tenis_ahora()
       and (p_cancha_id is null or r.cancha_id = p_cancha_id)
       and r.rango && tstzrange(p_desde, p_hasta, '[)')
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from canceladas;

  return jsonb_build_object(
    'bloque_id',           p_id,
    'reservas_canceladas', to_jsonb(v_ids),
    'reservas', coalesce((select jsonb_agg(tenis_aviso(x)) from unnest(v_ids) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function tenis_bloqueo_puntual_editar(uuid, uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function tenis_bloqueo_puntual_editar(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
