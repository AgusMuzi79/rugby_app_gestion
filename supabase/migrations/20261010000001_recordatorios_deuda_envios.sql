-- Migration: 20261010000001_recordatorios_deuda_envios
--
-- Registro de cada corrida del aviso mensual de deuda (Edge Function
-- recordatorio-deuda, cron del día 22). Una fila por corrida, se envíe o no:
--   - 'enviando': la corrida reservó el mes y está mandando el push.
--   - 'enviado':  salió el push y llegó al menos un aviso (destinatarios /
--                 enviados / sin_token).
--   - 'salteado': no correspondía mandarlo (no es día 22, el último reporte
--                 importado tiene más de 2 días, o el mes ya está enviado o
--                 en curso); el motivo queda en `motivo`.
--   - 'error':    falló una consulta, o no llegó ningún aviso (todos los
--                 envíos fallaron); detalle en `motivo`.
--
-- Uno por mes, atómico: antes de mandar, la función inserta una fila
-- 'enviando' con `mes` ('YYYY-MM', mes calendario en Argentina). El índice
-- único parcial de abajo sólo admite una fila 'enviando' o 'enviado' por mes,
-- así que una segunda corrida simultánea o posterior falla con 23505 y
-- saltea. Al terminar, la función pasa esa misma fila a 'enviado' o 'error'.
-- 'error' y 'salteado' no entran en el índice: un error no bloquea reintentar.
--
-- Si la función no logra cerrar la fila (falla el UPDATE final o se corta la
-- ejecución), queda 'enviando' y bloquea el aviso de ese mes. Se corrige a
-- mano según los logs de la función, por ejemplo:
--   UPDATE recordatorios_deuda_envios SET estado = 'error', motivo = '...'
--    WHERE estado = 'enviando' AND mes = 'YYYY-MM';
--
-- El panel de Secretaría (/secretaria/deuda) muestra la última corrida.

CREATE TABLE recordatorios_deuda_envios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_at   timestamptz NOT NULL DEFAULT now(),
  -- mes calendario en Argentina de la corrida ('YYYY-MM')
  mes            text        NOT NULL CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  estado         text        NOT NULL CHECK (estado IN ('enviando', 'enviado', 'salteado', 'error')),
  motivo         text,
  -- fecha de corte del último reporte importado al momento de la corrida
  fecha_corte    date,
  destinatarios  int         NOT NULL DEFAULT 0,
  enviados       int         NOT NULL DEFAULT 0,
  sin_token      int         NOT NULL DEFAULT 0
);

CREATE INDEX ON recordatorios_deuda_envios (ejecutado_at DESC);

-- Una sola corrida 'enviando' o 'enviado' por mes (reserva atómica del envío).
CREATE UNIQUE INDEX recordatorios_deuda_envios_un_envio_por_mes
  ON recordatorios_deuda_envios (mes)
  WHERE estado IN ('enviando', 'enviado');

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
-- ?forzar=true. Igual exige el reporte fresco y que el mes no esté ya
-- enviado o en curso.
