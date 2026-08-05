-- Migration: 20260804000004_socios_leen_importaciones_deuda
--
-- La pantalla de detalle de deuda del socio (design.md §6 de la change
-- importador-deuda-nuvix, implementada 2026-08-04) necesita el sello de
-- frescura ("datos al {fecha_corte}") — para eso el cliente lee
-- importaciones_deuda (sólo id y fecha_corte, ordenado desc, limit 1).
--
-- La policy original (20260804000000) sólo daba SELECT a secretaria/admin.
-- Los totales/contadores de esta tabla no son datos sensibles por-persona
-- (son metadata agregada de cada import), así que se abre lectura a
-- cualquier autenticado en vez de duplicar la policy con columnas
-- restringidas (RLS es row-level, no column-level, en Postgres).

CREATE POLICY "authenticated_select_importaciones" ON importaciones_deuda
  FOR SELECT TO authenticated
  USING (true);
