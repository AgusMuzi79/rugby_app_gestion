-- Migration: reconciliacion_servicios_socios
-- Prepara el schema para la reconciliación de categorías, servicios y precios de socios
-- contra el Padrón de Servicios real de NUVIX (openspec/changes/actualizar-servicios-socios).
--
-- Esta migración sólo agrega estructura — no toca datos de socios/categorías/servicios
-- todavía. La reconciliación de datos corre después, vía script, con su propio dry-run.
--
-- Decisión de diseño (confirmada por Agus): la app no factura — refleja lo que NUVIX
-- liquida. El precio real de un servicio vive en el vínculo socio↔servicio (`importe`),
-- nunca se deriva de una regla propia (ni por categoría, ni por edad). El precio de
-- catálogo en `servicios_opcionales.monto_mensual` queda como referencia informativa.

-- ============================================================
-- 1. SOCIO_SERVICIOS — importe real + trazabilidad de variante NUVIX
-- ============================================================

ALTER TABLE socio_servicios
  ADD COLUMN IF NOT EXISTS importe        numeric(10,2),
  ADD COLUMN IF NOT EXISTS variante_nuvix text;

COMMENT ON COLUMN socio_servicios.importe IS
  'Importe real liquidado por NUVIX para este vínculo puntual. Manda siempre sobre servicios_opcionales.monto_mensual, que es sólo referencia informativa.';
COMMENT ON COLUMN socio_servicios.variante_nuvix IS
  'Texto original de NUVIX (ej. "GYM Mayor", "RUGBY CUOTA DEPORTIVA") — sólo trazabilidad, la app no lo interpreta.';


-- ============================================================
-- 2. CATEGORIAS_SOCIO_HISTORIAL — no perder el precio anterior cuando cambie
-- ============================================================

CREATE TABLE categorias_socio_historial (
  id             uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id   uuid          NOT NULL REFERENCES categorias_socio(id) ON DELETE CASCADE,
  monto_mensual  numeric(10,2) NOT NULL,               -- el valor que tuvo, no el nuevo
  vigente_desde  timestamptz   NOT NULL,                -- cuándo empezó a regir ese monto
  vigente_hasta  timestamptz   NOT NULL DEFAULT now(),  -- cuándo dejó de regir
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ON categorias_socio_historial (categoria_id);

CREATE OR REPLACE FUNCTION log_categoria_precio_anterior()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.monto_mensual IS DISTINCT FROM OLD.monto_mensual THEN
    INSERT INTO categorias_socio_historial (categoria_id, monto_mensual, vigente_desde, vigente_hasta)
    VALUES (OLD.id, OLD.monto_mensual, OLD.updated_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categorias_socio_log_precio
  BEFORE UPDATE ON categorias_socio
  FOR EACH ROW EXECUTE FUNCTION log_categoria_precio_anterior();

ALTER TABLE categorias_socio_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_admin_leen_categorias_historial" ON categorias_socio_historial
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin', 'subcomision'));


-- ============================================================
-- 3. RECONCILIACIONES_SOCIOS — trazabilidad de cada corrida (dry-run o real)
-- ============================================================

CREATE TABLE reconciliaciones_socios (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  ejecutado_en   timestamptz NOT NULL DEFAULT now(),
  dry_run        boolean     NOT NULL,
  resumen        jsonb       NOT NULL,
  ejecutado_por  uuid        REFERENCES profiles(id)
);

CREATE INDEX ON reconciliaciones_socios (ejecutado_en DESC);

ALTER TABLE reconciliaciones_socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_admin_leen_reconciliaciones" ON reconciliaciones_socios
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin', 'subcomision'));


-- ============================================================
-- 4. CATÁLOGO — servicios nuevos, rename, precios de referencia
--    (precio informativo únicamente — ver comentario en socio_servicios.importe)
-- ============================================================

INSERT INTO servicios_opcionales (nombre, descripcion, monto_mensual)
SELECT 'Hockey Inclusivo', NULL, 18750.00
WHERE NOT EXISTS (SELECT 1 FROM servicios_opcionales WHERE nombre = 'Hockey Inclusivo');

INSERT INTO servicios_opcionales (nombre, descripcion, monto_mensual)
SELECT 'Rugby Inclusivo', NULL, 18750.00
WHERE NOT EXISTS (SELECT 1 FROM servicios_opcionales WHERE nombre = 'Rugby Inclusivo');

-- Rename: mismo registro, mismo id, preserva vínculos existentes (hoy 0, pero
-- evita perder el id si algo externo ya lo referencia).
UPDATE servicios_opcionales
   SET nombre = 'Carnet Tenis',
       descripcion = 'Acceso a las canchas de tenis sin ser socio del club'
 WHERE nombre = 'Tenis Carnet';

-- Precios de referencia corregidos (estaban mal desde la migración 20260714000000).
UPDATE servicios_opcionales SET monto_mensual = 25000.00 WHERE nombre = 'Gimnasio';
UPDATE servicios_opcionales SET monto_mensual = 60000.00 WHERE nombre = 'Carnet Tenis';
-- Rugby (25000) y Hockey (31250) ya estaban correctos, sin cambios.

-- Tenis queda deprecado: la reconciliación de datos (script, no esta migración)
-- vacía sus vínculos; acá sólo se desactiva el catálogo.
UPDATE servicios_opcionales SET activo = false WHERE nombre = 'Tenis';


-- ============================================================
-- 5. CATEGORIAS_SOCIO — precios corregidos
--    (dispara el trigger de la sección 2, que guarda el valor anterior)
-- ============================================================

UPDATE categorias_socio SET monto_mensual = 25000.00 WHERE nombre = 'Activo Mayor';     -- era 50000
UPDATE categorias_socio SET monto_mensual = 50000.00 WHERE nombre = 'Titular de Grupo'; -- era 60000
-- Activo Menor (25000), Activo Unquitas (12500), Dependiente Grupo Familiar (0) ya correctos.
