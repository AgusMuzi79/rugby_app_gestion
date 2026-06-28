-- Migration: 20260624000000_fix_socios_rls_multrol
--
-- Problema: policies de "propio registro" en socios y socios-fotos
-- chequeaban get_rol() = 'socio', bloqueando a staff con doble rol
-- (manager, entrenador, etc.) que también son socios.
--
-- Fix: eliminar el check de rol en policies de propiedad.
-- La condición profile_id = auth.uid() (o get_socio_id()) ya garantiza
-- que el usuario solo accede a su propio registro, sin importar el rol activo.


-- ── socios: SELECT propio ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "socios_select_own" ON socios;

CREATE POLICY "socios_select_own" ON socios
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());


-- ── socios: UPDATE foto propia ───────────────────────────────────────────────

DROP POLICY IF EXISTS "socios_update_own_foto" ON socios;

CREATE POLICY "socios_update_own_foto" ON socios
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());


-- ── storage socios-fotos: INSERT en carpeta propia ───────────────────────────

DROP POLICY IF EXISTS "socios_fotos_insert_own" ON storage.objects;

CREATE POLICY "socios_fotos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'socios-fotos'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );


-- ── storage socios-fotos: UPDATE en carpeta propia ───────────────────────────

DROP POLICY IF EXISTS "socios_fotos_update_own" ON storage.objects;

CREATE POLICY "socios_fotos_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'socios-fotos'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );
