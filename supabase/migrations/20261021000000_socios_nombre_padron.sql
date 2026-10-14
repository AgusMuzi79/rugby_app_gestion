-- Migration: 20261021000000_socios_nombre_padron
--
-- El carnet muestra el nombre del padrón del club, no el editable
-- (auditoría UX socio, T12). Hasta ahora había un solo nombre,
-- profiles.nombre: el socio lo editaba en Mi perfil y importar-socios lo
-- pisaba con el del padrón en la siguiente importación.
--
-- Desde acá:
--   • socios.nombre_padron = nombre del padrón NUVIX. Lo escribe
--     importar-socios (alta y actualización). Lo muestran el carnet, la
--     tarjeta física, los dependientes y el escaneo (socios-qr).
--   • profiles.nombre = nombre que el socio edita en Mi perfil. El
--     importador sólo lo setea al crear la cuenta, ya no lo pisa.
--
-- Backfill: hoy profiles.nombre de un socio es, salvo ediciones desde la
-- app posteriores a la última importación, el nombre del padrón.
-- Sin políticas nuevas: la columna hereda las de socios.

ALTER TABLE socios ADD COLUMN nombre_padron text;

UPDATE socios s
SET    nombre_padron = p.nombre
FROM   profiles p
WHERE  p.id = s.profile_id
  AND  s.nombre_padron IS NULL
  AND  nullif(trim(p.nombre), '') IS NOT NULL;

-- El socio puede actualizar su propia fila (foto, socios_update_own_foto) y
-- guard_socio_update no conoce esta columna: sin este guard podría cambiarse
-- el nombre del carnet. Mismo patrón que guard_socio_sexo_update
-- (20261014000000). Sólo staff o service_role (importar-socios).
CREATE OR REPLACE FUNCTION guard_socio_nombre_padron_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nombre_padron IS DISTINCT FROM OLD.nombre_padron
     AND auth.uid() IS NOT NULL
     AND coalesce(get_rol(), '') NOT IN ('secretaria', 'subcomision', 'admin')
  THEN
    RAISE EXCEPTION 'No autorizado para modificar ese campo del socio';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION guard_socio_nombre_padron_update() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS guard_socios_nombre_padron_update ON socios;
CREATE TRIGGER guard_socios_nombre_padron_update
  BEFORE UPDATE OF nombre_padron ON socios
  FOR EACH ROW EXECUTE FUNCTION guard_socio_nombre_padron_update();
