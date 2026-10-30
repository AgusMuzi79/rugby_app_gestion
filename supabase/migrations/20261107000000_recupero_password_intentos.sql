-- Migration: 20261107000000_recupero_password_intentos
--
-- Límite propio de pedidos de recupero de contraseña (login-dni, action
-- 'reset'). Todos los pedidos le llegan a GoTrue desde la IP de la Edge
-- Function, así que su límite es uno solo para todo el club; éste cuenta por
-- identificador (hash del DNI o mail normalizado) y por IP del cliente (hash).
-- Las claves y los límites los arma la función (_shared/recupero-intentos.ts):
-- la tabla nunca guarda DNIs, mails ni IPs.
--
-- Sólo service_role: RLS activa sin policies y sin permisos para anon ni
-- authenticated (ni la tabla ni la función).
--
-- Deploy: aplicar ANTES de deployar login-dni. Idempotente.

CREATE TABLE IF NOT EXISTS public.recupero_intentos (
  clave     text        PRIMARY KEY,
  inicio_at timestamptz NOT NULL,
  cuenta    int         NOT NULL
);

COMMENT ON TABLE public.recupero_intentos IS
  'Conteo por ventana fija de pedidos de recupero de contraseña (login-dni). Claves hasheadas; sólo service_role.';

ALTER TABLE public.recupero_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recupero_intentos FROM PUBLIC, anon, authenticated;
-- Sin DELETE: el conteo nunca borra filas (una por clave; la ventana vencida se
-- reinicia en la misma fila), así que la tabla crece una fila por DNI/mail/IP.
GRANT SELECT, INSERT, UPDATE ON TABLE public.recupero_intentos TO service_role;

-- Registra un intento para p_clave y dice si está dentro del límite: como
-- máximo p_maximo intentos por ventana fija de p_ventana (la ventana arranca
-- con el primer intento y se reinicia cuando vence). El upsert toma el lock de
-- la fila, así que dos pedidos simultáneos no pueden pasar los dos. Los
-- intentos rechazados también cuentan, pero no estiran la ventana.
-- No borra nada: una ventana vencida se reinicia en la misma fila.
CREATE OR REPLACE FUNCTION public.registrar_intento_recupero(
  p_clave   text,
  p_ventana interval,
  p_maximo  int
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cuenta int;
BEGIN
  IF p_clave IS NULL OR p_clave = '' OR p_ventana IS NULL OR p_maximo IS NULL
     OR p_ventana <= interval '0' OR p_ventana > interval '1 day' OR p_maximo < 1 THEN
    RAISE EXCEPTION 'registrar_intento_recupero: parámetros inválidos';
  END IF;

  INSERT INTO public.recupero_intentos AS r (clave, inicio_at, cuenta)
  VALUES (p_clave, now(), 1)
  ON CONFLICT (clave) DO UPDATE SET
    inicio_at = CASE WHEN r.inicio_at <= now() - p_ventana THEN now() ELSE r.inicio_at END,
    cuenta    = CASE WHEN r.inicio_at <= now() - p_ventana THEN 1 ELSE r.cuenta + 1 END
  RETURNING cuenta INTO v_cuenta;

  RETURN v_cuenta <= p_maximo;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_intento_recupero(text, interval, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_recupero(text, interval, int) TO service_role;
