-- Migration: 20260805000000_terminos_condiciones
--
-- Base técnica para Términos y Condiciones, independiente del texto legal
-- final (todavía en revisión — abogado de la familia + asesor legal del
-- club). Decisión de Agus (2026-08-05): aceptación obligatoria la primera
-- vez que el usuario entra (no un link pasivo), con registro versionado de
-- quién aceptó qué y cuándo — necesario para tener valor legal real bajo
-- Ley 25.326 (hay menores de edad entre los 1528 socios).
--
-- Diseño:
--   • terminos_versiones: el documento vigente es texto libre (title +
--     PDF) que subcomisión/admin publica — no requiere build nueva del
--     mobile para cambiar el contenido. Sólo una versión "activo" a la vez
--     (índice único parcial).
--   • terminos_aceptaciones: una fila por usuario por versión aceptada —
--     si se publica una versión nueva, todos vuelven a quedar "pendientes"
--     hasta que la re-acepten, sin perder el historial de aceptaciones
--     anteriores.
--   • Bucket 'legales' público (igual que 'noticias-imagenes') — el PDF de
--     T&C no es información sensible, simplifica mostrarlo sin signed URLs.
--
-- Sin versión activa (mientras el texto sigue en revisión), pendiente
-- siempre da false — no bloquea a nadie hasta que se publique la primera.


-- ============================================================
-- 1. TERMINOS_VERSIONES
-- ============================================================

CREATE TABLE terminos_versiones (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text          NOT NULL UNIQUE,
  titulo        text          NOT NULL,
  pdf_path      text          NOT NULL,     -- path dentro del bucket 'legales'
  activo        boolean       NOT NULL DEFAULT false,
  publicado_por uuid          REFERENCES profiles(id),
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- A lo sumo una versión activa a la vez.
CREATE UNIQUE INDEX terminos_versiones_una_activa ON terminos_versiones (activo) WHERE activo;

ALTER TABLE terminos_versiones ENABLE ROW LEVEL SECURITY;

-- Cualquier autenticado necesita saber cuál es la versión vigente para
-- decidir si tiene que aceptar.
CREATE POLICY "terminos_versiones_select_authenticated" ON terminos_versiones
  FOR SELECT TO authenticated
  USING (true);

-- Publicar/editar versiones queda reservado a quien gestiona lo legal del club.
CREATE POLICY "terminos_versiones_write_admin" ON terminos_versiones
  FOR ALL TO authenticated
  USING ((select get_rol()) IN ('admin', 'subcomision'))
  WITH CHECK ((select get_rol()) IN ('admin', 'subcomision'));


-- ============================================================
-- 2. TERMINOS_ACEPTACIONES
-- ============================================================

CREATE TABLE terminos_aceptaciones (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version_id  uuid          NOT NULL REFERENCES terminos_versiones(id),
  aceptado_at timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (profile_id, version_id)
);

CREATE INDEX terminos_aceptaciones_profile_id_idx ON terminos_aceptaciones (profile_id);

ALTER TABLE terminos_aceptaciones ENABLE ROW LEVEL SECURITY;

-- El usuario ve y registra su propia aceptación — nunca la de otro.
CREATE POLICY "terminos_aceptaciones_select_own" ON terminos_aceptaciones
  FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));

CREATE POLICY "terminos_aceptaciones_insert_own" ON terminos_aceptaciones
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = (select auth.uid()));

-- Admin/subcomisión pueden auditar quién aceptó qué (por si hace falta
-- demostrarlo ante un reclamo).
CREATE POLICY "terminos_aceptaciones_select_admin" ON terminos_aceptaciones
  FOR SELECT TO authenticated
  USING ((select get_rol()) IN ('admin', 'subcomision'));


-- ============================================================
-- 3. STORAGE — bucket 'legales'
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legales',
  'legales',
  true,        -- público: documento legal, no requiere signed URL para leer
  10485760,    -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "legales_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'legales'
    AND (SELECT get_rol()) IN ('admin', 'subcomision')
  );

CREATE POLICY "legales_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'legales'
    AND (SELECT get_rol()) IN ('admin', 'subcomision')
  );
