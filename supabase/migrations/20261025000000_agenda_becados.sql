-- Migration: 20261025000000_agenda_becados
--
-- agenda_socio: la categoría de socio 'Becado <deporte>' (Becado Rugby,
-- Becado Hockey, Becado Tenis) cuenta como el servicio de ese deporte.
-- Las becas se cargan como categoría y no como servicio, así que con
-- 20261024000000_agenda_exige_servicio los becados que juegan quedaban sin
-- ver su división (2026-10-19: 8 jugadores, p. ej. Becado Rugby en Mayores
-- y M15, Becado Hockey en Intermedia y Primera Damas).
--
-- Regla: la división d cuenta si el socio tiene un servicio activo cuyo
-- nombre contiene d.deporte, o si su categoría empieza con 'Becado' y
-- contiene d.deporte. Una beca de un deporte no habilita divisiones de otro.
--
-- Todo lo demás (firma, ventana con tope de 120 días, tiene_gimnasio, forma
-- de la respuesta y permisos) queda igual que en 20261024000000.

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
      AND (EXISTS (
        SELECT 1 FROM socio_servicios ss
        JOIN servicios_opcionales so ON so.id = ss.servicio_id
        WHERE ss.socio_id = v_socio_id
          AND so.activo
          AND so.nombre ILIKE '%' || d.deporte || '%'
      ) OR EXISTS (
        SELECT 1 FROM socios s
        JOIN categorias_socio cs ON cs.id = s.categoria_id
        WHERE s.id = v_socio_id
          AND cs.nombre ILIKE 'becado%'
          AND cs.nombre ILIKE '%' || d.deporte || '%'
      ))
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
