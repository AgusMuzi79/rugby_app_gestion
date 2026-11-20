-- Migration: 20261120000000_rol_pileta
--
-- New scanner role 'pileta' (2026-11-20, feature doc odd/tasks/lector-pileta.md):
-- the staff member at the pool entrance scans member QR cards from the mobile
-- app (attended, rear camera, same flow as 'canchero'). socios-qr only lets in
-- members with an active service whose name contains "pileta" and logs the
-- access with accesos.punto = 'pileta' (accesos.punto has no CHECK).
--
-- - Only admin grants or removes it. guard_profile_role_update()
--   (20261109000000) is unchanged: 'pileta' is not in subcomisión's
--   v_gestionables, so subcomisión can neither add nor remove it.
-- - The pool is not a NUVIX service: Secretaría ticks the "Pileta" service by
--   hand. importar-servicios only touches mapped services, so a manual link
--   is never overwritten.
--
-- Idempotent.


-- ============================================================
-- 1. Role 'pileta' in the profiles CHECKs
--    (full list copied from 20261111000000_rol_beneficios)
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol = ANY (ARRAY[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor', 'colaborador', 'beneficios', 'pileta'
  ]));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_roles_check
  CHECK (roles <@ ARRAY[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor', 'colaborador', 'beneficios', 'pileta'
  ]);


-- ============================================================
-- 2. "Pileta" service in the catalog (assigned by hand, amount 0)
--    The scan gate matches by name (ILIKE '%pileta%').
-- ============================================================

INSERT INTO servicios_opcionales (nombre, descripcion, monto_mensual, activo)
SELECT 'Pileta', 'Temporada de pileta. Lo asigna Secretaría a mano.', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM servicios_opcionales WHERE lower(nombre) = 'pileta'
);
