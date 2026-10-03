-- Migration: 20261003000002_aviso_inactividad_gimnasio
--
-- Aviso por push a quien tiene un servicio de Gimnasio pago y no entra hace más
-- de 20 días (puede estar pagando sin darse cuenta). Lo manda la Edge Function
-- `aviso-inactividad-gimnasio`; esta columna guarda cuándo se le avisó a cada
-- socio para no repetir el aviso hasta que vuelva a ir (o, si nunca fue, hasta
-- 60 días después). Los menores se avisan al titular, pero la marca queda en la
-- fila del menor (es quien está inactivo).
--
-- Ver memoria de proyecto: project-recordatorios-solo-push (sólo push, sin mail).

alter table socios
  add column if not exists aviso_inactividad_enviado_at timestamptz;

comment on column socios.aviso_inactividad_enviado_at is
  'Última vez que aviso-inactividad-gimnasio avisó por push que este socio no usa el gimnasio hace 20+ días. Se vuelve a avisar sólo si hubo un ingreso posterior (o pasaron 60 días si nunca ingresó).';

-- ─── Cron semanal (requiere pg_cron + pg_net habilitados) ─────────────────────
-- NO registrar sin confirmación de Agus: la primera corrida avisaría a casi
-- todos los socios con gimnasio sin ingresos en 20 días. Primero deployar la
-- función (supabase functions deploy aviso-inactividad-gimnasio --no-verify-jwt),
-- setear CRON_SECRET y probar con body {"dry_run": true}. Después, ejecutar
-- manualmente en el SQL editor de Supabase (mismo patrón que
-- recordatorio-debito-automatico, ver 20260826000000_debito_automatico_recordatorio.sql):
--
-- SELECT cron.schedule(
--   'aviso-inactividad-gimnasio',
--   '0 13 * * 1',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/aviso-inactividad-gimnasio',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
