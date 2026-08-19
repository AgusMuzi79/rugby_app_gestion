-- Cadencia del recordatorio de deuda por mail: no reenviar antes de 15 días
-- para el mismo socio, aunque secretaría reimporte la deuda varias veces en
-- el medio. Se actualiza desde importar-deuda al enviar de verdad (no al
-- armar la lista) — ver supabase/functions/importar-deuda/index.ts.

alter table socios
  add column if not exists recordatorio_deuda_enviado_at timestamptz;

comment on column socios.recordatorio_deuda_enviado_at is
  'Última vez que se envió (con éxito) el mail de recordatorio de deuda para este socio. No se resetea entre importaciones — se usa para no reenviar antes de los 15 días.';
