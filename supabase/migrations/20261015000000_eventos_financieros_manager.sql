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

-- ─── Manager: UPDATE limitado a cerrar (trigger) ────────────────────────────
-- RLS no restringe columnas: con la policy de arriba un Manager podría renombrar,
-- cambiar el monto sugerido (descripcion), la fecha, el autor, el partido
-- vinculado, cambiar viaje <-> tercer tiempo o reabrir un evento cerrado.
-- Mismo diseño que guard_cuota_update / guard_socio_update
-- (20260731000001_lock_cuotas_socios_self_update.sql):
--   - Exentos: conexiones service_role (auth.uid() IS NULL, Edge Functions) y
--     cualquier rol que no sea manager (subcomisión, coordinador, admin siguen
--     igual que antes).
--   - Manager: el único cambio permitido es estado 'activo' -> 'cerrado'.
--     updated_at no se compara (lo mantiene el trigger set_updated_at).

CREATE OR REPLACE FUNCTION guard_evento_financiero_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF get_rol() IS DISTINCT FROM 'manager' THEN
    RETURN NEW;
  END IF;

  -- el Manager nunca puede tocar ninguna columna salvo estado
  IF (NEW.id, NEW.tipo, NEW.nombre, NEW.descripcion, NEW.fecha, NEW.division_id,
      NEW.evento_id, NEW.creado_por, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tipo, OLD.nombre, OLD.descripcion, OLD.fecha, OLD.division_id,
      OLD.evento_id, OLD.creado_por, OLD.created_at)
  THEN
    RAISE EXCEPTION 'No autorizado: el Manager sólo puede cerrar el evento, no modificarlo';
  END IF;

  -- único cambio de estado permitido: cerrar un evento activo
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (OLD.estado = 'activo' AND NEW.estado = 'cerrado')
  THEN
    RAISE EXCEPTION 'No autorizado: el Manager no puede cambiar el estado del evento a %', NEW.estado;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_eventos_financieros_update ON eventos_financieros;

CREATE TRIGGER guard_eventos_financieros_update
  BEFORE UPDATE ON eventos_financieros
  FOR EACH ROW EXECUTE FUNCTION guard_evento_financiero_update();

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
