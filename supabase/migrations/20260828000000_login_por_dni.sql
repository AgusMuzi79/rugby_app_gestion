-- Login por DNI (2026-08-28)
--
-- El login de la app va a pedir DNI en vez de mail (pedido de Secretaría:
-- nadie se acuerda del mail sintético socio-{numero}@uncas.local). La
-- Edge Function `login-dni` resuelve DNI -> email real antes de llamar a
-- signInWithPassword, y para eso necesita un DNI legible desde `profiles`
-- (no se puede resolver contra `socios.dni` para cuentas de staff creadas
-- directo vía admin-usuarios "+ NUEVO USUARIO", que no tienen fila en
-- `socios`).
--
-- `profiles.dni` se mantiene sincronizado automáticamente desde
-- `socios.dni` vía trigger — cualquier alta/corrección de DNI en socios
-- (alta manual, importador mensual, carga masiva, fix de secretaría) se
-- refleja acá sin tocar cada call site que escribe en `socios`.

ALTER TABLE profiles ADD COLUMN dni text;

UPDATE profiles p
SET dni = s.dni
FROM socios s
WHERE s.profile_id = p.id;

CREATE UNIQUE INDEX profiles_dni_unique ON profiles (dni) WHERE dni IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_profile_dni()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET dni = NEW.dni WHERE id = NEW.profile_id AND dni IS DISTINCT FROM NEW.dni;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_profile_dni
AFTER INSERT OR UPDATE OF dni ON socios
FOR EACH ROW EXECUTE FUNCTION sync_profile_dni();
