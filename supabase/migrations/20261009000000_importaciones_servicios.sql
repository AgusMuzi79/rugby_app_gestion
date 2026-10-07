-- Migration: 20261009000000_importaciones_servicios
--
-- Historial del importador del Padrón de Servicios de NUVIX (Edge Function
-- importar-servicios, panel de Secretaría). Mismo patrón que
-- importaciones_socios (20260821000001): una fila por archivo confirmado, con
-- el resumen de lo que realmente se aplicó sobre socio_servicios.
--
-- No hay tabla de detalle: el estado resultante vive en socio_servicios
-- (variante_nuvix + importe), y el detalle de cada corrida se ve en la vista
-- previa antes de confirmar.

CREATE TABLE importaciones_servicios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre text,
  agregados      int         NOT NULL DEFAULT 0,
  actualizados   int         NOT NULL DEFAULT 0,
  eliminados     int         NOT NULL DEFAULT 0,
  -- bajas que Secretaría destildó en la vista previa y no se borraron
  omitidos       int         NOT NULL DEFAULT 0,
  sin_cambio     int         NOT NULL DEFAULT 0,
  errores        int         NOT NULL DEFAULT 0,
  importado_por  uuid        REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON importaciones_servicios (created_at DESC);

ALTER TABLE importaciones_servicios ENABLE ROW LEVEL SECURITY;

-- La Edge Function escribe con service_role; estas políticas son para que el
-- panel lea el historial (y por simetría con importaciones_socios).
CREATE POLICY "secretaria_admin_select_importaciones_servicios" ON importaciones_servicios
  FOR SELECT TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'));

CREATE POLICY "secretaria_admin_insert_importaciones_servicios" ON importaciones_servicios
  FOR INSERT TO authenticated
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));
