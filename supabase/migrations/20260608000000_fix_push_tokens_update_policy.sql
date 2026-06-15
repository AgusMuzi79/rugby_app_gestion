-- Migration: 20260608000000_fix_push_tokens_update_policy
-- El upsert con onConflict:'token' falla cuando el mismo dispositivo
-- fue usado previamente por otro usuario. La policy UPDATE anterior bloqueaba
-- la operación porque el USING chequeaba usuario_id del row existente.
-- Solución: USING (true) permite el UPDATE en cualquier fila de token,
-- pero WITH CHECK garantiza que solo puede reasignarse al usuario actual.

DROP POLICY IF EXISTS "push_tokens_update_own" ON push_tokens;

CREATE POLICY "push_tokens_update_own" ON push_tokens
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (usuario_id = auth.uid());
