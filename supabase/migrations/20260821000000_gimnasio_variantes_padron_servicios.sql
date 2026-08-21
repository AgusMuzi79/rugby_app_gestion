-- Migration: 20260821000000_gimnasio_variantes_padron_servicios
--
-- El padrón de servicios por socio (padronserviciossocios_uncas.xls, ver
-- openspec/changes/importador-mensual-socios/design.md §1.2) distingue 5
-- variantes de gimnasio que el catálogo actual no representa: GYM Mayor,
-- GYM Menor, GYM ALICUOTA, CLIENTE GYM, GYM Becado. Sin esto, el futuro
-- importador de servicios no tiene con qué mapear el importe de cada
-- variante. Precios confirmados por Agus (2026-08-21):
--   GYM Mayor    -> Gimnasio (ya existe, $25.000, activo — sin cambios)
--   GYM Menor    -> Gimnasio Menor (ya existe inactivo, mismo precio — reactivar)
--   GYM ALICUOTA -> nuevo, $60.000
--   CLIENTE GYM  -> nuevo, $0 — no es un cargo, sólo diferencia a un cliente
--                   de gimnasio de un socio común que también hace gimnasio
--   GYM Becado   -> nuevo, $0 — mismo patrón que el resto de becas del club

UPDATE servicios_opcionales
SET activo = true
WHERE nombre = 'Gimnasio Menor';

INSERT INTO servicios_opcionales (nombre, monto_mensual, activo, descripcion)
VALUES
  ('Gimnasio Alícuota', 60000, true, 'Variante GYM ALICUOTA del padrón de servicios NUVIX'),
  ('Cliente Gimnasio',       0, true, 'Diferencia a un cliente de gimnasio de un socio común — sin cargo propio'),
  ('Gimnasio Becado',        0, true, 'Beca de gimnasio — mismo criterio que el resto de las becas del club');
