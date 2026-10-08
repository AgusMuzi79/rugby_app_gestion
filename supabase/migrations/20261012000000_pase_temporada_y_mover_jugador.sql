-- Pase de temporada automático y mover jugador de división.
--
-- Modelo: jugadores tiene una fila por (dni, division_id). Mover a un jugador
-- = desactivar la fila de origen (activo = false) y activar la de destino:
-- si ya existe una fila de ese dni en la división destino se reactiva, si no
-- se crea una nueva. El historial (asistencias, lesiones, fichajes,
-- mesa_jugadores, cobranzas) queda colgado de la fila vieja a propósito.
--
-- siguiente_division_id: a dónde pasan los jugadores que superan edad_max
-- cuando no hay ninguna división con rango que contenga su nueva edad
-- (p. ej. Sub 19 -> Intermedia y Primera Damas, M19 -> una superior).
--
-- pase_de_temporada(): corre una vez por año (cron 1 de enero), es idempotente
-- y nunca saca a nadie de una división sin destino: si no encuentra destino,
-- el jugador se queda donde está y el coordinador lo mueve a mano.

-- ─── divisiones.siguiente_division_id ───────────────────────────────────────

alter table divisiones
  add column if not exists siguiente_division_id uuid
    references divisiones(id) on delete set null;

alter table divisiones
  drop constraint if exists divisiones_siguiente_distinta_check,
  add constraint divisiones_siguiente_distinta_check
    check (siguiente_division_id is null or siguiente_division_id <> id);

comment on column divisiones.siguiente_division_id is
  'División siguiente: destino del pase de temporada para quienes superan edad_max cuando ninguna división con rango contiene su nueva edad. Null = sin destino por defecto.';

-- ─── Helper interno: mover una fila de jugador a otra división ──────────────
-- Sin validaciones de permisos: lo usan mover_jugador_division (que valida) y
-- pase_de_temporada (sólo service_role). No ejecutable por anon/authenticated.

create or replace function _mover_jugador_division(
  p_jugador_id       uuid,
  p_division_destino uuid,
  p_reset_fichado    boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen  jugadores%rowtype;
  v_destino uuid;
begin
  select * into v_origen from jugadores where id = p_jugador_id for update;

  if not found then
    raise exception 'Jugador no encontrado';
  end if;

  -- Fila de origen ya inactiva: no hay nada que mover.
  if not v_origen.activo then
    return null;
  end if;

  if v_origen.division_id = p_division_destino then
    return v_origen.id;
  end if;

  update jugadores set activo = false where id = v_origen.id;

  -- Upsert sobre unique (dni, division_id): reactiva la fila existente en
  -- destino (completando datos faltantes) o crea una nueva. Si la fila de
  -- destino ya estaba activa se respeta su estado de fichaje.
  insert into jugadores (
    nombre_completo, dni, fecha_nacimiento, division_id, activo,
    socio_id, posicion, fichado_temporada_actual
  )
  values (
    v_origen.nombre_completo, v_origen.dni, v_origen.fecha_nacimiento,
    p_division_destino, true,
    v_origen.socio_id, v_origen.posicion,
    case when p_reset_fichado then false else v_origen.fichado_temporada_actual end
  )
  on conflict (dni, division_id) do update set
    fichado_temporada_actual = case
      when jugadores.activo then jugadores.fichado_temporada_actual
      else excluded.fichado_temporada_actual
    end,
    activo           = true,
    socio_id         = coalesce(jugadores.socio_id, excluded.socio_id),
    -- La fecha de la fila activa de origen manda: si la fila vieja de destino
    -- tuviera otra (dato corregido después), el pase volvería a moverlo.
    fecha_nacimiento = coalesce(excluded.fecha_nacimiento, jugadores.fecha_nacimiento),
    nombre_completo  = coalesce(nullif(jugadores.nombre_completo, ''), excluded.nombre_completo),
    posicion         = coalesce(jugadores.posicion, excluded.posicion)
  returning id into v_destino;

  return v_destino;
end;
$$;

revoke execute on function _mover_jugador_division(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function _mover_jugador_division(uuid, uuid, boolean) to service_role;

-- ─── RPC: mover jugador de división (app mobile) ────────────────────────────
-- Permisos (rol activo vía get_rol(), igual que las políticas RLS):
--   admin: cualquier división.
--   subcomision: divisiones de su disciplina (tiene_acceso_deporte).
--   coordinador: sólo si tiene acceso a la división de origen Y a la destino.

create or replace function mover_jugador_division(
  p_jugador_id       uuid,
  p_division_destino uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol      text;
  v_jugador  jugadores%rowtype;
  v_origen   divisiones%rowtype;
  v_destino  divisiones%rowtype;
  v_nueva_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_rol := get_rol();

  select * into v_jugador from jugadores where id = p_jugador_id;
  if not found then
    raise exception 'Jugador no encontrado';
  end if;
  if not v_jugador.activo then
    raise exception 'El jugador no está activo en esta división';
  end if;

  select * into v_origen from divisiones where id = v_jugador.division_id;

  select * into v_destino from divisiones where id = p_division_destino;
  if not found then
    raise exception 'División destino no encontrada';
  end if;

  if not (
    v_rol = 'admin'
    or (v_rol = 'subcomision' and tiene_acceso_deporte(v_destino.deporte)
                              and tiene_acceso_deporte(v_origen.deporte))
    or (v_rol = 'coordinador' and coalesce(tiene_acceso_division(v_origen.id), false)
                              and coalesce(tiene_acceso_division(v_destino.id), false))
  ) then
    raise exception 'No tenés permiso para mover jugadores entre estas divisiones';
  end if;

  if not v_destino.activa then
    raise exception 'La división destino no está activa';
  end if;
  if v_destino.deporte <> v_origen.deporte then
    raise exception 'La división destino es de otro deporte';
  end if;
  if v_destino.id = v_origen.id then
    raise exception 'El jugador ya está en esa división';
  end if;

  v_nueva_id := _mover_jugador_division(p_jugador_id, p_division_destino, false);

  return jsonb_build_object('ok', true, 'jugador_id', v_nueva_id);
end;
$$;

revoke execute on function mover_jugador_division(uuid, uuid) from public, anon;
grant execute on function mover_jugador_division(uuid, uuid) to authenticated;

-- ─── Pase de temporada ──────────────────────────────────────────────────────
-- Para cada jugador ACTIVO de una división ACTIVA con rango de edad:
--   edad = temporada - año de nacimiento.
--   edad <= edad_max -> se queda (incluye edad < edad_min).
--   edad >  edad_max -> destino = división activa del mismo deporte y rama
--     (null-safe) cuyo rango contiene la edad, prefiriendo: misma línea,
--     línea null, línea 'A', cualquiera (desempate por nombre). Si no hay,
--     siguiente_division_id (activa, mismo deporte, y que no le quede chica:
--     sin rango o edad <= su edad_max). Si tampoco, se queda (sin_destino).
-- Idempotente: tras moverlo, el jugador queda en una división cuyo rango lo
-- contiene (o sin rango), así que una segunda corrida no lo vuelve a mover.
-- El FOR recorre un cursor con la foto tomada al empezar: las filas
-- creadas/reactivadas durante la corrida no se reprocesan.

create or replace function pase_de_temporada(
  p_temporada int default extract(year from (now() at time zone 'America/Argentina/Buenos_Aires'))::int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r             record;
  v_movidos     int := 0;
  v_se_quedan   int := 0;
  v_sin_destino int := 0;
  v_detalle     jsonb := '[]'::jsonb;
begin
  for r in
    select
      j.id            as jugador_id,
      j.nombre_completo,
      d.nombre        as division,
      p_temporada - extract(year from j.fecha_nacimiento)::int as edad,
      d.edad_max,
      coalesce(
        (
          select t.id
          from divisiones t
          where t.activa
            and t.id <> d.id
            and t.deporte = d.deporte
            and t.rama is not distinct from d.rama
            and t.edad_min is not null
            and (p_temporada - extract(year from j.fecha_nacimiento)::int)
                between t.edad_min and t.edad_max
          order by
            case
              when t.linea is not distinct from d.linea then 1
              when t.linea is null then 2
              when t.linea = 'A' then 3
              else 4
            end,
            t.nombre
          limit 1
        ),
        (
          select s.id
          from divisiones s
          where s.id = d.siguiente_division_id
            and s.activa
            and s.deporte = d.deporte
            and (s.edad_max is null
                 or (p_temporada - extract(year from j.fecha_nacimiento)::int) <= s.edad_max)
        )
      ) as destino
    from jugadores j
    join divisiones d on d.id = j.division_id
    where j.activo
      and d.activa
      and d.edad_min is not null
      and j.fecha_nacimiento is not null
    order by d.nombre, j.nombre_completo
  loop
    if r.edad <= r.edad_max then
      v_se_quedan := v_se_quedan + 1;
    elsif r.destino is null then
      v_sin_destino := v_sin_destino + 1;
      if jsonb_array_length(v_detalle) < 200 then
        v_detalle := v_detalle || jsonb_build_object(
          'jugador_id', r.jugador_id,
          'nombre',     r.nombre_completo,
          'division',   r.division
        );
      end if;
    else
      -- null = la fila ya había quedado inactiva (p. ej. otra corrida en paralelo).
      if _mover_jugador_division(r.jugador_id, r.destino, true) is not null then
        v_movidos := v_movidos + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'temporada',           p_temporada,
    'movidos',             v_movidos,
    'se_quedan',           v_se_quedan,
    'sin_destino',         v_sin_destino,
    'detalle_sin_destino', v_detalle
  );
end;
$$;

-- Execute sólo para service_role (y postgres, dueño): lo corre el cron.
revoke execute on function pase_de_temporada(int) from public, anon, authenticated;
grant execute on function pase_de_temporada(int) to service_role;

-- ─── Cron anual: 1 de enero 03:05 UTC = 00:05 Argentina ─────────────────────
-- NOTA: NO registrar sin confirmación de Agus. Antes: aplicar esta migración,
-- cargar rangos/línea/rama/división siguiente en todas las divisiones y probar
-- con una temporada futura dentro de una transacción con rollback. Después,
-- ejecutar manualmente en el SQL editor de Supabase (requiere pg_cron):
--
-- SELECT cron.schedule(
--   'pase-de-temporada',
--   '5 3 1 1 *',
--   $$ SELECT pase_de_temporada(); $$
-- );
