-- Migration: 20261106000000_recordatorio_colaborador
--
-- El colaborador (rol nuevo de 20261105000000, sólo toma asistencia en sus
-- divisiones) también recibe el recordatorio de 30 minutos antes de cada
-- entrenamiento y actividad, igual que un entrenador de la división
-- (decisión 2026-10-30). Nada más cambia: no recibe noticias de "cuerpo
-- técnico" ni pushes manuales al staff.
--
-- reclamar_recordatorios_eventos se reescribe copiada de 20261026000000 con un
-- único cambio: el staff destinatario pasa de "'entrenador' en roles[]" a
-- "'entrenador' o 'colaborador' en roles[]". La clave del JSON sigue siendo
-- entrenador_profile_ids (la lee la Edge Function recordatorio-eventos ya
-- deployada; renombrarla la rompería): ahora incluye a los colaboradores.
-- Un profile con los dos roles aparece una sola vez, y la función ya manda un
-- solo push por persona y por sesión, aunque además sea jugador o tutor.
--
-- Firma, ventana, respuesta y permisos iguales a 20261026000000. Idempotente.

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
           -- Entrenadores y colaboradores activos con la división asignada
           -- (la clave conserva el nombre histórico).
           'entrenador_profile_ids', coalesce((
             SELECT jsonb_agg(p.id ORDER BY p.id)
             FROM profiles p
             WHERE p.activo
               AND p.roles && ARRAY['entrenador', 'colaborador']::text[]
               AND r.division_id = ANY (p.divisiones)
           ), '[]'::jsonb)
         ) ORDER BY r.fecha, r.hora, r.division_nombre, r.id), '[]'::jsonb)
  FROM reclamados r
$$;

REVOKE ALL ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) FROM anon;
REVOKE ALL ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_recordatorios_eventos(timestamptz, int) TO service_role;
