-- Migration: 20260617000000_profiles_secretaria_select
-- Secretaría necesita leer profiles de todos los socios para mostrar nombre en su panel.
-- Sin esta policy el join profiles!socios_profile_id_fkey devuelve null (RLS bloquea).

create policy "profiles_select_secretaria"
  on profiles for select to authenticated
  using ((select get_rol()) in ('secretaria', 'porteria'));
