-- Migration: 20260731000003_backfill_roles_socios_importados
--
-- La carga masiva (scripts/import-socios-masivo.mjs, 2026-07-29/30) insertaba
-- profiles sin setear la columna roles, que cae al default '{}'. Como
-- getDestinatariosSocio() (supabase/functions/notifications/index.ts) filtra
-- por .contains('roles', ['socio']), y '{}' no contiene 'socio', ninguno de
-- los socios importados recibía push. El script ya se corrigió para setear
-- roles: ['socio'] en altas nuevas — esto repara los que ya estaban cargados.
--
-- Aplicado manualmente en producción el 2026-07-31 vía `supabase db query`
-- (1527 filas). Esta migración lo deja registrado en el historial — el WHERE
-- la hace un no-op si se vuelve a correr.

UPDATE profiles
SET roles = ARRAY['socio']
WHERE roles = '{}' AND rol = 'socio';
