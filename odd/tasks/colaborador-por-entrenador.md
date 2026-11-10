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
  - Review (RDD, medium, lens reliability, lineage `review-a813718a0e4c755d`): consent granted, **approved and acknowledged** for `a9bde56`. Non-blocking findings: WARNING lost update on concurrent writes (`index.ts:213-219`), WARNING `null` JSON body → 500 (`index.ts:47-55`); SUGGESTIONS handler untested, `listar` filters only `roles[]`, padrón read error swallowed. The two warnings → T1b.
- [x] T1b — Follow-up of the T1 review: reject non-object bodies with 400; conditional update in `asignar`/`quitar` (match the read `roles`, `rol` and `divisiones`, 409 "El perfil cambió, volvé a intentar" when 0 rows) so concurrent writes are not lost. Route: same writer as T2, own commit.
- [x] T2 — Subcomisión loses colaborador. `_shared/permisos-usuarios.ts` (+ check), new migration recreating `guard_profile_role_update` without `colaborador` in `v_gestionables` (+ `supabase/tests/guard_roles_subcomision.sql`), app `UsuariosScreen.tsx` / `useUsuarios.ts`, web `usuarios/page.tsx` / `rolesStaff.check.ts`. Admin keeps it. Route: delegated writer.
- [x] T3 — Entrenador app screen "Colaboradores": hidden route `(entrenador)/colaboradores` opened from Inicio (diario); per division list, search + add, remove with confirmation. Route: delegated writer.
- [x] T4 — Docs: CLAUDE.md roles/colaborador line, this document's evidence. Route: same delegated writer as T3.

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

Strategy `ask-on-risk`. Forecast: ~1000 authored lines over T1–T3. T1 alone is 608 lines (it crosses the ~400 budget by itself: rules + 21-case check). User chose (2026-11-10) chain strategy **`stacked-to-main`**:

- PR1 `feat/colaborador-por-entrenador` → `main`: T1 (`a9bde56`) + T1b.
- PR2 `feat/colaborador-sin-subco` (based on PR1) → T2.
- PR3 `feat/colaborador-pantalla-entrenador` (based on PR2) → T3 + T4.

## Progress

- T1 (delegated writer, trigger: 3 non-trivial new files). Files: `supabase/functions/colaboradores/index.ts`, `supabase/functions/_shared/colaboradores.ts`, `supabase/functions/_shared/colaboradores.check.ts`. No `supabase/config.toml` entry: no other function has one (default JWT verification applies).
  - RED: `colaboradores.check.ts` failed with module not found before the module existed. GREEN: `npx --yes tsx supabase/functions/_shared/colaboradores.check.ts` → 21 casos OK; `permisos-usuarios.check.ts` → 17 casos ok; `npx --yes deno check supabase/functions/colaboradores/index.ts` → exit 0 (deno via npm, not installed globally).
  - Assumptions taken: name search reuses the RPC `buscar_socios_por_nombre` through service_role, so it matches `profiles.nombre` (not `nombre_padron`) and returns at most 10 rows (under the 20 cap); DNI search is exact on `socios.dni`. The target must have a `socios` row; a `cliente_gimnasio` without `socio` is not eligible. Unknown birth date is not refused by age. `asignar` always adds `socio` to `roles[]` (same as `rolesTrasAsignar`); an idempotent `asignar` writes nothing and keeps the active role. `quitar` also refuses (403) a target with entrenador/coordinador/manager/subcomisión/admin, because removing the shared division would cut that role's access. Concurrent edits to the same profile are last-write-wins, same as `admin-usuarios`.
- T1b (delegated writer, same as T2). Files: `supabase/functions/colaboradores/index.ts`, `supabase/functions/_shared/colaboradores.ts`, `supabase/functions/_shared/colaboradores.check.ts`.
  - Body: `esCuerpoValido()` rejects `null`, arrays and primitives with 400 `Body inválido`. RED: `colaboradores.check.ts` → `TypeError: esCuerpoValido is not a function`. GREEN: 22 casos OK.
  - Concurrency: `asignar`/`quitar` now write with `.eq('id').eq('updated_at', <read value>).select('id')`; 0 rows → 409 `El perfil cambió mientras lo editabas. Volvé a intentar.` `profiles.updated_at` is bumped by the `profiles_updated_at` trigger (`20260506000000_init_schema.sql`) on every UPDATE, so it works as an optimistic-lock version (simpler and safer than PostgREST equality on `uuid[]`/`text[]`). Not covered by an automated test (handler has no runner); `deno check` → exit 0.
- T2 (delegated writer, branch `feat/colaborador-sin-subco`). Files: `supabase/functions/_shared/permisos-usuarios.ts` (+ `.check.ts`), new `supabase/migrations/20261112000000_colaborador_fuera_de_subco.sql` (recreates `guard_profile_role_update` from `20261109000000`, the latest definition; `20261111000000` did not redefine it), `supabase/tests/guard_roles_subcomision.sql`, `app/components/shared/UsuariosScreen.tsx`, `web/app/(subcomision)/usuarios/page.tsx`, `web/lib/rolesStaff.check.ts`. `useUsuarios.ts` and `rolesStaff.ts` needed no change (the label stays; `reemplazarRolStaff` already keeps roles it does not replace).
  - `permisos-usuarios.check.ts`: RED `AssertionError ... !ROLES_POR_CALLER.subcomision.includes('colaborador')`; GREEN 18 casos ok (subco cannot assign or manage a colaborador account, admin can, subco "quitar staff" keeps colaborador).
  - `guard_roles_subcomision.sql` on `postgres:17`: GREEN `TODOS LOS CASOS OK`; `-v sin_colaborador=1` (only `20261109000000`) → RED `FALLARON 3 casos` (the three subco colaborador refusals); `-v sin_migracion=1` → RED `FALLARON 16 casos`.
  - `web/lib/rolesStaff.check.ts` → 14 casos ok (2 new characterization cases: subco EDITAR ROL keeps `colaborador` in `roles[]` and as active rol; no RED, existing behavior).
  - `deno check` `colaboradores` → exit 0; `admin-usuarios` → 2 pre-existing errors in the unchanged `index.ts` (`EdgeRuntime` global, `socio.profiles` join cast at :198).
  - `npx tsc --noEmit` in `app/` and `web/`: not run (no `node_modules` in the worktree).
  - Side effect: subcomisión no longer lists (web) nor deactivates/reactivates/reads the mail of (`admin-usuarios`) an account whose only staff role is `colaborador`; the app list still shows it, but those actions now answer 403.
    - User, 2026-11-10: no colaborador account was ever created by Subcomisión, so nothing breaks; entrenador-designated colaboradores are socios (`socio` + `colaborador`), which Subcomisión did not manage anyway. No change needed.
  - Parent spot check: `permisos-usuarios.check.ts` → 18 casos ok.
- RDD assessments after T1's review (base = last reviewed boundary `a9bde56`): T1b (`3a7841e`) medium, 84 lines, `under_budget`; T1b+T2 (`d7d8346`) medium, 296 lines, `under_budget` → pending in the slice until T3.
- T3 (delegated writer, trigger: 2+ non-trivial files; branch `feat/colaborador-pantalla-entrenador`, commit `9b13f60`). Files: `app/lib/colaboradores.ts` (+ `.check.ts`, added to `test:admin`), `app/hooks/useColaboradores.ts`, `app/app/(entrenador)/colaboradores.tsx` (hidden route, `href: null`), `app/app/(entrenador)/_layout.tsx`, `app/app/(entrenador)/diario.tsx` (atajo COLABORADORES in ATAJOS RÁPIDOS).
  - Screen: division chips (only with 2+ divisions, same pattern as Asistencia), current colaboradores of the division with QUITAR (confirmation via `Alert.alert`, like the other destructive actions), AGREGAR COLABORADOR search (name or DNI, 400 ms debounce, stale responses discarded) with DESIGNAR, `motivo` for non-eligible results, COLABORADOR tag when already designated. Load and search errors use `ErrorCarga` + REINTENTAR; action errors show the server message via `mensajeErrorFunction` (includes the 409 concurrency message). "‹" goes back to Inicio; Android Back goes to the first tab (Tabs default).
  - The client repeats the server's search rules (≥3 characters, digits-only = DNI) so it does not call the function with 1–2 letters; a comment in `app/lib/colaboradores.ts` says to keep both in sync.
  - RED: `npx --yes tsx app/lib/colaboradores.check.ts` → `ERR_MODULE_NOT_FOUND` (module missing). GREEN: 11 casos OK. `perfilAvatar.check.ts` → 12 casos OK; `guardRaiz.check.ts` → 16 casos ok.
  - `npx tsc --noEmit` in `app/` (junction to the main checkout's `node_modules`, removed afterwards) → exit 0, no errors.
  - Size: ~706 authored lines (screen 302 + hook 214 + lib/check 184), over the ~400 heuristic because screen, hook and check are one coherent behavior; not split.
  - Not verified on a device (no runner for screens/hooks).
- T4 (same writer). `CLAUDE.md`: Colaborador row (designated by the entrenador from Inicio › Colaboradores among socios with an account; Subcomisión no longer assigns it, Admin does) and a deploy-pending line in "Pendiente / backlog".

## Deploy (user, after merge)

backup → `supabase db push` → `supabase functions deploy colaboradores admin-usuarios` → web → OTA.
