-- Migration: 20261111000000_rol_beneficios
--
-- New role 'beneficios' (2026-11-06, feature doc odd/tasks/rol-beneficios.md):
-- its holders manage the benefits club (table beneficios and bucket
-- beneficios, 20261110000000_club_beneficios) from the web panel. Nothing else.
--
-- - Web-only role: the mobile app never uses it as the active role (it
--   normalizes a web-only active rol to 'socio'). Holders are socios and keep
--   'socio' in roles[]; admin-usuarios adds 'beneficios' to roles[] without
--   changing the active rol.
-- - Only admin grants or removes it. guard_profile_role_update()
--   (20261109000000) is unchanged: 'beneficios' is not in subcomisión's
--   v_gestionables, so subcomisión can neither add nor remove it.
-- - Access is by MEMBERSHIP ('beneficios' = ANY(profiles.roles), via
--   tiene_rol_beneficios()), not by the active rol (get_rol()): one account
--   has a single active rol, the mobile app keeps holders on 'socio', and the
--   web panel must keep working while the same person uses the app.
--
-- Only new policies are added; existing ones (socio/tutor read, admin all)
-- are not modified. Idempotent.


-- ============================================================
-- 1. Role 'beneficios' in the profiles CHECKs
--    (full list copied from 20261105000000_rol_colaborador)
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol = ANY (ARRAY[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor', 'colaborador', 'beneficios'
  ]));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_roles_check
  CHECK (roles <@ ARRAY[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor', 'colaborador', 'beneficios'
  ]);


-- ============================================================
-- 1b. Membership helper (active, non-deleted account holding the role)
-- ============================================================

CREATE OR REPLACE FUNCTION tiene_rol_beneficios()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND activo
      AND 'beneficios' = ANY (roles)
  );
$$;

REVOKE ALL ON FUNCTION tiene_rol_beneficios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tiene_rol_beneficios() TO authenticated;


-- ============================================================
-- 2. Table beneficios: full CRUD, including inactive and expired rows
-- ============================================================

DROP POLICY IF EXISTS "beneficios_select_rol_beneficios" ON beneficios;
CREATE POLICY "beneficios_select_rol_beneficios" ON beneficios
  FOR SELECT TO authenticated
  USING ((SELECT tiene_rol_beneficios()));

DROP POLICY IF EXISTS "beneficios_insert_rol_beneficios" ON beneficios;
CREATE POLICY "beneficios_insert_rol_beneficios" ON beneficios
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT tiene_rol_beneficios()));

DROP POLICY IF EXISTS "beneficios_update_rol_beneficios" ON beneficios;
CREATE POLICY "beneficios_update_rol_beneficios" ON beneficios
  FOR UPDATE TO authenticated
  USING ((SELECT tiene_rol_beneficios()))
  WITH CHECK ((SELECT tiene_rol_beneficios()));

DROP POLICY IF EXISTS "beneficios_delete_rol_beneficios" ON beneficios;
CREATE POLICY "beneficios_delete_rol_beneficios" ON beneficios
  FOR DELETE TO authenticated
  USING ((SELECT tiene_rol_beneficios()));


-- ============================================================
-- 3. Storage bucket 'beneficios'
--    Path convention: {beneficio_id}/{filename}.
--    The public URL needs no policy, but UPDATE/DELETE (remove, upsert) only
--    reach rows the role can SELECT through RLS, so this role also gets a
--    SELECT policy on its bucket (otherwise they silently affect 0 rows).
-- ============================================================

DROP POLICY IF EXISTS "beneficios_storage_select_rol_beneficios" ON storage.objects;
CREATE POLICY "beneficios_storage_select_rol_beneficios"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'beneficios'
    AND (SELECT tiene_rol_beneficios())
  );

-- Same gap for admin in 20261110000000 (already applied): without a SELECT
-- policy, admin's storage UPDATE/DELETE on this bucket affect 0 rows.
DROP POLICY IF EXISTS "beneficios_storage_select_admin" ON storage.objects;
CREATE POLICY "beneficios_storage_select_admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'beneficios'
    AND (SELECT get_rol()) = 'admin'
  );

DROP POLICY IF EXISTS "beneficios_storage_insert_rol_beneficios" ON storage.objects;
CREATE POLICY "beneficios_storage_insert_rol_beneficios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'beneficios'
    AND (SELECT tiene_rol_beneficios())
  );

DROP POLICY IF EXISTS "beneficios_storage_update_rol_beneficios" ON storage.objects;
CREATE POLICY "beneficios_storage_update_rol_beneficios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'beneficios'
    AND (SELECT tiene_rol_beneficios())
  )
  WITH CHECK (
    bucket_id = 'beneficios'
    AND (SELECT tiene_rol_beneficios())
  );

DROP POLICY IF EXISTS "beneficios_storage_delete_rol_beneficios" ON storage.objects;
CREATE POLICY "beneficios_storage_delete_rol_beneficios"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'beneficios'
    AND (SELECT tiene_rol_beneficios())
  );
