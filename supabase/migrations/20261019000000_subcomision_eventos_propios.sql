-- ─────────────────────────────────────────────────────────────────────────────
-- Subcomisión: sólo sus recaudaciones, con cobros y egresos
-- ─────────────────────────────────────────────────────────────────────────────
-- Decisión de Agus (2026-10-10): la Subcomisión ya no ve los partidos ni los
-- eventos de los managers (viajes / tercer tiempos). Ve sólo las recaudaciones
-- de SU disciplina (p. ej. "venta de pizzas" para las divisiones que elige),
-- registra quién paga (cobranzas de los jugadores de esas divisiones) y sus
-- egresos. Una subco de rugby no ve nada de hockey.
-- Depende de 20261016000000 (helpers de divisiones del evento), 20261017000000
-- y 20261018000000 (egresos_evento y resumen_egresos_evento).
--
-- Disciplina de la subco = profiles.deporte vía tiene_acceso_deporte()
-- (20260914000000_subcomision_deporte.sql): NULL = subco general (todo el club).
--
--   - eventos_financieros: SELECT / UPDATE / DELETE de la subco sólo sobre
--     recaudaciones visibles para ella (evento_financiero_visible_subcomision).
--     INSERT sin cambios (sólo recaudación, 20261015000000).
--   - cobranzas: la subco lee / registra / edita / borra cobranzas de sus
--     recaudaciones visibles, sólo de jugadores del evento y de su disciplina;
--     escrituras sólo con el evento activo; registrado_por = quien registra.
--   - egresos_evento: la subco lee los de sus recaudaciones visibles y carga /
--     borra con el evento activo (revierte la lectura total de 20261018000000).
--   - resumen_egresos_evento: la subco sólo obtiene resúmenes de sus eventos.
--   - Managers, coordinadores y admin: sin cambios.

-- ─── Helpers (SECURITY DEFINER: leen sin RLS, evitan recursión entre policies) ─

-- true si el evento es una recaudación visible para la subco actual:
--   * la creó ella, o
--   * alguna de sus divisiones es de su disciplina, o
--   * es global (sin divisiones) y quien la creó es de su disciplina
--     (profiles.deporte; un creador sin disciplina sólo lo ve una subco general).
CREATE OR REPLACE FUNCTION evento_financiero_visible_subcomision(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM eventos_financieros ef
    WHERE ef.id = p_evento_id
      AND ef.tipo = 'recaudacion'
      AND (
        ef.creado_por = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM eventos_financieros_divisiones efd
          JOIN divisiones d ON d.id = efd.division_id
          WHERE efd.evento_financiero_id = ef.id
            AND coalesce(tiene_acceso_deporte(d.deporte), false)
        )
        OR (
          ef.division_id IS NOT NULL
          AND coalesce(tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = ef.division_id)), false)
        )
        OR (
          evento_financiero_es_global(ef.id)
          AND coalesce(tiene_acceso_deporte((SELECT p.deporte FROM profiles p WHERE p.id = ef.creado_por)), false)
        )
      )
  )
$$;

-- true si la subco actual puede ver (p_escritura = false) o escribir
-- (p_escritura = true: además, evento activo) la cobranza de ese jugador en ese
-- evento: recaudación visible, jugador del evento y de su disciplina.
CREATE OR REPLACE FUNCTION cobranza_permitida_subcomision(
  p_evento_id  uuid,
  p_jugador_id uuid,
  p_escritura  boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT evento_financiero_visible_subcomision(p_evento_id)
     AND (NOT p_escritura OR EXISTS (
           SELECT 1 FROM eventos_financieros ef
           WHERE ef.id = p_evento_id AND ef.estado = 'activo'))
     AND jugador_en_evento_financiero(p_evento_id, p_jugador_id)
     AND coalesce(tiene_acceso_deporte((
           SELECT d.deporte FROM jugadores j JOIN divisiones d ON d.id = j.division_id
           WHERE j.id = p_jugador_id)), false)
$$;

REVOKE EXECUTE ON FUNCTION evento_financiero_visible_subcomision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION evento_financiero_visible_subcomision(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION cobranza_permitida_subcomision(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cobranza_permitida_subcomision(uuid, uuid, boolean) TO authenticated;

-- ─── eventos_financieros: Subcomisión ────────────────────────────────────────

DROP POLICY IF EXISTS "eventos_financieros_select_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_select_subcomision"
  ON eventos_financieros FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND evento_financiero_visible_subcomision(eventos_financieros.id)
  );

-- WITH CHECK con columnas (la fila nueva todavía no está en la tabla): sigue
-- siendo recaudación de su disciplina.
DROP POLICY IF EXISTS "eventos_financieros_update_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_update_subcomision"
  ON eventos_financieros FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND evento_financiero_visible_subcomision(eventos_financieros.id)
  )
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND eventos_financieros.tipo = 'recaudacion'
    AND (
      eventos_financieros.division_id IS NULL
      OR (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)))
    )
  );

DROP POLICY IF EXISTS "eventos_financieros_delete_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_delete_subcomision"
  ON eventos_financieros FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND evento_financiero_visible_subcomision(eventos_financieros.id)
  );

-- ─── cobranzas: Subcomisión ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "cobranzas_select_subcomision" ON cobranzas;
CREATE POLICY "cobranzas_select_subcomision"
  ON cobranzas FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND cobranza_permitida_subcomision(cobranzas.evento_financiero_id, cobranzas.jugador_id, false)
  );

DROP POLICY IF EXISTS "cobranzas_insert_subcomision" ON cobranzas;
CREATE POLICY "cobranzas_insert_subcomision"
  ON cobranzas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND cobranzas.registrado_por = (SELECT auth.uid())
    AND cobranza_permitida_subcomision(cobranzas.evento_financiero_id, cobranzas.jugador_id, true)
  );

-- Sin WITH CHECK explícito: Postgres reusa el USING para la fila nueva (no se
-- puede mover la cobranza a otro evento ni a un jugador fuera del evento).
DROP POLICY IF EXISTS "cobranzas_update_subcomision" ON cobranzas;
CREATE POLICY "cobranzas_update_subcomision"
  ON cobranzas FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND cobranza_permitida_subcomision(cobranzas.evento_financiero_id, cobranzas.jugador_id, true)
  );

DROP POLICY IF EXISTS "cobranzas_delete_subcomision" ON cobranzas;
CREATE POLICY "cobranzas_delete_subcomision"
  ON cobranzas FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND cobranza_permitida_subcomision(cobranzas.evento_financiero_id, cobranzas.jugador_id, true)
  );

-- ─── egresos_evento: Subcomisión ─────────────────────────────────────────────

DROP POLICY IF EXISTS "egresos_evento_select" ON egresos_evento;
CREATE POLICY "egresos_evento_select"
  ON egresos_evento FOR SELECT TO authenticated
  USING (
    (
      (SELECT get_rol()) = 'subcomision'
      AND evento_financiero_visible_subcomision(egresos_evento.evento_financiero_id)
    )
    OR (
      (SELECT get_rol()) = 'manager'
      AND EXISTS (
        SELECT 1 FROM eventos_financieros ef
        WHERE ef.id = egresos_evento.evento_financiero_id
      )
    )
  );

-- true si la subco actual puede cargar / borrar egresos del evento:
-- recaudación visible para ella y activa.
CREATE OR REPLACE FUNCTION egreso_evento_editable_por_subcomision(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT evento_financiero_visible_subcomision(p_evento_id)
     AND EXISTS (
       SELECT 1 FROM eventos_financieros ef
       WHERE ef.id = p_evento_id AND ef.estado = 'activo'
     )
$$;

REVOKE EXECUTE ON FUNCTION egreso_evento_editable_por_subcomision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION egreso_evento_editable_por_subcomision(uuid) TO authenticated;

DROP POLICY IF EXISTS "egresos_evento_insert_subcomision" ON egresos_evento;
CREATE POLICY "egresos_evento_insert_subcomision"
  ON egresos_evento FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND egresos_evento.registrado_por = (SELECT auth.uid())
    AND egreso_evento_editable_por_subcomision(egresos_evento.evento_financiero_id)
  );

DROP POLICY IF EXISTS "egresos_evento_delete_subcomision" ON egresos_evento;
CREATE POLICY "egresos_evento_delete_subcomision"
  ON egresos_evento FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND egreso_evento_editable_por_subcomision(egresos_evento.evento_financiero_id)
  );

-- ─── resumen_egresos_evento: subco sólo sus eventos ──────────────────────────
-- Para la subco, total_cobrado suma sólo cobranzas de jugadores de su
-- disciplina (en una recaudación global de rugby no cuenta hockey).

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
        v_rol = 'admin'
        OR (v_rol = 'subcomision' AND evento_financiero_visible_subcomision(ef.id))
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
              WHERE c.evento_financiero_id = p_evento_id
                AND c.estado = 'pagado'
                AND (v_rol IS DISTINCT FROM 'subcomision'
                     OR cobranza_permitida_subcomision(c.evento_financiero_id, c.jugador_id, false))), 0)::numeric,
    coalesce((SELECT sum(e.monto) FROM egresos_evento e
              WHERE e.evento_financiero_id = p_evento_id), 0)::numeric;
END;
$$;

REVOKE EXECUTE ON FUNCTION resumen_egresos_evento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_egresos_evento(uuid) TO authenticated;
