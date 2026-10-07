-- Migration: 20261010000001_recordatorios_deuda_envios
--
-- Registro de cada corrida del aviso mensual de deuda (Edge Function
-- recordatorio-deuda, cron del día 22). Una fila por corrida, se envíe o no:
--   - 'enviado':  salió el push (destinatarios / enviados / sin_token).
--   - 'salteado': no correspondía mandarlo (no es día 22, ya se envió este
--                 mes, o el último reporte importado tiene más de 2 días);
--                 el motivo queda en `motivo`.
--   - 'error':    falló una consulta o el envío; detalle en `motivo`.
--
-- La función usa esta tabla para no mandar el aviso dos veces en el mismo mes
-- (si ya hay una fila 'enviado' desde el día 1, saltea). El panel de
-- Secretaría (/secretaria/deuda) muestra la última corrida.

CREATE TABLE recordatorios_deuda_envios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_at   timestamptz NOT NULL DEFAULT now(),
  estado         text        NOT NULL CHECK (estado IN ('enviado', 'salteado', 'error')),
  motivo         text,
  -- fecha de corte del último reporte importado al momento de la corrida
  fecha_corte    date,
  destinatarios  int         NOT NULL DEFAULT 0,
  enviados       int         NOT NULL DEFAULT 0,
  sin_token      int         NOT NULL DEFAULT 0
);

CREATE INDEX ON recordatorios_deuda_envios (ejecutado_at DESC);

ALTER TABLE recordatorios_deuda_envios ENABLE ROW LEVEL SECURITY;

-- La Edge Function escribe con service_role; esta política es sólo para que
-- el panel lea las corridas.
CREATE POLICY "secretaria_admin_subcomision_select_recordatorios_deuda_envios" ON recordatorios_deuda_envios
  FOR SELECT TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin', 'subcomision'));

-- ─── Cron mensual (requiere pg_cron + pg_net habilitados) ─────────────────────
-- Ejecutar manualmente en el SQL editor de Supabase, después de deployar la
-- función recordatorio-deuda (--no-verify-jwt) con el secret CRON_SECRET ya
-- seteado (mismo patrón que recordatorio-debito, ver
-- 20260826000000_debito_automatico_recordatorio.sql).
-- '0 13 22 * *' = día 22 de cada mes a las 13:00 UTC = 10:00 en Argentina.
--
-- SELECT cron.schedule(
--   'recordatorio-deuda-mensual',
--   '0 13 22 * *',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/recordatorio-deuda',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
--
-- Prueba manual fuera del día 22 (manda el push de verdad y cuenta como el
-- envío del mes): POST a la misma URL con body '{"forzar": true}' o
-- ?forzar=true. Igual exige el reporte fresco y que no se haya enviado ya.
