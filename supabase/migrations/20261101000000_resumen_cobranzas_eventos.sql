-- ─────────────────────────────────────────────────────────────────────────────
-- resumen_cobranzas_eventos: una sola fuente para "% cobrado" y pendientes
-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría UX manager-subcomisión (2026-10-26), T3. Inicio de Subcomisión,
-- Eventos, Informes e Inicio del Manager dividían por las filas de `cobranzas`:
-- en una recaudación de Subcomisión sólo existen las de quienes pagaron (3 de
-- 80 = "100 %") y los pendientes se graban con monto null. Este RPC devuelve,
-- por evento, el denominador real (jugadores del evento) y lo pagado.
-- Depende de 20261016000000 (helpers de divisiones del evento) y
-- 20261019000000 (evento_financiero_visible_subcomision).
--
-- Por evento pedido (p_ids) y visible para quien llama:
--   jugadores = jugadores ACTIVOS del evento (de sus divisiones; si es global,
--               de todo el club — mismo criterio que jugador_en_evento_financiero)
--               que además ve el rol:
--                 * admin: todos;
--                 * subcomisión: los de su disciplina (tiene_acceso_deporte,
--                   igual que cobranza_permitida_subcomision / CobrosPanel);
--                 * manager: los de SUS divisiones (igual que la pestaña
--                   Cobranzas: le cobra sólo a sus jugadores);
--   pagados / cobrado = cobranzas 'pagado' de esos jugadores (una fila
--               pendiente, con o sin monto, no cuenta).
-- Visibilidad del evento: la misma que resumen_egresos_evento (admin todos;
-- subcomisión sus recaudaciones visibles; manager los que creó, los globales y
-- los que incluyen una división suya). Cualquier otro rol, o un evento que no
-- ve, no devuelve fila. SECURITY DEFINER para contar sin depender de la RLS de
-- jugadores / cobranzas; devuelve sólo totales, nunca filas.

CREATE OR REPLACE FUNCTION resumen_cobranzas_eventos(p_ids uuid[])
RETURNS TABLE (evento_id uuid, jugadores integer, pagados integer, cobrado numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_rol  text := get_rol();
  v_uid  uuid := auth.uid();
  v_divs uuid[] := '{}';
BEGIN
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'subcomision', 'manager') THEN
    RETURN;
  END IF;

  IF v_rol = 'manager' THEN
    SELECT coalesce(p.divisiones, '{}') INTO v_divs FROM profiles p WHERE p.id = v_uid;
    v_divs := coalesce(v_divs, '{}');
  END IF;

  RETURN QUERY
  WITH ev AS (
    SELECT ef.id AS ev_id, evento_financiero_es_global(ef.id) AS es_global
    FROM eventos_financieros ef
    WHERE ef.id = ANY (coalesce(p_ids, '{}'::uuid[]))
      AND (
        v_rol = 'admin'
        OR (v_rol = 'subcomision' AND evento_financiero_visible_subcomision(ef.id))
        OR (
          v_rol = 'manager'
          AND (
            ef.creado_por = v_uid
            OR evento_financiero_es_global(ef.id)
            OR evento_financiero_toca_mis_divisiones(ef.id)
          )
        )
      )
  ),
  jug AS (
    SELECT ev.ev_id, j.id AS jug_id
    FROM ev
    JOIN jugadores j ON j.activo
    JOIN divisiones d ON d.id = j.division_id
    WHERE (
        ev.es_global
        OR EXISTS (
          SELECT 1 FROM eventos_financieros_divisiones efd
          WHERE efd.evento_financiero_id = ev.ev_id
            AND efd.division_id = j.division_id
        )
      )
      AND (
        v_rol = 'admin'
        OR (v_rol = 'manager' AND j.division_id = ANY (v_divs))
        OR (v_rol = 'subcomision' AND coalesce(tiene_acceso_deporte(d.deporte), false))
      )
  )
  SELECT
    ev.ev_id,
    count(jug.jug_id)::integer,
    count(c.id)::integer,
    coalesce(sum(c.monto), 0)::numeric
  FROM ev
  LEFT JOIN jug ON jug.ev_id = ev.ev_id
  LEFT JOIN cobranzas c
    ON c.evento_financiero_id = ev.ev_id
   AND c.jugador_id = jug.jug_id
   AND c.estado = 'pagado'
  GROUP BY ev.ev_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION resumen_cobranzas_eventos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_cobranzas_eventos(uuid[]) TO authenticated;
