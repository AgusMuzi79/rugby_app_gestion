-- Migration: 20260601000002_socios_storage
-- Buckets y políticas de Storage para el módulo de socios.
--
-- Buckets:
--   socios-fotos       → fotos de carnet (privado, signed URL)
--   noticias-imagenes  → imágenes del feed (público)
--   comprobantes       → PDFs de pago (privado, signed URL)
--
-- Convención de paths:
--   socios-fotos:      {socio_id}/{filename}
--   noticias-imagenes: {noticia_id}/{filename}
--   comprobantes:      {socio_id}/{pago_id}.pdf


-- ============================================================
-- BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'socios-fotos',
  'socios-fotos',
  false,
  5242880,   -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'noticias-imagenes',
  'noticias-imagenes',
  true,       -- público: no requiere signed URL para leer
  10485760,   -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  5242880,   -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- POLÍTICAS — socios-fotos
-- Path: {socio_id}/{filename}
-- Lectura: cualquier usuario autenticado (portería necesita ver la foto al validar QR)
-- ============================================================

-- Cualquier autenticado puede leer (portería ve la foto del socio en validación)
CREATE POLICY "socios_fotos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'socios-fotos');

-- Secretaria/admin pueden subir cualquier foto
CREATE POLICY "socios_fotos_insert_staff"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'socios-fotos'
    AND (SELECT get_rol()) IN ('secretaria', 'admin')
  );

-- Socio puede subir solo en su propia carpeta: {su_socio_id}/...
CREATE POLICY "socios_fotos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'socios-fotos'
    AND (SELECT get_rol()) = 'socio'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );

-- Secretaria/admin y socio (solo su carpeta) pueden actualizar
CREATE POLICY "socios_fotos_update_staff"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'socios-fotos'
    AND (SELECT get_rol()) IN ('secretaria', 'admin')
  );

CREATE POLICY "socios_fotos_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'socios-fotos'
    AND (SELECT get_rol()) = 'socio'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );

-- Solo secretaria/admin eliminan fotos
CREATE POLICY "socios_fotos_delete_staff"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'socios-fotos'
    AND (SELECT get_rol()) IN ('secretaria', 'admin')
  );


-- ============================================================
-- POLÍTICAS — noticias-imagenes
-- Bucket público: la lectura no requiere política (public=true).
-- Mutaciones solo para roles que pueden publicar noticias.
-- ============================================================

CREATE POLICY "noticias_imagenes_insert_staff"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'noticias-imagenes'
    AND (SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin')
  );

CREATE POLICY "noticias_imagenes_update_staff"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'noticias-imagenes'
    AND (SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin')
  );

CREATE POLICY "noticias_imagenes_delete_staff"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'noticias-imagenes'
    AND (SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin')
  );


-- ============================================================
-- POLÍTICAS — comprobantes
-- Path: {socio_id}/{pago_id}.pdf
-- INSERT: solo service role (Edge Function genera el PDF → no hay policy de INSERT)
-- SELECT: socio ve solo su carpeta; secretaria/admin ven todo
-- ============================================================

CREATE POLICY "comprobantes_select_staff"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (SELECT get_rol()) IN ('secretaria', 'admin')
  );

-- Socio descarga solo sus propios comprobantes
CREATE POLICY "comprobantes_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (SELECT get_rol()) = 'socio'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );

-- Solo secretaria/admin pueden eliminar comprobantes
CREATE POLICY "comprobantes_delete_staff"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (SELECT get_rol()) IN ('secretaria', 'admin')
  );
