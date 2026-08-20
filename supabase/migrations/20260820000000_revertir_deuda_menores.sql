-- Migration: 20260820000000_revertir_deuda_menores
--
-- Comisión directiva (2026-08-20): la deuda tiene que aparecer para socios
-- de todas las edades — revierte por completo la migración 20260813000000
-- ("titular_ve_deuda_menores"). El piso de edad de 13 años para operar la
-- app (useAccesoRestringido, sin migración propia) NO cambia: sigue
-- bloqueando menores de 13. Esta migración sólo afecta a quién ve la
-- deuda/cuotas propia dentro de la app (13-17 años, ya que menores de 13
-- no llegan a esta pantalla de todos modos).
--
-- Revierte:
--   1. Las policies que le daban al titular de un grupo familiar acceso de
--      lectura a los datos financieros de sus dependientes menores.
--   2. La restricción que le sacaba al propio menor el acceso de lectura a
--      sus propias cuotas/comprobantes_deuda/socio_servicios/pagos_socios.
--   3. Los helpers SQL que sólo existían para sostener lo anterior.

-- ============================================================
-- 1. Sacar las policies del titular sobre dependientes menores
-- ============================================================

DROP POLICY IF EXISTS "socios_select_titular_de_menor" ON socios;
DROP POLICY IF EXISTS "profiles_select_titular_de_menor" ON profiles;
DROP POLICY IF EXISTS "cuotas_select_titular_de_menor" ON cuotas;
DROP POLICY IF EXISTS "pagos_socios_select_titular_de_menor" ON pagos_socios;
DROP POLICY IF EXISTS "socio_servicios_select_titular_de_menor" ON socio_servicios;
DROP POLICY IF EXISTS "comprobantes_deuda_select_titular_de_menor" ON comprobantes_deuda;

-- ============================================================
-- 2. Restaurar el acceso propio del socio, sin el chequeo de edad
-- ============================================================

DROP POLICY IF EXISTS "cuotas_select_own" ON cuotas;
CREATE POLICY "cuotas_select_own" ON cuotas
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND (SELECT get_socio_id()) = socio_id
  );

DROP POLICY IF EXISTS "pagos_socios_select_own" ON pagos_socios;
CREATE POLICY "pagos_socios_select_own" ON pagos_socios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND (SELECT get_socio_id()) = socio_id
  );

DROP POLICY IF EXISTS "socio_lee_propios_servicios" ON socio_servicios;
CREATE POLICY "socio_lee_propios_servicios" ON socio_servicios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND socio_id = (SELECT get_socio_id())
  );

DROP POLICY IF EXISTS "socio_select_own_comprobantes" ON comprobantes_deuda;
CREATE POLICY "socio_select_own_comprobantes" ON comprobantes_deuda
  FOR SELECT TO authenticated
  USING (
    socio_id IN (SELECT id FROM socios WHERE profile_id = (select auth.uid()))
  );

-- ============================================================
-- 3. Sacar los helpers que sólo servían para lo de arriba
-- ============================================================

DROP FUNCTION IF EXISTS dependientes_menores_ids();
DROP FUNCTION IF EXISTS soy_menor_de_edad();
DROP FUNCTION IF EXISTS es_menor_de_edad(date);
