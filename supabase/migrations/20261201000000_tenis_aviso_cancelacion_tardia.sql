-- Migration: 20261201000000_tenis_aviso_cancelacion_tardia
--
-- Aviso por push a la gestión de tenis cuando un socio cancela su reserva con
-- poca anticipación ("Cancelación tardía"). Decisión de la gestora (2026-11-27):
-- con cancelacion_horas = 0 el socio puede cancelar hasta que empieza el turno,
-- y quiere enterarse de las que caen dentro de las 3 horas previas.
--
--   · tenis_config.aviso_cancelacion_horas (0..72, por defecto 3; 0 = sin aviso),
--     editable con tenis_config_guardar y en la config de los payloads
--     (tenis_config_json la toma sola de la fila).
--   · Outbox tenis_avisos_gestores: una fila por (reserva, perfil destinatario).
--     La encola un trigger en la MISMA transacción que cancela, así cubre
--     cualquier RPC que cancele.
--
-- Cuándo se encola (trigger after update of estado → 'cancelada'):
--   · Canceló el titular (cancelada_por = el perfil del socio titular, igual que
--     tenis_cancelado_por_tipo = 'titular') y ese perfil no es staff de tenis
--     (gestora, admin o canchero): si la gestora cancela su propia reserva, no.
--   · inicio − cancelada_at < aviso_cancelacion_horas (con 3 h justas, no).
--   · No avisa: staff (cancelada_por de otro perfil), sistema (cancelada_por
--     null: comprobante vencido; los holds vencen como 'vencida') ni bloqueos.
--   · Invitados: hoy la web no tiene forma de cancelar (sólo tenis_cancelar
--     desde la app). Si se agrega, hay que marcar esa cancelación para que este
--     trigger la distinga de la del sistema (las dos quedan con cancelada_por null).
--
-- Destinatarios: los perfiles activos que pasarían es_gestor_tenis() (admin, o
-- subcomisión con deporte 'tenis'; roles[] además del rol activo), salvo quien
-- canceló. Un aviso por (reserva, perfil): unique; una reserva cancelada no
-- vuelve a cancelarse.
--
-- Cron (tenis-cron, cada 5 min): tenis_avisos_gestores_reclamar() descarta lo que
-- ya no corresponde (turno terminado; destinatario que dejó de gestionar tenis) y
-- reclama los pendientes con for update skip locked; tenis_avisos_gestores_marcar()
-- registra 'entregado', 'sin_dispositivo' (descartado) o 'error' (se reintenta; al
-- tercero se descarta). Un reclamo sin marcar vuelve a salir a los 10 minutos.
-- Igual que tenis_avisos_jugadores (20261125000000), pero dirigido a perfiles.
--
-- RLS activa y sin policies; tabla y funciones del cron sólo para service_role.
--
-- Deploy: aplicar ANTES de deployar la tenis-cron nueva (que llama a las dos
-- funciones). Con la tenis-cron vieja los avisos sólo se acumulan.

-- ─── Config ───────────────────────────────────────────────────────────────────

alter table tenis_config add column aviso_cancelacion_horas int not null default 3
  check (aviso_cancelacion_horas between 0 and 72);

-- ─── Helpers por perfil ──────────────────────────────────────────────────────

-- Mismo criterio que es_gestor_tenis(), para un perfil cualquiera.
create or replace function tenis_perfil_gestor(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = p_profile_id
      and p.activo
      and (
        p.rol = 'admin' or 'admin' = any (coalesce(p.roles, '{}'))
        or ((p.rol = 'subcomision' or 'subcomision' = any (coalesce(p.roles, '{}')))
            and p.deporte = 'tenis')
      )
  )
$$;

-- Mismo criterio que es_canchero() (gestora, admin o canchero), para un perfil cualquiera.
create or replace function tenis_perfil_staff(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tenis_perfil_gestor(p_profile_id) or exists (
    select 1 from profiles p
    where p.id = p_profile_id
      and p.activo
      and (p.rol = 'canchero' or 'canchero' = any (coalesce(p.roles, '{}')))
  )
$$;

-- ─── Outbox ───────────────────────────────────────────────────────────────────

create table tenis_avisos_gestores (
  id            uuid        primary key default gen_random_uuid(),
  reserva_id    uuid        not null references tenis_reservas(id) on delete cascade,
  profile_id    uuid        not null references profiles(id) on delete cascade,
  motivo        text        not null default 'cancelacion_tardia' check (motivo in ('cancelacion_tardia')),
  created_at    timestamptz not null default now(),
  -- Último reclamo del cron (null = libre para reclamar).
  reclamado_at  timestamptz,
  intentos      int         not null default 0,
  enviado_at    timestamptz,
  descartado_at timestamptz,
  descarte      text        check (descarte in ('turno_pasado', 'sin_permiso', 'sin_dispositivo', 'reintentos_agotados')),
  error         text,
  constraint tenis_avisos_gestores_uq unique (reserva_id, profile_id, motivo),
  constraint tenis_avisos_gestores_descartado_check check ((descartado_at is null) = (descarte is null))
);

create index tenis_avisos_gestores_pendientes_idx on tenis_avisos_gestores (created_at)
  where enviado_at is null and descartado_at is null;

alter table tenis_avisos_gestores enable row level security;
revoke all on table tenis_avisos_gestores from public, anon, authenticated;
grant all on table tenis_avisos_gestores to service_role;

-- ─── Encolado ─────────────────────────────────────────────────────────────────

create or replace function tenis_avisos_gestores_tg_cancelada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horas int := (select c.aviso_cancelacion_horas from tenis_config c where c.id);
begin
  if coalesce(v_horas, 0) = 0
     or new.cancelada_por is null
     or tenis_cancelado_por_tipo(new.cancelada_por, new.titular_socio_id) <> 'titular'
     or tenis_perfil_staff(new.cancelada_por)
     or new.inicio - coalesce(new.cancelada_at, tenis_ahora()) >= make_interval(hours => v_horas) then
    return null;
  end if;

  insert into tenis_avisos_gestores (reserva_id, profile_id)
  select new.id, p.id
  from profiles p
  where tenis_perfil_gestor(p.id)
    and p.id is distinct from new.cancelada_por
  on conflict (reserva_id, profile_id, motivo) do nothing;
  return null;
end;
$$;

create trigger tenis_avisos_gestores_cancelada
  after update of estado on tenis_reservas
  for each row
  when (new.estado = 'cancelada' and old.estado is distinct from 'cancelada')
  execute function tenis_avisos_gestores_tg_cancelada();

-- ─── Cron: reclamar y marcar ──────────────────────────────────────────────────

-- Descarta lo que ya no corresponde y reclama hasta p_limite pendientes.
-- → {descartados, avisos:[{id, reserva_id, profile_id, motivo, titular_nombre, cancha,
--    inicio, anticipacion_min}]}
create or replace function tenis_avisos_gestores_reclamar(p_limite int default 200)
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
  update tenis_avisos_gestores a
     set descartado_at = v_ahora, descarte = 'turno_pasado'
    from tenis_reservas r
   where r.id = a.reserva_id
     and a.enviado_at is null and a.descartado_at is null
     and r.fin <= v_ahora;
  get diagnostics v_n = row_count;
  v_descartados := v_descartados + v_n;

  update tenis_avisos_gestores a
     set descartado_at = v_ahora, descarte = 'sin_permiso'
   where a.enviado_at is null and a.descartado_at is null
     and not tenis_perfil_gestor(a.profile_id);
  get diagnostics v_n = row_count;
  v_descartados := v_descartados + v_n;

  with libres as (
    select a.id
    from tenis_avisos_gestores a
    where a.enviado_at is null and a.descartado_at is null
      and (a.reclamado_at is null or a.reclamado_at <= v_ahora - interval '10 minutes')
    order by a.created_at
    limit greatest(coalesce(p_limite, 200), 1)
    for update skip locked
  ), reclamados as (
    update tenis_avisos_gestores a
       set reclamado_at = v_ahora, intentos = a.intentos + 1
      from libres l
     where a.id = l.id
    returning a.id, a.reserva_id, a.profile_id, a.motivo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',               c.id,
           'reserva_id',       c.reserva_id,
           'profile_id',       c.profile_id,
           'motivo',           c.motivo,
           'titular_nombre',   tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id),
           'cancha',           k.nombre,
           'inicio',           r.inicio,
           'anticipacion_min', r.cancelacion_anticipacion_min
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
create or replace function tenis_avisos_gestores_marcar(p_resultados jsonb)
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
      update tenis_avisos_gestores
         set enviado_at = v_ahora, error = null, reclamado_at = null
       where id = v_id and enviado_at is null and descartado_at is null;
      v_clave := 'entregados';
    elsif v_res = 'sin_dispositivo' then
      update tenis_avisos_gestores
         set descartado_at = v_ahora, descarte = 'sin_dispositivo', reclamado_at = null
       where id = v_id and enviado_at is null and descartado_at is null;
      v_clave := 'sin_dispositivo';
    else
      update tenis_avisos_gestores
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

-- ─── Guardar la config: igual que en 20261128000000 más aviso_cancelacion_horas ─

create or replace function tenis_config_guardar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg tenis_config%rowtype;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    perform tenis_error('parametros');
  end if;

  begin
    update tenis_config c set
      hora_desde              = coalesce((p->>'hora_desde')::time, c.hora_desde),
      hora_hasta              = coalesce((p->>'hora_hasta')::time, c.hora_hasta),
      modulo_min              = coalesce((p->>'modulo_min')::int, c.modulo_min),
      margen_inicio_min       = coalesce((p->>'margen_inicio_min')::int, c.margen_inicio_min),
      singles_min             = coalesce((p->>'singles_min')::int, c.singles_min),
      dobles_min              = coalesce((p->>'dobles_min')::int, c.dobles_min),
      max_reservas_dia        = coalesce((p->>'max_reservas_dia')::int, c.max_reservas_dia),
      max_activas             = coalesce((p->>'max_activas')::int, c.max_activas),
      anticipacion_dias       = coalesce((p->>'anticipacion_dias')::int, c.anticipacion_dias),
      dias_vista              = coalesce((p->>'dias_vista')::int, c.dias_vista),
      cancelacion_horas       = coalesce((p->>'cancelacion_horas')::int, c.cancelacion_horas),
      aviso_cancelacion_horas = coalesce((p->>'aviso_cancelacion_horas')::int, c.aviso_cancelacion_horas),
      comprobante_horas_antes = coalesce((p->>'comprobante_horas_antes')::int, c.comprobante_horas_antes),
      hold_min                = coalesce((p->>'hold_min')::int, c.hold_min),
      alias_pago              = coalesce(nullif(btrim(p->>'alias_pago'), ''), c.alias_pago),
      precio_socio_single     = coalesce((p->>'precio_socio_single')::int, c.precio_socio_single),
      precio_socio_dobles     = coalesce((p->>'precio_socio_dobles')::int, c.precio_socio_dobles),
      precio_nosocio_single   = coalesce((p->>'precio_nosocio_single')::int, c.precio_nosocio_single),
      precio_nosocio_dobles   = coalesce((p->>'precio_nosocio_dobles')::int, c.precio_nosocio_dobles),
      bloquear_morosos        = coalesce((p->>'bloquear_morosos')::boolean, c.bloquear_morosos),
      updated_by              = auth.uid()
    where c.id
    returning * into v_cfg;
  exception
    when check_violation or invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range then
      perform tenis_error('config_invalida');
  end;

  return (to_jsonb(v_cfg) - 'id') || jsonb_build_object('horarios', tenis_horarios_json());
end;
$$;

-- ─── Permisos ─────────────────────────────────────────────────────────────────

revoke execute on function tenis_perfil_gestor(uuid)              from public, anon, authenticated;
revoke execute on function tenis_perfil_staff(uuid)               from public, anon, authenticated;
revoke execute on function tenis_avisos_gestores_tg_cancelada()   from public, anon, authenticated;
revoke execute on function tenis_avisos_gestores_reclamar(int)    from public, anon, authenticated;
revoke execute on function tenis_avisos_gestores_marcar(jsonb)    from public, anon, authenticated;
grant  execute on function tenis_avisos_gestores_reclamar(int)    to service_role;
grant  execute on function tenis_avisos_gestores_marcar(jsonb)    to service_role;
-- tenis_config_guardar conserva sus permisos (create or replace): authenticated y service_role.
