-- ─────────────────────────────────────────────────────────────────────────────
-- Eventos financieros: el Manager crea viajes y tercer tiempos de su división
-- ─────────────────────────────────────────────────────────────────────────────
-- Antes la Subcomisión creaba los tres tipos de evento (viaje, tercer_tiempo,
-- recaudacion). Ahora:
--   - Manager: crea y cierra viajes / tercer tiempos SÓLO de las divisiones a
--     las que tiene acceso (tiene_acceso_division). No puede crear ni convertir
--     un evento en recaudación, ni moverlo a una división ajena. Sin DELETE.
--   - Subcomisión: sólo crea recaudaciones (mismo filtro de disciplina que
--     antes). SELECT / UPDATE / DELETE de Subcomisión quedan iguales
--     (supervisión, cierre y borrado de cualquier tipo).
--   - Coordinador y admin: sin cambios.
-- Rol activo vía get_rol(), igual que el resto de las políticas RLS.

-- ─── Manager: INSERT ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "eventos_financieros_insert_manager" ON eventos_financieros;
CREATE POLICY "eventos_financieros_insert_manager"
  ON eventos_financieros FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND eventos_financieros.tipo IN ('viaje', 'tercer_tiempo')
    AND eventos_financieros.division_id IS NOT NULL
    AND (SELECT tiene_acceso_division(eventos_financieros.division_id))
    AND eventos_financieros.creado_por = (SELECT auth.uid())
  );

-- ─── Manager: UPDATE (cerrar) ───────────────────────────────────────────────
-- WITH CHECK repite las condiciones para que el UPDATE no pueda convertir el
-- evento en recaudación ni moverlo a una división a la que no tiene acceso.

DROP POLICY IF EXISTS "eventos_financieros_update_manager" ON eventos_financieros;
CREATE POLICY "eventos_financieros_update_manager"
  ON eventos_financieros FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'manager'
    AND eventos_financieros.tipo IN ('viaje', 'tercer_tiempo')
    AND eventos_financieros.division_id IS NOT NULL
    AND (SELECT tiene_acceso_division(eventos_financieros.division_id))
  )
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND eventos_financieros.tipo IN ('viaje', 'tercer_tiempo')
    AND eventos_financieros.division_id IS NOT NULL
    AND (SELECT tiene_acceso_division(eventos_financieros.division_id))
  );

-- ─── Subcomisión: INSERT sólo recaudación ───────────────────────────────────
-- Mismo filtro de disciplina que 20260914000000_subcomision_deporte.sql
-- (division_id NULL = recaudación global), más la restricción de tipo.

DROP POLICY IF EXISTS "eventos_financieros_insert_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_insert_subcomision"
  ON eventos_financieros FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND eventos_financieros.tipo = 'recaudacion'
    AND (
      eventos_financieros.division_id IS NULL
      OR (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)))
    )
  );
