-- ─────────────────────────────────────────────────────────────────────────────
-- Cobranzas del Manager: sólo con el evento activo
-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría UX manager-subcomisión (2026-10-26), T16. Las policies del Manager
-- (20261016000000) chequeaban rol, división del jugador y que el jugador fuera
-- del evento, pero no el estado del evento: por API (o si la app dejaba de
-- filtrar) un manager podía cargar o pisar cobranzas de un evento CERRADO. La
-- de Subcomisión ya lo exige (cobranza_permitida_subcomision, p_escritura).
--
-- Decisión de Agus (2026-10-26): el Manager SÍ cobra en las recaudaciones de la
-- Subcomisión además de sus viajes / tercer tiempos, así que no se restringe
-- por tipo. Que "GUARDAR TODOS" no pise lo que cargó la Subcomisión lo resuelve
-- la app (sólo guarda las filas que cambió, T1).
--
-- Las condiciones previas no cambian; se agrega el evento activo al INSERT
-- (WITH CHECK) y al UPDATE (USING para la fila vieja y WITH CHECK para la
-- nueva: tampoco se puede mover una cobranza a un evento cerrado).
-- Idempotente (DROP POLICY IF EXISTS + CREATE).

DROP POLICY IF EXISTS "cobranzas_insert_manager" ON cobranzas;
CREATE POLICY "cobranzas_insert_manager"
  ON cobranzas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND registrado_por = (SELECT auth.uid())
    AND (SELECT tiene_acceso_division(
      (SELECT division_id FROM jugadores WHERE id = cobranzas.jugador_id)
    ))
    AND jugador_en_evento_financiero(cobranzas.evento_financiero_id, cobranzas.jugador_id)
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = cobranzas.evento_financiero_id
        AND ef.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS "cobranzas_update_manager" ON cobranzas;
CREATE POLICY "cobranzas_update_manager"
  ON cobranzas FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'manager'
    AND (SELECT tiene_acceso_division(
      (SELECT division_id FROM jugadores WHERE id = cobranzas.jugador_id)
    ))
    AND jugador_en_evento_financiero(cobranzas.evento_financiero_id, cobranzas.jugador_id)
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = cobranzas.evento_financiero_id
        AND ef.estado = 'activo'
    )
  )
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND (SELECT tiene_acceso_division(
      (SELECT division_id FROM jugadores WHERE id = cobranzas.jugador_id)
    ))
    AND jugador_en_evento_financiero(cobranzas.evento_financiero_id, cobranzas.jugador_id)
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = cobranzas.evento_financiero_id
        AND ef.estado = 'activo'
    )
  );
