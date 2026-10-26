-- Migration: totp_un_solo_uso
-- Cada código del carnet abre la puerta una sola vez.
--
-- socios-qr aceptaba el código anterior, el actual y el siguiente (~3 min) sin
-- marcarlo como usado: una captura del QR mandada por WhatsApp abría el
-- gimnasio, donde nadie mira la foto, todas las veces que se quisiera.
--
-- Ahora socios-qr `validate`, al dejar pasar, consume el paso del código con
-- consumir_paso_totp(): un único UPDATE que sólo avanza si el paso es
-- posterior al último usado, así que dos lecturas simultáneas del mismo QR no
-- pasan las dos. Un rechazo (sin servicio, sin reserva) no consume el código.
--
-- No toca datos (la columna arranca NULL = ningún paso usado). Idempotente.

ALTER TABLE socios_secrets
  ADD COLUMN IF NOT EXISTS ultimo_paso_usado bigint;

COMMENT ON COLUMN socios_secrets.ultimo_paso_usado IS
  'Último paso TOTP (floor(epoch/60)) aceptado en la puerta. Un código con paso <= a este se rechaza.';

-- true = el paso quedó consumido ahora; false = ya se había usado ese paso (o
-- uno posterior), o el socio no tiene secreto.
CREATE OR REPLACE FUNCTION consumir_paso_totp(p_socio_id uuid, p_paso bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH consumido AS (
    UPDATE socios_secrets
       SET ultimo_paso_usado = p_paso
     WHERE socio_id = p_socio_id
       AND (ultimo_paso_usado IS NULL OR ultimo_paso_usado < p_paso)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM consumido);
$$;

-- Sólo la Edge Function (service role). socios_secrets no tiene políticas RLS.
REVOKE ALL ON FUNCTION consumir_paso_totp(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION consumir_paso_totp(uuid, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION consumir_paso_totp(uuid, bigint) TO service_role;

-- Escenario de verificación (local):
--   select consumir_paso_totp(:socio, 29876543);  -- true  (primer uso)
--   select consumir_paso_totp(:socio, 29876543);  -- false (la misma captura otra vez)
--   select consumir_paso_totp(:socio, 29876542);  -- false (código anterior)
--   select consumir_paso_totp(:socio, 29876544);  -- true  (minuto siguiente)
