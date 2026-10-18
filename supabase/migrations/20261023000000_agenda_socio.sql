-- Migration: 20261023000000_agenda_socio
--
-- Pestaña "Agenda" del socio (reemplaza a "Gimnasio"): muestra los
-- entrenamientos, partidos y actividades de las divisiones donde juega y, si
-- tiene el servicio, el turnero del gimnasio. Socios sin gimnasio ni división
-- no ven la pestaña.
--
-- agenda_socio(p_desde, p_hasta) devuelve, para el socio logueado
-- (get_socio_id()):
--   { tiene_gimnasio: bool,
--     divisiones: [{ id, nombre, deporte }],
--     eventos:    [{ id, tipo, titulo, fecha, hora, lugar, rival, modalidad, division_id }] }
--
-- Por qué un RPC SECURITY DEFINER y no una policy nueva: los socios no pueden
-- leer `jugadores` (datos de otros menores) y no queremos ampliar esa RLS.
-- La función sólo mira las filas de jugadores del propio socio
-- (jugadores.socio_id = get_socio_id()) y devuelve únicamente columnas de
-- calendario de esas divisiones.
--
--   • Divisiones: las de jugadores activos del socio, en divisiones activas.
--   • Eventos: no cancelados, de esas divisiones, con fecha en la ventana. La
--     ventana se recorta a 120 días para acotar la carga.
--   • tiene_gimnasio: misma regla que las Edge Functions socios-qr y
--     gimnasio-turnos — categoría 'Cliente Gimnasio' o un servicio activo cuyo
--     nombre contenga "gimnasio". Si cambia allá, cambiar acá.
--   • Sin fila en socios (staff, sin sesión): agenda vacía, nunca error.

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
