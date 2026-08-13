-- Migration: 20260813000000_titular_ve_deuda_menores
--
-- Hallazgo (2026-08-13): los socios menores de edad (divisiones infantiles y
-- juveniles) tienen su propia cuenta con credenciales reales (email + DNI) —
-- son parte de los 1528 socios de la carga masiva. Hasta ahora veían
-- exactamente lo mismo que un adulto en (socio)/cuotas.tsx: semáforo de
-- morosidad y el detalle completo de deuda del club (useDeudaDetalle).
--
-- Decisión de Agus: un menor no debería ver que su grupo familiar está en
-- mora — esa información pasa a ser exclusiva del titular del grupo
-- (socios.cabecera_id). Esta migración:
--   1. Le da al titular acceso de lectura a cuotas/comprobantes_deuda/
--      socio_servicios/pagos_socios/socios/profiles de sus dependientes
--      MENORES (no de dependientes adultos — eso no fue pedido y sería un
--      cambio de privacidad más amplio).
--   2. Le saca al propio menor el acceso de lectura a sus propias cuotas y
--      comprobantes_deuda — no es solo un gate de UI, si sólo ocultáramos la
--      pantalla el menor podría igual pedir esos datos directo contra la API
--      de Supabase con su propio JWT.
--
-- El resto de la fila `socios` (semaforo/deuda_vencida/etc., que no se puede
-- restringir por columna con RLS) sigue siendo legible por el propio dueño
-- de la fila — la app simplemente no la pide ni la muestra para un menor
-- (ver useCuotas.ts). Cerrar ese último resquicio a nivel DB requeriría
-- separar esas columnas a una tabla aparte; no se hizo en esta pasada.


-- ============================================================
-- 1. Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION es_menor_de_edad(p_fecha_nacimiento date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_fecha_nacimiento IS NOT NULL
     AND p_fecha_nacimiento > (CURRENT_DATE - INTERVAL '18 years')
$$;

-- ¿El socio dueño de la sesión actual es menor de edad?
CREATE OR REPLACE FUNCTION soy_menor_de_edad()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT es_menor_de_edad(fecha_nacimiento) FROM socios WHERE id = get_socio_id()
$$;

-- ids de los dependientes menores del titular dueño de la sesión actual
-- (cabecera_id = mi propio socio.id). SECURITY DEFINER: evita que la policy
-- de "socios" que consume esta función tenga que releerse a sí misma.
CREATE OR REPLACE FUNCTION dependientes_menores_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM socios
  WHERE cabecera_id = get_socio_id()
    AND es_menor_de_edad(fecha_nacimiento)
$$;


-- ============================================================
-- 2. El titular lee los datos de sus dependientes menores
-- ============================================================

CREATE POLICY "socios_select_titular_de_menor" ON socios
  FOR SELECT TO authenticated
  USING (id IN (SELECT dependientes_menores_ids()));

CREATE POLICY "profiles_select_titular_de_menor" ON profiles
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT profile_id FROM socios WHERE id IN (SELECT dependientes_menores_ids()))
  );

CREATE POLICY "cuotas_select_titular_de_menor" ON cuotas
  FOR SELECT TO authenticated
  USING (socio_id IN (SELECT dependientes_menores_ids()));

CREATE POLICY "pagos_socios_select_titular_de_menor" ON pagos_socios
  FOR SELECT TO authenticated
  USING (socio_id IN (SELECT dependientes_menores_ids()));

CREATE POLICY "socio_servicios_select_titular_de_menor" ON socio_servicios
  FOR SELECT TO authenticated
  USING (socio_id IN (SELECT dependientes_menores_ids()));

CREATE POLICY "comprobantes_deuda_select_titular_de_menor" ON comprobantes_deuda
  FOR SELECT TO authenticated
  USING (socio_id IN (SELECT dependientes_menores_ids()));


-- ============================================================
-- 3. El propio menor deja de leer su cuota/deuda/servicios/pagos
-- ============================================================

DROP POLICY IF EXISTS "cuotas_select_own" ON cuotas;
CREATE POLICY "cuotas_select_own" ON cuotas
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND (SELECT get_socio_id()) = socio_id
    AND NOT COALESCE(soy_menor_de_edad(), false)
  );

DROP POLICY IF EXISTS "pagos_socios_select_own" ON pagos_socios;
CREATE POLICY "pagos_socios_select_own" ON pagos_socios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND (SELECT get_socio_id()) = socio_id
    AND NOT COALESCE(soy_menor_de_edad(), false)
  );

DROP POLICY IF EXISTS "socio_lee_propios_servicios" ON socio_servicios;
CREATE POLICY "socio_lee_propios_servicios" ON socio_servicios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND socio_id = (SELECT get_socio_id())
    AND NOT COALESCE(soy_menor_de_edad(), false)
  );

DROP POLICY IF EXISTS "socio_select_own_comprobantes" ON comprobantes_deuda;
CREATE POLICY "socio_select_own_comprobantes" ON comprobantes_deuda
  FOR SELECT TO authenticated
  USING (
    socio_id IN (SELECT id FROM socios WHERE profile_id = (select auth.uid()))
    AND NOT COALESCE(soy_menor_de_edad(), false)
  );
