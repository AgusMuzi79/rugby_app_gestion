-- Migration: 20261125000000_tenis_aviso_jugadores
--
-- Aviso por push a los socios que otro suma a una reserva de tenis ("Te sumaron
-- a un turno de tenis"). Va sobre 20261112000000_reservas_tenis (no la toca).
--
-- Outbox transaccional: el aviso se encola en la MISMA transacción que agrega
-- al jugador, y tenis-cron (cada 5 min) lo reclama, manda el push (al socio y a
-- sus tutores) y lo marca. Por eso llega a los pocos minutos, nunca antes de
-- que la reserva exista de verdad.
--
-- Quién recibe aviso (triggers, así cubre todas las RPC que suman jugadores):
--   · Jugadores socio que NO son el titular, de reservas en
--     'pendiente_comprobante' o 'confirmada': tenis_reservar,
--     tenis_reservar_staff, tenis_jugadores_corregir (sólo los que se suman:
--     la corrección no borra ni reinserta a los que quedan).
--   · Reserva de invitado: nada mientras es un hold ('pendiente_confirmacion');
--     al confirmarse por mail (pasa a 'pendiente_comprobante') se encolan sus
--     jugadores socio. Un hold que vence nunca avisa.
--   · Extensiones (origen 'extension'): no, son los mismos que siguen jugando.
--   · Un aviso por (reserva, socio): unique. Si el socio sale y vuelve a entrar
--     después de avisado, no hay segundo aviso.
--   · Si una corrección saca al socio antes de que salga el aviso, el pendiente
--     se borra (trigger de delete).
--
-- Cron: tenis_avisos_jugadores_reclamar() descarta lo que ya no corresponde
-- (reserva cancelada/vencida/terminada, jugador que ya no está) y reclama los
-- pendientes con for update skip locked; tenis_avisos_jugadores_marcar()
-- registra el resultado de cada uno: 'entregado' (enviado_at), 'sin_dispositivo'
-- (descartado: el socio y sus tutores no tienen teléfono registrado) o 'error'
-- (se reintenta en la corrida siguiente; al tercero se descarta). Un reclamo
-- sin marcar (el cron se cayó a mitad) vuelve a salir a los 10 minutos.
--
-- RLS activa y sin policies; tabla y funciones sólo para service_role.
--
-- Deploy: aplicar ANTES de deployar la tenis-cron nueva (que llama a las dos
-- funciones). Con la tenis-cron vieja los avisos sólo se acumulan.

-- ─── Outbox ───────────────────────────────────────────────────────────────────

create table tenis_avisos_jugadores (
  id            uuid        primary key default gen_random_uuid(),
  reserva_id    uuid        not null references tenis_reservas(id) on delete cascade,
  socio_id      uuid        not null references socios(id) on delete cascade,
  motivo        text        not null default 'agregado' check (motivo in ('agregado')),
  created_at    timestamptz not null default now(),
  -- Último reclamo del cron (null = libre para reclamar).
  reclamado_at  timestamptz,
  intentos      int         not null default 0,
  enviado_at    timestamptz,
  descartado_at timestamptz,
  descarte      text        check (descarte in ('reserva_inactiva', 'turno_pasado', 'jugador_quitado',
                                                'sin_dispositivo', 'reintentos_agotados')),
  error         text,
  constraint tenis_avisos_jugadores_uq unique (reserva_id, socio_id),
  constraint tenis_avisos_jugadores_descartado_check check ((descartado_at is null) = (descarte is null))
);

create index tenis_avisos_jugadores_pendientes_idx on tenis_avisos_jugadores (created_at)
  where enviado_at is null and descartado_at is null;

alter table tenis_avisos_jugadores enable row level security;
revoke all on table tenis_avisos_jugadores from public, anon, authenticated;
grant all on table tenis_avisos_jugadores to service_role;

-- ─── Encolado ─────────────────────────────────────────────────────────────────

-- Encola el aviso de los jugadores socio (no titulares) de una reserva viva que
-- no sea extensión. p_socio_id null = todos los de la reserva.
create or replace function tenis_avisos_jugadores_encolar(p_reserva_id uuid, p_socio_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into tenis_avisos_jugadores (reserva_id, socio_id)
  select j.reserva_id, j.socio_id
  from tenis_reserva_jugadores j
  join tenis_reservas r on r.id = j.reserva_id
  where j.reserva_id = p_reserva_id
    and (p_socio_id is null or j.socio_id = p_socio_id)
    and j.socio_id is not null
    and not j.es_titular
    and j.socio_id is distinct from r.titular_socio_id
    and r.origen <> 'extension'
    and r.estado in ('pendiente_comprobante', 'confirmada')
  on conflict (reserva_id, socio_id) do nothing
$$;

create or replace function tenis_avisos_jugadores_tg_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.socio_id is not null and not new.es_titular then
    perform tenis_avisos_jugadores_encolar(new.reserva_id, new.socio_id);
  end if;
  return null;
end;
$$;

-- Si el jugador sale antes de que salga el aviso, el aviso no sale.
create or replace function tenis_avisos_jugadores_tg_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.socio_id is not null then
    delete from tenis_avisos_jugadores a
     where a.reserva_id = old.reserva_id
       and a.socio_id = old.socio_id
       and a.enviado_at is null
       and a.descartado_at is null;
  end if;
  return null;
end;
$$;

-- Invitado que confirma su hold por mail: recién ahí se avisa a sus jugadores.
create or replace function tenis_avisos_jugadores_tg_confirmada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform tenis_avisos_jugadores_encolar(new.id);
  return null;
end;
$$;

create trigger tenis_avisos_jugadores_insert
  after insert on tenis_reserva_jugadores
  for each row execute function tenis_avisos_jugadores_tg_insert();

create trigger tenis_avisos_jugadores_delete
  after delete on tenis_reserva_jugadores
  for each row execute function tenis_avisos_jugadores_tg_delete();

create trigger tenis_avisos_jugadores_confirmada
  after update of estado on tenis_reservas
  for each row
  when (old.estado = 'pendiente_confirmacion' and new.estado in ('pendiente_comprobante', 'confirmada'))
  execute function tenis_avisos_jugadores_tg_confirmada();

-- ─── Cron: reclamar y marcar ──────────────────────────────────────────────────

-- Descarta lo que ya no corresponde y reclama hasta p_limite pendientes.
-- → {descartados, avisos:[{id, reserva_id, socio_id, titular_nombre, cancha,
--    inicio, modalidad}]}
create or replace function tenis_avisos_jugadores_reclamar(p_limite int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora       timestamptz := tenis_ahora();
  v_descartados int := 0;
  v_n           int;
  v_avisos      jsonb;
begin
  update tenis_avisos_jugadores a
     set descartado_at = v_ahora,
         descarte = case when r.estado not in ('pendiente_comprobante', 'confirmada') then 'reserva_inactiva'
                         else 'turno_pasado' end
    from tenis_reservas r
   where r.id = a.reserva_id
     and a.enviado_at is null and a.descartado_at is null
     and (r.estado not in ('pendiente_comprobante', 'confirmada') or r.fin <= v_ahora);
  get diagnostics v_n = row_count;
  v_descartados := v_descartados + v_n;

  update tenis_avisos_jugadores a
     set descartado_at = v_ahora, descarte = 'jugador_quitado'
   where a.enviado_at is null and a.descartado_at is null
     and not exists (
       select 1 from tenis_reserva_jugadores j
       where j.reserva_id = a.reserva_id and j.socio_id = a.socio_id and not j.es_titular
     );
  get diagnostics v_n = row_count;
  v_descartados := v_descartados + v_n;

  with libres as (
    select a.id
    from tenis_avisos_jugadores a
    where a.enviado_at is null and a.descartado_at is null
      and (a.reclamado_at is null or a.reclamado_at <= v_ahora - interval '10 minutes')
    order by a.created_at
    limit greatest(coalesce(p_limite, 200), 1)
    for update skip locked
  ), reclamados as (
    update tenis_avisos_jugadores a
       set reclamado_at = v_ahora, intentos = a.intentos + 1
      from libres l
     where a.id = l.id
    returning a.id, a.reserva_id, a.socio_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',             c.id,
           'reserva_id',     c.reserva_id,
           'socio_id',       c.socio_id,
           'titular_nombre', tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id),
           'cancha',         k.nombre,
           'inicio',         r.inicio,
           'modalidad',      r.modalidad
         ) order by r.inicio, c.id), '[]'::jsonb)
    into v_avisos
  from reclamados c
  join tenis_reservas r on r.id = c.reserva_id
  left join tenis_canchas k on k.id = r.cancha_id;

  return jsonb_build_object('descartados', v_descartados, 'avisos', v_avisos);
end;
$$;

-- Resultado de cada aviso reclamado: [{id, resultado: 'entregado' |
-- 'sin_dispositivo' | 'error', error}]. Sólo toca avisos todavía pendientes.
-- → {actualizados, entregados, sin_dispositivo, con_error, agotados}
create or replace function tenis_avisos_jugadores_marcar(p_resultados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := tenis_ahora();
  v_e     jsonb;
  v_id    uuid;
  v_res   text;
  v_int   int;
  v_out   jsonb := jsonb_build_object('actualizados', 0, 'entregados', 0, 'sin_dispositivo', 0,
                                      'con_error', 0, 'agotados', 0);
  v_clave text;
begin
  if p_resultados is null or jsonb_typeof(p_resultados) <> 'array' then
    perform tenis_error('parametros');
  end if;

  for v_e in select e from jsonb_array_elements(p_resultados) e loop
    v_id  := case when v_e->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (v_e->>'id')::uuid end;
    v_res := v_e->>'resultado';
    continue when v_id is null or v_res is null or v_res not in ('entregado', 'sin_dispositivo', 'error');

    if v_res = 'entregado' then
      update tenis_avisos_jugadores
         set enviado_at = v_ahora, error = null, reclamado_at = null
       where id = v_id and enviado_at is null and descartado_at is null;
      v_clave := 'entregados';
    elsif v_res = 'sin_dispositivo' then
      update tenis_avisos_jugadores
         set descartado_at = v_ahora, descarte = 'sin_dispositivo', reclamado_at = null
       where id = v_id and enviado_at is null and descartado_at is null;
      v_clave := 'sin_dispositivo';
    else
      update tenis_avisos_jugadores
         set error = left(coalesce(nullif(v_e->>'error', ''), 'error'), 500),
             reclamado_at = null,
             descartado_at = case when intentos >= 3 then v_ahora end,
             descarte = case when intentos >= 3 then 'reintentos_agotados' end
       where id = v_id and enviado_at is null and descartado_at is null
      returning intentos into v_int;
      v_clave := case when v_int >= 3 then 'agotados' else 'con_error' end;
    end if;

    if found then
      v_out := v_out
        || jsonb_build_object('actualizados', (v_out->>'actualizados')::int + 1)
        || jsonb_build_object(v_clave, (v_out->>v_clave)::int + 1);
    end if;
  end loop;

  return v_out;
end;
$$;

-- ─── Permisos: sólo service_role (tenis-cron) ────────────────────────────────

revoke execute on function tenis_avisos_jugadores_encolar(uuid, uuid)  from public, anon, authenticated;
revoke execute on function tenis_avisos_jugadores_tg_insert()          from public, anon, authenticated;
revoke execute on function tenis_avisos_jugadores_tg_delete()          from public, anon, authenticated;
revoke execute on function tenis_avisos_jugadores_tg_confirmada()      from public, anon, authenticated;
revoke execute on function tenis_avisos_jugadores_reclamar(int)        from public, anon, authenticated;
revoke execute on function tenis_avisos_jugadores_marcar(jsonb)        from public, anon, authenticated;
grant  execute on function tenis_avisos_jugadores_reclamar(int)        to service_role;
grant  execute on function tenis_avisos_jugadores_marcar(jsonb)        to service_role;
