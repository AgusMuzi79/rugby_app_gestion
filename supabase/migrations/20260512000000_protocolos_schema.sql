-- Migration: protocolos_schema
-- Tabla de protocolos de lesión estructurados, pasos, alertas y etapas GRTP

-- ── Tabla principal ────────────────────────────────────────────────────────────

CREATE TABLE public.protocolos_lesion (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo                  text NOT NULL CHECK (tipo IN ('tejidos_blandos', 'conmocion', 'columna', 'sangrado')),
  grado                 int  NOT NULL CHECK (grado BETWEEN 1 AND 5),
  titulo                text NOT NULL,
  descripcion           text NOT NULL,
  retiro_inmediato      bool NOT NULL DEFAULT false,
  notas_uar             text,
  disponible_offline    bool NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.protocolos_lesion ENABLE ROW LEVEL SECURITY;

-- ── Pasos de actuación inmediata ───────────────────────────────────────────────

CREATE TABLE public.protocolo_pasos (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id  uuid NOT NULL REFERENCES public.protocolos_lesion(id) ON DELETE CASCADE,
  orden         int  NOT NULL,
  titulo        text NOT NULL,
  descripcion   text NOT NULL,
  es_critico    bool NOT NULL DEFAULT false,
  UNIQUE (protocolo_id, orden)
);

ALTER TABLE public.protocolo_pasos ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.protocolo_pasos (protocolo_id);

-- ── Señales de alerta y criterios de retiro ────────────────────────────────────

CREATE TABLE public.protocolo_alertas (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo_id  uuid NOT NULL REFERENCES public.protocolos_lesion(id) ON DELETE CASCADE,
  descripcion   text NOT NULL,
  es_criterio1  bool NOT NULL DEFAULT false
);

ALTER TABLE public.protocolo_alertas ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.protocolo_alertas (protocolo_id);

-- ── Etapas GRTP (globales, no por protocolo) ───────────────────────────────────

CREATE TABLE public.grtp_etapas (
  id                              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  numero                          int  NOT NULL UNIQUE CHECK (numero BETWEEN 1 AND 6),
  titulo                          text NOT NULL,
  descripcion                     text NOT NULL,
  duracion_minima_horas_adultos   int  NOT NULL,
  duracion_minima_horas_menores   int  NOT NULL
);

ALTER TABLE public.grtp_etapas ENABLE ROW LEVEL SECURITY;

-- ── RLS: lectura para todos los roles autenticados ────────────────────────────

CREATE POLICY "protocolos_lesion_select_all"
  ON public.protocolos_lesion FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "protocolo_pasos_select_all"
  ON public.protocolo_pasos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "protocolo_alertas_select_all"
  ON public.protocolo_alertas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "grtp_etapas_select_all"
  ON public.grtp_etapas FOR SELECT TO authenticated
  USING (true);

-- ── RLS: escritura solo para admin ────────────────────────────────────────────

CREATE POLICY "protocolos_lesion_admin_all"
  ON public.protocolos_lesion FOR ALL TO authenticated
  USING     ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "protocolo_pasos_admin_all"
  ON public.protocolo_pasos FOR ALL TO authenticated
  USING     ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "protocolo_alertas_admin_all"
  ON public.protocolo_alertas FOR ALL TO authenticated
  USING     ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "grtp_etapas_admin_all"
  ON public.grtp_etapas FOR ALL TO authenticated
  USING     ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');
