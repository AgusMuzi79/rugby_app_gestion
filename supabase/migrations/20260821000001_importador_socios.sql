-- Migration: 20260821000001_importador_socios
--
-- Base para el importador mensual de socios (openspec/changes/importador-mensual-socios/).
-- Mismo patrón que importaciones_deuda (20260804000000): una fila por archivo
-- importado, con el resumen del diff aplicado.
--
-- No hay tabla de detalle (equivalente a comprobantes_deuda) porque acá el
-- detalle vive directo en `socios` (numero_socio, estado, categoria_id, etc.)
-- — no hace falta duplicarlo, `ultima_importacion_id` alcanza para trazar
-- "por qué está así este socio" sin guardar el archivo entero de nuevo.

CREATE TABLE importaciones_socios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre text,
  altas          int         NOT NULL DEFAULT 0,
  bajas          int         NOT NULL DEFAULT 0,
  actualizados   int         NOT NULL DEFAULT 0,
  sin_cambio     int         NOT NULL DEFAULT 0,
  errores        int         NOT NULL DEFAULT 0,
  importado_por  uuid        REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE importaciones_socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_admin_all_importaciones_socios" ON importaciones_socios
  FOR ALL TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'))
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));

ALTER TABLE socios
  ADD COLUMN ultima_importacion_id uuid REFERENCES importaciones_socios(id);

-- Excepciones permanentes al diff de altas/bajas del importador — hoy sólo la
-- cuenta demo de revisores de Apple/Google (design.md §4): nunca va a
-- aparecer en ningún padrón real de NUVIX, así que sin este flag el
-- importador la marcaría de baja todos los meses.
ALTER TABLE socios
  ADD COLUMN excluir_de_import boolean NOT NULL DEFAULT false;

UPDATE socios SET excluir_de_import = true WHERE numero_socio = '0012';
