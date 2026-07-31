-- Migration: 20260731000000_lock_profiles_self_escalation
--
-- Problema (hallazgo #1 de auditoría pre-producción, 2026-07-31):
-- "profiles_update_own" permite UPDATE de la fila propia sin WITH CHECK
-- ni restricción de columnas. RLS de Postgres no puede limitar columnas,
-- así que cualquier usuario autenticado puede hacer
--   supabase.from('profiles').update({ rol: 'admin' }).eq('id', auth.uid())
-- y escalar privilegios — get_rol() (de la que cuelga todo el RLS del
-- sistema y las Edge Functions) lee exactamente esa columna.
--
-- Fix: trigger BEFORE UPDATE que valida, para cualquier caller que NO sea
-- admin/subcomisión, que:
--   • roles[]     no cambie
--   • divisiones  no cambie
--   • activo      no cambie
--   • rol         solo cambie a un valor ya presente en roles[] (switcheo
--                 multi-rol legítimo — SobreScreen.tsx / web login.tsx)
--
-- auth.uid() IS NULL identifica conexiones con la service_role key (todas
-- las Edge Functions: admin-usuarios, admin-socios, etc.) — esas quedan
-- exentas del guard, tal como ya quedan exentas de RLS.
--
-- admin/subcomisión (vía profiles_update_subcomision/admin) siguen pudiendo
-- editar cualquier columna de cualquier perfil, incluido el suyo propio.


CREATE OR REPLACE FUNCTION guard_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_rol TEXT;
BEGIN
  -- service_role (Edge Functions) — sin JWT de usuario, exento del guard
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_rol := get_rol();

  -- admin/subcomisión: CRUD total, sin restricciones
  IF v_caller_rol IN ('admin', 'subcomision') THEN
    RETURN NEW;
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    RAISE EXCEPTION 'No autorizado para modificar roles';
  END IF;

  IF NEW.divisiones IS DISTINCT FROM OLD.divisiones THEN
    RAISE EXCEPTION 'No autorizado para modificar divisiones';
  END IF;

  IF NEW.activo IS DISTINCT FROM OLD.activo THEN
    RAISE EXCEPTION 'No autorizado para modificar activo';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT (NEW.rol = ANY (OLD.roles)) THEN
    RAISE EXCEPTION 'No autorizado para cambiar a ese rol';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_role_update ON profiles;

CREATE TRIGGER guard_profiles_role_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_role_update();
