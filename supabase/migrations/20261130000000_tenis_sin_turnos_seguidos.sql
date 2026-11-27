-- Migration: 20261130000000_tenis_sin_turnos_seguidos
--
-- Tenis: nadie juega dos turnos seguidos (pedido de la gestora, 2026-11-27). Va sobre
-- 20261128000000_tenis_paridad_ondepor (no la toca: las funciones que cambian se redefinen acá
-- con la misma firma, así que los permisos se mantienen; igual se vuelven a declarar abajo).
--
--  · "Seguido" = pegado: la otra reserva del jugador termina justo cuando empieza esta, o
--    empieza justo cuando termina esta, en cualquier cancha. Con 30 min o más en el medio, pasa.
--    Lo que se pisa sigue siendo jugador_ocupado (se valida antes).
--  · Vale para todos los jugadores de la reserva: titular, otros socios e invitados (por DNI o
--    por invitado_id). Los "Socio a designar" no tienen identidad y no cuentan.
--  · Sólo reservas vivas: pendiente_confirmacion, pendiente_comprobante, confirmada, jugada
--    (las mismas que jugador_ocupado). Las extensiones del canchero son reservas vivas
--    (origen 'extension') y cuentan: quien extendió hasta las 11:30 juega hasta las 11:30, así
--    que un turno a las 11:30 queda pegado. Crear la extensión no valida la regla (es staff).
--  · Aplica donde aplican los límites: reserva del socio, web de invitados (tenis_crear_reserva
--    con p_aplicar_limites) y edición del socio (tenis_editar_reserva; sólo si cambia
--    cancha/hora/modalidad o el jugador es nuevo, así editar en el lugar o el comentario no se
--    traba por algo que ya estaba). tenis_cotizar da lo mismo porque corre esas RPC.
--    Exentos: reserva telefónica de la gestora, corrección de jugadores y extensión del canchero.
--
-- Función nueva (interna): tenis_jugador_turno_seguido(p_socio, p_invitado, p_inicio, p_fin,
-- p_excluir_reserva). Redefinidas: tenis_crear_reserva, tenis_editar_reserva.
--
-- Código nuevo: turno_seguido (detail = nombre de la persona, como jugador_ocupado).
--
-- Deploy: aplicar antes de la app/web que muestran el texto (sin el texto, la app muestra el
-- genérico; nada se rompe).

-- true si la persona (socio o invitado) tiene otra reserva viva pegada a [p_inicio, p_fin).
-- Persona vacía ("a designar") → false.
create or replace function tenis_jugador_turno_seguido(
  p_socio_id        uuid,
  p_invitado_id     uuid,
  p_inicio          timestamptz,
  p_fin             timestamptz,
  p_excluir_reserva uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_socio_id is not null or p_invitado_id is not null) and exists (
    select 1
    from tenis_reserva_jugadores j
    join tenis_reservas r on r.id = j.reserva_id
    where r.id is distinct from p_excluir_reserva
      and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
      and (r.fin = p_inicio or r.inicio = p_fin)
      and ((p_socio_id is not null and j.socio_id = p_socio_id)
        or (p_invitado_id is not null and j.invitado_id = p_invitado_id))
  )
$$;

-- Igual que en 20261128000000 más turno_seguido cuando p_aplicar_limites.
create or replace function tenis_crear_reserva(
  p_cancha_id           uuid,
  p_inicio              timestamptz,
  p_modalidad           text,
  p_titular_socio_id    uuid,
  p_titular_invitado_id uuid,
  p_jugadores           jsonb,
  p_origen              text,
  p_estado              text,
  p_aplicar_limites     boolean,
  p_creado_por          uuid,
  p_hold_vence_at       timestamptz default null,
  p_token_hash          text default null,
  p_comentario          text default null,
  p_flexible            boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     tenis_config%rowtype;
  v_ahora   timestamptz := tenis_ahora();
  v_fin     timestamptz;
  v_fecha   date;
  v_coment  text := tenis_norm_comentario(p_comentario);
  v_socios  uuid[] := array[p_titular_socio_id];
  v_invs    uuid[] := array[p_titular_invitado_id];
  v_item    jsonb;
  v_p       record;
  v_c       record;
  v_clave   text;
  v_id      uuid;
  i         int;
begin
  select * into v_cfg from tenis_config where id;

  if p_modalidad is null or p_modalidad not in ('singles', 'dobles') then
    perform tenis_error('modalidad_invalida');
  end if;
  if p_cancha_id is null or p_inicio is null
     or (p_titular_socio_id is null) = (p_titular_invitado_id is null) then
    perform tenis_error('parametros');
  end if;

  v_fin   := p_inicio + make_interval(mins => case when p_modalidad = 'singles'
                                                   then v_cfg.singles_min else v_cfg.dobles_min end);
  v_fecha := tenis_local(p_inicio)::date;

  if p_inicio <= v_ahora then
    perform tenis_error('pasado');
  end if;
  if v_fecha > tenis_hoy() + v_cfg.anticipacion_dias then
    perform tenis_error('anticipacion');
  end if;

  perform tenis_lock('cancha:' || p_cancha_id::text);
  perform tenis_validar_turno(p_cancha_id, p_inicio, v_fin);
  if p_aplicar_limites then
    perform tenis_validar_hueco(p_cancha_id, p_inicio, v_fin);
  end if;

  if p_jugadores is null or jsonb_typeof(p_jugadores) <> 'array' then
    perform tenis_error('parametros');
  end if;
  if jsonb_array_length(p_jugadores) <> (case when p_modalidad = 'singles' then 1 else 3 end) then
    perform tenis_error('cantidad_jugadores');
  end if;

  for v_item in select e from jsonb_array_elements(p_jugadores) e loop
    select * into v_p from tenis_resolver_jugador(v_item, null, p_flexible);
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
    where k is not null
    order by k
  loop
    perform tenis_lock(v_clave);
  end loop;

  for i in 1 .. array_length(v_socios, 1) loop
    perform tenis_validar_persona(v_socios[i], v_invs[i], v_fecha, i = 1);

    if exists (
      select 1
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
        and r.rango && tstzrange(p_inicio, v_fin, '[)')
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    ) then
      perform tenis_error('jugador_ocupado', tenis_nombre_persona(v_socios[i], v_invs[i]));
    end if;

    if p_aplicar_limites and tenis_jugador_turno_seguido(v_socios[i], v_invs[i], p_inicio, v_fin) then
      perform tenis_error('turno_seguido', tenis_nombre_persona(v_socios[i], v_invs[i]));
    end if;
  end loop;

  if p_aplicar_limites then
    if (
      select count(*) from tenis_reservas r
      where (r.titular_socio_id = p_titular_socio_id or r.titular_invitado_id = p_titular_invitado_id)
        and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada', 'no_show')
        and r.inicio >= tenis_ts(v_fecha, '00:00')
        and r.inicio <  tenis_ts(v_fecha + 1, '00:00')
    ) >= v_cfg.max_reservas_dia then
      perform tenis_error('limite_dia');
    end if;

    if (
      select count(*) from tenis_reservas r
      where (r.titular_socio_id = p_titular_socio_id or r.titular_invitado_id = p_titular_invitado_id)
        and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada')
        and r.fin > v_ahora
    ) >= v_cfg.max_activas then
      perform tenis_error('limite_activas');
    end if;
  end if;

  begin
    insert into tenis_reservas (
      cancha_id, inicio, fin, modalidad, origen, titular_socio_id, titular_invitado_id,
      estado, hold_vence_at, confirmacion_token_hash, creado_por, comentario
    ) values (
      p_cancha_id, p_inicio, v_fin, p_modalidad, p_origen, p_titular_socio_id, p_titular_invitado_id,
      p_estado, p_hold_vence_at, p_token_hash, p_creado_por, v_coment
    )
    returning id into v_id;
  exception when exclusion_violation then
    perform tenis_error('turno_ocupado');
  end;

  for i in 1 .. array_length(v_socios, 1) loop
    select * into v_c from tenis_cargo_jugador(v_socios[i], v_invs[i], p_inicio, p_modalidad, v_id);
    insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, cargo, motivo_cargo, a_designar)
    values (v_id, v_socios[i], v_invs[i], i = 1, v_c.cargo, v_c.motivo, v_socios[i] is null and v_invs[i] is null);
  end loop;

  return tenis_reserva_resumen(v_id);
end;
$$;

-- Igual que en 20261128000000 más turno_seguido si cambia el turno o el jugador es nuevo.
create or replace function tenis_editar_reserva(
  p_reserva_id uuid,
  p_cancha_id  uuid,
  p_inicio     timestamptz,
  p_modalidad  text,
  p_jugadores  jsonb,
  p_comentario text default null
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
  v_coment   text := tenis_norm_comentario(p_comentario);
  v_socios   uuid[];
  v_invs     uuid[];
  v_item     jsonb;
  v_p        record;
  v_j        record;
  v_c        record;
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
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_r.cancha_id not in (v_cancha0, coalesce(p_cancha_id, v_cancha0)) then
    perform tenis_error('reintentar');
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

  if p_jugadores is null or jsonb_typeof(p_jugadores) <> 'array' then
    perform tenis_error('parametros');
  end if;
  if jsonb_array_length(p_jugadores) <> (case when p_modalidad = 'singles' then 1 else 3 end) then
    perform tenis_error('cantidad_jugadores');
  end if;

  v_socios := array[v_socio];
  v_invs   := array[null::uuid];
  for v_item in select e from jsonb_array_elements(p_jugadores) e loop
    select * into v_p from tenis_resolver_jugador(v_item, p_reserva_id, true);
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
    where k is not null
    order by k
  loop
    perform tenis_lock(v_clave);
  end loop;

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
    if v_cambia or v_nuevo then
      perform tenis_validar_persona(v_socios[i], v_invs[i], v_fecha, i = 1);
    end if;

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

    if (v_cambia or v_nuevo)
       and tenis_jugador_turno_seguido(v_socios[i], v_invs[i], p_inicio, v_fin, p_reserva_id) then
      perform tenis_error('turno_seguido', tenis_nombre_persona(v_socios[i], v_invs[i]));
    end if;
  end loop;

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

  if p_comentario is not null and v_coment is distinct from v_r.comentario then
    update tenis_reservas set comentario = v_coment where id = p_reserva_id;
  end if;

  perform tenis_jugadores_sincronizar(p_reserva_id, v_socios, v_invs);

  if v_cambia then
    update tenis_reserva_jugadores
       set check_in_at = null, check_in_por = null
     where reserva_id = p_reserva_id and check_in_at is not null;
  end if;

  for v_j in
    select * from tenis_reserva_jugadores
     where reserva_id = p_reserva_id and (v_cambia or not cobrado)
     order by es_titular desc
  loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, p_inicio, p_modalidad, p_reserva_id);
    if v_c.cargo is distinct from v_j.cargo or v_c.motivo is distinct from v_j.motivo_cargo then
      update tenis_reserva_jugadores set cargo = v_c.cargo, motivo_cargo = v_c.motivo where id = v_j.id;
    end if;
    if v_j.cobrado then
      perform tenis_cobro_ajuste_sincronizar(v_j.id);
    end if;
  end loop;

  return tenis_reserva_resumen(p_reserva_id);
exception
  when deadlock_detected then
    perform tenis_error('reintentar');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Permisos
-- ═════════════════════════════════════════════════════════════════════════════

revoke execute on function tenis_jugador_turno_seguido(uuid, uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
revoke execute on function tenis_crear_reserva(uuid, timestamptz, text, uuid, uuid, jsonb, text, text, boolean, uuid,
                                               timestamptz, text, text, boolean) from public, anon, authenticated;
revoke execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb, text) from public, anon;
grant  execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb, text) to authenticated, service_role;
