-- Migration: 20261128000000_tenis_paridad_ondepor
--
-- Tenis "como OnDepor" (odd/tasks/tenis-paridad-ondepor.md, contrato 1–16). Va sobre
-- 20261112000000, 20261125000000, 20261126000000 y 20261127000000 (no las toca: las
-- funciones que cambian se redefinen acá).
--
--  1. Horarios por día (tenis_horarios, ISO 1 = lunes … 7 = domingo; activo = false: ese día
--     no se abre). Sin fila para el día vale tenis_config.hora_desde/hasta. Todo valida con el
--     horario del día (tenis_validar_turno, optimizador). tenis_horarios_guardar(p) (gestor).
--     config.horarios = [{dia_semana, hora_desde 'HH:MM', hora_hasta 'HH:MM', activo}] (7 días)
--     y horario = {desde, hasta, abierto} del día pedido en disponibilidad y grilla.
--  2. tenis_config.dias_vista (7): el socio ve de hoy a hoy + dias_vista − 1 (fuera_de_vista;
--     nunca menos que la anticipación). Staff (canchero/gestor) sin ventana. reservable = la
--     fecha cae dentro de la anticipación.
--  3. tenis_disponibilidad: cada reserva trae jugadores:[{nombre}] (nombre del padrón tal como
--     está, invitados "Nombre Apellido", "Socio a designar"); sin ids ni DNI de otros.
--  4. tenis_reservas.comentario (≤ 280, recortado, '' = null). p_comentario al final de
--     tenis_reservar, tenis_reservar_staff, tenis_editar_reserva (null = no cambia, '' = borra)
--     y tenis_invitado_reservar. El resumen trae comentario.
--  5. {a_designar: true}: jugador sin socio ni invitado (a_designar = true), precio socio,
--     motivo 'a_designar'. Lo reemplaza la edición del titular o la corrección del canchero;
--     los que siguen no se borran. No-show: el titular paga su precio socio. Check-in del
--     titular: su pendiente incluye los "a designar" (jugador.a_designar con el detalle).
--  6. {invitado:{nombre, apellido}} sin DNI en reservas de socios y de staff: una fila nueva
--     de tenis_invitados por vez (dni null). La web de invitados sigue exigiendo DNI.
--     Editar/corregir aceptan {invitado_id} de un invitado que ya juega en esa reserva.
--  7. tenis_disponibilidad_semana(p_desde, p_dias, p_modalidad) → [{fecha, reservable, horario,
--     slots:[{hora, libres, total}]}].
--  8. tenis_reservas_historial por triggers: una versión por reserva y por sentencia del
--     cliente (una RPC = una versión). tenis_reserva_historial(p_reserva_id).
--  9. cancelacion_anticipacion_min (trigger al cancelar) y tenis_canceladas_listar(...).
-- 10. tenis_reservas_listar(...).  11. tenis_cancelar_varias(p_ids, p_motivo).
-- 12. tenis_reporte(p_tipo, p_desde, p_hasta).  13. Cartelera: tenis_novedades + RPC.
-- 14. tenis_checkin: jugador con monto_cobrado, diferencia, pendiente (incluye no-show y los
--     "a designar" del titular).  15. tenis_cotizar(...): simula la reserva y la deshace.
--     Además tenis_cancelar acepta al canchero como staff.
--
-- Códigos nuevos: fuera_de_vista, comentario_largo, novedad_invalida, novedad_inexistente,
-- reporte_invalido, rango_invalido. (horarios inválidos → config_invalida.)
--
-- Deploy: aplicar ANTES de las Edge Functions y la app de esta feature. Las firmas viejas de
-- tenis_reservar, tenis_reservar_staff, tenis_editar_reserva y tenis_invitado_reservar se
-- reemplazan (el parámetro nuevo tiene default: los llamados por nombre siguen andando).

-- ═════════════════════════════════════════════════════════════════════════════
-- Esquema
-- ═════════════════════════════════════════════════════════════════════════════

create table tenis_horarios (
  dia_semana  int         primary key check (dia_semana between 1 and 7),
  hora_desde  time        not null,
  hora_hasta  time        not null,
  activo      boolean     not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references profiles(id) on delete set null,
  constraint tenis_horarios_horas_check check (hora_desde < hora_hasta)
);

create trigger tenis_horarios_updated_at
  before update on tenis_horarios
  for each row execute function set_updated_at();

insert into tenis_horarios (dia_semana, hora_desde, hora_hasta) values
  (1, '08:00', '22:00'), (2, '08:00', '22:00'), (3, '08:00', '22:00'), (4, '08:00', '22:00'),
  (5, '08:00', '22:00'), (6, '09:00', '22:00'), (7, '10:00', '17:00')
on conflict (dia_semana) do nothing;

alter table tenis_config add column dias_vista int not null default 7 check (dias_vista between 1 and 31);

alter table tenis_reservas add column comentario text check (comentario is null or length(comentario) <= 280);
alter table tenis_reservas add column cancelacion_anticipacion_min int;

update tenis_reservas
   set cancelacion_anticipacion_min = floor(extract(epoch from (inicio - cancelada_at)) / 60)::int
 where estado = 'cancelada' and cancelada_at is not null;

alter table tenis_reserva_jugadores add column a_designar boolean not null default false;
alter table tenis_reserva_jugadores drop constraint tenis_jugadores_persona_check;
alter table tenis_reserva_jugadores add constraint tenis_jugadores_persona_check check (
  case when a_designar then socio_id is null and invitado_id is null
       else (socio_id is null) <> (invitado_id is null) end);
alter table tenis_reserva_jugadores add constraint tenis_jugadores_a_designar_titular_check
  check (not (a_designar and es_titular));
alter table tenis_reserva_jugadores drop constraint tenis_reserva_jugadores_motivo_cargo_check;
alter table tenis_reserva_jugadores add constraint tenis_reserva_jugadores_motivo_cargo_check
  check (motivo_cargo in ('carnet_gratis', 'turno_extra', 'socio', 'no_socio', 'no_show', 'a_designar'));

alter table tenis_invitados alter column dni drop not null;

create table tenis_reservas_historial (
  id          uuid        primary key default gen_random_uuid(),
  reserva_id  uuid        not null references tenis_reservas(id) on delete cascade,
  version     int         not null,
  accion      text        not null check (accion in ('creada', 'editada', 'jugadores', 'cancelada', 'estado', 'cobro')),
  snapshot    jsonb       not null,
  hecho_por   uuid        references profiles(id) on delete set null,  -- null = sistema / web
  hecho_at    timestamptz not null default now(),
  -- Agrupa los cambios de una misma sentencia del cliente en una sola versión.
  tx_id       bigint      not null default txid_current(),
  tx_stmt_at  timestamptz not null default statement_timestamp(),
  constraint tenis_reservas_historial_version_uq unique (reserva_id, version)
);

create table tenis_novedades (
  id             uuid        primary key default gen_random_uuid(),
  titulo         text        not null check (length(btrim(titulo)) between 1 and 120),
  texto          text        not null check (length(btrim(texto)) between 1 and 4000),
  destacada      boolean     not null default false,
  creado_por     uuid        references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  enviada_at     timestamptz,
  push_enviados  int         not null default 0 check (push_enviados >= 0),
  mails_enviados int         not null default 0 check (mails_enviados >= 0)
);

create index tenis_novedades_orden_idx on tenis_novedades (destacada desc, created_at desc);

alter table tenis_horarios           enable row level security;
alter table tenis_reservas_historial enable row level security;
alter table tenis_novedades          enable row level security;
revoke all on table tenis_horarios, tenis_reservas_historial, tenis_novedades from public, anon, authenticated;
grant all on table tenis_horarios, tenis_reservas_historial, tenis_novedades to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Helpers
-- ═════════════════════════════════════════════════════════════════════════════

-- Horario de una fecha local (siempre una fila; sin fila para el día, tenis_config).
create or replace function tenis_horario_dia(p_fecha date)
returns table (hora_desde time, hora_hasta time, activo boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(h.hora_desde, c.hora_desde), coalesce(h.hora_hasta, c.hora_hasta), coalesce(h.activo, true)
  from tenis_config c
  left join tenis_horarios h on h.dia_semana = extract(isodow from p_fecha)::int
  where c.id
$$;

create or replace function tenis_horario_json(p_fecha date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('desde', to_char(h.hora_desde, 'HH24:MI'), 'hasta', to_char(h.hora_hasta, 'HH24:MI'),
                            'abierto', h.activo)
  from tenis_horario_dia(p_fecha) h
$$;

-- Los 7 días: [{dia_semana, hora_desde, hora_hasta, activo}] (fallback a tenis_config).
create or replace function tenis_horarios_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_agg(jsonb_build_object(
           'dia_semana', d,
           'hora_desde', to_char(coalesce(h.hora_desde, c.hora_desde), 'HH24:MI'),
           'hora_hasta', to_char(coalesce(h.hora_hasta, c.hora_hasta), 'HH24:MI'),
           'activo',     coalesce(h.activo, true)) order by d)
  from generate_series(1, 7) d
  cross join tenis_config c
  left join tenis_horarios h on h.dia_semana = d
  where c.id
$$;

-- Config para los payloads: la fila de tenis_config + horarios.
create or replace function tenis_config_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select (to_jsonb(c) - 'id' - 'updated_by' - 'updated_at') || jsonb_build_object('horarios', tenis_horarios_json())
  from tenis_config c where c.id
$$;

-- Días que ve el socio (nunca menos que los que puede reservar).
create or replace function tenis_dias_vista()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(c.dias_vista, c.anticipacion_dias + 1) from tenis_config c where c.id
$$;

create or replace function tenis_reservable(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_fecha between tenis_hoy() and tenis_hoy() + c.anticipacion_dias from tenis_config c where c.id
$$;

-- Comentario: recortado, '' → null, máximo 280.
create or replace function tenis_norm_comentario(p text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(p, '')), '');
begin
  if length(v) > 280 then
    perform tenis_error('comentario_largo');
  end if;
  return v;
end;
$$;

create or replace function tenis_tipo_reserva(p_origen text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_origen when 'socio' then 'reserva_web' when 'telefonica' then 'reserva_telefonica'
                       when 'invitado' then 'reserva_invitado' else 'extension' end
$$;

-- "Socio a designar" cuando no hay persona.
create or replace function tenis_nombre_persona(p_socio_id uuid, p_invitado_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_socio_id is not null then tenis_nombre_socio(p_socio_id)
    when p_invitado_id is null then 'Socio a designar'
    else (select btrim(coalesce(i.nombre, '') || ' ' || coalesce(i.apellido, ''))
            from tenis_invitados i where i.id = p_invitado_id)
  end
$$;

-- Nombre de quien hizo algo (perfil): el del padrón si es socio, si no el del perfil.
create or replace function tenis_nombre_perfil(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tenis_nombre_socio(s.id) from socios s where s.profile_id = p_profile_id limit 1),
    (select nullif(btrim(p.nombre), '') from profiles p where p.id = p_profile_id))
$$;

-- Cargo: igual que en 20261112000000, más "a designar" (sin socio ni invitado) a precio socio.
create or replace function tenis_cargo_jugador(
  p_socio_id        uuid,
  p_invitado_id     uuid,
  p_inicio          timestamptz,
  p_modalidad       text,
  p_excluir_reserva uuid default null
)
returns table (cargo int, motivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_fecha date := tenis_local(p_inicio)::date;
begin
  if p_modalidad is null or p_modalidad not in ('singles', 'dobles') then
    perform tenis_error('modalidad_invalida');
  end if;
  if (p_socio_id is not null and p_invitado_id is not null) or p_inicio is null then
    perform tenis_error('parametros');
  end if;

  if p_socio_id is null and p_invitado_id is null then
    return query select tenis_precio(true, p_modalidad), 'a_designar'::text;
    return;
  end if;

  if p_invitado_id is not null then
    return query select tenis_precio(false, p_modalidad), 'no_socio'::text;
    return;
  end if;

  if socio_habilitado_deporte(p_socio_id, 'tenis') then
    if exists (
      select 1
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where j.socio_id = p_socio_id
        and r.estado not in ('cancelada', 'vencida')
        and (p_excluir_reserva is null or r.id <> p_excluir_reserva)
        and r.inicio >= tenis_ts(v_fecha, '00:00')
        and r.inicio <  tenis_ts(v_fecha + 1, '00:00')
    ) then
      return query select tenis_precio(true, p_modalidad), 'turno_extra'::text;
    else
      return query select 0, 'carnet_gratis'::text;
    end if;
    return;
  end if;

  return query select tenis_precio(true, p_modalidad), 'socio'::text;
end;
$$;

-- Igual que en 20261112000000 con el horario del día.
create or replace function tenis_validar_turno(p_cancha_id uuid, p_inicio timestamptz, p_fin timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg    tenis_config%rowtype;
  v_h      record;
  v_ini    timestamp := tenis_local(p_inicio);
  v_fin    timestamp := tenis_local(p_fin);
  v_fecha  date      := tenis_local(p_inicio)::date;
  v_activa boolean;
begin
  select * into v_cfg from tenis_config where id;
  select * into v_h from tenis_horario_dia(v_fecha);

  select c.activa into v_activa from tenis_canchas c where c.id = p_cancha_id;
  if not found then
    perform tenis_error('cancha_inexistente');
  end if;
  if not v_activa then
    perform tenis_error('cancha_inactiva');
  end if;

  if p_fin <= p_inicio
     or not tenis_en_grilla(v_ini, v_cfg.modulo_min)
     or not tenis_en_grilla(v_fin, v_cfg.modulo_min) then
    perform tenis_error('horario_invalido');
  end if;
  if not v_h.activo or v_ini < v_fecha + v_h.hora_desde or v_fin > v_fecha + v_h.hora_hasta then
    perform tenis_error('fuera_de_horario');
  end if;

  if exists (
    select 1 from tenis_bloques_dia(v_fecha) b
    where b.cancha_id = p_cancha_id and b.inicio < p_fin and b.fin > p_inicio
  ) then
    perform tenis_error('bloqueado');
  end if;
end;
$$;

-- Igual que en 20261112000000 con la apertura/cierre del día.
create or replace function tenis_validar_hueco(p_cancha_id uuid, p_inicio timestamptz, p_fin timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg   tenis_config%rowtype;
  v_h     record;
  v_fecha date := tenis_local(p_inicio)::date;
  v_prev  timestamptz;
  v_next  timestamptz;
  v_antes numeric;
  v_desp  numeric;
begin
  select * into v_cfg from tenis_config where id;
  if v_fecha = tenis_hoy() then
    return;
  end if;
  select * into v_h from tenis_horario_dia(v_fecha);

  select greatest(
           tenis_ts(v_fecha, v_h.hora_desde),
           (select max(r.fin) from tenis_reservas r
             where r.cancha_id = p_cancha_id
               and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
               and r.fin <= p_inicio and r.fin > tenis_ts(v_fecha, '00:00')),
           (select max(b.fin) from tenis_bloques_dia(v_fecha) b
             where b.cancha_id = p_cancha_id and b.fin <= p_inicio))
    into v_prev;
  select least(
           tenis_ts(v_fecha, v_h.hora_hasta),
           (select min(r.inicio) from tenis_reservas r
             where r.cancha_id = p_cancha_id
               and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
               and r.inicio >= p_fin and r.inicio < tenis_ts(v_fecha + 1, '00:00')),
           (select min(b.inicio) from tenis_bloques_dia(v_fecha) b
             where b.cancha_id = p_cancha_id and b.inicio >= p_fin))
    into v_next;

  v_antes := extract(epoch from (p_inicio - v_prev)) / 60;
  v_desp  := extract(epoch from (v_next - p_fin)) / 60;
  if (v_antes > 0 and v_antes < v_cfg.singles_min) or (v_desp > 0 and v_desp < v_cfg.singles_min) then
    perform tenis_error('hueco_invalido');
  end if;
end;
$$;

-- Jugador del JSON de entrada, con lo nuevo de esta migración:
--   {invitado_id}                  → invitado que ya juega en p_reserva_id (editar/corregir);
--   {a_designar: true}             → (null, null)            [p_flexible]
--   {invitado:{nombre, apellido}}  → invitado nuevo sin DNI  [p_flexible]
--   resto                          → tenis_resolver_persona (exige DNI para invitados).
create or replace function tenis_resolver_jugador(p jsonb, p_reserva_id uuid default null, p_flexible boolean default false)
returns table (socio_id uuid, invitado_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_iid uuid;
  v_nom text;
  v_ape text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    perform tenis_error('parametros');
  end if;

  if nullif(p->>'invitado_id', '') is not null then
    if p_reserva_id is null then
      perform tenis_error('parametros');
    end if;
    begin
      v_iid := (p->>'invitado_id')::uuid;
    exception when invalid_text_representation then
      perform tenis_error('parametros');
    end;
    if not exists (select 1 from tenis_reserva_jugadores j
                    where j.reserva_id = p_reserva_id and j.invitado_id = v_iid) then
      perform tenis_error('parametros');
    end if;
    return query select null::uuid, v_iid;
    return;
  end if;

  if p ? 'a_designar' then
    if not p_flexible or jsonb_typeof(p->'a_designar') <> 'boolean' or not (p->>'a_designar')::boolean then
      perform tenis_error('parametros');
    end if;
    return query select null::uuid, null::uuid;
    return;
  end if;

  if p_flexible and jsonb_typeof(p->'invitado') = 'object' and tenis_norm_dni(p->'invitado'->>'dni') is null then
    v_nom := nullif(btrim(p->'invitado'->>'nombre'), '');
    v_ape := nullif(btrim(p->'invitado'->>'apellido'), '');
    if v_nom is null or v_ape is null then
      perform tenis_error('invitado_incompleto');
    end if;
    insert into tenis_invitados (dni, nombre, apellido) values (null, v_nom, v_ape) returning id into v_iid;
    return query select null::uuid, v_iid;
    return;
  end if;

  return query select r.socio_id, r.invitado_id from tenis_resolver_persona(p, false) r;
end;
$$;

-- Deja los jugadores (no titulares) de una reserva iguales a la lista (índice 1 = titular):
-- saca a los que no están, conserva a los que siguen (y a tantos "a designar" como pida la
-- lista, los no cobrados se van primero) y suma a los nuevos.
create or replace function tenis_jugadores_sincronizar(p_reserva_id uuid, p_socios uuid[], p_invs uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need int := 0;
  v_have int;
  i      int;
begin
  for i in 2 .. coalesce(array_length(p_socios, 1), 1) loop
    if p_socios[i] is null and p_invs[i] is null then
      v_need := v_need + 1;
    end if;
  end loop;

  delete from tenis_reserva_jugadores j
   where j.reserva_id = p_reserva_id
     and not j.es_titular
     and not j.a_designar
     and not exists (
       select 1 from unnest(p_socios, p_invs) as u(s, iv)
       where (u.s is not null and u.s = j.socio_id) or (u.iv is not null and u.iv = j.invitado_id)
     );

  select count(*) into v_have from tenis_reserva_jugadores where reserva_id = p_reserva_id and a_designar;
  if v_have > v_need then
    delete from tenis_reserva_jugadores
     where id in (select j.id from tenis_reserva_jugadores j
                   where j.reserva_id = p_reserva_id and j.a_designar
                   order by j.cobrado, j.id
                   limit v_have - v_need);
  end if;

  for i in 2 .. coalesce(array_length(p_socios, 1), 1) loop
    if p_socios[i] is not null or p_invs[i] is not null then
      insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, cargo)
      select p_reserva_id, p_socios[i], p_invs[i], false, 0
      where not exists (
        select 1 from tenis_reserva_jugadores j
        where j.reserva_id = p_reserva_id
          and ((p_socios[i] is not null and j.socio_id = p_socios[i])
            or (p_invs[i] is not null and j.invitado_id = p_invs[i]))
      );
    end if;
  end loop;

  if v_need > v_have then
    insert into tenis_reserva_jugadores (reserva_id, a_designar, es_titular, cargo)
    select p_reserva_id, true, false, 0 from generate_series(1, v_need - v_have);
  end if;
end;
$$;

-- Igual que en 20261127000000, salvo los "a designar": sin persona no hay ajuste por jugador
-- (la diferencia se ve en el resumen).
create or replace function tenis_cobro_ajuste_sincronizar(p_jugador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j   tenis_reserva_jugadores%rowtype;
  v_dif int;
begin
  select * into v_j from tenis_reserva_jugadores where id = p_jugador_id;
  if not found or not v_j.cobrado or v_j.a_designar then
    return;
  end if;
  v_dif := v_j.monto_cobrado - v_j.cargo;

  if v_dif = 0 then
    update tenis_cobros_ajustes a
       set resuelto_at = tenis_ahora(), resuelto_por = null
     where a.reserva_id = v_j.reserva_id and a.motivo = 'cambio_turno' and a.resuelto_at is null
       and coalesce(a.socio_id, a.invitado_id) = coalesce(v_j.socio_id, v_j.invitado_id);
    return;
  end if;

  update tenis_cobros_ajustes a
     set monto = v_dif, created_by = auth.uid(), created_at = tenis_ahora(),
         nombre = tenis_nombre_persona(v_j.socio_id, v_j.invitado_id)
   where a.reserva_id = v_j.reserva_id and a.motivo = 'cambio_turno' and a.resuelto_at is null
     and coalesce(a.socio_id, a.invitado_id) = coalesce(v_j.socio_id, v_j.invitado_id);
  if not found then
    insert into tenis_cobros_ajustes (reserva_id, socio_id, invitado_id, nombre, monto, motivo, created_by, created_at)
    values (v_j.reserva_id, v_j.socio_id, v_j.invitado_id, tenis_nombre_persona(v_j.socio_id, v_j.invitado_id),
            v_dif, 'cambio_turno', auth.uid(), tenis_ahora());
  end if;
end;
$$;

-- Resumen: igual que en 20261127000000 más comentario y a_designar por jugador.
create or replace function tenis_reserva_resumen(p_reserva_id uuid, p_detalle boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reserva_id',           r.id,
    'cancha_id',            r.cancha_id,
    'cancha_nombre',        c.nombre,
    'inicio',               r.inicio,
    'fin',                  r.fin,
    'modalidad',            r.modalidad,
    'origen',               r.origen,
    'estado',               r.estado,
    'comentario',           r.comentario,
    'comprobante_estado',   r.comprobante_estado,
    'comprobante_vence_at', r.comprobante_vence_at,
    'jugadores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jugador_id',    j.id,
          'socio_id',      j.socio_id,
          'invitado_id',   j.invitado_id,
          'a_designar',    j.a_designar,
          'nombre',        tenis_nombre_persona(j.socio_id, j.invitado_id),
          'es_titular',    j.es_titular,
          'cargo',         j.cargo,
          'motivo',        j.motivo_cargo,
          'cobrado',       j.cobrado,
          'monto_cobrado', j.monto_cobrado,
          'diferencia',    case when j.cobrado then j.cargo - coalesce(j.monto_cobrado, j.cargo) else 0 end,
          'check_in_at',   j.check_in_at,
          'cargo_no_show',         j.cargo_no_show,
          'cargo_no_show_cobrado', j.cargo_no_show_cobrado,
          'pendiente',     case when j.cobrado then j.cargo - coalesce(j.monto_cobrado, j.cargo) else j.cargo end
                           + case when j.cargo_no_show_cobrado then 0 else j.cargo_no_show end
        ) || case when p_detalle then jsonb_build_object(
          'numero_socio', (select s.numero_socio from socios s where s.id = j.socio_id),
          'dni',          (select i.dni from tenis_invitados i where i.id = j.invitado_id)
        ) else '{}'::jsonb end
        order by j.es_titular desc, j.a_designar, tenis_nombre_persona(j.socio_id, j.invitado_id), j.id)
      from tenis_reserva_jugadores j where j.reserva_id = r.id
    ), '[]'::jsonb),
    'total', (select coalesce(sum(j.cargo + j.cargo_no_show), 0) from tenis_reserva_jugadores j
               where j.reserva_id = r.id),
    'total_cobrado', (select coalesce(sum(case when j.cobrado then coalesce(j.monto_cobrado, j.cargo) else 0 end
                                          + case when j.cargo_no_show_cobrado then j.cargo_no_show else 0 end), 0)
                       from tenis_reserva_jugadores j where j.reserva_id = r.id),
    'total_pendiente', (select coalesce(sum(case when j.cobrado then j.cargo - coalesce(j.monto_cobrado, j.cargo)
                                                 else j.cargo end
                                            + case when j.cargo_no_show_cobrado then 0 else j.cargo_no_show end), 0)
                         from tenis_reserva_jugadores j where j.reserva_id = r.id)
  )
  from tenis_reservas r
  join tenis_canchas c on c.id = r.cancha_id
  where r.id = p_reserva_id
$$;

-- ¿Quién canceló? null → sistema; el perfil del titular → titular; otro → staff.
create or replace function tenis_cancelado_por_tipo(p_cancelada_por uuid, p_titular_socio_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_cancelada_por is null then 'sistema'
    when exists (select 1 from socios s where s.id = p_titular_socio_id and s.profile_id = p_cancelada_por) then 'titular'
    else 'staff' end
$$;

-- Búsqueda en una reserva: número de socio exacto, DNI exacto o todas las palabras del nombre
-- de algún jugador (sin tildes).
create or replace function tenis_reserva_coincide(p_reserva_id uuid, p_q text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from tenis_reserva_jugadores j
    left join socios s on s.id = j.socio_id
    left join tenis_invitados i on i.id = j.invitado_id
    where j.reserva_id = p_reserva_id
      and (
        s.numero_socio = btrim(p_q)
        or (length(coalesce(tenis_norm_dni(p_q), '')) >= 5
            and tenis_norm_dni(coalesce(s.dni, i.dni)) = tenis_norm_dni(p_q))
        or not exists (
          select 1 from unnest(string_to_array(lower(unaccent(btrim(p_q))), ' ')) w
          where w <> ''
            and position(w in lower(unaccent(coalesce(tenis_nombre_persona(j.socio_id, j.invitado_id), '')))) = 0
        )
      )
  )
$$;

-- Item de listado para staff: resumen con detalle + datos de la reserva.
create or replace function tenis_reserva_item_staff(p_reserva_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select tenis_reserva_resumen(r.id, true) || jsonb_build_object(
    'tipo',               tenis_tipo_reserva(r.origen),
    'titular', jsonb_build_object(
      'tipo',        case when r.titular_socio_id is not null then 'socio' else 'invitado' end,
      'socio_id',    r.titular_socio_id,
      'invitado_id', r.titular_invitado_id,
      'nombre',      tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id)),
    'created_at',         r.created_at,
    'creado_por_nombre',  tenis_nombre_perfil(r.creado_por),
    'cancelada_at',       r.cancelada_at,
    'cancelacion_motivo', r.cancelacion_motivo)
  from tenis_reservas r where r.id = p_reserva_id
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Historial y anticipación de la cancelación (triggers)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function tenis_historial_snapshot(p_reserva_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fecha',              tenis_local(r.inicio)::date,
    'inicio',             r.inicio,
    'fin',                r.fin,
    'cancha',             c.nombre,
    'cancha_id',          r.cancha_id,
    'modalidad',          r.modalidad,
    'estado',             r.estado,
    'comentario',         r.comentario,
    'comprobante_estado', r.comprobante_estado,
    'jugadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre',     tenis_nombre_persona(j.socio_id, j.invitado_id),
               'cobrado',    j.cobrado,
               'cargo',      j.cargo,
               'es_titular', j.es_titular,
               'a_designar', j.a_designar)
             order by j.es_titular desc, j.a_designar, tenis_nombre_persona(j.socio_id, j.invitado_id), j.id)
      from tenis_reserva_jugadores j where j.reserva_id = r.id), '[]'::jsonb))
  from tenis_reservas r
  join tenis_canchas c on c.id = r.cancha_id
  where r.id = p_reserva_id
$$;

-- Una versión por reserva y por sentencia del cliente: los cambios que hace una misma RPC se
-- juntan en la misma fila (snapshot final, la acción más importante).
create or replace function tenis_historial_registrar(p_reserva_id uuid, p_accion text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_accion text;
  v_ver    int;
  v_prio   constant text[] := array['creada', 'cancelada', 'editada', 'estado', 'jugadores', 'cobro'];
begin
  if not exists (select 1 from tenis_reservas r where r.id = p_reserva_id) then
    return;
  end if;
  perform tenis_lock('historial:' || p_reserva_id::text);

  select h.id, h.accion into v_id, v_accion
  from tenis_reservas_historial h
  where h.reserva_id = p_reserva_id and h.tx_id = txid_current() and h.tx_stmt_at = statement_timestamp()
  order by h.version desc
  limit 1;

  if v_id is not null then
    update tenis_reservas_historial
       set snapshot = tenis_historial_snapshot(p_reserva_id),
           accion = case when array_position(v_prio, p_accion) < array_position(v_prio, v_accion)
                         then p_accion else accion end
     where id = v_id;
    return;
  end if;

  select coalesce(max(h.version), 0) + 1 into v_ver from tenis_reservas_historial h where h.reserva_id = p_reserva_id;
  insert into tenis_reservas_historial (reserva_id, version, accion, snapshot, hecho_por, hecho_at)
  values (p_reserva_id, v_ver, p_accion, tenis_historial_snapshot(p_reserva_id), auth.uid(), tenis_ahora());
end;
$$;

create or replace function tenis_historial_tg_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accion text;
begin
  if tg_op = 'INSERT' then
    v_accion := 'creada';
  elsif new.estado is distinct from old.estado and new.estado = 'cancelada' then
    v_accion := 'cancelada';
  elsif (new.inicio, new.fin, new.cancha_id, new.modalidad, new.comentario)
        is distinct from (old.inicio, old.fin, old.cancha_id, old.modalidad, old.comentario) then
    v_accion := 'editada';
  elsif new.estado is distinct from old.estado or new.comprobante_estado is distinct from old.comprobante_estado then
    v_accion := 'estado';
  else
    return null;
  end if;
  perform tenis_historial_registrar(new.id, v_accion);
  return null;
end;
$$;

create or replace function tenis_historial_tg_jugador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform tenis_historial_registrar(old.reserva_id, 'jugadores');
  elsif tg_op = 'INSERT' then
    perform tenis_historial_registrar(new.reserva_id, 'jugadores');
  elsif (new.socio_id, new.invitado_id, new.a_designar, new.es_titular, new.cargo)
        is distinct from (old.socio_id, old.invitado_id, old.a_designar, old.es_titular, old.cargo) then
    perform tenis_historial_registrar(new.reserva_id, 'jugadores');
  elsif (new.cobrado, new.monto_cobrado, new.cargo_no_show, new.cargo_no_show_cobrado)
        is distinct from (old.cobrado, old.monto_cobrado, old.cargo_no_show, old.cargo_no_show_cobrado) then
    perform tenis_historial_registrar(new.reserva_id, 'cobro');
  end if;
  return null;
end;
$$;

create trigger tenis_historial_reserva
  after insert or update on tenis_reservas
  for each row execute function tenis_historial_tg_reserva();

create trigger tenis_historial_jugadores
  after insert or update or delete on tenis_reserva_jugadores
  for each row execute function tenis_historial_tg_jugador();

-- Minutos entre la cancelación y el turno (negativo: canceló después de empezar).
create or replace function tenis_cancelacion_tg()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.cancelacion_anticipacion_min :=
    floor(extract(epoch from (new.inicio - coalesce(new.cancelada_at, tenis_ahora()))) / 60)::int;
  return new;
end;
$$;

create trigger tenis_reservas_cancelacion
  before update of estado on tenis_reservas
  for each row
  when (new.estado = 'cancelada' and old.estado is distinct from 'cancelada')
  execute function tenis_cancelacion_tg();

-- ═════════════════════════════════════════════════════════════════════════════
-- Crear reserva (núcleo) y RPC de reserva con comentario
-- ═════════════════════════════════════════════════════════════════════════════

drop function tenis_crear_reserva(uuid, timestamptz, text, uuid, uuid, jsonb, text, text, boolean, uuid, timestamptz, text);
drop function tenis_reservar(uuid, timestamptz, text, jsonb);
drop function tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text);
drop function tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text);
drop function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb);

-- Igual que en 20261112000000 más p_comentario y p_flexible ("a designar" e invitados sin
-- DNI: reservas de socios y de staff; la web de invitados no).
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

create or replace function tenis_reservar(
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
  v_socio uuid := get_socio_id();
begin
  if v_socio is null then
    perform tenis_error('sin_socio');
  end if;
  if not tenis_es_socio_activo(v_socio) then
    perform tenis_error('no_es_socio');
  end if;
  return tenis_crear_reserva(p_cancha_id, p_inicio, p_modalidad, v_socio, null, p_jugadores,
                             'socio', 'confirmada', true, auth.uid(), null, null, p_comentario, true);
end;
$$;

create or replace function tenis_reservar_staff(
  p_cancha_id  uuid,
  p_inicio     timestamptz,
  p_modalidad  text,
  p_jugadores  jsonb,
  p_titular    jsonb,
  p_origen     text default 'telefonica',
  p_comentario text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if coalesce(p_origen, 'telefonica') <> 'telefonica' then
    perform tenis_error('origen_invalido');
  end if;
  if p_titular is null or jsonb_typeof(p_titular) <> 'object' or p_titular ? 'a_designar' then
    perform tenis_error('parametros');
  end if;
  select * into v_t from tenis_resolver_persona(p_titular, true);
  return tenis_crear_reserva(p_cancha_id, p_inicio, p_modalidad, v_t.socio_id, v_t.invitado_id,
                             p_jugadores, 'telefonica', 'confirmada', false, auth.uid(), null, null,
                             p_comentario, true);
end;
$$;

-- Igual que en 20261112000000 más p_comentario. Jugadores siempre con DNI, sin "a designar".
create or replace function tenis_invitado_reservar(
  p_cancha_id  uuid,
  p_inicio     timestamptz,
  p_modalidad  text,
  p_titular    jsonb,
  p_jugadores  jsonb,
  p_token_hash text,
  p_comentario text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg   tenis_config%rowtype;
  v_ahora timestamptz := tenis_ahora();
  v_dni   text;
  v_mail  text;
  v_t     record;
  v_hold  timestamptz;
  v_res   jsonb;
begin
  select * into v_cfg from tenis_config where id;
  if p_titular is null or jsonb_typeof(p_titular) <> 'object'
     or p_token_hash is null or length(p_token_hash) < 32 or p_inicio is null then
    perform tenis_error('parametros');
  end if;

  v_dni  := tenis_norm_dni(p_titular->>'dni');
  v_mail := nullif(lower(btrim(p_titular->>'email')), '');
  if v_dni is null or v_dni !~ '^[0-9A-Z]{5,12}$' then
    perform tenis_error('dni_invalido');
  end if;
  if nullif(btrim(p_titular->>'nombre'), '') is null or nullif(btrim(p_titular->>'apellido'), '') is null then
    perform tenis_error('invitado_incompleto');
  end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform tenis_error('email_invalido');
  end if;
  if tenis_socio_activo_por_dni(v_dni) is not null then
    perform tenis_error('titular_es_socio');
  end if;
  if p_jugadores is not null and jsonb_typeof(p_jugadores) = 'array' and exists (
    select 1 from jsonb_array_elements(p_jugadores) e
    where jsonb_typeof(e) = 'object' and (e ? 'socio_id' or e ? 'a_designar' or e ? 'invitado_id')
  ) then
    perform tenis_error('parametros');
  end if;
  if p_inicio - make_interval(hours => v_cfg.comprobante_horas_antes)
     <= v_ahora + make_interval(mins => v_cfg.hold_min) then
    perform tenis_error('plazo_invitado');
  end if;

  select * into v_t from tenis_resolver_persona(jsonb_build_object('invitado', p_titular), true);
  v_hold := v_ahora + make_interval(mins => v_cfg.hold_min);

  v_res := tenis_crear_reserva(p_cancha_id, p_inicio, p_modalidad, null, v_t.invitado_id, p_jugadores,
                               'invitado', 'pendiente_confirmacion', true, null, v_hold, p_token_hash,
                               p_comentario, false);

  return v_res || jsonb_build_object('hold_vence_at', v_hold);
end;
$$;

-- Igual que en 20261127000000 más p_comentario (null = no cambia, '' = lo borra), "a designar"
-- e invitados sin DNI (los "a designar" que siguen no se borran).
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

-- Igual que en 20261112000000 con "a designar", invitados sin DNI e {invitado_id} de la reserva.
create or replace function tenis_jugadores_corregir(
  p_reserva_id           uuid,
  p_jugadores            jsonb,
  p_registrar_infraccion boolean default false,
  p_nota                 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      tenis_reservas%rowtype;
  v_socios uuid[];
  v_invs   uuid[];
  v_item   jsonb;
  v_p      record;
  v_j      record;
  v_c      record;
  v_clave  text;
  v_inf    jsonb;
  i        int;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_r.estado not in ('confirmada', 'pendiente_comprobante') then
    perform tenis_error('estado_invalido');
  end if;
  if v_r.fin <= tenis_ahora() then
    perform tenis_error('reserva_finalizada');
  end if;
  if p_jugadores is null or jsonb_typeof(p_jugadores) <> 'array' then
    perform tenis_error('parametros');
  end if;
  if jsonb_array_length(p_jugadores) <> (case when v_r.modalidad = 'singles' then 1 else 3 end) then
    perform tenis_error('cantidad_jugadores');
  end if;

  v_socios := array[v_r.titular_socio_id];
  v_invs   := array[v_r.titular_invitado_id];
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

  for i in 2 .. array_length(v_socios, 1) loop
    if (v_socios[i] is not null or v_invs[i] is not null) and not exists (
      select 1 from tenis_reserva_jugadores j
      where j.reserva_id = p_reserva_id
        and ((v_socios[i] is not null and j.socio_id = v_socios[i])
          or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
    ) then
      perform tenis_validar_persona(v_socios[i], v_invs[i], tenis_local(v_r.inicio)::date, false);
      if exists (
        select 1
        from tenis_reserva_jugadores j
        join tenis_reservas r on r.id = j.reserva_id
        where r.id <> p_reserva_id
          and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
          and r.rango && v_r.rango
          and ((v_socios[i] is not null and j.socio_id = v_socios[i])
            or (v_invs[i] is not null and j.invitado_id = v_invs[i]))
      ) then
        perform tenis_error('jugador_ocupado', tenis_nombre_persona(v_socios[i], v_invs[i]));
      end if;
    end if;
  end loop;

  perform tenis_jugadores_sincronizar(p_reserva_id, v_socios, v_invs);

  for v_j in select * from tenis_reserva_jugadores where reserva_id = p_reserva_id and not cobrado loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, v_r.inicio, v_r.modalidad, p_reserva_id);
    if v_c.cargo is distinct from v_j.cargo or v_c.motivo is distinct from v_j.motivo_cargo then
      update tenis_reserva_jugadores set cargo = v_c.cargo, motivo_cargo = v_c.motivo where id = v_j.id;
    end if;
  end loop;

  if coalesce(p_registrar_infraccion, false) then
    v_inf := tenis_registrar_infraccion(v_r.titular_socio_id, v_r.titular_invitado_id, p_reserva_id,
                                        'jugadores_incorrectos', p_nota, auth.uid());
  end if;

  return tenis_reserva_resumen(p_reserva_id, true) || jsonb_build_object('infraccion', v_inf);
end;
$$;

-- Igual que en 20261112000000; copia también a los "a designar".
create or replace function tenis_extension(p_cancha_id uuid, p_hasta timestamptz, p_reserva_origen uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o     tenis_reservas%rowtype;
  v_ahora timestamptz := tenis_ahora();
  v_id    uuid;
  v_j     record;
  v_c     record;
  v_clave text;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  select * into v_o from tenis_reservas where id = p_reserva_origen for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_o.estado not in ('confirmada', 'jugada') then
    perform tenis_error('estado_invalido');
  end if;
  if p_cancha_id is null or p_hasta is null or p_hasta <= greatest(v_o.fin, v_ahora)
     or v_o.inicio > v_ahora
     or v_o.fin < v_ahora - interval '15 minutes' then
    perform tenis_error('extension_invalida');
  end if;

  perform tenis_lock('cancha:' || p_cancha_id::text);
  perform tenis_validar_turno(p_cancha_id, v_o.fin, p_hasta);

  for v_clave in
    select coalesce('s:' || j.socio_id::text, 'i:' || j.invitado_id::text) as k
    from tenis_reserva_jugadores j
    where j.reserva_id = p_reserva_origen and not j.a_designar
    order by 1
  loop
    perform tenis_lock(v_clave);
  end loop;

  for v_j in select * from tenis_reserva_jugadores where reserva_id = p_reserva_origen loop
    perform tenis_validar_persona(v_j.socio_id, v_j.invitado_id, tenis_local(v_o.fin)::date, v_j.es_titular);
    if not v_j.a_designar and exists (
      select 1
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where r.id <> p_reserva_origen
        and r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
        and r.rango && tstzrange(v_o.fin, p_hasta, '[)')
        and ((v_j.socio_id is not null and j.socio_id = v_j.socio_id)
          or (v_j.invitado_id is not null and j.invitado_id = v_j.invitado_id))
    ) then
      perform tenis_error('jugador_ocupado', tenis_nombre_persona(v_j.socio_id, v_j.invitado_id));
    end if;
  end loop;

  begin
    insert into tenis_reservas (cancha_id, inicio, fin, modalidad, origen, titular_socio_id,
                                titular_invitado_id, estado, creado_por)
    values (p_cancha_id, v_o.fin, p_hasta, v_o.modalidad, 'extension', v_o.titular_socio_id,
            v_o.titular_invitado_id, 'confirmada', auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    perform tenis_error('turno_ocupado');
  end;

  for v_j in select * from tenis_reserva_jugadores where reserva_id = p_reserva_origen
             order by es_titular desc loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, v_o.fin, v_o.modalidad, v_id);
    insert into tenis_reserva_jugadores (reserva_id, socio_id, invitado_id, es_titular, a_designar, cargo, motivo_cargo,
                                         check_in_at, check_in_por)
    values (v_id, v_j.socio_id, v_j.invitado_id, v_j.es_titular, v_j.a_designar, v_c.cargo, v_c.motivo,
            v_j.check_in_at, case when v_j.check_in_at is not null then v_j.check_in_por end);
  end loop;

  return tenis_reserva_resumen(v_id, true);
end;
$$;

-- Igual que en 20261112000000; un "a designar" se suma al no-show del titular a precio socio.
create or replace function tenis_procesar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora   timestamptz := tenis_ahora();
  v_holds   jsonb := '[]'::jsonb;
  v_comp    jsonb := '[]'::jsonb;
  v_jugadas jsonb := '[]'::jsonb;
  v_noshows jsonb := '[]'::jsonb;
  v_sinrev  jsonb := '[]'::jsonb;
  v_res     text;
  v_r       record;
  v_total   int;
  v_inf     jsonb;
begin
  for v_r in
    select * from tenis_reservas
    where estado = 'pendiente_confirmacion' and hold_vence_at <= v_ahora
    for update skip locked
  loop
    update tenis_reservas set estado = 'vencida' where id = v_r.id;
    v_holds := v_holds || jsonb_build_array(tenis_aviso(v_r.id));
  end loop;

  for v_r in
    select * from tenis_reservas
    where estado = 'pendiente_comprobante'
      and comprobante_vence_at <= v_ahora
      and comprobante_estado is distinct from 'pendiente'
    for update skip locked
  loop
    update tenis_reservas
       set estado = 'cancelada', cancelada_at = v_ahora,
           cancelacion_motivo = 'No se recibió el comprobante a tiempo'
     where id = v_r.id;
    v_comp := v_comp || jsonb_build_array(tenis_aviso(v_r.id));
  end loop;

  for v_r in
    select * from tenis_reservas
    where estado = 'pendiente_comprobante'
      and comprobante_estado = 'pendiente'
      and fin <= v_ahora
    for update skip locked
  loop
    v_res := case when exists (select 1 from tenis_reserva_jugadores j
                                where j.reserva_id = v_r.id and j.check_in_at is not null)
                  then 'jugada' else 'no_show' end;
    update tenis_reservas set estado = v_res where id = v_r.id;
    v_sinrev := v_sinrev || jsonb_build_array(tenis_aviso(v_r.id) || jsonb_build_object('resultado', v_res));
  end loop;

  for v_r in
    select * from tenis_reservas
    where estado = 'confirmada' and fin <= v_ahora
    for update skip locked
  loop
    if exists (select 1 from tenis_reserva_jugadores j
                where j.reserva_id = v_r.id and j.check_in_at is not null) then
      update tenis_reservas set estado = 'jugada' where id = v_r.id;
      v_jugadas := v_jugadas || jsonb_build_array(v_r.id);
    else
      select coalesce(sum(tenis_precio(j.socio_id is not null or j.a_designar, v_r.modalidad)), 0)::int into v_total
      from tenis_reserva_jugadores j
      where j.reserva_id = v_r.id and not j.cobrado;

      update tenis_reserva_jugadores
         set cargo = 0, motivo_cargo = 'no_show'
       where reserva_id = v_r.id and not es_titular and not cobrado;

      update tenis_reserva_jugadores
         set cargo         = case when cobrado then cargo else v_total end,
             motivo_cargo  = case when cobrado then motivo_cargo else 'no_show' end,
             cargo_no_show = case when cobrado then v_total else 0 end,
             cargo_no_show_cobrado = false
       where reserva_id = v_r.id and es_titular;

      update tenis_reservas set estado = 'no_show' where id = v_r.id;

      v_inf := tenis_registrar_infraccion(v_r.titular_socio_id, v_r.titular_invitado_id, v_r.id,
                                          'no_show', 'Ausencia sin aviso (automática)', null);

      v_noshows := v_noshows || jsonb_build_array(
        tenis_aviso(v_r.id) || jsonb_build_object(
          'cargo_titular', v_total,
          'infraccion_id', v_inf->'infraccion_id',
          'advertencia',   v_inf->'advertencia'
        ));
    end if;
  end loop;

  delete from tenis_invitados_intentos where created_at < v_ahora - interval '24 hours';

  return jsonb_build_object(
    'ahora',                 v_ahora,
    'holds_vencidos',        v_holds,
    'comprobantes_vencidos', v_comp,
    'jugadas',               v_jugadas,
    'no_shows',              v_noshows,
    'comprobantes_sin_revisar', v_sinrev
  );
end;
$$;

-- Igual que en 20261112000000 salvo que el canchero también cancela como staff.
create or replace function tenis_cancelar(p_reserva_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      tenis_reservas%rowtype;
  v_staff  boolean := es_canchero();
  v_socio  uuid := get_socio_id();
  v_horas  int := (select c.cancelacion_horas from tenis_config c where c.id);
  v_ahora  timestamptz := tenis_ahora();
begin
  select * into v_r from tenis_reservas where id = p_reserva_id for update;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;

  if not v_staff then
    if v_socio is null or v_r.titular_socio_id is distinct from v_socio then
      perform tenis_error('no_autorizado');
    end if;
    if v_r.estado <> 'confirmada' then
      perform tenis_error('estado_invalido');
    end if;
    if v_r.inicio - make_interval(hours => v_horas) < v_ahora then
      perform tenis_error('fuera_de_plazo');
    end if;
  else
    if v_r.estado not in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada') then
      perform tenis_error('estado_invalido');
    end if;
    if v_r.fin <= v_ahora then
      perform tenis_error('reserva_finalizada');
    end if;
  end if;

  update tenis_reservas
     set estado = 'cancelada',
         cancelada_por = auth.uid(),
         cancelada_at = v_ahora,
         cancelacion_motivo = nullif(btrim(p_motivo), ''),
         hold_vence_at = null
   where id = p_reserva_id;

  return tenis_aviso(p_reserva_id);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Grilla, disponibilidad, config y horarios
-- ═════════════════════════════════════════════════════════════════════════════

-- Socio: de hoy a hoy + dias_vista − 1 (staff sin ventana). Cada reserva trae los nombres de
-- sus jugadores; la propia además reserva_id, estado y comentario.
create or replace function tenis_disponibilidad(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_socio uuid := get_socio_id();
  v_staff boolean := es_canchero();
begin
  if v_socio is null and not v_staff then
    perform tenis_error('no_autorizado');
  end if;
  if p_fecha is null then
    perform tenis_error('parametros');
  end if;
  if not v_staff and (p_fecha < tenis_hoy() or p_fecha > tenis_hoy() + tenis_dias_vista() - 1) then
    perform tenis_error('fuera_de_vista');
  end if;

  return jsonb_build_object(
    'fecha',      p_fecha,
    'ahora',      tenis_ahora(),
    'reservable', tenis_reservable(p_fecha),
    'horario',    tenis_horario_json(p_fecha),
    'config',     tenis_config_json(),
    'canchas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'superficie', c.superficie,
                                          'luz', c.luz, 'orden', c.orden) order by c.orden, c.nombre)
      from tenis_canchas c where c.activa
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(x.item order by x.orden, x.inicio)
      from (
        select c.orden, r.inicio,
               jsonb_build_object(
                 'cancha_id',  r.cancha_id,
                 'inicio',     r.inicio,
                 'fin',        r.fin,
                 'tipo',       tenis_tipo_reserva(r.origen),
                 'titulo',     case when m.mio then 'Mi reserva' else 'Reservado' end,
                 'recurrente', false,
                 'mio',        m.mio,
                 'jugadores',  coalesce((
                   select jsonb_agg(jsonb_build_object('nombre', tenis_nombre_persona(j.socio_id, j.invitado_id))
                                    order by j.es_titular desc, j.a_designar,
                                             tenis_nombre_persona(j.socio_id, j.invitado_id), j.id)
                   from tenis_reserva_jugadores j where j.reserva_id = r.id), '[]'::jsonb)
               ) || case when m.mio then jsonb_build_object('reserva_id', r.id, 'estado', r.estado,
                                                            'comentario', r.comentario)
                         else '{}'::jsonb end as item
        from tenis_reservas r
        join tenis_canchas c on c.id = r.cancha_id and c.activa
        cross join lateral (
          select exists (select 1 from tenis_reserva_jugadores j
                          where j.reserva_id = r.id and j.socio_id = v_socio) as mio
        ) m
        where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
          and r.inicio >= tenis_ts(p_fecha, '00:00')
          and r.inicio <  tenis_ts(p_fecha + 1, '00:00')
        union all
        select c.orden, b.inicio,
               jsonb_build_object(
                 'cancha_id',  b.cancha_id,
                 'inicio',     b.inicio,
                 'fin',        b.fin,
                 'tipo',       b.tipo,
                 'titulo',     b.titulo,
                 'recurrente', b.recurrente,
                 'mio',        false,
                 'bloque_id',  b.bloque_id
               )
        from tenis_bloques_dia(p_fecha) b
        join tenis_canchas c on c.id = b.cancha_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Igual que en 20261112000000 más reservable, horario y config.horarios (staff, sin ventana).
create or replace function tenis_grilla(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_fecha is null then
    perform tenis_error('parametros');
  end if;

  return jsonb_build_object(
    'fecha',      p_fecha,
    'ahora',      tenis_ahora(),
    'reservable', tenis_reservable(p_fecha),
    'horario',    tenis_horario_json(p_fecha),
    'config',     tenis_config_json(),
    'canchas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'superficie', c.superficie,
                                          'luz', c.luz, 'orden', c.orden) order by c.orden, c.nombre)
      from tenis_canchas c where c.activa
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(x.item order by x.orden, x.inicio)
      from (
        select c.orden, r.inicio,
               tenis_reserva_resumen(r.id, true) || jsonb_build_object(
                 'tipo',              tenis_tipo_reserva(r.origen),
                 'titulo',            tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id),
                 'recurrente',        false,
                 'mio',               false,
                 'titular', jsonb_build_object(
                   'tipo',        case when r.titular_socio_id is not null then 'socio' else 'invitado' end,
                   'socio_id',    r.titular_socio_id,
                   'invitado_id', r.titular_invitado_id,
                   'nombre',      tenis_nombre_persona(r.titular_socio_id, r.titular_invitado_id)
                 ),
                 'tiene_comprobante', r.comprobante_path is not null,
                 'check_ins', (select count(*) from tenis_reserva_jugadores j
                                where j.reserva_id = r.id and j.check_in_at is not null)
               ) as item
        from tenis_reservas r
        join tenis_canchas c on c.id = r.cancha_id and c.activa
        where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada', 'no_show')
          and r.inicio >= tenis_ts(p_fecha, '00:00')
          and r.inicio <  tenis_ts(p_fecha + 1, '00:00')
        union all
        select c.orden, b.inicio,
               jsonb_build_object(
                 'cancha_id',  b.cancha_id,
                 'inicio',     b.inicio,
                 'fin',        b.fin,
                 'tipo',       b.tipo,
                 'titulo',     b.titulo,
                 'recurrente', b.recurrente,
                 'mio',        false,
                 'bloque_id',  b.bloque_id,
                 'bloque_cancha_id', tb.cancha_id,
                 'dia_semana',       tb.dia_semana,
                 'vigente_desde',    tb.vigente_desde,
                 'vigente_hasta',    tb.vigente_hasta
               )
        from tenis_bloques_dia(p_fecha) b
        join tenis_canchas c on c.id = b.cancha_id
        join tenis_bloques tb on tb.id = b.bloque_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Igual que en 20261112000000 más dias_vista; devuelve también horarios.
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

-- Horarios por día (gestor). p: [{dia_semana, hora_desde?, hora_hasta?, activo?}] (o
-- {horarios: [...]}); lo que no viene queda igual. Devuelve los 7 días.
create or replace function tenis_horarios_guardar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb := case when jsonb_typeof(p) = 'object' then p->'horarios' else p end;
  v_e    jsonb;
  v_dia  int;
  v_h    record;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
    perform tenis_error('parametros');
  end if;

  begin
    for v_e in select e from jsonb_array_elements(v_rows) e loop
      v_dia := (v_e->>'dia_semana')::int;
      if v_dia is null or v_dia not between 1 and 7 then
        perform tenis_error('config_invalida');
      end if;
      -- Horario actual del día (2026-11-23 es lunes = ISO 1).
      select * into v_h from tenis_horario_dia('2026-11-22'::date + v_dia);
      insert into tenis_horarios as t (dia_semana, hora_desde, hora_hasta, activo, updated_by)
      values (v_dia,
              coalesce(nullif(v_e->>'hora_desde', '')::time, v_h.hora_desde),
              coalesce(nullif(v_e->>'hora_hasta', '')::time, v_h.hora_hasta),
              coalesce((v_e->>'activo')::boolean, v_h.activo),
              auth.uid())
      on conflict (dia_semana) do update set
        hora_desde = excluded.hora_desde,
        hora_hasta = excluded.hora_hasta,
        activo     = excluded.activo,
        updated_by = excluded.updated_by;
    end loop;
  exception
    when check_violation or invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range then
      perform tenis_error('config_invalida');
  end;

  return tenis_horarios_json();
end;
$$;

-- Disponibilidad semanal: por día y por turno de la modalidad, cuántas canchas lo pueden
-- empezar (horario del día, bloques, solapes, que no haya empezado y, para quien no es
-- gestor, el optimizador salvo hoy). Socio: dentro de la vista (se corta al final).
create or replace function tenis_disponibilidad_semana(p_desde date, p_dias int default 7, p_modalidad text default 'singles')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg    tenis_config%rowtype;
  v_staff  boolean := es_canchero();
  v_gestor boolean := es_gestor_tenis();
  v_hoy    date := tenis_hoy();
  v_ahora  timestamptz := tenis_ahora();
  v_hasta  date;
  v_dur    interval;
  v_mod    interval;
begin
  if get_socio_id() is null and not v_staff then
    perform tenis_error('no_autorizado');
  end if;
  if p_desde is null or p_dias is null or p_dias not between 1 and 31 then
    perform tenis_error('parametros');
  end if;
  if p_modalidad is null or p_modalidad not in ('singles', 'dobles') then
    perform tenis_error('modalidad_invalida');
  end if;
  select * into v_cfg from tenis_config where id;
  v_hasta := p_desde + p_dias - 1;
  if not v_staff then
    if p_desde < v_hoy or p_desde > v_hoy + tenis_dias_vista() - 1 then
      perform tenis_error('fuera_de_vista');
    end if;
    v_hasta := least(v_hasta, v_hoy + tenis_dias_vista() - 1);
  end if;
  v_dur := make_interval(mins => case when p_modalidad = 'singles' then v_cfg.singles_min else v_cfg.dobles_min end);
  v_mod := make_interval(mins => v_cfg.modulo_min);

  return coalesce((
    with dias as (
      select d::date as fecha from generate_series(p_desde::timestamp, v_hasta::timestamp, interval '1 day') d
    ),
    h as (
      select d.fecha, x.hora_desde, x.hora_hasta, x.activo,
             tenis_ts(d.fecha, x.hora_desde) as abre, tenis_ts(d.fecha, x.hora_hasta) as cierra
      from dias d cross join lateral tenis_horario_dia(d.fecha) x
    ),
    canchas as (select c.id from tenis_canchas c where c.activa),
    ocup as (
      select r.cancha_id, r.inicio, r.fin from tenis_reservas r
       where r.estado in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada')
         and r.inicio < tenis_ts(v_hasta + 1, '00:00') and r.fin > tenis_ts(p_desde, '00:00')
      union all
      select b.cancha_id, b.inicio, b.fin from dias d cross join lateral tenis_bloques_dia(d.fecha) b
    ),
    slots as (
      select h.fecha, s as inicio, s + v_dur as fin, h.abre, h.cierra
      from h cross join lateral generate_series(h.abre, h.cierra - v_dur, v_mod) s
      where h.activo
    ),
    cel as (
      select sl.fecha, sl.inicio, c.id as cancha_id,
             sl.inicio > v_ahora
             and not exists (select 1 from ocup o where o.cancha_id = c.id and o.inicio < sl.fin and o.fin > sl.inicio)
             and (v_gestor or sl.fecha = v_hoy or (
               (extract(epoch from (sl.inicio - greatest(sl.abre,
                  (select max(o.fin) from ocup o where o.cancha_id = c.id and o.fin <= sl.inicio
                     and o.fin > tenis_ts(sl.fecha, '00:00'))))) / 60 not between 1 and v_cfg.singles_min - 1)
               and (extract(epoch from (least(sl.cierra,
                  (select min(o.inicio) from ocup o where o.cancha_id = c.id and o.inicio >= sl.fin
                     and o.inicio < tenis_ts(sl.fecha + 1, '00:00'))) - sl.fin)) / 60 not between 1 and v_cfg.singles_min - 1)
             )) as libre
      from slots sl cross join canchas c
    )
    select jsonb_agg(jsonb_build_object(
             'fecha',      h.fecha,
             'reservable', tenis_reservable(h.fecha),
             'horario',    jsonb_build_object('desde', to_char(h.hora_desde, 'HH24:MI'),
                                              'hasta', to_char(h.hora_hasta, 'HH24:MI'), 'abierto', h.activo),
             'slots', coalesce((
               select jsonb_agg(jsonb_build_object('hora', to_char(tenis_local(x.inicio), 'HH24:MI'),
                                                   'libres', x.libres, 'total', x.total) order by x.inicio)
               from (select cel.inicio, count(*) filter (where cel.libre) as libres, count(*) as total
                     from cel where cel.fecha = h.fecha group by cel.inicio) x), '[]'::jsonb)
           ) order by h.fecha)
    from h
  ), '[]'::jsonb);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Historial, canceladas, listado y cancelación masiva
-- ═════════════════════════════════════════════════════════════════════════════

-- Staff (gestor/canchero) o el socio titular de la reserva.
create or replace function tenis_reserva_historial(p_reserva_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff boolean := es_canchero();
  v_socio uuid := get_socio_id();
  v_r     tenis_reservas%rowtype;
begin
  if not v_staff and v_socio is null then
    perform tenis_error('no_autorizado');
  end if;
  select * into v_r from tenis_reservas where id = p_reserva_id;
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if not v_staff and v_r.titular_socio_id is distinct from v_socio then
    perform tenis_error('no_autorizado');
  end if;

  return jsonb_build_object(
    'reserva', jsonb_build_object(
      'reserva_id',        v_r.id,
      'tipo',              tenis_tipo_reserva(v_r.origen),
      'origen',            v_r.origen,
      'creada_at',         v_r.created_at,
      'creada_por_nombre', case when v_r.creado_por is not null then tenis_nombre_perfil(v_r.creado_por)
                                when v_r.origen = 'invitado'
                                  then tenis_nombre_persona(null, v_r.titular_invitado_id) end),
    'versiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'version',          h.version,
               'accion',           h.accion,
               'snapshot',         h.snapshot,
               'hecho_por_nombre', tenis_nombre_perfil(h.hecho_por),
               'hecho_at',         h.hecho_at) order by h.version)
      from tenis_reservas_historial h where h.reserva_id = v_r.id), '[]'::jsonb));
end;
$$;

-- Canceladas (gestor/canchero), más recientes primero. Fechas = día local del turno.
create or replace function tenis_canceladas_listar(
  p_desde         date,
  p_hasta         date,
  p_q             text default null,
  p_motivo        text default null,
  p_cancelado_por text default null,
  p_limit         int default 50,
  p_offset        int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_q     text := nullif(btrim(coalesce(p_q, '')), '');
  v_mot   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_total int;
  v_items jsonb;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_cancelado_por is not null and p_cancelado_por not in ('titular', 'staff', 'sistema') then
    perform tenis_error('parametros');
  end if;

  with base as (
    select r.id, r.cancelada_at, r.inicio
    from tenis_reservas r
    where r.estado = 'cancelada'
      and (p_desde is null or r.inicio >= tenis_ts(p_desde, '00:00'))
      and (p_hasta is null or r.inicio <  tenis_ts(p_hasta + 1, '00:00'))
      and (v_mot is null or lower(unaccent(coalesce(r.cancelacion_motivo, ''))) like '%' || lower(unaccent(v_mot)) || '%')
      and (p_cancelado_por is null or tenis_cancelado_por_tipo(r.cancelada_por, r.titular_socio_id) = p_cancelado_por)
      and (v_q is null or tenis_reserva_coincide(r.id, v_q))
  )
  select (select count(*) from base),
         coalesce((
           select jsonb_agg(tenis_reserva_item_staff(p.id) || jsonb_build_object(
                    'cancelado_por_nombre',         tenis_nombre_perfil(r.cancelada_por),
                    'cancelado_por_tipo',           tenis_cancelado_por_tipo(r.cancelada_por, r.titular_socio_id),
                    'cancelacion_anticipacion_min', r.cancelacion_anticipacion_min)
                  order by p.cancelada_at desc nulls last, p.inicio desc, p.id)
           from (select * from base
                 order by cancelada_at desc nulls last, inicio desc, id
                 limit least(greatest(coalesce(p_limit, 50), 1), 500)
                 offset greatest(coalesce(p_offset, 0), 0)) p
           join tenis_reservas r on r.id = p.id), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- Listado de reservas (gestor/canchero), por inicio. Sin p_estado no trae holds vencidos.
create or replace function tenis_reservas_listar(
  p_desde     date,
  p_hasta     date,
  p_q         text default null,
  p_cancha_id uuid default null,
  p_origen    text default null,
  p_estado    text default null,
  p_limit     int default 50,
  p_offset    int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_q     text := nullif(btrim(coalesce(p_q, '')), '');
  v_total int;
  v_items jsonb;
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if (p_origen is not null and p_origen not in ('socio', 'invitado', 'telefonica', 'extension'))
     or (p_estado is not null and p_estado not in ('pendiente_confirmacion', 'pendiente_comprobante', 'confirmada',
                                                   'jugada', 'no_show', 'cancelada', 'vencida')) then
    perform tenis_error('parametros');
  end if;

  with base as (
    select r.id, r.inicio
    from tenis_reservas r
    where (p_estado is null and r.estado <> 'vencida' or r.estado = p_estado)
      and (p_desde is null or r.inicio >= tenis_ts(p_desde, '00:00'))
      and (p_hasta is null or r.inicio <  tenis_ts(p_hasta + 1, '00:00'))
      and (p_cancha_id is null or r.cancha_id = p_cancha_id)
      and (p_origen is null or r.origen = p_origen)
      and (v_q is null or tenis_reserva_coincide(r.id, v_q))
  )
  select (select count(*) from base),
         coalesce((
           select jsonb_agg(tenis_reserva_item_staff(p.id) order by p.inicio, p.id)
           from (select * from base order by inicio, id
                 limit least(greatest(coalesce(p_limit, 50), 1), 500)
                 offset greatest(coalesce(p_offset, 0), 0)) p), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- Cancela varias (gestor) con las reglas de tenis_cancelar para staff. Las que no se pueden
-- quedan en omitidas con su código.
create or replace function tenis_cancelar_varias(p_ids uuid[], p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_canc jsonb := '[]'::jsonb;
  v_omit jsonb := '[]'::jsonb;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 200 then
    perform tenis_error('parametros');
  end if;

  for v_id in select distinct x from unnest(p_ids) x where x is not null order by x loop
    begin
      v_canc := v_canc || jsonb_build_array(tenis_cancelar(v_id, p_motivo));
    exception when sqlstate 'P0001' then
      v_omit := v_omit || jsonb_build_array(jsonb_build_object('reserva_id', v_id, 'codigo', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('canceladas', v_canc, 'omitidas', v_omit);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Reportes
-- ═════════════════════════════════════════════════════════════════════════════

-- Módulos de cancha abiertos entre dos fechas locales, con el bloque (tipo) que lo ocupa y
-- el origen de la reserva que lo ocupa (pendiente_comprobante, confirmada, jugada, no_show).
create or replace function tenis_reporte_modulos(p_desde date, p_hasta date)
returns table (fecha date, cancha_id uuid, inicio timestamptz, minutos int, bloque_tipo text, reserva_origen text)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (select c.modulo_min from tenis_config c where c.id),
  dias as (select d::date as fecha from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') d),
  mods as (
    select d.fecha, c.id as cancha_id, m as inicio, m + make_interval(mins => cfg.modulo_min) as fin
    from dias d
    cross join cfg
    cross join lateral tenis_horario_dia(d.fecha) h
    join tenis_canchas c on c.activa
    cross join lateral generate_series(tenis_ts(d.fecha, h.hora_desde),
                                       tenis_ts(d.fecha, h.hora_hasta) - make_interval(mins => cfg.modulo_min),
                                       make_interval(mins => cfg.modulo_min)) m
    where h.activo
  ),
  bloques as (select b.cancha_id, b.inicio, b.fin, b.tipo from dias d cross join lateral tenis_bloques_dia(d.fecha) b),
  reservas as (
    select r.cancha_id, r.inicio, r.fin, r.origen from tenis_reservas r
    where r.estado in ('pendiente_comprobante', 'confirmada', 'jugada', 'no_show')
      and r.inicio < tenis_ts(p_hasta + 1, '00:00') and r.fin > tenis_ts(p_desde, '00:00')
  )
  select m.fecha, m.cancha_id, m.inicio, (select modulo_min from cfg),
         (select b.tipo from bloques b where b.cancha_id = m.cancha_id and b.inicio < m.fin and b.fin > m.inicio
           order by b.inicio limit 1),
         (select r.origen from reservas r where r.cancha_id = m.cancha_id and r.inicio < m.fin and r.fin > m.inicio
           limit 1)
  from mods m
$$;

-- Reportes del gestor entre dos fechas locales (máx. 366 días). → {tipo, desde, hasta, filas[, total]}
--   uso_mensual (mes 'YYYY-MM') | uso_diario (dia_semana ISO) | uso_hora (hora 'HH:00') |
--   uso_general (cancha; + total): minutos_disponibles (abierto − bloques),
--     minutos_reservados (reservas sobre lo disponible), uso = porcentaje (1 decimal);
--   uso_tipo: minutos y porcentaje (sobre lo abierto) por reserva_web, reserva_telefonica,
--     reserva_invitado, extension, cada tipo de bloque y libre;
--   ranking_reservas: por persona {nombre, tipo, numero_socio, reservas (jugadas o por
--     jugar), cancelaciones (canceladas por ella como titular), no_shows, total, cumplimiento
--     = reservas / total %}; ranking_cancelaciones: los mismos, con cancelaciones > 0.
create or replace function tenis_reporte(p_tipo text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_total jsonb;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p_tipo is null or p_tipo not in ('uso_mensual', 'uso_diario', 'uso_hora', 'uso_general', 'uso_tipo',
                                      'ranking_reservas', 'ranking_cancelaciones') then
    perform tenis_error('reporte_invalido');
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    perform tenis_error('rango_invalido');
  end if;

  if p_tipo in ('uso_mensual', 'uso_diario', 'uso_hora', 'uso_general') then
    with g as (
      select case p_tipo when 'uso_mensual' then to_char(m.fecha, 'YYYY-MM')
                         when 'uso_diario'  then lpad(extract(isodow from m.fecha)::int::text, 2, '0')
                         when 'uso_hora'    then to_char(tenis_local(m.inicio), 'HH24') || ':00'
                         else lpad(c.orden::text, 4, '0') || c.nombre end as orden,
             case p_tipo when 'uso_mensual' then to_jsonb(to_char(m.fecha, 'YYYY-MM'))
                         when 'uso_diario'  then to_jsonb(extract(isodow from m.fecha)::int)
                         when 'uso_hora'    then to_jsonb(to_char(tenis_local(m.inicio), 'HH24') || ':00')
                         else to_jsonb(c.nombre) end as clave,
             (case when p_tipo = 'uso_general' then c.id end) as cancha_id,
             coalesce(sum(m.minutos) filter (where m.bloque_tipo is null), 0)::int as disp,
             coalesce(sum(m.minutos) filter (where m.bloque_tipo is null and m.reserva_origen is not null), 0)::int as res
      from tenis_reporte_modulos(p_desde, p_hasta) m
      join tenis_canchas c on c.id = m.cancha_id
      group by 1, 2, 3
    )
    select jsonb_agg(jsonb_build_object(
             case p_tipo when 'uso_mensual' then 'mes' when 'uso_diario' then 'dia_semana'
                         when 'uso_hora' then 'hora' else 'cancha' end, g.clave,
             'minutos_disponibles', g.disp,
             'minutos_reservados',  g.res,
             'uso',        coalesce(round(100.0 * g.res / nullif(g.disp, 0), 1), 0),
             'porcentaje', coalesce(round(100.0 * g.res / nullif(g.disp, 0), 1), 0))
           || case when g.cancha_id is not null then jsonb_build_object('cancha_id', g.cancha_id) else '{}'::jsonb end
           order by g.orden),
           jsonb_build_object(
             'minutos_disponibles', coalesce(sum(g.disp), 0),
             'minutos_reservados',  coalesce(sum(g.res), 0),
             'uso',        coalesce(round(100.0 * sum(g.res) / nullif(sum(g.disp), 0), 1), 0),
             'porcentaje', coalesce(round(100.0 * sum(g.res) / nullif(sum(g.disp), 0), 1), 0))
      into v_filas, v_total
    from g;

  elsif p_tipo = 'uso_tipo' then
    with m as (
      select coalesce(x.bloque_tipo, case when x.reserva_origen is null then 'libre'
                                          else tenis_tipo_reserva(x.reserva_origen) end) as tipo,
             x.minutos
      from tenis_reporte_modulos(p_desde, p_hasta) x
    ), g as (select m.tipo, sum(m.minutos)::int as minutos from m group by m.tipo)
    select jsonb_agg(jsonb_build_object('tipo', g.tipo, 'minutos', g.minutos,
                                        'porcentaje', round(100.0 * g.minutos / nullif((select sum(minutos) from g), 0), 1))
                     order by g.minutos desc, g.tipo),
           jsonb_build_object('minutos', coalesce(sum(g.minutos), 0))
      into v_filas, v_total
    from g;

  else
    with part as (
      select j.socio_id, j.invitado_id, r.estado, j.es_titular,
             tenis_cancelado_por_tipo(r.cancelada_por, r.titular_socio_id) as cancelo
      from tenis_reserva_jugadores j
      join tenis_reservas r on r.id = j.reserva_id
      where not j.a_designar
        and r.estado not in ('vencida', 'pendiente_confirmacion')
        and r.inicio >= tenis_ts(p_desde, '00:00') and r.inicio < tenis_ts(p_hasta + 1, '00:00')
    ), g as (
      select p.socio_id, p.invitado_id,
             count(*) filter (where p.estado in ('pendiente_comprobante', 'confirmada', 'jugada'))::int as reservas,
             count(*) filter (where p.estado = 'cancelada' and p.es_titular and p.cancelo = 'titular')::int as cancelaciones,
             count(*) filter (where p.estado = 'no_show')::int as no_shows
      from part p
      group by p.socio_id, p.invitado_id
    ), f as (
      select g.*, g.reservas + g.cancelaciones + g.no_shows as total,
             tenis_nombre_persona(g.socio_id, g.invitado_id) as nombre,
             (select s.numero_socio from socios s where s.id = g.socio_id) as numero_socio,
             case when p_tipo = 'ranking_reservas' then g.reservas else g.cancelaciones end as clave
      from g
      where g.reservas + g.cancelaciones + g.no_shows > 0
        and (p_tipo = 'ranking_reservas' or g.cancelaciones > 0)
    ), t as (select * from f order by clave desc, total desc, nombre limit 200)
    select jsonb_agg(jsonb_build_object(
             'socio_id',      t.socio_id,
             'invitado_id',   t.invitado_id,
             'tipo',          case when t.socio_id is not null then 'socio' else 'invitado' end,
             'nombre',        t.nombre,
             'numero_socio',  t.numero_socio,
             'reservas',      t.reservas,
             'cancelaciones', t.cancelaciones,
             'no_shows',      t.no_shows,
             'total',         t.total,
             'cumplimiento',  round(100.0 * t.reservas / nullif(t.total, 0), 1))
           order by t.clave desc, t.total desc, t.nombre)
      into v_filas
    from t;
  end if;

  return jsonb_build_object('tipo', p_tipo, 'desde', p_desde, 'hasta', p_hasta,
                            'filas', coalesce(v_filas, '[]'::jsonb))
         || case when v_total is not null then jsonb_build_object('total', v_total) else '{}'::jsonb end;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Cartelera de novedades
-- ═════════════════════════════════════════════════════════════════════════════

-- Cualquier cuenta logueada: destacadas primero, más nuevas primero.
create or replace function tenis_novedades_listar(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    perform tenis_error('no_autorizado');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id, 'titulo', n.titulo, 'texto', n.texto, 'destacada', n.destacada,
             'created_at', n.created_at, 'updated_at', n.updated_at, 'enviada_at', n.enviada_at,
             'creado_por_nombre', tenis_nombre_perfil(n.creado_por))
           order by n.destacada desc, n.created_at desc, n.id)
    from (select * from tenis_novedades
          order by destacada desc, created_at desc, id
          limit least(greatest(coalesce(p_limit, 20), 1), 100)) n
  ), '[]'::jsonb);
end;
$$;

-- Crea o edita (gestor). p: {id?, titulo, texto, destacada?}. Editar no toca enviada_at ni
-- los contadores (no hay reenvío).
create or replace function tenis_novedad_guardar(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_tit text := nullif(btrim(p->>'titulo'), '');
  v_txt text := nullif(btrim(p->>'texto'), '');
  v_des boolean;
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    perform tenis_error('parametros');
  end if;
  if v_tit is null or v_txt is null or length(v_tit) > 120 or length(v_txt) > 4000 then
    perform tenis_error('novedad_invalida');
  end if;
  begin
    v_id  := nullif(p->>'id', '')::uuid;
    v_des := coalesce((p->>'destacada')::boolean, false);
  exception when invalid_text_representation then
    perform tenis_error('novedad_invalida');
  end;

  if v_id is null then
    insert into tenis_novedades (titulo, texto, destacada, creado_por, created_at, updated_at)
    values (v_tit, v_txt, v_des, auth.uid(), tenis_ahora(), tenis_ahora())
    returning id into v_id;
  else
    update tenis_novedades
       set titulo = v_tit, texto = v_txt, destacada = v_des, updated_at = tenis_ahora()
     where id = v_id;
    if not found then
      perform tenis_error('novedad_inexistente');
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function tenis_novedad_borrar(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_gestor_tenis() then
    perform tenis_error('no_autorizado');
  end if;
  delete from tenis_novedades where id = p_id;
  if not found then
    perform tenis_error('novedad_inexistente');
  end if;
  return true;
end;
$$;

-- service_role (tenis-gestion publicar-novedad): registra el envío.
create or replace function tenis_novedad_marcar_enviada(p_id uuid, p_push int, p_mails int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n tenis_novedades%rowtype;
begin
  update tenis_novedades
     set enviada_at = tenis_ahora(), push_enviados = greatest(coalesce(p_push, 0), 0),
         mails_enviados = greatest(coalesce(p_mails, 0), 0)
   where id = p_id
  returning * into v_n;
  if not found then
    perform tenis_error('novedad_inexistente');
  end if;
  return jsonb_build_object('id', v_n.id, 'enviada_at', v_n.enviada_at,
                            'push_enviados', v_n.push_enviados, 'mails_enviados', v_n.mails_enviados);
end;
$$;

-- service_role: socios vigentes con Carnet/Becado Tenis o que jugaron/reservaron un turno de
-- tenis en los últimos 120 días (también turnos futuros). Los tutores los suma la función.
create or replace function tenis_audiencia_novedades()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from socios s
  where tenis_es_socio_activo(s.id)
    and (socio_habilitado_deporte(s.id, 'tenis')
      or exists (
        select 1 from tenis_reserva_jugadores j
        join tenis_reservas r on r.id = j.reserva_id
        where j.socio_id = s.id
          and r.estado not in ('vencida', 'pendiente_confirmacion')
          and r.inicio >= tenis_ahora() - interval '120 days'))
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Check-in y cotización
-- ═════════════════════════════════════════════════════════════════════════════

-- Igual que en 20261112000000; jugador suma es_titular, monto_cobrado, diferencia, pendiente
-- (lo que falta de su turno + no-show sin cobrar + los "a designar" si es el titular),
-- pendiente_propio y a_designar:[{jugador_id, cargo, cobrado, pendiente}] (titular).
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
                    'a_designar', v_ad) end,
    'suspendido', v_susp,
    'resultado',  v_res
  );
end;
$$;

-- Precio antes de confirmar: corre la reserva (o la edición, con p_reserva_id) con las mismas
-- validaciones y la deshace. Errores = los de tenis_reservar / tenis_editar_reserva /
-- tenis_reservar_staff. p_titular_socio_id (sólo gestor, sin p_reserva_id): cotiza una
-- telefónica para ese socio.
create or replace function tenis_cotizar(
  p_cancha_id        uuid,
  p_inicio           timestamptz,
  p_modalidad        text,
  p_jugadores        jsonb,
  p_reserva_id       uuid default null,
  p_titular_socio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if p_titular_socio_id is not null and (not es_gestor_tenis() or p_reserva_id is not null) then
    perform tenis_error('no_autorizado');
  end if;

  begin
    if p_titular_socio_id is not null then
      v := tenis_reservar_staff(p_cancha_id, p_inicio, p_modalidad, p_jugadores,
                                jsonb_build_object('socio_id', p_titular_socio_id));
    elsif p_reserva_id is null then
      v := tenis_reservar(p_cancha_id, p_inicio, p_modalidad, p_jugadores);
    else
      v := tenis_editar_reserva(p_reserva_id, p_cancha_id, p_inicio, p_modalidad, p_jugadores);
    end if;
    raise exception using errcode = 'TQ001', message = 'cotizacion';
  exception when sqlstate 'TQ001' then
    null;
  end;

  return jsonb_build_object(
    'jugadores', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', e->>'nombre', 'cargo', (e->>'cargo')::int, 'motivo', e->>'motivo',
                                          'es_titular', (e->>'es_titular')::boolean,
                                          'a_designar', (e->>'a_designar')::boolean)
                       order by ord)
      from jsonb_array_elements(v->'jugadores') with ordinality as x(e, ord)), '[]'::jsonb),
    'total', (v->>'total')::int);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Permisos
-- ═════════════════════════════════════════════════════════════════════════════

-- Internos: nadie (los llaman las SECURITY DEFINER y los triggers).
revoke execute on function tenis_horario_dia(date)                          from public, anon, authenticated;
revoke execute on function tenis_horario_json(date)                         from public, anon, authenticated;
revoke execute on function tenis_horarios_json()                            from public, anon, authenticated;
revoke execute on function tenis_config_json()                              from public, anon, authenticated;
revoke execute on function tenis_dias_vista()                               from public, anon, authenticated;
revoke execute on function tenis_reservable(date)                           from public, anon, authenticated;
revoke execute on function tenis_norm_comentario(text)                      from public, anon, authenticated;
revoke execute on function tenis_tipo_reserva(text)                         from public, anon, authenticated;
revoke execute on function tenis_nombre_persona(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function tenis_nombre_perfil(uuid)                        from public, anon, authenticated;
revoke execute on function tenis_validar_turno(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function tenis_validar_hueco(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function tenis_resolver_jugador(jsonb, uuid, boolean)     from public, anon, authenticated;
revoke execute on function tenis_jugadores_sincronizar(uuid, uuid[], uuid[]) from public, anon, authenticated;
revoke execute on function tenis_cobro_ajuste_sincronizar(uuid)             from public, anon, authenticated;
revoke execute on function tenis_reserva_resumen(uuid, boolean)             from public, anon, authenticated;
revoke execute on function tenis_cancelado_por_tipo(uuid, uuid)             from public, anon, authenticated;
revoke execute on function tenis_reserva_coincide(uuid, text)               from public, anon, authenticated;
revoke execute on function tenis_reserva_item_staff(uuid)                   from public, anon, authenticated;
revoke execute on function tenis_historial_snapshot(uuid)                   from public, anon, authenticated;
revoke execute on function tenis_historial_registrar(uuid, text)            from public, anon, authenticated;
revoke execute on function tenis_historial_tg_reserva()                     from public, anon, authenticated;
revoke execute on function tenis_historial_tg_jugador()                     from public, anon, authenticated;
revoke execute on function tenis_cancelacion_tg()                           from public, anon, authenticated;
revoke execute on function tenis_reporte_modulos(date, date)                from public, anon, authenticated;
revoke execute on function tenis_crear_reserva(uuid, timestamptz, text, uuid, uuid, jsonb, text, text, boolean, uuid,
                                               timestamptz, text, text, boolean) from public, anon, authenticated;

-- Helper del contrato (mismos permisos que antes).
revoke execute on function tenis_cargo_jugador(uuid, uuid, timestamptz, text, uuid) from public, anon;
grant  execute on function tenis_cargo_jugador(uuid, uuid, timestamptz, text, uuid) to authenticated, service_role;

-- RPC de clientes: authenticated (cada una valida su rol).
revoke execute on function tenis_reservar(uuid, timestamptz, text, jsonb, text)                    from public, anon;
revoke execute on function tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text, text) from public, anon;
revoke execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb, text)        from public, anon;
revoke execute on function tenis_jugadores_corregir(uuid, jsonb, boolean, text)                    from public, anon;
revoke execute on function tenis_extension(uuid, timestamptz, uuid)                                from public, anon;
revoke execute on function tenis_cancelar(uuid, text)                                              from public, anon;
revoke execute on function tenis_disponibilidad(date)                                              from public, anon;
revoke execute on function tenis_grilla(date)                                                      from public, anon;
revoke execute on function tenis_config_guardar(jsonb)                                             from public, anon;
revoke execute on function tenis_horarios_guardar(jsonb)                                           from public, anon;
revoke execute on function tenis_disponibilidad_semana(date, int, text)                            from public, anon;
revoke execute on function tenis_reserva_historial(uuid)                                           from public, anon;
revoke execute on function tenis_canceladas_listar(date, date, text, text, text, int, int)         from public, anon;
revoke execute on function tenis_reservas_listar(date, date, text, uuid, text, text, int, int)     from public, anon;
revoke execute on function tenis_cancelar_varias(uuid[], text)                                     from public, anon;
revoke execute on function tenis_reporte(text, date, date)                                         from public, anon;
revoke execute on function tenis_novedades_listar(int)                                             from public, anon;
revoke execute on function tenis_novedad_guardar(jsonb)                                            from public, anon;
revoke execute on function tenis_novedad_borrar(uuid)                                              from public, anon;
revoke execute on function tenis_checkin(text, text)                                               from public, anon;
revoke execute on function tenis_cotizar(uuid, timestamptz, text, jsonb, uuid, uuid)               from public, anon;

grant execute on function tenis_reservar(uuid, timestamptz, text, jsonb, text)                    to authenticated, service_role;
grant execute on function tenis_reservar_staff(uuid, timestamptz, text, jsonb, jsonb, text, text) to authenticated, service_role;
grant execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb, text)        to authenticated, service_role;
grant execute on function tenis_jugadores_corregir(uuid, jsonb, boolean, text)                    to authenticated, service_role;
grant execute on function tenis_extension(uuid, timestamptz, uuid)                                to authenticated, service_role;
grant execute on function tenis_cancelar(uuid, text)                                              to authenticated, service_role;
grant execute on function tenis_disponibilidad(date)                                              to authenticated, service_role;
grant execute on function tenis_grilla(date)                                                      to authenticated, service_role;
grant execute on function tenis_config_guardar(jsonb)                                             to authenticated, service_role;
grant execute on function tenis_horarios_guardar(jsonb)                                           to authenticated, service_role;
grant execute on function tenis_disponibilidad_semana(date, int, text)                            to authenticated, service_role;
grant execute on function tenis_reserva_historial(uuid)                                           to authenticated, service_role;
grant execute on function tenis_canceladas_listar(date, date, text, text, text, int, int)         to authenticated, service_role;
grant execute on function tenis_reservas_listar(date, date, text, uuid, text, text, int, int)     to authenticated, service_role;
grant execute on function tenis_cancelar_varias(uuid[], text)                                     to authenticated, service_role;
grant execute on function tenis_reporte(text, date, date)                                         to authenticated, service_role;
grant execute on function tenis_novedades_listar(int)                                             to authenticated, service_role;
grant execute on function tenis_novedad_guardar(jsonb)                                            to authenticated, service_role;
grant execute on function tenis_novedad_borrar(uuid)                                              to authenticated, service_role;
grant execute on function tenis_checkin(text, text)                                               to authenticated, service_role;
grant execute on function tenis_cotizar(uuid, timestamptz, text, jsonb, uuid, uuid)               to authenticated, service_role;

-- Sólo service_role (Edge Functions).
revoke execute on function tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function tenis_procesar()                                                        from public, anon, authenticated;
revoke execute on function tenis_audiencia_novedades()                                             from public, anon, authenticated;
revoke execute on function tenis_novedad_marcar_enviada(uuid, int, int)                            from public, anon, authenticated;
grant  execute on function tenis_invitado_reservar(uuid, timestamptz, text, jsonb, jsonb, text, text) to service_role;
grant  execute on function tenis_procesar()                                                        to service_role;
grant  execute on function tenis_audiencia_novedades()                                             to service_role;
grant  execute on function tenis_novedad_marcar_enviada(uuid, int, int)                            to service_role;
