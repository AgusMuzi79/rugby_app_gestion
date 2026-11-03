-- Migration: 20261109000000_guard_roles_subcomision
--
-- Problema (auditoría UX, backlog de CLAUDE.md): guard_profile_role_update()
-- (última versión en 20260914000000) a subcomisión sólo le bloquea `deporte`.
-- El panel web de Usuarios escribe roles/rol/activo/divisiones directo con
-- supabase.from('profiles').update(...), así que la base es el único límite, y
-- hoy una subco puede:
--   • agregarse 'admin' a sí misma (o a cualquiera)
--   • sacarle 'admin' al admin real, o desactivarlo
--   • poner o quitar roles que no gestiona (secretaria, porteria, socio…)
--
-- Fix: misma regla que admin-usuarios (functions/_shared/permisos-usuarios.ts,
-- ROLES_POR_CALLER.subcomision). Con A = OLD.roles ∪ {OLD.rol} y
-- B = NEW.roles ∪ {NEW.rol}, todo rol que entra o sale (A Δ B) tiene que ser
-- uno de los que subco gestiona: coordinador, entrenador, colaborador,
-- manager, subcomision. Cambiar `rol` a uno que ya está en A (pasar a la vista
-- socio, por ejemplo) sigue andando: no entra ni sale nada.
-- Si A tiene 'admin', subco no toca roles, rol ni activo de esa cuenta.
-- divisiones y activo de cuentas que no son admin siguen libres para subco
-- (DESACTIVAR/REACTIVAR, asignar divisiones, reemplazarRolStaff de la web).
--
-- service_role, admin y el resto de los roles: sin cambios.
-- Idempotente (CREATE OR REPLACE); el trigger de 20260731000000 no cambia.

CREATE OR REPLACE FUNCTION guard_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_rol TEXT;
  -- Roles que subcomisión puede poner o quitar (ROLES_POR_CALLER.subcomision)
  v_gestionables CONSTANT TEXT[] := ARRAY['coordinador', 'entrenador', 'colaborador', 'manager', 'subcomision'];
  v_antes   TEXT[];
  v_despues TEXT[];
BEGIN
  -- service_role (Edge Functions) — sin JWT de usuario, exento del guard
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_rol := get_rol();

  -- admin: CRUD total, sin restricciones
  IF v_caller_rol = 'admin' THEN
    RETURN NEW;
  END IF;

  IF v_caller_rol = 'subcomision' THEN
    -- `deporte` sólo lo asigna admin (20260914000000)
    IF NEW.deporte IS DISTINCT FROM OLD.deporte THEN
      RAISE EXCEPTION 'No autorizado para modificar deporte';
    END IF;

    -- Roles de la cuenta antes y después: roles[] más el rol activo, sin nulls
    v_antes   := array_remove(COALESCE(OLD.roles, '{}') || OLD.rol, NULL);
    v_despues := array_remove(COALESCE(NEW.roles, '{}') || NEW.rol, NULL);

    -- Cuenta de admin: subco no le cambia roles, rol ni activo
    IF 'admin' = ANY (v_antes) AND (
      NEW.roles IS DISTINCT FROM OLD.roles
      OR NEW.rol IS DISTINCT FROM OLD.rol
      OR NEW.activo IS DISTINCT FROM OLD.activo
    ) THEN
      RAISE EXCEPTION 'No autorizado para modificar una cuenta de administrador';
    END IF;

    -- Lo que entra o sale (A Δ B) tiene que ser un rol que subco gestiona
    IF EXISTS (
      SELECT 1
      FROM (
        (SELECT unnest(v_antes) EXCEPT SELECT unnest(v_despues))
        UNION
        (SELECT unnest(v_despues) EXCEPT SELECT unnest(v_antes))
      ) AS cambiados (r)
      WHERE r <> ALL (v_gestionables)
    ) THEN
      RAISE EXCEPTION 'No autorizado para asignar o quitar ese rol';
    END IF;

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

  IF NEW.deporte IS DISTINCT FROM OLD.deporte THEN
    RAISE EXCEPTION 'No autorizado para modificar deporte';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT (NEW.rol = ANY (OLD.roles)) THEN
    RAISE EXCEPTION 'No autorizado para cambiar a ese rol';
  END IF;

  RETURN NEW;
END;
$$;
