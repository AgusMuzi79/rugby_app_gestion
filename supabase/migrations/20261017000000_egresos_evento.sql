-- ─────────────────────────────────────────────────────────────────────────────
-- Egresos de viajes y tercer tiempos
-- ─────────────────────────────────────────────────────────────────────────────
-- El Manager registra lo que gasta en cada viaje / tercer tiempo (micro, comida,
-- etc.). Tabla propia porque guard_evento_financiero_update (20261015000000)
-- no deja al Manager tocar eventos_financieros salvo para cerrarlo.
-- Depende de 20261016000000_eventos_financieros_multi_division.sql (helper
-- evento_financiero_toca_mis_divisiones).
--
--   - Manager: ve los egresos de los eventos que ve (RLS de eventos_financieros).
--     Carga y borra egresos sólo en viajes / tercer tiempos ACTIVOS que creó o
--     que incluyen alguna división suya. Cualquier manager del evento puede
--     borrar (varios managers comparten un viaje multi-división).
--   - Subcomisión: sólo lectura, con la misma visibilidad que tiene sobre el
--     evento (filtro de disciplina).
--   - Admin: CRUD total, igual que en eventos_financieros_divisiones.
--   - Sin UPDATE para nadie salvo admin: editar = borrar y volver a cargar.

-- ─── Tabla ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS egresos_evento (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_financiero_id uuid          NOT NULL REFERENCES eventos_financieros(id) ON DELETE CASCADE,
  concepto             text          NOT NULL CHECK (btrim(concepto) <> ''),
  monto                numeric(10,2) NOT NULL CHECK (monto > 0),
  fecha                date          NOT NULL DEFAULT current_date,
  registrado_por       uuid          DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS egresos_evento_evento_financiero_id_idx
  ON egresos_evento (evento_financiero_id);

ALTER TABLE egresos_evento ENABLE ROW LEVEL SECURITY;

-- ─── Helper ──────────────────────────────────────────────────────────────────
-- true si el Manager actual puede cargar / borrar egresos del evento:
-- viaje o tercer tiempo, activo, creado por él o con alguna división suya.
-- SECURITY DEFINER para leer el evento sin depender de la RLS de
-- eventos_financieros (las condiciones de acceso se repiten acá explícitas).

CREATE OR REPLACE FUNCTION egreso_evento_editable_por_manager(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM eventos_financieros ef
    WHERE ef.id = p_evento_id
      AND ef.tipo IN ('viaje', 'tercer_tiempo')
      AND ef.estado = 'activo'
      AND (
        ef.creado_por = auth.uid()
        OR evento_financiero_toca_mis_divisiones(ef.id)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION egreso_evento_editable_por_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION egreso_evento_editable_por_manager(uuid) TO authenticated;

-- ─── Policies ────────────────────────────────────────────────────────────────

-- SELECT: Manager y Subcomisión ven los egresos de los eventos que ven
-- (aplica la RLS de eventos_financieros sobre el evento padre).
DROP POLICY IF EXISTS "egresos_evento_select" ON egresos_evento;
CREATE POLICY "egresos_evento_select"
  ON egresos_evento FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) IN ('manager', 'subcomision')
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = egresos_evento.evento_financiero_id
    )
  );

DROP POLICY IF EXISTS "egresos_evento_insert_manager" ON egresos_evento;
CREATE POLICY "egresos_evento_insert_manager"
  ON egresos_evento FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND egresos_evento.registrado_por = (SELECT auth.uid())
    AND egreso_evento_editable_por_manager(egresos_evento.evento_financiero_id)
  );

DROP POLICY IF EXISTS "egresos_evento_delete_manager" ON egresos_evento;
CREATE POLICY "egresos_evento_delete_manager"
  ON egresos_evento FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'manager'
    AND egreso_evento_editable_por_manager(egresos_evento.evento_financiero_id)
  );

-- Admin: CRUD total.
DROP POLICY IF EXISTS "egresos_evento_all_admin" ON egresos_evento;
CREATE POLICY "egresos_evento_all_admin"
  ON egresos_evento FOR ALL TO authenticated
  USING ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');
