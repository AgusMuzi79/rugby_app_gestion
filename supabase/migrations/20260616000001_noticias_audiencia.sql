-- Migration: 20260616000001_noticias_audiencia
-- Agrega audiencia, division_id y generada_automaticamente a noticias.
-- Actualiza RLS: socios solo ven audiencia='todos'; cuerpo técnico ve ambas.

-- ============================================================
-- 1. Nuevas columnas
-- ============================================================

ALTER TABLE noticias
  ADD COLUMN IF NOT EXISTS audiencia TEXT NOT NULL DEFAULT 'todos';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'noticias_audiencia_check' AND conrelid = 'noticias'::regclass
  ) THEN
    ALTER TABLE noticias ADD CONSTRAINT noticias_audiencia_check
      CHECK (audiencia IN ('todos', 'cuerpo_tecnico'));
  END IF;
END $$;

ALTER TABLE noticias
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisiones(id) ON DELETE SET NULL;

ALTER TABLE noticias
  ADD COLUMN IF NOT EXISTS generada_automaticamente BOOLEAN NOT NULL DEFAULT false;


-- ============================================================
-- 2. Actualizar RLS
--    Antes: noticias_select_published → todos los autenticados ven publicadas
--    Ahora: separar socios (audiencia='todos') del cuerpo técnico (ambas)
-- ============================================================

-- Reemplazar política genérica por dos específicas
DROP POLICY IF EXISTS "noticias_select_published" ON noticias;

-- Cuerpo técnico: ve noticias publicadas de cualquier audiencia
CREATE POLICY "noticias_select_cuerpo_tecnico" ON noticias
  FOR SELECT TO authenticated
  USING (
    publicada = true
    AND (SELECT get_rol()) IN ('coordinador', 'entrenador', 'manager')
  );

-- Socios: solo ven noticias publicadas con audiencia='todos'
CREATE POLICY "noticias_select_socio" ON noticias
  FOR SELECT TO authenticated
  USING (
    publicada = true
    AND audiencia = 'todos'
    AND (SELECT get_rol()) = 'socio'
  );
