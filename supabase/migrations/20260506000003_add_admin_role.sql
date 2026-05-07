-- Migration: 20260506000003_add_admin_role
-- Agrega el rol 'admin' a profiles con acceso CRUD total sin restricción de división.
-- Equivalente a 'subcomision' en permisos pero como rol técnico separado.
--
-- Notas de diseño:
--   • get_rol() no requiere cambios — retorna profiles.rol directamente.
--   • Las políticas de 'subcomision' no se tocan; admin recibe políticas propias.
--   • Para tablas con SELECT USING(true) (divisiones, protocolos) no se agrega
--     política de SELECT para admin — ya tienen acceso por esa policy.
--   • pedidos_update_admin no restringe por estado, a diferencia del manager.
--   • items_pedido_update_admin: no existía para otros roles; se agrega solo para admin.


-- ============================================================
-- 1. CONSTRAINT: agregar 'admin' al check de profiles.rol
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('subcomision', 'coordinador', 'entrenador', 'manager', 'admin'));


-- ============================================================
-- 2. divisiones — SELECT cubierto por USING(true), agregar CUD
-- ============================================================

CREATE POLICY "divisiones_insert_admin" ON divisiones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "divisiones_update_admin" ON divisiones
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "divisiones_delete_admin" ON divisiones
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 3. profiles — CRUD total
-- ============================================================

CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 4. push_tokens — CRUD total
-- ============================================================

CREATE POLICY "push_tokens_select_admin" ON push_tokens
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "push_tokens_insert_admin" ON push_tokens
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "push_tokens_update_admin" ON push_tokens
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "push_tokens_delete_admin" ON push_tokens
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 5. jugadores — CRUD total
-- ============================================================

CREATE POLICY "jugadores_select_admin" ON jugadores
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "jugadores_insert_admin" ON jugadores
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "jugadores_update_admin" ON jugadores
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "jugadores_delete_admin" ON jugadores
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 6. fichajes — CRUD total
-- ============================================================

CREATE POLICY "fichajes_select_admin" ON fichajes
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "fichajes_insert_admin" ON fichajes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "fichajes_update_admin" ON fichajes
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "fichajes_delete_admin" ON fichajes
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 7. documentos_fichaje — CRUD total
-- ============================================================

CREATE POLICY "documentos_fichaje_select_admin" ON documentos_fichaje
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "documentos_fichaje_insert_admin" ON documentos_fichaje
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "documentos_fichaje_update_admin" ON documentos_fichaje
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "documentos_fichaje_delete_admin" ON documentos_fichaje
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 8. eventos — CRUD total
-- ============================================================

CREATE POLICY "eventos_select_admin" ON eventos
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "eventos_insert_admin" ON eventos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "eventos_update_admin" ON eventos
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "eventos_delete_admin" ON eventos
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 9. asistencias — CRUD total
-- ============================================================

CREATE POLICY "asistencias_select_admin" ON asistencias
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "asistencias_insert_admin" ON asistencias
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "asistencias_update_admin" ON asistencias
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "asistencias_delete_admin" ON asistencias
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 10. mesas_de_partido — CRUD total
-- ============================================================

CREATE POLICY "mesas_de_partido_select_admin" ON mesas_de_partido
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "mesas_de_partido_insert_admin" ON mesas_de_partido
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "mesas_de_partido_update_admin" ON mesas_de_partido
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "mesas_de_partido_delete_admin" ON mesas_de_partido
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 11. mesa_jugadores — CRUD total
-- ============================================================

CREATE POLICY "mesa_jugadores_select_admin" ON mesa_jugadores
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "mesa_jugadores_insert_admin" ON mesa_jugadores
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "mesa_jugadores_update_admin" ON mesa_jugadores
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "mesa_jugadores_delete_admin" ON mesa_jugadores
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 12. resultados — CRUD total
-- ============================================================

CREATE POLICY "resultados_select_admin" ON resultados
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "resultados_insert_admin" ON resultados
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "resultados_update_admin" ON resultados
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "resultados_delete_admin" ON resultados
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 13. lesiones — CRUD total
-- ============================================================

CREATE POLICY "lesiones_select_admin" ON lesiones
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "lesiones_insert_admin" ON lesiones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "lesiones_update_admin" ON lesiones
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "lesiones_delete_admin" ON lesiones
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 14. protocolos — SELECT cubierto por USING(true), agregar CUD
-- ============================================================

CREATE POLICY "protocolos_insert_admin" ON protocolos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "protocolos_update_admin" ON protocolos
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "protocolos_delete_admin" ON protocolos
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 15. eventos_financieros — CRUD total
-- ============================================================

CREATE POLICY "eventos_financieros_select_admin" ON eventos_financieros
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "eventos_financieros_insert_admin" ON eventos_financieros
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "eventos_financieros_update_admin" ON eventos_financieros
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "eventos_financieros_delete_admin" ON eventos_financieros
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 16. cobranzas — CRUD total
-- ============================================================

CREATE POLICY "cobranzas_select_admin" ON cobranzas
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "cobranzas_insert_admin" ON cobranzas
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "cobranzas_update_admin" ON cobranzas
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "cobranzas_delete_admin" ON cobranzas
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 17. pedidos — CRUD total (sin restricción de estado, a diferencia de manager)
-- ============================================================

CREATE POLICY "pedidos_select_admin" ON pedidos
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "pedidos_insert_admin" ON pedidos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "pedidos_update_admin" ON pedidos
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "pedidos_delete_admin" ON pedidos
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 18. items_pedido — CRUD total (sin restricción de estado del pedido padre)
-- ============================================================

CREATE POLICY "items_pedido_select_admin" ON items_pedido
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "items_pedido_insert_admin" ON items_pedido
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "items_pedido_update_admin" ON items_pedido
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "items_pedido_delete_admin" ON items_pedido
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 19. notificaciones — CRUD total
-- ============================================================

CREATE POLICY "notificaciones_select_admin" ON notificaciones
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "notificaciones_insert_admin" ON notificaciones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "notificaciones_update_admin" ON notificaciones
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "notificaciones_delete_admin" ON notificaciones
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- 20. notificaciones_destinatarios — CRUD total
-- ============================================================

CREATE POLICY "notificaciones_destinatarios_select_admin" ON notificaciones_destinatarios
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "notificaciones_destinatarios_insert_admin" ON notificaciones_destinatarios
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

CREATE POLICY "notificaciones_destinatarios_update_admin" ON notificaciones_destinatarios
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin');

CREATE POLICY "notificaciones_destinatarios_delete_admin" ON notificaciones_destinatarios
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');
