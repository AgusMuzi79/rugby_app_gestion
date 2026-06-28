-- Migration: 20260624000001_cuotas_comprobante
--
-- Reemplaza el flujo de pago por MercadoPago con:
--   - Transferencia bancaria al alias del club
--   - Subida de comprobante por el socio
--   - Estado intermedio 'en_revision' hasta que secretaría apruebe
--
-- Cambios:
--   1. cuotas.estado: agrega 'en_revision' al CHECK constraint
--   2. cuotas.comprobante_path: path al archivo en storage (comprobantes bucket)


-- ── 1. Ampliar CHECK de estado ───────────────────────────────────────────────

ALTER TABLE cuotas
  DROP CONSTRAINT IF EXISTS cuotas_estado_check;

ALTER TABLE cuotas
  ADD CONSTRAINT cuotas_estado_check
  CHECK (estado IN ('pendiente', 'en_revision', 'pagado'));


-- ── 2. Columna para el comprobante ───────────────────────────────────────────

ALTER TABLE cuotas
  ADD COLUMN IF NOT EXISTS comprobante_path TEXT;


-- ── 3. RLS: socio puede UPDATE su propia cuota (para setear comprobante_path) ─

CREATE POLICY "cuotas_update_own_comprobante" ON cuotas
  FOR UPDATE TO authenticated
  USING (
    (SELECT get_socio_id()) = socio_id
  )
  WITH CHECK (
    (SELECT get_socio_id()) = socio_id
  );
