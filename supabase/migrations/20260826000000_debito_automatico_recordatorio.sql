-- Migration: 20260826000000_debito_automatico_recordatorio
--
-- Recordatorio de débito automático real (pedido de Secretaría, 2026-08-26):
-- ella carga en su panel las fechas en las que el banco va a debitar la
-- cuota de los socios que pagan con tarjeta (Vendedor='VISA' en el padrón
-- NUVIX — no importa si es tarjeta de débito o crédito, ambas se cobran
-- automáticamente el mismo día). Un día antes de cada fecha, push + mail
-- avisándoles que tengan fondos disponibles.
--
-- Ver memoria de proyecto: project-recordatorio-debito-automatico,
-- project-forma-pago-padron.

alter table socios
  add column if not exists cobro_con_tarjeta boolean not null default false;

comment on column socios.cobro_con_tarjeta is
  'true si Vendedor=VISA en el padrón NUVIX (paga con tarjeta, débito o crédito — ambas se cobran automáticamente el mismo día). Poblado por importar-socios (columna "Vendedor" del padrón); sin backfill retroactivo hasta el próximo import mensual.';

create table fechas_debito_automatico (
  id               uuid        primary key default gen_random_uuid(),
  fecha            date        not null unique,
  aviso_enviado    boolean     not null default false,
  aviso_enviado_at timestamptz,
  creado_por       uuid        references profiles(id),
  created_at       timestamptz not null default now()
);

alter table fechas_debito_automatico enable row level security;

create policy "secretaria_admin_all_fechas_debito" on fechas_debito_automatico
  for all to authenticated
  using ((select get_rol()) in ('secretaria', 'admin'))
  with check ((select get_rol()) in ('secretaria', 'admin'));

-- ─── Cron job diario (requiere pg_cron + pg_net habilitados) ──────────────────
-- Ejecutar manualmente en el SQL editor de Supabase, después de deployar la
-- función recordatorio-debito y setear CRON_SECRET (mismo patrón que
-- cobro-mensual-socios, ver 20260609000002_mp_card_fields.sql):
--
-- SELECT cron.schedule(
--   'recordatorio-debito-automatico',
--   '0 10 * * *',
--   $$
--   SELECT net.http_post(
--     url     => 'https://tlexvbattnzpmdftjsao.supabase.co/functions/v1/recordatorio-debito',
--     headers => '{"x-cron-secret": "REEMPLAZAR_CON_CRON_SECRET", "Content-Type": "application/json"}'::jsonb,
--     body    => '{}'::jsonb
--   );
--   $$
-- );
