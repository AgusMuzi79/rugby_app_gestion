-- ─────────────────────────────────────────────────────────────────────────────
-- Egresos: resumen del evento completo y lectura de Subcomisión
-- ─────────────────────────────────────────────────────────────────────────────
-- Depende de 20261017000000_egresos_evento.sql.
--
--   - resumen_egresos_evento(p_evento_id): total cobrado (cobranzas pagadas de
--     TODAS las divisiones del evento) y total de egresos. SECURITY DEFINER para
--     sumar cobranzas que la RLS no le muestra al Manager (sólo ve las de sus
--     jugadores) sin ampliar esa RLS: devuelve sólo los totales, nunca filas.
--     Antes de sumar valida que quien llama pueda ver el evento:
--       * admin y subcomisión: cualquier evento;
--       * manager: los que creó, los globales y los que incluyen una división
--         suya (mismo criterio que eventos_financieros_select_division);
--       * cualquier otro rol o evento inexistente: sin filas.
--   - Subcomisión lee los egresos de todos los eventos (cualquier disciplina),
--     sólo lectura. El Manager mantiene la visibilidad por evento.

-- ─── egresos_evento: SELECT ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "egresos_evento_select" ON egresos_evento;
CREATE POLICY "egresos_evento_select"
  ON egresos_evento FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    OR (
      (SELECT get_rol()) = 'manager'
      AND EXISTS (
        SELECT 1 FROM eventos_financieros ef
        WHERE ef.id = egresos_evento.evento_financiero_id
      )
    )
  );

-- ─── Resumen del evento ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resumen_egresos_evento(p_evento_id uuid)
RETURNS TABLE (total_cobrado numeric, total_egresos numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text := get_rol();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM eventos_financieros ef
    WHERE ef.id = p_evento_id
      AND (
        v_rol IN ('admin', 'subcomision')
        OR (
          v_rol = 'manager'
          AND (
            ef.creado_por = auth.uid()
            OR evento_financiero_es_global(ef.id)
            OR evento_financiero_toca_mis_divisiones(ef.id)
          )
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    coalesce((SELECT sum(c.monto) FROM cobranzas c
              WHERE c.evento_financiero_id = p_evento_id AND c.estado = 'pagado'), 0)::numeric,
    coalesce((SELECT sum(e.monto) FROM egresos_evento e
              WHERE e.evento_financiero_id = p_evento_id), 0)::numeric;
END;
$$;

REVOKE EXECUTE ON FUNCTION resumen_egresos_evento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_egresos_evento(uuid) TO authenticated;
