-- Migration: 20261112000000_colaborador_fuera_de_subco
--
-- Desde 2026-11-10 el colaborador lo designa el entrenador de la división
-- (Edge Function `colaboradores`, con service_role; feature doc
-- odd/tasks/colaborador-por-entrenador.md). Subcomisión deja de poner o quitar
-- el rol 'colaborador'; admin lo sigue haciendo.
--
-- Recrea guard_profile_role_update() igual que en 20261109000000 (última
-- versión; 20261111000000 no la tocó) con 'colaborador' fuera de
-- v_gestionables. Misma regla que ROLES_POR_CALLER.subcomision en
-- functions/_shared/permisos-usuarios.ts. Con A Δ B (roles que entran o
-- salen), subco ya no puede agregar ni sacar 'colaborador'; editar una cuenta
-- que lo tiene sigue andando si el rol queda (no entra ni sale).
--
-- service_role (la function del entrenador), admin y el resto: sin cambios.
-- Idempotente (CREATE OR REPLACE); el trigger de 20260731000000 no cambia.

CREATE OR REPLACE FUNCTION guard_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_rol TEXT;
  -- Roles que subcomisión puede poner o quitar (ROLES_POR_CALLER.subcomision).
  -- 'colaborador' ya no: lo designa el entrenador (function colaboradores).
  v_gestionables CONSTANT TEXT[] := ARRAY['coordinador', 'entrenador', 'manager', 'subcomision'];
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
