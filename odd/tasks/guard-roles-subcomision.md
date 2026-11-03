# Guard de roles: subcomisión no puede escalar a admin

Locator: `odd/tasks/guard-roles-subcomision.md` · Engram mirror: `odd/guard-roles-subcomision/tasks` · Branch: `fix/guard-roles-subcomision`

## Objective

Make the database enforce the same role rules for subcomisión that the `admin-usuarios` Edge Function already enforces (`supabase/functions/_shared/permisos-usuarios.ts`).

## Problem

`guard_profile_role_update()` was last defined in `supabase/migrations/20260914000000_subcomision_deporte.sql:55-108`. When the caller's `get_rol()` is `subcomision`, it only blocks `deporte` changes and returns NEW, so a subcomisión user can write any value into `profiles.roles` and `profiles.rol`:

- They can add `admin` to their own profile (self-escalation) or to anyone else's.
- They can strip `admin` from the real admin.
- They can add or remove non-staff roles (`secretaria`, `porteria`, `socio`…).
- They can deactivate an admin account.

The app goes through `admin-usuarios` (service role, exempt from the guard), which validates this correctly. The web panel writes `roles`/`rol`/`activo`/`divisiones` directly with `supabase.from('profiles').update(...)` (`web/app/(subcomision)/usuarios/page.tsx:177-191`), so the database is the only boundary there. The issue was found during the UX audit (backlog item in `CLAUDE.md`).

## Scope (authorized 2026-11-03: "arrancá con el guard de roles")

When the caller is subcomisión:

- Let A = `OLD.roles ∪ {OLD.rol}` and B = `NEW.roles ∪ {NEW.rol}` (nulls ignored). Every role in the symmetric difference A Δ B must be in the roles subcomisión manages: `coordinador, entrenador, colaborador, manager, subcomision` (`ROLES_POR_CALLER.subcomision`). Changing `rol` to a role already in A (switching to the socio view, for example) is still allowed.
- If A contains `admin`, the caller cannot change `roles`, `rol` or `activo`.
- `deporte` stays blocked, as it is today.
- The admin, service_role and other-role branches are unchanged.

Out of scope: the Usuarios "saveRol silent no-op" web bug (separate backlog item); Edge Function changes.

## Constraints

- New migration `supabase/migrations/20261109000000_guard_roles_subcomision.sql`, idempotent (`create or replace`), not applied to production by the agent. Deploy steps go in this doc.
- SQL scenario test `supabase/tests/guard_roles_subcomision.sql`, same conventions as `supabase/tests/divisiones_solo_admin.sql`, on a throwaway Postgres (RED before GREEN).
- Never delete data, profiles or Auth users.

## Tasks

- [x] T1 — Migration + SQL scenario test (RED → GREEN). Route: delegated direct (writer trigger: 2 non-trivial files).
- [ ] T2 — Docs: CLAUDE.md backlog item, deploy steps here.

## Acceptance criteria

- Subcomisión gets an exception when it adds `admin` (own profile or another), removes `admin`, adds or removes a role outside the managed set, sets `rol` to a role outside A ∪ the managed set, or changes `roles`/`rol`/`activo` on an admin profile.
- Subcomisión can still swap coordinador ↔ entrenador ↔ colaborador ↔ manager ↔ subcomision on a non-admin profile, edit `divisiones`, toggle `activo` on non-admin profiles, and switch its own `rol` among roles it already has.
- Admin and service_role are unaffected; the other roles keep the existing rules.

## Checks

- `supabase/tests/guard_roles_subcomision.sql` on throwaway Postgres 17: RED on the current definition, GREEN with the migration (loaded twice).
- Existing `supabase/tests/*.sql` that load the guard still pass.

## Delivery

Strategy: ask-on-risk, single PR (forecast ~250 lines).

## Progress

- 2026-11-03: doc created; exploration done inline (3 files: the guard migration, `permisos-usuarios.ts`, web `usuarios/page.tsx`).
- T1 (delegated writer, parent spot check):
  - `20261109000000_guard_roles_subcomision.sql` replaces only the subcomisión branch of the guard with `CREATE OR REPLACE`, built from the latest body (no later migration redefines it). The trigger is unchanged.
  - The new branch keeps blocking `deporte`. It raises `No autorizado para modificar una cuenta de administrador` when the account has `admin` and the change touches roles, rol or activo. It raises `No autorizado para asignar o quitar ese rol` when A Δ B contains a role outside the managed set.
  - `supabase/tests/guard_roles_subcomision.sql` has 32 cases:
    - 12 subco blocked;
    - 10 subco allowed, including the shapes `reemplazarRolStaff` produces, divisiones, deactivate/reactivate, and switching its own view to socio;
    - 3 admin, 1 service_role, 4 other roles.
  - It carries a verbatim copy of the old guard for RED (`-v sin_migracion=1`) and loads the migration twice.
  - RED (old guard): exit 3, `FALLARON 11 casos`, all subco-blocked cases, including self-escalation to admin.
  - GREEN: exit 0, `TODOS LOS CASOS OK`.
  - Parent re-ran both on a throwaway `postgres:17` with the same results.
  - No earlier test in `supabase/tests/` loads this guard.
  - Accepted limits, as scoped:
    - On an admin profile, subco can still edit columns other than roles/rol/activo (divisiones, nombre).
    - Subco can still drop its own staff roles.
    - The Edge Function is stricter on both points (no action on admin accounts or on one's own account).

## Deploy (user)

Pending T1.

## Next step

T1.
