-- Check-in de tenis: el canchero ve los turnos del día de quien tiene el carnet.
--
-- tenis_checkin (cuerpo de 20261128000000) suma al jugador:
--   carnet      el beneficio del carnet hoy (socio_habilitado_deporte(socio, 'tenis'): servicio
--               de tenis o categoría "Becado Tenis"); false para invitados.
--   turnos_dia  sus turnos de ese día (hora argentina) en reservas no canceladas ni vencidas,
--               extensiones incluidas: lo mismo que cuenta tenis_cargo_jugador para decidir
--               si un turno es el gratis del carnet o uno extra.
--   turno_n     el lugar de esta reserva entre ellos, por orden de reserva (created_at): el
--               primero que se reservó es el gratis, no el que empieza antes.
-- 'motivo' (motivo_cargo) ya estaba. Los "a designar" del titular quedan igual.
-- Misma firma y permisos.

create or replace function tenis_checkin(p_dni text default null, p_numero_socio text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dni     text := tenis_norm_dni(p_dni);
  v_numero  text := nullif(btrim(coalesce(p_numero_socio, '')), '');
  v_ahora   timestamptz := tenis_ahora();
  v_socio   socios%rowtype;
  v_inv     uuid;
  v_persona jsonb;
  v_susp    boolean;
  v_j       tenis_reserva_jugadores%rowtype;
  v_estado  text;
  v_res     text;
  v_propio  int;
  v_ad      jsonb := '[]'::jsonb;
  v_ad_pend int := 0;
  v_r       tenis_reservas%rowtype;
  v_fecha   date;
  v_carnet  boolean := false;
  v_turnos  int;
  v_turno_n int;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if (p_dni is null) = (v_numero is null) then
    perform tenis_error('parametros');
  end if;

  if v_numero is not null then
    select s.* into v_socio from socios s
    where s.numero_socio = v_numero
    order by (s.estado <> 'inactivo') desc
    limit 1;
  else
    if v_dni is null then
      perform tenis_error('dni_invalido');
    end if;
    select s.* into v_socio from socios s
    where tenis_norm_dni(s.dni) = v_dni
    order by (s.estado <> 'inactivo') desc
    limit 1;
    select i.id into v_inv from tenis_invitados i where i.dni = v_dni;
  end if;

  if v_socio.id is null and v_inv is null then
    return jsonb_build_object('persona', null, 'reserva', null, 'jugador', null,
                              'suspendido', false, 'resultado', 'sin_reserva');
  end if;

  if v_socio.id is not null then
    v_persona := jsonb_build_object(
      'tipo', 'socio', 'socio_id', v_socio.id, 'invitado_id', null,
      'nombre', tenis_nombre_socio(v_socio.id), 'numero_socio', v_socio.numero_socio,
      'dni', v_socio.dni, 'semaforo', v_socio.semaforo,
      'es_socio_activo', tenis_es_socio_activo(v_socio.id));
  else
    v_persona := jsonb_build_object(
      'tipo', 'invitado', 'socio_id', null, 'invitado_id', v_inv,
      'nombre', tenis_nombre_persona(null, v_inv), 'numero_socio', null,
      'dni', v_dni, 'semaforo', null, 'es_socio_activo', false);
  end if;

  v_susp := tenis_suspendido(v_socio.id, null, tenis_hoy()) or tenis_suspendido(null, v_inv, tenis_hoy());

  select j.* into v_j
  from tenis_reserva_jugadores j
  join tenis_reservas r on r.id = j.reserva_id
  where ((v_socio.id is not null and j.socio_id = v_socio.id) or (v_inv is not null and j.invitado_id = v_inv))
    and r.estado in ('confirmada', 'pendiente_comprobante')
    and v_ahora >= r.inicio - interval '15 minutes'
    and v_ahora <= r.fin
  order by r.inicio
  limit 1
  for update of j;

  if v_j.id is not null then
    select r.estado into v_estado from tenis_reservas r where r.id = v_j.reserva_id;
  end if;

  v_res := case
    when v_susp then 'suspendido'
    when v_j.id is null then 'sin_reserva'
    when v_estado = 'pendiente_comprobante' then 'comprobante_pendiente'
    else 'ok'
  end;

  if v_res = 'ok' and v_j.check_in_at is null then
    update tenis_reserva_jugadores
       set check_in_at = v_ahora, check_in_por = auth.uid()
     where id = v_j.id
    returning * into v_j;
    if v_j.socio_id is not null then
      insert into accesos (socio_id, punto, semaforo) values (v_j.socio_id, 'tenis', v_socio.semaforo);
    end if;
  end if;

  if v_j.id is not null then
    v_propio := case when v_j.cobrado then v_j.cargo - coalesce(v_j.monto_cobrado, v_j.cargo) else v_j.cargo end
                + case when v_j.cargo_no_show_cobrado then 0 else v_j.cargo_no_show end;
    if v_j.es_titular then
      select coalesce(jsonb_agg(jsonb_build_object(
               'jugador_id', a.id, 'cargo', a.cargo, 'cobrado', a.cobrado,
               'pendiente', case when a.cobrado then a.cargo - coalesce(a.monto_cobrado, a.cargo) else a.cargo end)
             order by a.id), '[]'::jsonb),
             coalesce(sum(case when a.cobrado then a.cargo - coalesce(a.monto_cobrado, a.cargo) else a.cargo end), 0)
        into v_ad, v_ad_pend
      from tenis_reserva_jugadores a
      where a.reserva_id = v_j.reserva_id and a.a_designar;
    end if;

    -- Turnos del día como los cuenta tenis_cargo_jugador (no cancelados ni vencidos,
    -- extensiones incluidas), ordenados por cuándo se reservaron.
    select r.* into v_r from tenis_reservas r where r.id = v_j.reserva_id;
    v_fecha  := tenis_local(v_r.inicio)::date;
    v_carnet := v_j.socio_id is not null and socio_habilitado_deporte(v_j.socio_id, 'tenis');
    select count(*)::int,
           count(*) filter (where (r.created_at, r.id) <= (v_r.created_at, v_r.id))::int
      into v_turnos, v_turno_n
    from tenis_reserva_jugadores j
    join tenis_reservas r on r.id = j.reserva_id
    where ((v_j.socio_id is not null and j.socio_id = v_j.socio_id)
        or (v_j.invitado_id is not null and j.invitado_id = v_j.invitado_id))
      and r.estado not in ('cancelada', 'vencida')
      and r.inicio >= tenis_ts(v_fecha, '00:00')
      and r.inicio <  tenis_ts(v_fecha + 1, '00:00');
  end if;

  return jsonb_build_object(
    'persona',    v_persona,
    'reserva',    case when v_j.id is not null then tenis_reserva_resumen(v_j.reserva_id, true) end,
    'jugador',    case when v_j.id is not null then jsonb_build_object(
                    'jugador_id', v_j.id, 'cargo', v_j.cargo, 'motivo', v_j.motivo_cargo,
                    'cobrado', v_j.cobrado, 'check_in_at', v_j.check_in_at,
                    'es_titular', v_j.es_titular,
                    'monto_cobrado', v_j.monto_cobrado,
                    'diferencia', case when v_j.cobrado then v_j.cargo - coalesce(v_j.monto_cobrado, v_j.cargo) else 0 end,
                    'cargo_no_show', v_j.cargo_no_show,
                    'cargo_no_show_cobrado', v_j.cargo_no_show_cobrado,
                    'pendiente_propio', v_propio,
                    'pendiente', v_propio + v_ad_pend,
                    'a_designar', v_ad,
                    'carnet',     v_carnet,
                    'turnos_dia', v_turnos,
                    'turno_n',    v_turno_n) end,
    'suspendido', v_susp,
    'resultado',  v_res
  );
end;
$$;

revoke execute on function tenis_checkin(text, text) from public, anon;
grant execute on function tenis_checkin(text, text) to authenticated, service_role;
