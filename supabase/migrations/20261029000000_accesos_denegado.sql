-- Migration: 20261029000000_accesos_denegado
--
-- Auditoría portería T11: separar los intentos rechazados de los ingresos.
--
-- socios-qr registra en `accesos` también los escaneos que NO pasaron (sin el servicio
-- de Gimnasio, o bloqueados por el turnero sin reserva), y el panel web los contaba
-- como "INGRESOS". Desde ahora la función los escribe con `denegado = true` y un
-- `motivo_rechazo` corto (lo muestra el panel como "RECHAZADO · <motivo>").
--
-- Filas viejas: no se actualizan (sin escritura masiva). Las de `sin_servicio = true`
-- siempre fueron rechazos (sólo se escribe en ese camino), así que el panel y el
-- proceso de faltas las tratan como rechazo aunque tengan `denegado = false`. Un
-- bloqueo viejo del turnero (sin_reserva) no se puede distinguir de un ingreso sin
-- reserva y queda como ingreso.
--
-- gimnasio_procesar_faltas: un rechazo ya no cuenta como asistencia al turno. Es la
-- misma función de 20261007000000 con dos condiciones más en el EXISTS de accesos.
--
-- Orden de deploy: esta migración ANTES que socios-qr (escribe y lee las columnas).
-- Idempotente.

alter table accesos
  add column if not exists denegado boolean not null default false;

alter table accesos
  add column if not exists motivo_rechazo text;

create or replace function gimnasio_procesar_faltas(p_aplicar boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aplicar    boolean := coalesce(p_aplicar, true);
  v_cfg        gimnasio_config%rowtype;
  v_ahora      timestamp := gimnasio_ahora();
  v_hoy        date := gimnasio_ahora()::date;
  v_tol        interval;
  v_desde      timestamp;
  v_evaluadas  integer := 0;
  v_asistio    integer := 0;
  v_falto      integer := 0;
  v_avisos     jsonb := '[]'::jsonb;
  v_bajas      jsonb := '[]'::jsonb;
  v_r          record;
  v_f          gimnasio_franjas%rowtype;
  v_profile    uuid;
  v_ev         uuid;
  v_canceladas integer;
  v_fijos_off  integer := 0;
  v_elim       integer := 0;
  v_fid        uuid;
  v_lib        jsonb;
begin
  select * into v_cfg from gimnasio_config where id = 1;
  if not found then
    raise exception 'gimnasio_config no tiene fila (id = 1)';
  end if;

  if v_aplicar and not v_cfg.faltas_activas then
    return jsonb_build_object('ok', true, 'activo', false);
  end if;

  v_desde := v_cfg.faltas_activas_desde;
  if v_desde is null then
    -- Sólo se llega acá en dry-run (aplicando con el interruptor apagado ya se devolvió arriba).
    return jsonb_build_object(
      'ok', true, 'activo', v_cfg.faltas_activas, 'aplicado', v_aplicar, 'desde', null,
      'nota', 'Todavía no se activó el proceso de faltas: no hay desde cuándo evaluar.',
      'evaluadas', 0, 'asistio', 0, 'falto', 0, 'avisos', '[]'::jsonb, 'bajas', '[]'::jsonb
    );
  end if;

  v_tol := make_interval(mins => v_cfg.tolerancia_min);

  perform pg_advisory_xact_lock(hashtext('gimnasio_procesar_faltas'));

  begin
    -- 1. Evaluación de reservas vencidas. La ventana de ingreso se arma en hora local y se pasa a
    --    UTC sumando 3 horas (sin depender de la interpretación de offsets como texto).
    with debidas as (
      select r.id,
        exists (
          select 1 from accesos a
          where a.socio_id = r.socio_id
            and a.punto = 'gimnasio'
            -- Un rechazo en la puerta no es asistencia (sin_servicio sólo se escribe al rechazar).
            and not a.denegado
            and not a.sin_servicio
            and a.creado_en >= (((r.fecha + f.hora_desde) - v_tol + interval '3 hours') at time zone 'UTC')
            and a.creado_en <= (((r.fecha + f.hora_hasta) + v_tol + interval '3 hours') at time zone 'UTC')
        ) as asistio
      from gimnasio_reservas r
      join gimnasio_franjas f on f.id = r.franja_id
      where r.estado = 'reservada'
        and (r.fecha + f.hora_hasta) >= v_desde
        and (r.fecha + f.hora_hasta) + v_tol <= v_ahora
    ),
    upd as (
      update gimnasio_reservas r
         set estado = case when d.asistio then 'asistio' else 'falto' end
        from debidas d
       where r.id = d.id and r.estado = 'reservada'
      returning r.estado
    )
    select count(*)::integer,
           (count(*) filter (where estado = 'asistio'))::integer,
           (count(*) filter (where estado = 'falto'))::integer
      into v_evaluadas, v_asistio, v_falto
    from upd;

    -- 2. Contador de faltas de los turnos fijos activos.
    with r as (select * from gimnasio_rachas())
    update gimnasio_turnos_fijos tf
       set faltas_consecutivas = coalesce(
         (select x.largo from r x where x.socio_id = tf.socio_id and x.franja_id = tf.franja_id), 0)
     where tf.activo
       and tf.faltas_consecutivas is distinct from coalesce(
         (select x.largo from r x where x.socio_id = tf.socio_id and x.franja_id = tf.franja_id), 0);

    -- 3 y 4. Avisos y bajas.
    for v_r in
      select * from gimnasio_rachas() x
      where x.largo >= v_cfg.faltas_aviso
      order by x.franja_id, x.socio_id
    loop
      select * into v_f from gimnasio_franjas where id = v_r.franja_id;
      select s.profile_id into v_profile from socios s where s.id = v_r.socio_id;

      if v_r.largo >= v_cfg.faltas_baja then
        v_ev := null;
        insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
        values (v_r.socio_id, v_r.franja_id, 'baja', v_r.ultima)
        on conflict (socio_id, franja_id, tipo, fecha_ref) do nothing
        returning id into v_ev;

        if v_ev is not null then
          -- Turno fijo activo de esa franja: se desactiva y se borran sus ocurrencias futuras.
          v_fijos_off := 0;
          v_elim := 0;
          for v_fid in
            select tf.id from gimnasio_turnos_fijos tf
            where tf.socio_id = v_r.socio_id and tf.franja_id = v_r.franja_id and tf.activo
          loop
            v_lib := gimnasio_liberar_fijo(v_fid);
            v_fijos_off := v_fijos_off + 1;
            v_elim := v_elim + (v_lib->>'reservas_eliminadas')::integer;
          end loop;

          -- Reservas sueltas que le queden en la franja: se cancelan (no se borran), sólo las que no
          -- empezaron.
          update gimnasio_reservas
             set estado = 'cancelada'
           where socio_id = v_r.socio_id
             and franja_id = v_r.franja_id
             and estado = 'reservada'
             and fecha >= v_hoy
             and (fecha + v_f.hora_desde) > v_ahora;
          get diagnostics v_canceladas = row_count;

          v_bajas := v_bajas || jsonb_build_object(
            'socio_id', v_r.socio_id,
            'profile_id', v_profile,
            'franja_id', v_r.franja_id,
            'dia_semana', v_f.dia_semana,
            'hora_desde', v_f.hora_desde,
            'hora_hasta', v_f.hora_hasta,
            'profesor', v_f.profesor,
            'fecha', v_r.ultima,
            'racha', v_r.largo,
            'faltas_baja', v_cfg.faltas_baja,
            'reservas_canceladas', v_canceladas,
            'reservas_eliminadas', v_elim,
            'fijo_desactivado', v_fijos_off > 0
          );
        end if;
      else
        v_ev := null;
        insert into gimnasio_faltas_eventos (socio_id, franja_id, tipo, fecha_ref)
        values (v_r.socio_id, v_r.franja_id, 'aviso', v_r.ref_aviso)
        on conflict (socio_id, franja_id, tipo, fecha_ref) do nothing
        returning id into v_ev;

        if v_ev is not null then
          v_avisos := v_avisos || jsonb_build_object(
            'socio_id', v_r.socio_id,
            'profile_id', v_profile,
            'franja_id', v_r.franja_id,
            'dia_semana', v_f.dia_semana,
            'hora_desde', v_f.hora_desde,
            'hora_hasta', v_f.hora_hasta,
            'profesor', v_f.profesor,
            'fecha', v_r.ref_aviso,
            'racha', v_r.largo,
            'faltas_baja', v_cfg.faltas_baja
          );
        end if;
      end if;
    end loop;

    if not v_aplicar then
      raise exception 'dry_run' using errcode = 'GD001';
    end if;
  exception when sqlstate 'GD001' then
    null; -- dry-run: se deshizo todo lo escrito; v_* conserva lo que se habría aplicado.
  end;

  return jsonb_build_object(
    'ok', true,
    'activo', v_cfg.faltas_activas,
    'aplicado', v_aplicar,
    'desde', v_desde,
    'evaluadas', v_evaluadas,
    'asistio', v_asistio,
    'falto', v_falto,
    'avisos', v_avisos,
    'bajas', v_bajas
  );
end;
$$;

revoke execute on function gimnasio_procesar_faltas(boolean) from public, anon, authenticated;
grant execute on function gimnasio_procesar_faltas(boolean) to service_role;
