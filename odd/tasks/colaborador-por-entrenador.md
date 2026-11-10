# Colaborador designated by the entrenador

Branch: `feat/colaborador-por-entrenador` (from `main` at `d90bdc7`).

## Objective

The entrenador, not Subcomisión, designates the colaboradores of their divisions. Today Subcomisión/Admin create the colaborador from Usuarios (`admin-usuarios` assign-role) and set `profiles.divisiones`.

## Decisions

- User, 2026-11-10: the entrenador picks an EXISTING user (a socio who already has an app account) and gives them role `colaborador` on one of the entrenador's own divisions. They can remove it later. No account creation.
- User, 2026-11-10: Subcomisión stops assigning colaborador. Assumption: Admin keeps it (superuser).
- Assumptions (parent, to confirm with the user):
  - The candidate must be an active socio profile, at least 13 years old, whose roles are only `socio` / `colaborador` (and other roles that do not use `profiles.divisiones`). Someone who is already entrenador/coordinador/manager is refused, because `profiles.divisiones` is shared by every role and the colaborador division would also grant entrenador access.
  - Designating behaves like today's assign-role: `colaborador` is added to `roles[]`, the division is merged into `divisiones`, and the active `rol` switches to `colaborador` (the person can switch back to socio in Mi perfil).
  - Removing takes only that division out of `divisiones`. When no colaborador division is left, `colaborador` leaves `roles[]`, and if it was the active role the active role falls back to `socio` (or the first remaining role).
  - The search returns only what the entrenador needs to pick the person (profile id, padrón name, whether already colaborador there), at most 20 rows, by name or DNI.

## Why server-side

`get_rol()` reads the active role only, the guard `guard_profile_role_update` (`20261109000000`) blocks every non-admin/non-subcomisión JWT from changing roles/divisiones, and socios are readable only by secretaría/subcomisión/admin. So the entrenador's flow goes through a new Edge Function with service_role that checks: caller active rol `entrenador`, division in the caller's `divisiones`.

## Tasks

- [x] T1 — Backend. New Edge Function `colaboradores` (actions `listar`, `buscar`, `asignar`, `quitar`), pure rules in `supabase/functions/_shared/colaboradores.ts` + `colaboradores.check.ts`. Route: delegated writer (2+ non-trivial files).
- [ ] T2 — Subcomisión loses colaborador. `_shared/permisos-usuarios.ts` (+ check), new migration recreating `guard_profile_role_update` without `colaborador` in `v_gestionables` (+ `supabase/tests/guard_roles_subcomision.sql`), app `UsuariosScreen.tsx` / `useUsuarios.ts`, web `usuarios/page.tsx` / `rolesStaff.check.ts`. Admin keeps it. Route: delegated writer.
- [ ] T3 — Entrenador app screen "Colaboradores": hidden route `(entrenador)/colaboradores` opened from Inicio (diario); per division list, search + add, remove with confirmation. Route: delegated writer.
- [ ] T4 — Docs: CLAUDE.md roles/colaborador line, this document's evidence.

## Acceptance criteria

- An entrenador can search a socio, designate them colaborador on one of their divisions, see them listed, and remove them.
- An entrenador cannot designate on a division that is not theirs, nor touch a profile that has entrenador/coordinador/manager/admin/subcomisión roles.
- Subcomisión can no longer give or remove `colaborador` (app, web, Edge Function, DB guard). Admin can.
- `recordatorio-eventos` keeps reaching the colaborador (it uses `roles` membership + `divisiones`).

## Checks

- `npx --yes tsx supabase/functions/_shared/colaboradores.check.ts`, `.../permisos-usuarios.check.ts`, `web/lib/rolesStaff.check.ts`.
- `supabase/tests/guard_roles_subcomision.sql` on a throwaway `postgres:17` container (header of the file).
- `npx tsc --noEmit` in `app/` and `web/`.

## Delivery

Strategy `ask-on-risk`. Forecast: ~600–800 authored lines over T1–T3, so a chain may be needed (ask before the commit that crosses ~400).

## Progress

- T1 (delegated writer, trigger: 3 non-trivial new files). Files: `supabase/functions/colaboradores/index.ts`, `supabase/functions/_shared/colaboradores.ts`, `supabase/functions/_shared/colaboradores.check.ts`. No `supabase/config.toml` entry: no other function has one (default JWT verification applies).
  - RED: `colaboradores.check.ts` failed with module not found before the module existed. GREEN: `npx --yes tsx supabase/functions/_shared/colaboradores.check.ts` → 21 casos OK; `permisos-usuarios.check.ts` → 17 casos ok; `npx --yes deno check supabase/functions/colaboradores/index.ts` → exit 0 (deno via npm, not installed globally).
  - Assumptions taken: name search reuses the RPC `buscar_socios_por_nombre` through service_role, so it matches `profiles.nombre` (not `nombre_padron`) and returns at most 10 rows (under the 20 cap); DNI search is exact on `socios.dni`. The target must have a `socios` row; a `cliente_gimnasio` without `socio` is not eligible. Unknown birth date is not refused by age. `asignar` always adds `socio` to `roles[]` (same as `rolesTrasAsignar`); an idempotent `asignar` writes nothing and keeps the active role. `quitar` also refuses (403) a target with entrenador/coordinador/manager/subcomisión/admin, because removing the shared division would cut that role's access. Concurrent edits to the same profile are last-write-wins, same as `admin-usuarios`.

## Deploy (user, after merge)

backup → `supabase db push` → `supabase functions deploy colaboradores admin-usuarios` → web → OTA.
