-- Migration: 20261126000000_tenis_editar_reserva
--
-- El socio titular edita su propia reserva de tenis desde "MIS RESERVAS":
-- jugadores, día/horario, cancha y singles/dobles. Depende sólo de
-- 20261112000000_reservas_tenis (reusa sus helpers y códigos de error).
--
-- tenis_editar_reserva(p_reserva_id, p_cancha_id, p_inicio, p_modalidad, p_jugadores)
--   · Editable: el socio logueado es el titular, la reserva es suya (origen
--     'socio'), está confirmada y faltan al menos cancelacion_horas (3 h) para
--     el turno ORIGINAL (mismo corte que cancelar). Si no: reserva_no_editable;
--     con menos de 3 h: fuera_de_plazo.
--   · El turno NUEVO pasa las mismas reglas que una reserva nueva del socio:
--     grilla, horario, duración, pasado, anticipación (2 días), bloques, solape
--     (turno_ocupado, sin contar esta misma reserva), optimizador de huecos
--     (hueco_invalido, salvo hoy), jugadores ocupados en otro turno,
--     suspendidos y morosos, cantidad de jugadores por modalidad.
--   · Límites del titular contando la reserva editada una sola vez: 1 por día en
--     el día NUEVO (sólo si cambia el día) y 2 activas (la editada no suma).
--   · Se actualiza la MISMA fila (conserva el id). Jugadores: los que siguen se
--     actualizan; si cambió el turno (cancha, inicio o modalidad) se les borra el
--     cobro y el check-in; los que salen se borran; los nuevos se INSERTAN en
--     tenis_reserva_jugadores (inserts normales: un trigger AFTER INSERT de esa
--     tabla los ve como cualquier jugador agregado). Los cargos se recalculan con
--     tenis_cargo_jugador excluyendo esta reserva (regla del carnet); con el
--     turno sin cambios sólo los no cobrados (igual que tenis_jugadores_corregir).
--   · p_jugadores: mismo formato que tenis_reservar, sin el titular (singles 1,
--     dobles 3). Además acepta {invitado_id} SÓLO para un invitado que ya juega
--     en esta reserva (la app del socio no conoce su DNI); cualquier otro
--     invitado_id → parametros.
--   · Devuelve el mismo resumen que tenis_reservar (tenis_reserva_resumen).
--
-- Código nuevo: reserva_no_editable.
--
-- Deploy: aplicar después de 20261112000000. No hay Edge Function que cambiar.

create or replace function tenis_editar_reserva(
  p_reserva_id uuid,
  p_cancha_id  uuid,
  p_inicio     timestamptz,
  p_modalidad  text,
  p_jugadores  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_socio    uuid := get_socio_id();
  v_cfg      tenis_config%rowtype;
  v_ahora    timestamptz := tenis_ahora();
  v_r        tenis_reservas%rowtype;
  v_cancha0  uuid;
  v_fin      timestamptz;
  v_fecha    date;
  v_cambia   boolean;
  v_socios   uuid[];
  v_invs     uuid[];
  v_item     jsonb;
  v_p        record;
  v_j        record;
  v_c        record;
  v_iid      uuid;
  v_clave    text;
  v_nuevo    boolean;
  i          int;
begin
  if v_socio is null then
    perform tenis_error('sin_socio');
  end if;
  if p_reserva_id is null then
    perform tenis_error('parametros');
  end if;
  select * into v_cfg from tenis_config where id;

  -- Locks en el mismo orden que tenis_crear_reserva: canchas (la actual y la
  -- nueva, ordenadas), la fila y después cada persona.
  select r.cancha_id into v_cancha0 from tenis_reservas r where r.id = p_reserva_id;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  for v_clave in
    select distinct k from unnest(array['cancha:' || v_cancha0::text,
                                        'cancha:' || coalesce(p_cancha_id, v_cancha0)::text]) k
    order by k
  loop
    perform tenis_lock(v_clave);
  end loop;

  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if v_r.cancha_id is distinct from v_cancha0 then
    -- La movió otra edición mientras esperábamos el lock.
    perform tenis_lock('cancha:' || v_r.cancha_id::text);
  end if;

  if v_r.titular_socio_id is distinct from v_socio
     or v_r.origen <> 'socio'
     or v_r.estado <> 'confirmada' then
    perform tenis_error('reserva_no_editable');
  end if;
  if v_r.inicio - make_interval(hours => v_cfg.cancelacion_horas) < v_ahora then
    perform tenis_error('fuera_de_plazo');
  end if;
  if not tenis_es_socio_activo(v_socio) then
    perform tenis_error('no_es_socio');
  end if;

  -- Turno nuevo: mismas validaciones que tenis_crear_reserva.
  if p_modalidad is null or p_modalidad not in ('singles', 'dobles') then
    perform tenis_error('modalidad_invalida');
  end if;
  if p_cancha_id is null or p_inicio is null then
    perform tenis_error('parametros');
  end if;
  v_fin   := p_inicio + make_interval(mins => case when p_modalidad = 'singles'
                                                 then v_cfg.singles_min else v_cfg.dobles_min end);
  v_fecha := tenis_local(p_inicio)::date;
  v_cambia := p_cancha_id <> v_r.cancha_id or p_inicio <> v_r.inicio or p_modalidad <> v_r.modalidad;

  if p_inicio <= v_ahora then
    perform tenis_error('pasado');
  end if;
  if v_fecha > tenis_hoy() + v_cfg.anticipacion_dias then
    perform tenis_error('anticipacion');
  end if;
  perform tenis_validar_turno(p_cancha_id, p_inicio, v_fin);

  -- Jugadores: cantidad exacta y sin repetidos (el titular no va en la lista).
  if p_jugadores is null or jsonb_typeof(p_jugadores) <> 'array' then
    perform tenis_error('parametros');
  end if;
  if jsonb_array_length(p_jugadores) <> (case when p_modalidad = 'singles' then 1 else 3 end) then
    perform tenis_error('cantidad_jugadores');
  end if;

  v_socios := array[v_socio];
  v_invs   := array[null::uuid];
  for v_item in select e from jsonb_array_elements(p_jugadores) e loop
    if jsonb_typeof(v_item) = 'object' and nullif(v_item->>'invitado_id', '') is not null then
      -- Invitado que ya está en esta reserva (la app del socio no ve su DNI).
      begin
        v_iid := (v_item->>'invitado_id')::uuid;
      exception when invalid_text_representation then
        perform tenis_error('parametros');
      end;
      if not exists (select 1 from tenis_reserva_jugadores j
                      where j.reserva_id = p_reserva_id and j.invitado_id = v_iid) then
        perform tenis_error('parametros');
      end if;
      select null::uuid as socio_id, v_iid as invitado_id into v_p;
    else
      select * into v_p from tenis_resolver_persona(v_item, false);
    end if;
    for i in 1 .. array_length(v_socios, 1) loop
      if (v_p.socio_id is not null and v_socios[i] = v_p.socio_id)
         or (v_p.invitado_id is not null and v_invs[i] = v_p.invitado_id) then
        perform tenis_error('jugadores_duplicados', tenis_nombre_persona(v_p.socio_id, v_p.invitado_id));
      end if;
    end loop;
    v_socios := array_append(v_socios, v_p.socio_id);
    v_invs   := array_append(v_invs, v_p.invitado_id);
  end loop;

  for v_clave in
    select k from unnest(v_socios, v_invs) as u(s, iv)
    cross join lateral (select coalesce('s:' || u.s::text, 'i:' || u.iv::text) as k) kk
    order by k
  loop
    perform tenis_lock(v_clave);
  end loop;

  -- Mover la fila al turno nuevo: la constraint de exclusión no la compara
  -- consigo misma (turno_ocupado sólo contra otras reservas) y, ya movida,
  -- tenis_validar_hueco no la ve ni en su lugar viejo ni en el nuevo.
  if v_cambia then
    begin
      update tenis_reservas
         set cancha_id = p_cancha_id, inicio = p_inicio, fin = v_fin, modalidad = p_modalidad
       where id = p_reserva_id;
    exception when exclusion_violation then
      perform tenis_error('turno_ocupado');
    end;
    perform tenis_validar_hueco(p_cancha_id, p_inicio, v_fin);
  end if;

  for i in 1 .. array_length(v_socios, 1) loop
    v_nuevo := not exists (
      select 1 from tenis_reserva_jugadores j
      where j.reserva_id = p_reserva_id
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    );
    -- Con el turno igual, sólo se valida a los que se suman (como
    -- tenis_jugadores_corregir); con turno nuevo, a todos.
    if v_cambia or v_nuevo then
      perform tenis_validar_persona(v_socios[i], v_invs[i], v_fecha, i = 1);
    end if;

    -- Nadie puede estar en dos turnos que se pisan (en cualquier cancha).
    if exists (
      select 1
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where r.id <> p_reserva_id
        and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
        and r.rango && tstzrange(p_inicio, v_fin, '[)')
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    ) then
      perform tenis_error('jugador_ocupado', tenis_nombre_persona(v_socios[i], v_invs[i]));
    end if;
  end loop;

  -- Límites del titular, sin contar esta reserva.
  if v_fecha <> tenis_local(v_r.inicio)::date and (
    select count(*) from tenis_reservas r
    where r.titular_socio_id = v_socio
      and r.id <> p_reserva_id
      and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada', 'no_show')
      and r.inicio >= tenis_ts(v_fecha, '00:00')
      and r.inicio <  tenis_ts(v_fecha + 1, '00:00')
  ) >= v_cfg.max_reservas_dia then
    perform tenis_error('limite_dia');
  end if;
  if (
    select count(*) from tenis_reservas r
    where r.titular_socio_id = v_socio
      and r.id <> p_reserva_id
      and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada')
      and r.fin > v_ahora
  ) >= v_cfg.max_activas then
    perform tenis_error('limite_activas');
  end if;

  -- Jugadores: sacar a los que ya no están, resetear cobro/check-in de los que
  -- siguen si cambió el turno, e insertar a los nuevos.
  delete from tenis_reserva_jugadores j
   where j.reserva_id = p_reserva_id
     and not j.es_titular
     and not exists (
       select 1 from unnest(v_socios, v_invs) as u(s, iv)
       where (u.s is not null and u.s = j.socio_id) or (u.iv is not null and u.iv = j.invitado_id)
     );

  if v_cambia then
    update tenis_reserva_jugadores
       set cobrado = false, cobrado_por = null, cobrado_at = null,
           check_in_at = null, check_in_por = null
     where reserva_id = p_reserva_id;
  end if;

  for i in 2 .. array_length(v_socios, 1) loop
    insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, cargo)
    select p_reserva_id, v_socios[i], v_invs[i], false, 0
    where not exists (
      select 1 from tenis_reserva_jugadores j
      where j.reserva_id = p_reserva_id
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    );
  end loop;

  -- Cargos: el carnet gratis lo define cada jugador, sin contar esta reserva.
  for v_j in
    select * from tenis_reserva_jugadores
     where reserva_id = p_reserva_id and not cobrado
     order by es_titular desc
  loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, p_inicio, p_modalidad, p_reserva_id);
    update tenis_reserva_jugadores set cargo = v_c.cargo, motivo_cargo = v_c.motivo where id = v_j.id;
  end loop;

  return tenis_reserva_resumen(p_reserva_id);
end;
$$;

revoke execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb) from public, anon;
grant  execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb) to authenticated, service_role;
