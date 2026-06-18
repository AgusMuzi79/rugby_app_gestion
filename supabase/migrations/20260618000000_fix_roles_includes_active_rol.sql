-- Migration: 20260618000000_fix_roles_includes_active_rol
-- Garantiza que el rol activo (profiles.rol) siempre esté incluido en profiles.roles[].
-- Afecta perfiles donde roles[] no contiene el valor de rol (ej: creados vía handleCreate
-- antes del fix, o que pasaron por assign-role en versiones previas con lógica incompleta).

UPDATE profiles
SET roles = array_append(roles, rol)
WHERE rol IS NOT NULL
  AND NOT (rol = ANY(roles));
