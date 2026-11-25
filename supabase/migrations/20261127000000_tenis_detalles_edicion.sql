-- Migration: 20261127000000_tenis_detalles_edicion
--
-- Detalles de la edición de reservas de tenis. Va sobre 20261112000000_reservas_tenis,
-- 20261125000000_tenis_aviso_jugadores y 20261126000000_tenis_editar_reserva (no las toca).
--
-- 1. Editar una reserva no pierde lo cobrado.
--    · tenis_reserva_jugadores.monto_cobrado: lo que se cobró de verdad del cargo del turno
--      (null = no cobrado). Lo ponen tenis_cobro_marcar (= cargo) y, con un trigger BEFORE, todo
--      lo que marque cobrado = true sin monto (aprobar el comprobante: = cargo). Se completa
--      con el cargo de las filas ya cobradas.
--    · tenis_editar_reserva: el que sigue en la reserva conserva cobrado/cobrado_por/cobrado_at
--      aunque cambie cancha, horario o modalidad (sólo se borra el check-in si cambia el turno).
--      Si su cargo nuevo no coincide con lo cobrado queda una diferencia: cargo − monto_cobrado
--      (> 0 debe más, < 0 hay que devolverle). tenis_reserva_resumen la muestra por jugador
--      ('monto_cobrado', 'diferencia', y 'pendiente' la incluye, puede ser negativo);
--      total_cobrado suma lo cobrado de verdad, así total = total_cobrado + total_pendiente.
--      Marcar el cobro de nuevo (tenis_cobro_marcar) salda la diferencia (monto = cargo).
--    · tenis_cobros_ajustes: lo que staff tiene que devolver o cobrar fuera de la reserva.
--      'jugador_quitado' (trigger de delete: un jugador que había pagado sale por una edición o
--      una corrección; monto = lo que pagó, a devolver) y 'cambio_turno' (un jugador cobrado que
--      sigue y cuyo cargo cambió; monto = monto_cobrado − cargo: > 0 devolver, < 0 cobrar; uno
--      abierto por jugador y reserva, se actualiza con cada edición y se cierra solo al saldarse).
--      RLS cerrada; gestor y canchero lo leen con tenis_cobros_ajustes_pendientes() y lo cierran
--      con tenis_cobro_ajuste_resolver().
-- 2. Locks de tenis_editar_reserva: si otra edición movió la reserva a una cancha cuyo lock
--    no se tomó mientras se esperaba, ya no se toma ese lock fuera de orden (posible deadlock):
--    se aborta con el código nuevo 'reintentar'. Un deadlock_detected (40P01) también sale
--    como 'reintentar' (la edición se deshace entera).
--
-- Deploy: aplicar después de las tres anteriores. No hay Edge Function que cambiar.

-- ─── 1. Lo cobrado por jugador ────────────────────────────────────────────────

alter table tenis_reserva_jugadores add column monto_cobrado int check (monto_cobrado >= 0);

update tenis_reserva_jugadores set monto_cobrado = cargo where cobrado;

alter table tenis_reserva_jugadores
  add constraint tenis_jugadores_monto_cobrado_check check (cobrado = (monto_cobrado is not null));

-- Cobrado sin monto (aprobar comprobante, extensiones, cualquier camino que sólo ponga
-- cobrado = true) = se cobró el cargo. Desmarcar borra el monto.
create or replace function tenis_jugadores_tg_monto_cobrado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.cobrado then
    new.monto_cobrado := null;
  elsif new.monto_cobrado is null then
    new.monto_cobrado := new.cargo;
  end if;
  return new;
end;
$$;

create trigger tenis_jugadores_monto_cobrado
  before insert or update on tenis_reserva_jugadores
  for each row execute function tenis_jugadores_tg_monto_cobrado();

-- ─── Ajustes de cobro (devoluciones / diferencias para staff) ─────────────────

create table tenis_cobros_ajustes (
  id           uuid        primary key default gen_random_uuid(),
  reserva_id   uuid        not null references tenis_reservas(id) on delete cascade,
  socio_id     uuid        references socios(id) on delete set null,
  invitado_id  uuid        references tenis_invitados(id) on delete set null,
  -- Nombre al momento del ajuste (la persona ya puede no estar en la reserva).
  nombre       text        not null,
  -- > 0: el club le devuelve; < 0: la persona debe.
  monto        int         not null check (monto <> 0),
  motivo       text        not null check (motivo in ('jugador_quitado', 'cambio_turno')),
  created_by   uuid        references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  resuelto_at  timestamptz,
  resuelto_por uuid        references profiles(id) on delete set null
);

create index tenis_cobros_ajustes_abiertos_idx on tenis_cobros_ajustes (created_at) where resuelto_at is null;
create index tenis_cobros_ajustes_reserva_idx  on tenis_cobros_ajustes (reserva_id);
create unique index tenis_cobros_ajustes_cambio_abierto_uq
  on tenis_cobros_ajustes (reserva_id, coalesce(socio_id, invitado_id))
  where motivo = 'cambio_turno' and resuelto_at is null;

alter table tenis_cobros_ajustes enable row level security;
revoke all on table tenis_cobros_ajustes from public, anon, authenticated;
grant all on table tenis_cobros_ajustes to service_role;

-- Deja el ajuste 'cambio_turno' de un jugador al día con su diferencia: abierto con
-- monto = monto_cobrado − cargo si hay diferencia; cerrado si no (saldado o no cobrado).
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
  if not found then
    return;
  end if;
  v_dif := case when v_j.cobrado then v_j.monto_cobrado - v_j.cargo else 0 end;

  if v_dif = 0 then
    update tenis_cobros_ajustes a
       set resuelto_at = tenis_ahora(), resuelto_por = auth.uid()
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

-- Sale de la reserva alguien que había pagado (edición del titular o corrección del
-- canchero): queda a devolver todo lo que pagó, y su 'cambio_turno' abierto se cierra (lo
-- reemplaza éste). No aplica cuando se borra la reserva entera ni la persona.
create or replace function tenis_cobros_ajustes_tg_jugador_quitado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not old.cobrado or coalesce(old.monto_cobrado, 0) <= 0
     or not exists (select 1 from tenis_reservas r where r.id = old.reserva_id)
     or (old.socio_id is not null and not exists (select 1 from socios s where s.id = old.socio_id))
     or (old.invitado_id is not null and not exists (select 1 from tenis_invitados i where i.id = old.invitado_id)) then
    return null;
  end if;

  update tenis_cobros_ajustes a
     set resuelto_at = tenis_ahora(), resuelto_por = auth.uid()
   where a.reserva_id = old.reserva_id and a.motivo = 'cambio_turno' and a.resuelto_at is null
     and coalesce(a.socio_id, a.invitado_id) = coalesce(old.socio_id, old.invitado_id);

  insert into tenis_cobros_ajustes (reserva_id, socio_id, invitado_id, nombre, monto, motivo, created_by, created_at)
  values (old.reserva_id, old.socio_id, old.invitado_id, tenis_nombre_persona(old.socio_id, old.invitado_id),
          old.monto_cobrado, 'jugador_quitado', auth.uid(), tenis_ahora());
  return null;
end;
$$;

create trigger tenis_cobros_ajustes_jugador_quitado
  after delete on tenis_reserva_jugadores
  for each row execute function tenis_cobros_ajustes_tg_jugador_quitado();

-- Ajustes sin resolver, más viejos primero (gestor y canchero).
-- → [{id, reserva_id, socio_id, invitado_id, nombre, numero_socio, dni, monto, motivo,
--     created_at, cancha_nombre, inicio, estado}]
create or replace function tenis_cobros_ajustes_pendientes()
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

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',            a.id,
      'reserva_id',    a.reserva_id,
      'socio_id',      a.socio_id,
      'invitado_id',   a.invitado_id,
      'nombre',        a.nombre,
      'numero_socio',  s.numero_socio,
      'dni',           i.dni,
      'monto',         a.monto,
      'motivo',        a.motivo,
      'created_at',    a.created_at,
      'cancha_nombre', c.nombre,
      'inicio',        r.inicio,
      'estado',        r.estado
    ) order by a.created_at, a.id)
    from tenis_cobros_ajustes a
    join tenis_reservas r on r.id = a.reserva_id
    left join tenis_canchas c on c.id = r.cancha_id
    left join socios s on s.id = a.socio_id
    left join tenis_invitados i on i.id = a.invitado_id
    where a.resuelto_at is null
  ), '[]'::jsonb);
end;
$$;

-- Staff ya devolvió o cobró: el ajuste se cierra. → {id, resuelto} (false si ya estaba
-- cerrado o no existe; idempotente).
create or replace function tenis_cobro_ajuste_resolver(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_id is null then
    perform tenis_error('parametros');
  end if;
  update tenis_cobros_ajustes
     set resuelto_at = tenis_ahora(), resuelto_por = auth.uid()
   where id = p_id and resuelto_at is null;
  return jsonb_build_object('id', p_id, 'resuelto', found);
end;
$$;

-- tenis_cobro_marcar: igual que en 20261112000000, más monto_cobrado (= cargo al marcar el
-- turno, null al desmarcar) y el ajuste 'cambio_turno' al día (marcar salda la diferencia).
create or replace function tenis_cobro_marcar(p_jugador_id uuid, p_cobrado boolean, p_concepto text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j     tenis_reserva_jugadores%rowtype;
  v_turno boolean := p_concepto is null or p_concepto = 'turno';
  v_ns    boolean := p_concepto is null or p_concepto = 'no_show';
begin
  if not es_canchero() then
    perform tenis_error('no_autorizado');
  end if;
  if p_cobrado is null or (p_concepto is not null and p_concepto not in ('turno', 'no_show')) then
    perform tenis_error('parametros');
  end if;
  update tenis_reserva_jugadores
     set cobrado       = case when v_turno then p_cobrado else cobrado end,
         cobrado_por   = case when not v_turno then cobrado_por when p_cobrado then auth.uid() end,
         cobrado_at    = case when not v_turno then cobrado_at when p_cobrado then tenis_ahora() end,
         monto_cobrado = case when not v_turno then monto_cobrado when p_cobrado then cargo end,
         cargo_no_show_cobrado     = case when v_ns and cargo_no_show > 0 then p_cobrado
                                          else cargo_no_show_cobrado end,
         cargo_no_show_cobrado_por = case when not (v_ns and cargo_no_show > 0) then cargo_no_show_cobrado_por
                                          when p_cobrado then auth.uid() end,
         cargo_no_show_cobrado_at  = case when not (v_ns and cargo_no_show > 0) then cargo_no_show_cobrado_at
                                          when p_cobrado then tenis_ahora() end
   where id = p_jugador_id
  returning * into v_j;
  if not found then
    perform tenis_error('jugador_inexistente');
  end if;
  if v_turno then
    perform tenis_cobro_ajuste_sincronizar(v_j.id);
  end if;
  return jsonb_build_object('jugador_id', v_j.id, 'reserva_id', v_j.reserva_id,
                            'cargo', v_j.cargo, 'cobrado', v_j.cobrado, 'cobrado_at', v_j.cobrado_at,
                            'monto_cobrado', v_j.monto_cobrado,
                            'diferencia', case when v_j.cobrado then v_j.cargo - v_j.monto_cobrado else 0 end,
                            'cargo_no_show', v_j.cargo_no_show,
                            'cargo_no_show_cobrado', v_j.cargo_no_show_cobrado);
end;
$$;

-- tenis_reserva_resumen: igual que en 20261112000000, más 'monto_cobrado' y 'diferencia' por
-- jugador. 'pendiente' = lo que falta (o sobra, negativo) del turno + el no-show sin cobrar;
-- total_cobrado = lo cobrado de verdad. total = total_cobrado + total_pendiente.
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
    'comprobante_estado',   r.comprobante_estado,
    'comprobante_vence_at', r.comprobante_vence_at,
    'jugadores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jugador_id',    j.id,
          'socio_id',      j.socio_id,
          'invitado_id',   j.invitado_id,
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
        order by j.es_titular desc, tenis_nombre_persona(j.socio_id, j.invitado_id))
      from tenis_reserva_jugadores j where j.reserva_id = r.id
    ), '[]'::jsonb),
    -- total incluye el cargo extra del no-show (cargo_no_show) de un titular que ya había pagado.
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

-- ─── tenis_editar_reserva: conserva lo cobrado ────────────────────────────────
-- Igual que en 20261126000000 salvo los jugadores que siguen: si cambia el turno sólo se
-- borra su check-in (el cobro queda) y se recalcula el cargo de todos; al cobrado cuyo cargo
-- cambia le queda la diferencia y su ajuste 'cambio_turno'. Los que salen se borran (el
-- trigger de delete deja el 'jugador_quitado' si habían pagado).

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
  if not found then
    perform tenis_error('reserva_inexistente');
  end if;
  if v_r.cancha_id not in (v_cancha0, coalesce(p_cancha_id, v_cancha0)) then
    -- Otra edición la movió a una cancha cuyo lock no tenemos mientras esperábamos.
    -- Tomarlo ahora rompería el orden de los locks (posible deadlock): se aborta y el
    -- socio vuelve a intentar con la reserva actualizada.
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

  -- Jugadores: sacar a los que ya no están (si habían pagado queda el ajuste para
  -- devolver), borrar el check-in de los que siguen si cambió el turno (el cobro queda) e
  -- insertar a los nuevos.
  delete from tenis_reserva_jugadores j
   where j.reserva_id = p_reserva_id
     and not j.es_titular
     and not exists (
       select 1 from unnest(v_socios, v_invs) as u(s, iv)
       where (u.s is not null and u.s = j.socio_id) or (u.iv is not null and u.iv = j.invitado_id)
     );

  if v_cambia then
    update tenis_reserva_jugadores
       set check_in_at = null, check_in_por = null
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

  -- Cargos: el carnet gratis lo define cada jugador, sin contar esta reserva. Con turno
  -- nuevo, todos (también los cobrados: su diferencia queda pendiente); si no, los no
  -- cobrados (igual que tenis_jugadores_corregir).
  for v_j in
    select * from tenis_reserva_jugadores
     where reserva_id = p_reserva_id and (v_cambia or not cobrado)
     order by es_titular desc
  loop
    select * into v_c from tenis_cargo_jugador(v_j.socio_id, v_j.invitado_id, p_inicio, p_modalidad, p_reserva_id);
    update tenis_reserva_jugadores set cargo = v_c.cargo, motivo_cargo = v_c.motivo where id = v_j.id;
    if v_j.cobrado then
      perform tenis_cobro_ajuste_sincronizar(v_j.id);
    end if;
  end loop;

  return tenis_reserva_resumen(p_reserva_id);
exception
  -- Un deadlock con otra operación (la base aborta una de las dos) no llega como error
  -- sin código: la edición se deshace entera y el socio vuelve a intentar.
  when deadlock_detected then
    perform tenis_error('reintentar');
end;
$$;

-- ─── Permisos ─────────────────────────────────────────────────────────────────

revoke execute on function tenis_jugadores_tg_monto_cobrado()           from public, anon, authenticated;
revoke execute on function tenis_cobro_ajuste_sincronizar(uuid)         from public, anon, authenticated;
revoke execute on function tenis_cobros_ajustes_tg_jugador_quitado()    from public, anon, authenticated;

revoke execute on function tenis_cobros_ajustes_pendientes()            from public, anon;
revoke execute on function tenis_cobro_ajuste_resolver(uuid)            from public, anon;
grant  execute on function tenis_cobros_ajustes_pendientes()            to authenticated, service_role;
grant  execute on function tenis_cobro_ajuste_resolver(uuid)            to authenticated, service_role;

revoke execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb) from public, anon;
grant  execute on function tenis_editar_reserva(uuid, uuid, timestamptz, text, jsonb) to authenticated, service_role;
