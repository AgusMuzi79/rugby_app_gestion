-- Migration: 20260601000001_socios_rls
-- Políticas RLS para el módulo de socios.
--
-- Matriz de acceso:
--   secretaria   → CRUD en socios, cuotas, pagos, noticias, categorías
--   subcomision  → SELECT en todo; UPDATE estado de socios
--   admin        → CRUD total (igual que secretaria, incluido en todas las policies)
--   socio        → SELECT solo sus propios registros (socios, cuotas, pagos)
--   porteria     → sin acceso directo a DB; todo via Edge Function con service role
--
-- NOTA: socios_secrets no tiene políticas → solo service role (Edge Functions).
-- NOTA: multiple políticas SELECT se combinan con OR en PostgreSQL.


-- ============================================================
-- 1. categorias_socio
-- Sin datos sensibles: cualquier usuario autenticado puede leer.
-- ============================================================

CREATE POLICY "categorias_socio_select_all" ON categorias_socio
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "categorias_socio_insert_staff" ON categorias_socio
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) IN ('secretaria', 'admin'));

CREATE POLICY "categorias_socio_update_staff" ON categorias_socio
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin'));

CREATE POLICY "categorias_socio_delete_staff" ON categorias_socio
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin'));


-- ============================================================
-- 2. socios
-- ============================================================

-- Secretaria/subcomision/admin ven todos los registros
CREATE POLICY "socios_select_staff" ON socios
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

-- Socio ve solo su propio registro
CREATE POLICY "socios_select_own" ON socios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND profile_id = auth.uid()
  );

-- Solo secretaria/admin pueden dar de alta socios
CREATE POLICY "socios_insert_staff" ON socios
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) IN ('secretaria', 'admin'));

-- Secretaria, subcomision y admin pueden actualizar (ej: cambiar estado, validar foto)
CREATE POLICY "socios_update_staff" ON socios
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

-- Socio puede actualizar solo su foto_path (upload desde app)
CREATE POLICY "socios_update_own_foto" ON socios
  FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND profile_id = auth.uid()
  );

CREATE POLICY "socios_delete_staff" ON socios
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin'));


-- ============================================================
-- 3. socios_secrets — SIN POLÍTICAS (intencional)
-- RLS habilitado + sin policies = ningún rol autenticado puede acceder.
-- Solo service role en Edge Functions puede leer/escribir.
-- ============================================================


-- ============================================================
-- 4. cuotas
-- ============================================================

CREATE POLICY "cuotas_select_staff" ON cuotas
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

-- Socio ve sus propias cuotas
CREATE POLICY "cuotas_select_own" ON cuotas
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND (SELECT get_socio_id()) = socio_id
  );

-- Secretaria/admin crean cuotas (Edge Function también lo hace vía service role)
CREATE POLICY "cuotas_insert_staff" ON cuotas
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) IN ('secretaria', 'admin'));

CREATE POLICY "cuotas_update_staff" ON cuotas
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin'));


-- ============================================================
-- 5. pagos_socios
-- El socio no puede insertar directamente — Mercado Pago usa service role via webhook.
-- Secretaria registra pagos manuales (efectivo/transferencia).
-- ============================================================

CREATE POLICY "pagos_socios_select_staff" ON pagos_socios
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

-- Socio ve sus propios pagos
CREATE POLICY "pagos_socios_select_own" ON pagos_socios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND (SELECT get_socio_id()) = socio_id
  );

-- Solo secretaria/admin insertan pagos manuales; MP lo hace via service role
CREATE POLICY "pagos_socios_insert_staff" ON pagos_socios
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) IN ('secretaria', 'admin'));

CREATE POLICY "pagos_socios_update_staff" ON pagos_socios
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'admin'));


-- ============================================================
-- 6. noticias
-- Dos políticas SELECT con semántica OR: privilegiados ven todo, resto solo publicadas.
-- ============================================================

-- Roles privilegiados ven todas (incluyendo borradores)
CREATE POLICY "noticias_select_staff" ON noticias
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

-- Todos los demás roles autenticados ven solo las publicadas
CREATE POLICY "noticias_select_published" ON noticias
  FOR SELECT TO authenticated
  USING (publicada = true);

CREATE POLICY "noticias_insert_staff" ON noticias
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

CREATE POLICY "noticias_update_staff" ON noticias
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));

CREATE POLICY "noticias_delete_staff" ON noticias
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) IN ('secretaria', 'subcomision', 'admin'));
