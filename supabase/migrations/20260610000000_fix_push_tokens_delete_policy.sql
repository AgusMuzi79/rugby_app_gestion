-- Migration: 20260610000000_fix_push_tokens_delete_policy
-- El token de push es propiedad del dispositivo, no del usuario.
-- Permitir DELETE por cualquier usuario autenticado resuelve el problema
-- de re-asignación cuando el mismo dispositivo cambia de cuenta.
-- SELECT/INSERT/UPDATE siguen protegidos por usuario_id = auth.uid().

DROP POLICY IF EXISTS "push_tokens_delete_own" ON push_tokens;

CREATE POLICY "push_tokens_delete_own" ON push_tokens
  FOR DELETE TO authenticated
  USING (true);
