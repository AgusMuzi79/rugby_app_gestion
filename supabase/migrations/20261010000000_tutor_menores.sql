-- Migration: 20261010000000_tutor_menores
--
-- Tutor de menores (2026-10-07): an adult who is NOT a club member (mother,
-- father, legal guardian) self-registers from the "acceso restringido" screen
-- shown to members under 13 and gets read-only access to ALL of the minor's
-- member data (carnet QR, cuotas/deuda, servicios, comprobantes, noticias,
-- calendario) plus the minor's push notifications.
--
-- `socios.cabecera_id` (see 20260915000000_titular_ve_carnet_menores) only
-- links a minor to another `socios` row, so a non-member parent had no way in.
-- This adds:
--   - role 'tutor' (profiles.rol / profiles.roles). A tutor has NO socios row,
--     so get_socio_id() is NULL for them.
--   - tutores_menores: tutor profile <-> minor socio link. Written only by the
--     Edge Function registro-tutor (service_role) after verifying a 6-digit
--     code sent to the minor's account email.
--   - tutor_verificaciones: hashed codes, expiry and attempts. No client
--     access at all (RLS on, no policies).
--   - tutor_menores_ids() + SELECT policies on the minor's data.
--
-- Authorization is the link itself: the policies do NOT require the minor to
-- be under 13. The minor turning 13 (or 18) keeps the tutor link and access;
-- removing access means deleting the tutores_menores row (service role).
--
-- The TOTP secret (socios_secrets) is still never readable through RLS: the
-- socios-qr Edge Function validates the tutor link server-side.
--
-- Only new policies are added; no existing policy is loosened.


-- ============================================================
-- 1. Role 'tutor' in profiles CHECK constraints
--    (full list copied from 20260911000000_rol_cliente_gimnasio)
-- ============================================================

alter table profiles drop constraint if exists profiles_rol_check;
alter table profiles add constraint profiles_rol_check
  check (rol = any (array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor'
  ]));

alter table profiles drop constraint if exists profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (roles <@ array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor'
  ]);


-- ============================================================
-- 2. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS tutores_menores (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  socio_id          uuid        NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  relacion          text        NOT NULL CHECK (relacion IN ('madre', 'padre', 'tutor', 'otro')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tutor_profile_id, socio_id)
);

-- tutor_profile_id is covered by the UNIQUE index (leading column).
CREATE INDEX IF NOT EXISTS tutores_menores_socio_id_idx ON tutores_menores (socio_id);

ALTER TABLE tutores_menores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tutor_verificaciones (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id                uuid        NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  email                   text        NOT NULL CHECK (email = lower(email)),
  codigo_hash             text        NOT NULL,
  relacion                text        NOT NULL CHECK (relacion IN ('madre', 'padre', 'tutor', 'otro')),
  fecha_nacimiento_tutor  date        NOT NULL,
  expires_at              timestamptz NOT NULL,
  intentos                int         NOT NULL DEFAULT 0,
  usado_at                timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutor_verificaciones_socio_email_idx
  ON tutor_verificaciones (socio_id, email, created_at DESC);

-- Service role only: RLS enabled and intentionally no policies.
ALTER TABLE tutor_verificaciones ENABLE ROW LEVEL SECURITY;

-- Atomically consumes one verification attempt. Returns the new attempt count,
-- or no row when the code is already used or out of attempts. Concurrent
-- guesses serialize on the row lock, so the attempt cap cannot be raced.
CREATE OR REPLACE FUNCTION tutor_verificacion_consumir_intento(p_id uuid, p_max int)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE tutor_verificaciones
  SET intentos = intentos + 1
  WHERE id = p_id AND usado_at IS NULL AND intentos < p_max
  RETURNING intentos
$$;

REVOKE ALL ON FUNCTION tutor_verificacion_consumir_intento(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION tutor_verificacion_consumir_intento(uuid, int) TO service_role;


-- ============================================================
-- 3. Helper
-- ============================================================

-- Socio ids of the minors linked to the current session's tutor. SECURITY
-- DEFINER so policies on socios/profiles that consume it do not recurse into
-- their own RLS (same reason as dependientes_menores_13_ids()).
CREATE OR REPLACE FUNCTION tutor_menores_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT socio_id FROM tutores_menores
  WHERE tutor_profile_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION tutor_menores_ids() FROM public;
GRANT EXECUTE ON FUNCTION tutor_menores_ids() TO authenticated;


-- ============================================================
-- 4. tutores_menores: own rows + staff
-- ============================================================

DROP POLICY IF EXISTS "tutores_menores_select_own" ON tutores_menores;
CREATE POLICY "tutores_menores_select_own" ON tutores_menores
  FOR SELECT TO authenticated
  USING (tutor_profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "tutores_menores_select_staff" ON tutores_menores;
CREATE POLICY "tutores_menores_select_staff" ON tutores_menores
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));


-- ============================================================
-- 5. The tutor reads the minor's member data (read-only)
-- ============================================================

DROP POLICY IF EXISTS "socios_select_tutor" ON socios;
CREATE POLICY "socios_select_tutor" ON socios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'tutor'
    AND id IN (SELECT tutor_menores_ids())
  );

DROP POLICY IF EXISTS "profiles_select_tutor_de_menor" ON profiles;
CREATE POLICY "profiles_select_tutor_de_menor" ON profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'tutor'
    AND id IN (SELECT profile_id FROM socios WHERE id IN (SELECT tutor_menores_ids()))
  );

DROP POLICY IF EXISTS "cuotas_select_tutor" ON cuotas;
CREATE POLICY "cuotas_select_tutor" ON cuotas
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'tutor'
    AND socio_id IN (SELECT tutor_menores_ids())
  );

DROP POLICY IF EXISTS "pagos_socios_select_tutor" ON pagos_socios;
CREATE POLICY "pagos_socios_select_tutor" ON pagos_socios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'tutor'
    AND socio_id IN (SELECT tutor_menores_ids())
  );

DROP POLICY IF EXISTS "socio_servicios_select_tutor" ON socio_servicios;
CREATE POLICY "socio_servicios_select_tutor" ON socio_servicios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'tutor'
    AND socio_id IN (SELECT tutor_menores_ids())
  );

DROP POLICY IF EXISTS "comprobantes_deuda_select_tutor" ON comprobantes_deuda;
CREATE POLICY "comprobantes_deuda_select_tutor" ON comprobantes_deuda
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'tutor'
    AND socio_id IN (SELECT tutor_menores_ids())
  );

-- Storage: comprobantes bucket, path {socio_id}/... (same folder scoping as
-- comprobantes_select_own). Read-only: no INSERT/UPDATE for tutors.
DROP POLICY IF EXISTS "comprobantes_select_tutor" ON storage.objects;
CREATE POLICY "comprobantes_select_tutor"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (SELECT get_rol()) = 'tutor'
    AND (storage.foldername(name))[1] IN (SELECT t::text FROM tutor_menores_ids() AS t)
  );

-- socios-fotos is already readable by any authenticated user
-- (socios_fotos_select), so the carnet photo needs no new policy.
--
-- jugadores: intentionally no tutor policy. Socios cannot read jugadores
-- either today (no socio policy exists), so useCalendarioSocio's division
-- lookup already returns null for them — mirrored here, not widened.


-- ============================================================
-- 6. Club-wide content the socio sees: noticias, eventos, resultados
-- ============================================================

DROP POLICY IF EXISTS "noticias_select_tutor" ON noticias;
CREATE POLICY "noticias_select_tutor" ON noticias
  FOR SELECT TO authenticated
  USING (
    publicada = true
    AND audiencia = 'todos'
    AND (SELECT get_rol()) = 'tutor'
  );

DROP POLICY IF EXISTS "eventos_select_tutor" ON eventos;
CREATE POLICY "eventos_select_tutor"
  ON eventos FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'tutor');

DROP POLICY IF EXISTS "resultados_select_tutor" ON resultados;
CREATE POLICY "resultados_select_tutor"
  ON resultados FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'tutor');
