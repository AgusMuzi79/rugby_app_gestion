-- Migration: 20261107000000_recupero_password_intentos
--
-- Límite propio de pedidos de recupero de contraseña (login-dni, action
-- 'reset'). Todos los pedidos le llegan a GoTrue desde la IP de la Edge
-- Function, así que su límite es uno solo para todo el club; éste cuenta por
-- identificador (DNI o mail normalizado) y por IP del cliente. Las claves
-- (HMAC-SHA-256 con una clave del servidor) y los límites los arma la función
-- (_shared/recupero-intentos.ts): la tabla nunca guarda DNIs, mails ni IPs
-- recuperables.
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

-- Borrador anterior de una sola clave (nunca se aplicó en producción; esto
-- sólo limpia una base local que lo tenga). Borra la función, no datos.
DROP FUNCTION IF EXISTS public.registrar_intento_recupero(text, interval, int);

-- Registra un pedido contra sus claves, EN ORDEN, y corta en la primera que
-- está pasada del límite: devuelve 0 si todas pasaron, o el índice (desde 1)
-- de la que rechazó. Las claves siguientes ni se cuentan, así un doble toque
-- frenado por la ventana de 60 s no gasta el cupo por hora ni el de la IP.
-- Cada clave admite como máximo p_maximos[i] intentos por ventana fija de
-- p_ventanas[i] (la ventana arranca con el primer intento y se reinicia
-- cuando vence). El upsert toma el lock de la fila, así que dos pedidos
-- simultáneos no pueden pasar los dos; todo corre en una sola transacción.
-- Un intento rechazado no estira la ventana y deja la cuenta en
-- p_maximo + 1 (no sigue sumando): pasado el máximo, contar de más no cambia
-- nada y así la cuenta no crece sin techo con un flood.
-- No borra nada: una ventana vencida se reinicia en la misma fila.
CREATE OR REPLACE FUNCTION public.registrar_intento_recupero(
  p_claves   text[],
  p_ventanas interval[],
  p_maximos  int[]
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n      int := coalesce(cardinality(p_claves), 0);
  v_cuenta int;
BEGIN
  IF v_n < 1 OR v_n > 10
     OR coalesce(cardinality(p_ventanas), -1) <> v_n
     OR coalesce(cardinality(p_maximos), -1) <> v_n THEN
    RAISE EXCEPTION 'registrar_intento_recupero: parámetros inválidos';
  END IF;
  -- Se valida todo antes de contar nada.
  FOR i IN 1..v_n LOOP
    IF p_claves[i] IS NULL OR p_claves[i] = '' OR p_ventanas[i] IS NULL OR p_maximos[i] IS NULL
       OR p_ventanas[i] <= interval '0' OR p_ventanas[i] > interval '1 day' OR p_maximos[i] < 1 THEN
      RAISE EXCEPTION 'registrar_intento_recupero: parámetros inválidos';
    END IF;
  END LOOP;

  FOR i IN 1..v_n LOOP
    INSERT INTO public.recupero_intentos AS r (clave, inicio_at, cuenta)
    VALUES (p_claves[i], now(), 1)
    ON CONFLICT (clave) DO UPDATE SET
      inicio_at = CASE WHEN r.inicio_at <= now() - p_ventanas[i] THEN now() ELSE r.inicio_at END,
      cuenta    = CASE WHEN r.inicio_at <= now() - p_ventanas[i] THEN 1
                       ELSE least(r.cuenta + 1, p_maximos[i] + 1) END
    RETURNING cuenta INTO v_cuenta;

    IF v_cuenta > p_maximos[i] THEN
      RETURN i;
    END IF;
  END LOOP;

  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_intento_recupero(text[], interval[], int[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_recupero(text[], interval[], int[]) TO service_role;

