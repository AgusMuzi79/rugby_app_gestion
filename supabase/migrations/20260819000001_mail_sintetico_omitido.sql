-- Flag self-service: el socio con mail sintético puede elegir "ahora no"
-- en la pantalla de registro de mail (app/(auth)/registrar-mail.tsx) y no
-- se le vuelve a mostrar. Sigue pudiendo registrar su mail real después
-- desde "Mi Perfil" en cualquier momento.
--
-- No hace falta tocar guard_profile_role_update (20260731000000): esa
-- función sólo bloquea roles/divisiones/activo/rol — cualquier otra
-- columna de profiles, incluida esta, ya es editable por el propio dueño
-- vía profiles_update_own (mismo patrón que el switch de rol multi-rol en
-- SobreScreen.tsx).

alter table profiles
  add column if not exists mail_sintetico_omitido boolean not null default false;
