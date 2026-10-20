-- Migration: 20261027000000_recordatorio_eventos_envios
--
-- Registro de cada corrida de recordatorio-eventos que reclamó al menos un evento.
-- Motivo (2026-10-20): el recordatorio de la charla del 19/10 se reclamó para las 5
-- divisiones del plantel superior pero jugadores de M19–M22 reportaron que no les llegó, y
-- la respuesta HTTP del cron (net._http_response) se borra a las pocas horas: no había forma
-- de saber qué pasó con cada envío.
--
--   • Una fila por corrida con eventos: totales (eventos, destinatarios, pushes entregados,
--     sin token, fallidos), el detalle por destinatario (título, cuerpo, profile, cantidad de
--     tokens, si se entregó) y los errores que devolvió Expo (tickets rechazados, chunks
--     fallidos).
--   • Las corridas sin eventos (la mayoría, cada 5 minutos) no se registran.
--   • Sólo la escribe y la lee service_role (RLS activa sin políticas). Se consulta por CLI.

CREATE TABLE public.recordatorio_eventos_envios (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ejecutado_at   timestamptz NOT NULL DEFAULT now(),
  eventos        int         NOT NULL,
  destinatarios  int         NOT NULL,
  pushes         int         NOT NULL,
  sin_token      int         NOT NULL,
  fallidos       int         NOT NULL,
  detalle        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  errores        jsonb       NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX recordatorio_eventos_envios_ejecutado_idx
  ON public.recordatorio_eventos_envios (ejecutado_at DESC);

ALTER TABLE public.recordatorio_eventos_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recordatorio_eventos_envios FROM anon, authenticated;
