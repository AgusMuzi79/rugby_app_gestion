-- Permite al entrenador crear eventos de tipo 'entrenamiento' en su división.
-- Necesario para el flujo de asistencia: guardar asistencia auto-crea el evento del día.
CREATE POLICY "eventos_insert_entrenador" ON eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'entrenador'
    AND tipo = 'entrenamiento'
    AND (SELECT tiene_acceso_division(division_id))
  );
