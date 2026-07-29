-- Migration: carga_masiva_prep
-- Prepara el schema para la carga masiva del padrón real de socios.
--
-- Decisiones de diseño:
--   • cabecera_id: autorreferencia nullable en socios para grupos familiares.
--     El titular no tiene cabecera; los dependientes apuntan al id del titular.
--   • fichado_temporada_actual: refleja si Ult.fichaje (padrón UAR) == temporada
--     actual. Se recalcula en cada import/re-fichaje, no es un valor histórico.
--     Determina habilitación para mesa de partido, no bloquea asistencia.
--   • Servicio "Tenis Carnet": catálogo separado de "Tenis" para no perder el
--     dato de la modalidad (155 socios activos), aunque por ahora se factura
--     igual que Tenis y los socios se vinculan al servicio "Tenis" existente.

ALTER TABLE socios
  ADD COLUMN IF NOT EXISTS cabecera_id uuid REFERENCES socios(id);

CREATE INDEX IF NOT EXISTS socios_cabecera_id_idx ON socios (cabecera_id);

ALTER TABLE jugadores
  ADD COLUMN IF NOT EXISTS fichado_temporada_actual boolean NOT NULL DEFAULT false;

INSERT INTO servicios_opcionales (nombre, descripcion, monto_mensual)
SELECT 'Tenis Carnet', 'Modalidad carnet de tenis (definición operativa pendiente de confirmar con el club)', 25000.00
WHERE NOT EXISTS (SELECT 1 FROM servicios_opcionales WHERE nombre = 'Tenis Carnet');
