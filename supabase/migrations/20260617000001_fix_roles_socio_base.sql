-- Migration: 20260617000001_fix_roles_socio_base
-- Garantiza que todo profile vinculado a un registro socios tenga 'socio' en roles[].
-- Afecta a usuarios creados antes de v3 que recibieron un rol staff vía assign-role
-- sin que se incluyera 'socio' en el array.

UPDATE profiles p
SET roles = array_prepend('socio', p.roles)
FROM socios s
WHERE s.profile_id = p.id
  AND NOT ('socio' = ANY(p.roles));
