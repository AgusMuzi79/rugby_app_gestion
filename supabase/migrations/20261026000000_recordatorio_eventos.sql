-- Migration: 20261026000000_recordatorio_eventos
--
-- Recordatorio por push ~30 minutos antes de cada entrenamiento y actividad
-- (pedido 2026-10-19). Los partidos quedan afuera: la hora de llegada varía.
-- Lo manda la Edge Function recordatorio-eventos, disparada por pg_cron cada
-- 5 minutos; esta migración pone la parte de la base:
--
-- 1. eventos.recordatorio_enviado_at: cuándo se reclamó el recordatorio. Un
--    evento se avisa una sola vez; si el coordinador cambia la fecha o la hora,
--    el trigger lo vuelve a NULL y el recordatorio se rearma para el horario
--    nuevo.
--
-- 2. socio_habilitado_deporte(socio, deporte): la regla de la Agenda
--    (20261024000000 + 20261025000000) sacada a una función para que la usen
--    agenda_socio() y el recordatorio sin duplicarla: servicio activo cuyo
--    nombre contiene el deporte, o categoría 'Becado <deporte>'. Es interna
--    (SECURITY DEFINER, sin EXECUTE para PUBLIC/anon/authenticated): sólo la
--    llaman otras funciones SECURITY DEFINER. agenda_socio() se reescribe para
--    usarla con el mismo comportamiento (firma, ventana, respuesta y permisos
--    iguales a 20261025000000).
--
-- 3. reclamar_recordatorios_eventos(p_ahora, p_minutos): marca de forma
--    atómica los eventos que arrancan en (p_ahora, p_ahora + p_minutos] (fecha
--    + hora son hora local de Argentina) y los devuelve con sus destinatarios.
--    Es un único UPDATE ... RETURNING: si dos corridas se pisan, la segunda
--    espera el lock de la fila, revalida `recordatorio_enviado_at IS NULL` y la
--    saltea, así que nadie recibe el aviso dos veces. Destinatarios:
--      - socio_ids: jugadores activos de la división que pasan la regla de la
--        Agenda (la función resuelve sus profiles y tutores);
--      - entrenador_profile_ids: profiles activos con 'entrenador' en roles[] y
--        la división en divisiones[] (divisiones NULL no cuenta: sin divisiones,
--        como tiene_acceso_division desde 20260911000002).
--    La función agrupa los eventos de la misma sesión (misma fecha, hora, tipo,
--    título y lugar en varias divisiones) y manda un solo push por persona.
--    Sólo la ejecuta service_role.
--
-- Si el envío falla después del reclamo, ese recordatorio se pierde: mejor que
-- avisar dos veces.

ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS recordatorio_enviado_at timestamptz;

COMMENT ON COLUMN public.eventos.recordatorio_enviado_at IS
  'Cuándo se reclamó el push de recordatorio (reclamar_recordatorios_eventos). Vuelve a NULL si cambian fecha u hora.';

-- ─── Rearmado al cambiar fecha u hora ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.eventos_rearmar_recordatorio()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fecha IS DISTINCT FROM OLD.fecha OR NEW.hora IS DISTINCT FROM OLD.hora THEN
    NEW.recordatorio_enviado_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eventos_rearmar_recordatorio ON public.eventos;
CREATE TRIGGER eventos_rearmar_recordatorio
  BEFORE UPDATE ON public.eventos
  FOR EACH ROW EXECUTE FUNCTION public.eventos_rearmar_recordatorio();

-- ─── Regla de la Agenda: ¿el socio juega ese deporte? ────────────────────────

CREATE OR REPLACE FUNCTION public.socio_habilitado_deporte(p_socio_id uuid, p_deporte text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM socio_servicios ss
    JOIN servicios_opcionales so ON so.id = ss.servicio_id
    WHERE ss.socio_id = p_socio_id
      AND so.activo
      AND so.nombre ILIKE '%' || p_deporte || '%'
  ) OR EXISTS (
    SELECT 1 FROM socios s
    JOIN categorias_socio cs ON cs.id = s.categoria_id
    WHERE s.id = p_socio_id
      AND cs.nombre ILIKE 'becado%'
      AND cs.nombre ILIKE '%' || p_deporte || '%'
  )
$$;

REVOKE ALL ON FUNCTION public.socio_habilitado_deporte(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.socio_habilitado_deporte(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.socio_habilitado_deporte(uuid, text) FROM authenticated;

-- ─── agenda_socio con el helper (mismo comportamiento que 20261025000000) ────

CREATE OR REPLACE FUNCTION public.agenda_socio(
  p_desde date DEFAULT current_date,
  p_hasta date DEFAULT current_date + 60
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_socio_id   uuid := get_socio_id();
  v_desde      date := coalesce(p_desde, current_date);
  v_hasta      date := least(coalesce(p_hasta, current_date + 60), coalesce(p_desde, current_date) + 120);
  v_gimnasio   boolean;
  v_divisiones jsonb;
  v_eventos    jsonb;
BEGIN
  IF v_socio_id IS NULL THEN
    RETURN jsonb_build_object('tiene_gimnasio', false, 'divisiones', '[]'::jsonb, 'eventos', '[]'::jsonb);
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM socios s
      JOIN categorias_socio cs ON cs.id = s.categoria_id
      WHERE s.id = v_socio_id AND cs.nombre = 'Cliente Gimnasio'
    )
    OR EXISTS (
      SELECT 1 FROM socio_servicios ss
      JOIN servicios_opcionales so ON so.id = ss.servicio_id
      WHERE ss.socio_id = v_socio_id AND so.activo AND so.nombre ILIKE '%gimnasio%'
    )
  INTO v_gimnasio;

  WITH mis_divisiones AS (
    SELECT DISTINCT d.id, d.nombre, d.deporte
    FROM jugadores j
    JOIN divisiones d ON d.id = j.division_id
    WHERE j.socio_id = v_socio_id AND j.activo AND d.activa
      AND socio_habilitado_deporte(v_socio_id, d.deporte)
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'deporte', deporte) ORDER BY nombre)
              FROM mis_divisiones), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', e.id, 'tipo', e.tipo, 'titulo', e.titulo, 'fecha', e.fecha, 'hora', e.hora,
                'lugar', e.lugar, 'rival', e.rival, 'modalidad', e.modalidad, 'division_id', e.division_id)
                ORDER BY e.fecha, e.hora NULLS LAST, e.id)
              FROM eventos e
              WHERE e.division_id IN (SELECT id FROM mis_divisiones)
                AND NOT e.cancelado
                AND e.fecha BETWEEN v_desde AND v_hasta), '[]'::jsonb)
  INTO v_divisiones, v_eventos;

  RETURN jsonb_build_object('tiene_gimnasio', v_gimnasio, 'divisiones', v_divisiones, 'eventos', v_eventos);
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_socio(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_socio(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.agenda_socio(date, date) TO authenticated;

-- ─── Reclamo atómico de los recordatorios que vencen ─────────────────────────

CREATE OR REPLACE FUNCTION public.reclamar_recordatorios_eventos(
  p_ahora   timestamptz DEFAULT now(),
  p_minutos int DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reclamados AS (
    UPDATE eventos e
       SET recordatorio_enviado_at = p_ahora
      FROM divisiones d
     WHERE d.id = e.division_id
       AND d.activa
       AND e.tipo IN ('entrenamiento', 'actividad')
       AND NOT e.cancelado
       AND e.hora IS NOT NULL
       AND e.recordatorio_enviado_at IS NULL
       AND (e.fecha + e.hora) AT TIME ZONE 'America/Argentina/Buenos_Aires' > p_ahora
       AND (e.fecha + e.hora) AT TIME ZONE 'America/Argentina/Buenos_Aires'
             <= p_ahora + make_interval(mins => coalesce(p_minutos, 30))
    RETURNING e.id, e.tipo, e.titulo, e.fecha, e.hora, e.lugar, e.division_id,
              d.nombre AS division_nombre, d.deporte
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'evento_id',       r.id,
           'tipo',            r.tipo,
           'titulo',          r.titulo,
           'fecha',           r.fecha,
           'hora',            r.hora,
           'lugar',           r.lugar,
           'division_id',     r.division_id,
           'division_nombre', r.division_nombre,
           'socio_ids', coalesce((
             SELECT jsonb_agg(DISTINCT j.socio_id ORDER BY j.socio_id)
             FROM jugadores j
             WHERE j.division_id = r.division_id
               AND j.activo
               AND j.socio_id IS NOT NULL
               AND socio_habilitado_deporte(j.socio_id, r.deporte)
           ), '[]'::jsonb),
           'entrenador_profile_ids', coalesce((
             SELECT jsonb_agg(p.id ORDER BY p.id)
             FROM profiles p
             WHERE p.activo
               AND 'entrenador' = ANY (p.roles)
               AND r.division_id = ANY (p.divisiones)
           ), '[]'::jsonb)
         ) ORDER BY r.fecha, r.hora, r.division_nombre, r.id), '[]'::jsonb)
  FROM reclamados r
$$;

REVOKE ALL ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) FROM anon;
REVOKE ALL ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) TO service_role;

-- ─── Cron (se registra a mano en el SQL Editor, después del deploy) ──────────
-- Requiere pg_cron + pg_net (ya habilitados por recordatorio-deuda). Cada 5
-- minutos: con la ventana de 30 minutos, cada evento se avisa entre 25 y 30
-- minutos antes de empezar.
--
-- SELECT cron.schedule(
--   'recordatorio-eventos',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/recordatorio-eventos',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
--
-- Para darlo de baja: SELECT cron.unschedule('recordatorio-eventos');
