-- Migration: profiles_no_borrar_socios
-- Última línea de defensa: una cuenta con fila en `socios` no se puede borrar.
--
-- profiles → socios → cuotas / pagos_socios / accesos / turnos es todo
-- ON DELETE CASCADE (20260506000000, 20260601000000). Borrar el usuario en Auth
-- (admin-usuarios `delete`, o "Delete user" en el Dashboard de Supabase) se
-- llevaba el historial contable del socio. La baja de un socio es otra cosa:
-- Secretaría lo saca del padrón y el import banea la cuenta (importar-socios),
-- sin borrar nada.
--
-- El trigger dispara también cuando el DELETE llega en cascada desde
-- auth.users, así que aborta todo el borrado. Los rollbacks de los importadores
-- y de admin-socios / registro-tutor borran la cuenta antes de que exista la
-- fila de socio, así que no los afecta.
--
-- No toca datos. Idempotente.

CREATE OR REPLACE FUNCTION impedir_borrar_profile_de_socio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM socios WHERE profile_id = OLD.id) THEN
    RAISE EXCEPTION 'La cuenta % es de un socio y no se puede borrar. Para darlo de baja, sacalo del padrón (el import banea la cuenta).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS impedir_borrar_profile_de_socio ON profiles;
CREATE TRIGGER impedir_borrar_profile_de_socio
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION impedir_borrar_profile_de_socio();

-- Escenario de verificación (correr a mano en local; todo en una transacción):
--   begin;
--   -- 1. Cuenta de socio: falla (antes: borraba socio, cuotas y pagos).
--   delete from auth.users where id = (select profile_id from socios where profile_id is not null limit 1);
--   --    ERROR: La cuenta … es de un socio y no se puede borrar. (SQLSTATE 23001)
--   rollback;
--   begin;
--   -- 2. Cuenta sólo de staff (sin fila en socios): se borra como siempre.
--   delete from auth.users where id = (
--     select p.id from profiles p where not exists (select 1 from socios s where s.profile_id = p.id) limit 1);
--   --    DELETE 1
--   rollback;
