-- Migration: mp_card_fields
-- Campos para tarjeta guardada en Mercado Pago — débito automático mensual.
-- La secretaria asocia la tarjeta del socio; el cron cobra el 1ro de cada mes
-- con reintentos en días 2, 4 y 7. Al 4to fallo notifica a secretaria.

ALTER TABLE socios
  ADD COLUMN mp_customer_id    text,
  ADD COLUMN mp_card_id        text,
  ADD COLUMN mp_card_last_four char(4),
  ADD COLUMN mp_card_brand     text,
  ADD COLUMN mp_card_retries   int NOT NULL DEFAULT 0,
  ADD COLUMN mp_card_retry_at  timestamptz;

-- Agregar 'tarjeta' al CHECK de forma_pago (el nombre del constraint es auto-generado)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name      = 'pagos_socios'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%forma_pago%'
  LOOP
    EXECUTE 'ALTER TABLE pagos_socios DROP CONSTRAINT ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE pagos_socios
  ADD CONSTRAINT pagos_socios_forma_pago_check
  CHECK (forma_pago IN ('mercadopago', 'efectivo', 'transferencia', 'tarjeta'));

-- ─── Cron job diario a las 9am (requiere pg_cron + pg_net habilitados) ────────
-- Ejecutar manualmente en el SQL editor de Supabase después de setear CRON_SECRET:
--
-- SELECT cron.schedule(
--   'cobro-mensual-socios',
--   '0 9 * * *',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/socios-pagos?action=cobro-mensual',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
