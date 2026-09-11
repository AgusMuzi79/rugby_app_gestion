-- Migration: 20260911000002_fix_rls_encontrados_en_revision
--
-- 3 hallazgos de una revisión completa de RLS pedida por Agus (2026-09-11),
-- ninguno con evidencia de explotación real, los tres cerrados por las dudas:
--
-- 1. push_tokens: "_delete_own"/"_update_own" tenían USING (true) en vez de
--    usuario_id = auth.uid() — quedó así de cuando se armó el RPC
--    register_push_token (SECURITY DEFINER, bypassea RLS) para resolver el
--    caso de "el token ya pertenece a otro usuario" (dispositivo compartido)
--    — la tabla base nunca se volvió a cerrar. Cualquier autenticado podía
--    borrar/reasignar el token de cualquier otro por API directa.
-- 2. tiene_acceso_division(): "divisiones IS NULL" se trataba como "sin
--    restricción" (ve todo) en vez de "sin acceso". La app nunca deja usar
--    una cuenta coordinador/entrenador/manager sin división asignada (le
--    muestra "Sin divisiones asignadas"), pero por API directa esa cuenta
--    veía todo. 0 cuentas reales afectadas hoy (verificado), pero quedaba
--    de trampa para la próxima cuenta creada sin elegir división.
-- 3. noticias_update_buffet_own: el WITH CHECK no revalidaba autor_id =
--    auth.uid() — una cuenta Buffet podía reasignarle la autoría de su
--    propia promo a otro perfil. Bug propio de la migración de Buffet del
--    mismo día (20260910000002).

-- ─── 1. push_tokens ─────────────────────────────────────────────────────────

drop policy "push_tokens_delete_own" on push_tokens;
create policy "push_tokens_delete_own" on push_tokens
  for delete to authenticated
  using (usuario_id = auth.uid());

drop policy "push_tokens_update_own" on push_tokens;
create policy "push_tokens_update_own" on push_tokens
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ─── 2. tiene_acceso_division — NULL ya no es "acceso a todo" ─────────────────

create or replace function tiene_acceso_division(p_division_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select coalesce(p_division_id = any(divisiones), false)
  from profiles
  where id = auth.uid()
$$;

-- ─── 3. noticias_update_buffet_own — revalidar autor_id en el WITH CHECK ──────

drop policy "noticias_update_buffet_own" on noticias;
create policy "noticias_update_buffet_own" on noticias
  for update to authenticated
  using ((select get_rol()) = 'buffet' and autor_id = auth.uid())
  with check (
    autor_id = auth.uid()
    and audiencia = 'todos'
    and coalesce(array_length(etiquetas, 1), 0) = 0
  );
