-- Migration: 20260915000000_titular_ve_carnet_menores
--
-- Pedido real de un titular de grupo familiar (2026-09-14): quiere ver, desde
-- su propio perfil, el carnet QR de sus hijos menores de 13. Los socios
-- menores de 13 tienen cuenta propia real (auth.users + profiles + socios +
-- socios_secrets, igual que un adulto — ver useAccesoRestringido.ts), pero
-- desde el 2026-08-13 la app les bloquea el uso (EDAD_MINIMA = 13, misma
-- constante que acá). El problema: no pueden loguearse ellos mismos para
-- mostrar su propio QR en el gimnasio/portería. Se necesita que el titular
-- (socios.cabecera_id) pueda leer los datos de esos dependientes menores
-- desde su propia sesión.
--
-- Plantilla: mismo patrón que 20260813000000_titular_ve_deuda_menores.sql
-- (revertido en 20260820000000 por una decisión de negocio sobre DEUDA, no
-- por un problema técnico) — acá se reusa el mecanismo (helper +
-- dependientes_ids() + policy), pero con nombres propios y umbral de 13 (no
-- 18) para no pisar ni depender de aquel feature, que sigue sin existir.
--
-- Alcance: sólo lectura de `socios`/`profiles` del dependiente menor de 13
-- (lo que ya usa useCarnet.ts para armar el carnet — nombre, foto, estado,
-- semáforo, categoría, roles). El TOTP secret NO se lee vía RLS — ninguna
-- policy de socios_secrets existe ni se agrega acá; se resuelve server-side
-- en la Edge Function socios-qr (ver handleGetSecret), que ya corre con
-- service_role y valida el vínculo titular↔menor con la misma lógica que
-- estas funciones antes de entregar el secret.
--
-- No se toca nada de cuotas/deuda/pagos — eso es un tema aparte, resuelto
-- (y revertido) en la migración de agosto. Este cambio es sólo carnet/QR.


-- ============================================================
-- 1. Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION es_menor_de_13(p_fecha_nacimiento date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_fecha_nacimiento IS NOT NULL
     AND p_fecha_nacimiento > (CURRENT_DATE - INTERVAL '13 years')
$$;

-- ids de los dependientes menores de 13 del titular dueño de la sesión
-- actual (cabecera_id = mi propio socio.id). SECURITY DEFINER: evita que la
-- policy de "socios" que consume esta función tenga que releerse a sí misma.
CREATE OR REPLACE FUNCTION dependientes_menores_13_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM socios
  WHERE cabecera_id = get_socio_id()
    AND es_menor_de_13(fecha_nacimiento)
$$;


-- ============================================================
-- 2. El titular lee los datos del carnet de sus dependientes menores de 13
-- ============================================================

CREATE POLICY "socios_select_titular_de_menor13" ON socios
  FOR SELECT TO authenticated
  USING (id IN (SELECT dependientes_menores_13_ids()));

CREATE POLICY "profiles_select_titular_de_menor13" ON profiles
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT profile_id FROM socios WHERE id IN (SELECT dependientes_menores_13_ids()))
  );
