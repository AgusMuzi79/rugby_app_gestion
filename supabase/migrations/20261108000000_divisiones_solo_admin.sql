-- Migration: 20261108000000_divisiones_solo_admin
--
-- Crear y editar divisiones pasa a ser sólo del admin (decisión del club,
-- 2026-10-26). Subcomisión sigue viendo la lista (divisiones_select no cambia).
--
-- 1. Se borran las policies de INSERT y UPDATE de subcomisión
--    (20260914000000_subcomision_deporte.sql). El admin ya tiene las suyas,
--    divisiones_insert_admin y divisiones_update_admin
--    (20260506000003_add_admin_role.sql), que no se tocan. divisiones_delete
--    queda como está (fuera de alcance).
--
-- 2. Una sola división activa que recibe adultos por deporte y rama.
--    _destino_division_por_servicio (20261014000000) no asigna ninguna si hay
--    más de una ('adultos_ambiguo'). Si ya hay duplicadas, la migración falla
--    con la lista de (deporte, rama) en conflicto y NO toca datos: hay que
--    resolverlas a mano (desmarcar recibe_adultos o desactivar una) y volver a
--    correrla.
--
-- Idempotente.

DROP POLICY IF EXISTS "divisiones_insert" ON divisiones;
DROP POLICY IF EXISTS "divisiones_update" ON divisiones;

DO $$
DECLARE
  v_conflictos text;
BEGIN
  SELECT string_agg(format('%s/%s (%s)', deporte, coalesce(rama, 'sin rama'), nombres), '; ')
    INTO v_conflictos
  FROM (
    SELECT deporte, rama, string_agg(nombre, ', ' ORDER BY nombre) AS nombres
    FROM divisiones
    WHERE activa AND recibe_adultos AND rama IS NOT NULL
    GROUP BY deporte, rama
    HAVING count(*) > 1
  ) d;

  IF v_conflictos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay más de una división activa que recibe adultos para el mismo deporte y rama: %. Resolverlo a mano antes de aplicar esta migración.', v_conflictos;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS divisiones_recibe_adultos_unico
  ON divisiones (deporte, rama)
  WHERE activa AND recibe_adultos;
