-- Migration: 20261007000000_gimnasio_turnos_fijos_auto
--
-- Turnos fijos automáticos (T6): materialización de las reservas de un turno fijo y proceso de
-- faltas (aviso y baja del horario). Lo dispara la Edge Function `gimnasio-turnos-fijos` (cron,
-- bloque comentado al final) y, para la materialización, también `crear-fijo`.
--
-- Qué agrega:
--   · gimnasio_config.faltas_activas (default false): interruptor del proceso de faltas. Mientras
--     esté apagado NO se evalúan reservas ni se avisa ni se libera nada; la materialización de
--     fijos no depende de él.
--   · gimnasio_faltas_eventos: registro de avisos y bajas ya emitidos (dedupe: una vez por racha).
--   · gimnasio_materializar_fijos(...): crea las reservas 'fijo' de los próximos días. Idempotente.
--   · gimnasio_rachas(): racha vigente de faltas consecutivas por (socio, franja).
--   · gimnasio_procesar_faltas(p_aplicar): evalúa asistencia, cuenta rachas, registra avisos y
--     bajas. Con p_aplicar = false es un dry-run que no deja nada escrito.
--
-- Convenciones (las mismas de 20261005000000): día ISO 1 = lunes … 7 = domingo, hora local del club
-- UTC-3 fija vía gimnasio_ahora(), funciones SECURITY DEFINER con search_path fijo y execute sólo
-- para service_role.

-- ─── Interruptor de faltas ────────────────────────────────────────────────────

alter table gimnasio_config
  add column faltas_activas       boolean   not null default false,
  -- Desde cuándo se evalúan faltas (hora local del club, mismo tipo que gimnasio_ahora(): timestamp
  -- sin zona). Lo fija el trigger de abajo al encender el interruptor; null = nunca se encendió.
  add column faltas_activas_desde timestamp;

comment on column gimnasio_config.faltas_activas is
  'Interruptor del proceso automático de faltas (avisos y baja del horario). Encenderlo recién cuando todos escaneen al entrar al gimnasio: la asistencia se deduce de los ingresos en accesos.';

comment on column gimnasio_config.faltas_activas_desde is
  'Momento (hora local del club) en que faltas_activas pasó de false a true la última vez. Sólo se evalúan reservas cuya franja terminó en ese momento o después: lo anterior nunca se evalúa ni cuenta para rachas. Apagar el interruptor no lo borra; volver a encenderlo lo mueve al nuevo momento.';

-- La base garantiza el corte sea quien sea el que escribe (Edge Function, SQL editor, ...):
--   · false -> true : faltas_activas_desde = ahora (gimnasio_ahora()).
--   · true -> false o sin cambio del interruptor: se conserva el valor anterior (aunque el UPDATE
--     intente pisarlo).
--   · INSERT ya activo: ahora, salvo que venga con un valor explícito.
create or replace function gimnasio_config_faltas_desde()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.faltas_activas and new.faltas_activas_desde is null then
      new.faltas_activas_desde := gimnasio_ahora();
    end if;
  elsif new.faltas_activas and not old.faltas_activas then
    new.faltas_activas_desde := gimnasio_ahora();
  else
    new.faltas_activas_desde := old.faltas_activas_desde;
  end if;
  return new;
end;
$$;

create trigger gimnasio_config_faltas_desde
  before insert or update on gimnasio_config
  for each row execute function gimnasio_config_faltas_desde();

-- ─── Eventos de faltas (dedupe de avisos y bajas) ─────────────────────────────
-- fecha_ref identifica la racha y hace único el evento:
--   · 'aviso': fecha de la falta que alcanzó faltas_aviso dentro de la racha (la N-ésima falta
--     desde el último 'asistio' o desde la última baja). Es estable aunque la racha siga creciendo.
--   · 'baja' : fecha de la ÚLTIMA falta de la racha en el momento de la baja. Además hace de corte:
--     las reservas con fecha <= fecha_ref de la última baja no cuentan para rachas nuevas de esa
--     franja, así que una baja reinicia el conteo y no se vuelve a bajar por las mismas faltas.

create table gimnasio_faltas_eventos (
  id         uuid        primary key default gen_random_uuid(),
  socio_id   uuid        not null references socios(id) on delete cascade,
  franja_id  uuid        not null references gimnasio_franjas(id) on delete cascade,
  tipo       text        not null check (tipo in ('aviso', 'baja')),
  fecha_ref  date        not null,
  creado_en  timestamptz not null default now(),
  constraint gimnasio_faltas_eventos_uq unique (socio_id, franja_id, tipo, fecha_ref)
);

create index gimnasio_faltas_eventos_franja_idx on gimnasio_faltas_eventos (franja_id);

alter table gimnasio_faltas_eventos enable row level security;

-- Lectura sólo para el staff; escritura únicamente por las RPC / service_role.
create policy "gimnasio_staff_select_faltas_eventos" on gimnasio_faltas_eventos
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision', 'porteria'));

-- ─── Materialización de turnos fijos ──────────────────────────────────────────
-- Para cada turno fijo ACTIVO (o sólo p_turno_fijo_id) cuya franja esté activa, recorre las fechas
-- desde hoy (hora local) hasta p_hasta (por defecto hoy + semanas_fijos * 7 días, inclusive) que
-- caen en el día de la franja y reserva con origen 'fijo' vía gimnasio_reservar.
--   · Si ya hay CUALQUIER reserva del socio en esa franja y fecha (en cualquier estado) se saltea:
--     así no se recrean las ocurrencias que el socio canceló ni las canceladas por un cierre.
--   · Los rechazos de gimnasio_reservar (cerrado, cupo_lleno, cupo_fijos_lleno, pasado, ...) son
--     esperables y no frenan nada: se cuentan por `codigo`.
--   · Cada turno fijo corre en su propio subbloque (savepoint): si uno revienta con una excepción
--     inesperada se deshacen SÓLO sus reservas, se informa en `errores` y se sigue con los demás.
--   · Idempotente: una segunda corrida no crea nada porque todas las fechas ya tienen reserva.
--   · p_aplicar = false es un dry-run: calcula y devuelve lo mismo que aplicaría pero no deja nada
--     escrito (las escrituras corren en un subbloque que se deshace con la excepción propia GD001;
--     las variables de plpgsql conservan lo calculado, igual que en gimnasio_procesar_faltas).
--   · Un lock advisory serializa las corridas (cron + crear-fijo) para que no se crucen los locks
--     de franja que toma gimnasio_reservar.
-- Devuelve {ok, aplicado, fijos_procesados, creadas, omitidas:{por_codigo:{...}, ya_existia:n}, errores:[...]}.

create or replace function gimnasio_materializar_fijos(
  p_turno_fijo_id uuid    default null,
  p_hasta         date    default null,
  p_aplicar       boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg        gimnasio_config%rowtype;
  v_hoy        date := gimnasio_ahora()::date;
  v_hasta      date;
  v_fijo       record;
  v_fecha      date;
  v_res        jsonb;
  v_cod        text;
  v_proc       integer := 0;
  v_creadas    integer := 0;
  v_ya         integer := 0;
  v_codigos    jsonb := '{}'::jsonb;
  v_errores    jsonb := '[]'::jsonb;
  f_creadas    integer;
  f_ya         integer;
  f_codigos    jsonb;
  v_par        record;
  v_aplicar    boolean := coalesce(p_aplicar, true);
begin
  select * into v_cfg from gimnasio_config where id = 1;
  if not found then
    raise exception 'gimnasio_config no tiene fila (id = 1)';
  end if;

  v_hasta := coalesce(p_hasta, v_hoy + v_cfg.semanas_fijos * 7);

  perform pg_advisory_xact_lock(hashtext('gimnasio_materializar_fijos'));

  begin
    for v_fijo in
      select tf.id, tf.socio_id, tf.franja_id, f.dia_semana
      from gimnasio_turnos_fijos tf
      join gimnasio_franjas f on f.id = tf.franja_id
      where tf.activo
        and f.activa
        and (p_turno_fijo_id is null or tf.id = p_turno_fijo_id)
      order by tf.franja_id, tf.id
    loop
      v_proc := v_proc + 1;

      begin
        f_creadas := 0;
        f_ya := 0;
        f_codigos := '{}'::jsonb;

        for v_fecha in
          select d::date
          from generate_series(v_hoy::timestamp, v_hasta::timestamp, interval '1 day') d
          where extract(isodow from d)::int = v_fijo.dia_semana
          order by d
        loop
          if exists (
            select 1 from gimnasio_reservas r
            where r.socio_id = v_fijo.socio_id and r.franja_id = v_fijo.franja_id and r.fecha = v_fecha
          ) then
            f_ya := f_ya + 1;
            continue;
          end if;

          v_res := gimnasio_reservar(v_fijo.socio_id, v_fijo.franja_id, v_fecha, 'fijo', v_fijo.id);
          if coalesce((v_res->>'ok')::boolean, false) then
            f_creadas := f_creadas + 1;
          else
            v_cod := coalesce(v_res->>'codigo', 'desconocido');
            f_codigos := jsonb_set(
              f_codigos, array[v_cod], to_jsonb(coalesce((f_codigos->>v_cod)::integer, 0) + 1)
            );
          end if;
        end loop;

        -- Éxito del subbloque: recién acá se suman sus números al total.
        v_creadas := v_creadas + f_creadas;
        v_ya := v_ya + f_ya;
        for v_par in select k, v from jsonb_each_text(f_codigos) as t(k, v) loop
          v_codigos := jsonb_set(
            v_codigos, array[v_par.k],
            to_jsonb(coalesce((v_codigos->>v_par.k)::integer, 0) + v_par.v::integer)
          );
        end loop;
      exception when others then
        v_errores := v_errores || jsonb_build_object(
          'turno_fijo_id', v_fijo.id, 'sqlstate', sqlstate, 'mensaje', sqlerrm
        );
      end;
    end loop;

    if not v_aplicar then
      raise exception 'dry_run' using errcode = 'GD001';
    end if;
  exception when sqlstate 'GD001' then
    null; -- dry-run: se deshizo todo lo escrito; v_* conserva lo que se habría creado.
  end;

  return jsonb_build_object(
    'ok', true,
    'aplicado', v_aplicar,
    'fijos_procesados', v_proc,
    'creadas', v_creadas,
    'omitidas', jsonb_build_object('por_codigo', v_codigos, 'ya_existia', v_ya),
    'errores', v_errores
  );
end;
$$;

-- ─── Rachas de faltas ─────────────────────────────────────────────────────────
-- Racha vigente por (socio, franja): faltas consecutivas YA evaluadas ('falto'), ordenadas por
-- fecha, que vienen después del último 'asistio' y de la última baja registrada. Las reservas
-- 'cancelada' y 'reservada' no cuentan ni cortan la racha. Tampoco cuentan las reservas cuya franja
-- terminó antes de gimnasio_config.faltas_activas_desde (la historia previa al encendido no entra
-- nunca en una racha; con el corte en null no hay rachas). Sólo devuelve pares con racha >= 1.
--   largo     — cantidad de faltas de la racha
--   primera   — fecha de la primera falta
--   ultima    — fecha de la última falta (es la fecha_ref de la baja)
--   ref_aviso — fecha de la falta que alcanza faltas_aviso (null si la racha es más corta)

create or replace function gimnasio_rachas()
returns table (
  socio_id  uuid,
  franja_id uuid,
  largo     integer,
  primera   date,
  ultima    date,
  ref_aviso date
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select faltas_aviso from gimnasio_config where id = 1
  ),
  cortes as (
    select e.socio_id as c_socio, e.franja_id as c_franja, max(e.fecha_ref) as corte
    from gimnasio_faltas_eventos e
    where e.tipo = 'baja'
    group by e.socio_id, e.franja_id
  ),
  ev as (
    select r.socio_id as e_socio, r.franja_id as e_franja, r.fecha as e_fecha, r.estado as e_estado
    from gimnasio_reservas r
    join gimnasio_franjas fr on fr.id = r.franja_id
    left join cortes c on c.c_socio = r.socio_id and c.c_franja = r.franja_id
    where r.estado in ('asistio', 'falto')
      and (r.fecha + fr.hora_hasta) >= (select cf.faltas_activas_desde from gimnasio_config cf where cf.id = 1)
      and (c.corte is null or r.fecha > c.corte)
  ),
  ult as (
    select x.e_socio as u_socio, x.e_franja as u_franja,
           max(x.e_fecha) filter (where x.e_estado = 'asistio') as ult_asistio
    from ev x
    group by x.e_socio, x.e_franja
  ),
  racha as (
    select x.e_socio as r_socio, x.e_franja as r_franja, x.e_fecha as r_fecha,
           row_number() over (partition by x.e_socio, x.e_franja order by x.e_fecha) as n
    from ev x
    join ult u on u.u_socio = x.e_socio and u.u_franja = x.e_franja
    where x.e_estado = 'falto'
      and (u.ult_asistio is null or x.e_fecha > u.ult_asistio)
  )
  select
    q.r_socio,
    q.r_franja,
    count(*)::integer,
    min(q.r_fecha),
    max(q.r_fecha),
    max(q.r_fecha) filter (where q.n = (select faltas_aviso from cfg))
  from racha q
  group by q.r_socio, q.r_franja
$$;

-- ─── Proceso de faltas ────────────────────────────────────────────────────────
-- 1. Evalúa cada reserva 'reservada' cuya franja ya terminó más la tolerancia
--    (ahora >= fecha + hora_hasta + tolerancia_min) Y terminó en o después de
--    gimnasio_config.faltas_activas_desde (nunca se mira hacia atrás del momento en que se encendió
--    el interruptor; las reservas anteriores quedan como están, sin actualización masiva): 'asistio' si el socio tiene un ingreso en
--    `accesos` (punto 'gimnasio') dentro de [inicio - tolerancia, fin + tolerancia] de ese día
--    (extremos incluidos; hora local UTC-3), si no 'falto'.
-- 2. Recalcula gimnasio_turnos_fijos.faltas_consecutivas de los fijos activos con la racha vigente.
-- 3. Racha >= faltas_aviso y < faltas_baja y sin evento 'aviso' de esa racha: registra el aviso y lo
--    devuelve en `avisos`. Si la racha ya llegó a la baja en la misma corrida se da la baja directa,
--    sin aviso intermedio.
-- 4. Racha >= faltas_baja: registra la baja, cancela TODAS las reservas 'reservada' del socio en esa
--    franja con fecha >= hoy, desactiva su turno fijo activo en esa franja y lo devuelve en `bajas`.
--
-- Interruptor: con faltas_activas = false y p_aplicar = true NO hace nada y devuelve
-- {ok:true, activo:false}. Con p_aplicar = false es un dry-run: calcula y devuelve lo mismo que
-- aplicaría (aunque el interruptor esté apagado) y NO deja nada escrito: las escrituras corren en un
-- subbloque que se deshace a propósito con una excepción propia (GD001); las variables de plpgsql
-- conservan lo calculado.
-- Idempotente: los avisos y bajas se registran con INSERT ... ON CONFLICT DO NOTHING y sólo lo que
-- ESTA corrida insertó se devuelve, así que una segunda corrida no devuelve ni cambia nada nuevo
-- (tampoco dos corridas concurrentes: un lock advisory las serializa).
--
-- Si faltas_activas_desde es null (el interruptor nunca se encendió) el dry-run NO evalúa nada y
-- devuelve desde:null con una `nota`: nunca cae a evaluar toda la historia.
--
-- Devuelve {ok, activo, aplicado, desde, evaluadas, asistio, falto, avisos:[...], bajas:[...]}; cada item
-- trae socio_id, profile_id, franja_id, dia_semana, hora_desde, hora_hasta, profesor, fecha, racha y
-- faltas_baja (las bajas además reservas_canceladas y fijo_desactivado).

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
  v_fijos_off  integer;
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
          update gimnasio_reservas
             set estado = 'cancelada'
           where socio_id = v_r.socio_id
             and franja_id = v_r.franja_id
             and estado = 'reservada'
             and fecha >= v_hoy;
          get diagnostics v_canceladas = row_count;

          update gimnasio_turnos_fijos
             set activo = false
           where socio_id = v_r.socio_id and franja_id = v_r.franja_id and activo;
          get diagnostics v_fijos_off = row_count;

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

-- Execute sólo para service_role.
revoke execute on function gimnasio_materializar_fijos(uuid, date, boolean) from public, anon, authenticated;
revoke execute on function gimnasio_rachas()                       from public, anon, authenticated;
revoke execute on function gimnasio_procesar_faltas(boolean)       from public, anon, authenticated;

grant execute on function gimnasio_materializar_fijos(uuid, date, boolean)  to service_role;
grant execute on function gimnasio_rachas()                        to service_role;
grant execute on function gimnasio_procesar_faltas(boolean)        to service_role;

-- ─── Cron cada 15 minutos (requiere pg_cron + pg_net habilitados) ─────────────
-- NOTA: NO registrar sin confirmación de Agus. Antes: deployar la función
-- (supabase functions deploy gimnasio-turnos-fijos --no-verify-jwt), setear CRON_SECRET y probar
-- con body {"dry_run": true}. El proceso de faltas además queda apagado hasta encender
-- gimnasio_config.faltas_activas desde la pestaña Configuración de /porteria/turnos. Después,
-- ejecutar manualmente en el SQL editor de Supabase (mismo patrón que
-- 20261003000002_aviso_inactividad_gimnasio.sql):
--
-- SELECT cron.schedule(
--   'gimnasio-turnos-fijos',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/gimnasio-turnos-fijos',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
