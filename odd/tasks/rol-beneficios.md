# Feature: rol-beneficios

## Objective
A new web-only role `beneficios` whose holders manage the benefits club (`beneficios` table, PR #58) from a new section of the web panel. Holders: Karina Ali and Patricia Perrotta (both are socias; they keep `socio`). Both see the same panel and can do the same things.

## Problem
Today only admin can write benefits, from the Supabase dashboard. The people in charge of loading them have no tool.

## Why
Benefits are a separate area of the club: they have nothing to do with Subcomisión, and Secretaría does not load them (Agus, 2026-11-04 / 2026-11-06). A dedicated role keeps them away from users, events, reports and member data.

## Scope
- DB: role `beneficios` allowed in `profiles.rol` / `profiles.roles`; RLS on `beneficios` (select all, insert, update, delete) and on the `beneficios` bucket for holders of the role (membership in `roles[]`, not the active `rol`). Only admin can grant it (subcomisión's guard already excludes it).
- Edge Function `admin-usuarios` / `_shared/permisos-usuarios.ts`: admin can assign `beneficios`; subcomisión cannot. Assigning a web-only role must not change the user's active `rol`.
- Web: login routes `beneficios` to `/beneficios`; new `(beneficios)` panel with one section to list, create, edit, pause/activate and delete benefits (all table fields, rubro select, logo + photo upload); Usuarios page lets admin assign it with a label.
- Mobile: `beneficios` is web-only. A user whose active `rol` is web-only is normalized to `socio` on app open/login (and `profiles.rol` written back, so RLS and the carnet QR work); web-only roles never appear in the role picker.

## Constraints
- Migration to production, Edge Function deploy, OTA and role assignment only with Agus's OK.
- Order matters: the mobile normalization must be live (OTA) BEFORE assigning the role to Karina and Patricia, or their app sends them to login / loses the carnet.
- Never give benefits permissions to subcomisión or secretaría.

## Tasks
- [x] T1 — DB migration `rol_beneficios` + test fixtures + `permisos-usuarios` (admin-only) + `admin-usuarios` keeps active rol for web-only roles. Route: delegated (writer trigger).
- [x] T2 — Web panel `(beneficios)` + login + PanelShell + Usuarios labels. Route: delegated (writer trigger).
- [ ] T3 — Mobile web-only role normalization (pure helper + check, applied at profile load and logins, write back `rol = 'socio'`). Route: delegated (writer trigger).
- [ ] T4 — Deploy: backup, `db push`, deploy `admin-usuarios`, merge (Vercel), OTA, then assign `beneficios` to Karina Ali (`f4ac10a6-3201-4e83-b386-38b7d1700049`) and Patricia Perrotta (`038af87b-81f0-47ba-a2b8-caf046869204`). Needs Agus's OK.

## Acceptance criteria
- A `beneficios` user logs into `uncasapp.com` and lands on the Beneficios panel; can create, edit, pause and delete benefits with images; sees no other section.
- The same user opening the mobile app acts as socio (carnet QR, cuotas, noticias) with no role picker entry for beneficios.
- Subcomisión cannot grant or remove `beneficios`; socios cannot write benefits.

## Checks
- `npx tsc --noEmit` in `app/` and `web/`; `npm run -s test:admin` (app); new check cases; web build if feasible; SQL test fixtures updated.

## Progress / evidence
- Delivery strategy: single-pr (forecast ~700 authored lines, one cohesive feature, work-unit commits per task).
- Exploration (delegated mapper): roles constrained by `profiles_rol_check` / `profiles_roles_check` (latest list in `20261105000000_rol_colaborador.sql`); `get_rol()` = `profiles.rol`; web login and `admin-usuarios` assign-role overwrite `profiles.rol`; mobile sends unknown roles to login (`guardRaiz.ts`) and `SobreScreen` would crash on a role without label.

- T1 (delegated writer + parent inline admin storage SELECT) — migration `20261111000000_rol_beneficios.sql` (NOT applied): role checks + `beneficios`; policies `beneficios_{select,insert,update,delete}_rol_beneficios`; storage `beneficios_storage_{select,insert,update,delete}_rol_beneficios` + `beneficios_storage_select_admin` (Postgres RLS: UPDATE/DELETE only reach rows that pass a SELECT policy, so without it storage writes affect 0 rows). `permisos-usuarios.ts`: `beneficios` admin-only, `ROLES_SOLO_WEB` / `esRolSoloWeb`, pure `rolesTrasAsignar` (web-only role keeps the active `rol`); `admin-usuarios` assign-role uses it, `create` rejects web-only roles (400: assigned to an existing socio). `rol_colaborador.sql` fixture intentionally untouched (pre-colaborador state). RED → GREEN `permisos-usuarios.check.ts` 17 casos ok (re-run by parent); `guard_roles_subcomision.sql` and `rol_colaborador.sql` "TODOS LOS CASOS OK" on a disposable postgres:17; scratch test of both beneficios migrations ok. `admin-usuarios/index.ts` not type-checked (no Deno).

- T1 native review: medium; consent granted by Agus; review-reliability → approved, acknowledged (lineage review-9b5fbf43762a674f). Accepted design change from its WARNING: one account has a single active `rol`, so RLS keyed on `get_rol() = 'beneficios'` breaks the web panel whenever the holder uses the mobile app (which keeps/normalizes `rol = 'socio'`). Now: policies check MEMBERSHIP with `tiene_rol_beneficios()` (SECURITY DEFINER, `activo` and `'beneficios' = ANY(roles)`); the web login does NOT overwrite `rol` for web-only roles and the beneficios panel guard checks `roles[]`. Consequence for T3: holders stay on `rol = 'socio'`; mobile only needs to hide web-only roles from the picker and normalize a stray `rol = 'beneficios'` (defensive). Committed SQL scenario test `supabase/tests/rol_beneficios.sql` requested by the review (delegated writer): 8 cases (holder with rol socio and with rol beneficios, inactive holder, plain socio, subcomisión/secretaría, admin, storage incl. admin SELECT fix, CHECKs) → "TODOS LOS CASOS OK" on a disposable postgres:17. Other follow-up: a check for the `create` 400 on web-only roles.

- T2 (delegated writer, informed mid-task of the membership design) — commit d930f6f. `web/app/(beneficios)` panel: list (destacado → orden → nombre, badges Activo/Pausado/Vencido/Programado, visible-today count), Modal form with all fields and validation, logo/foto upload via `prepararImagen` + bucket limits check to `{id}/logo-{ts}` / `{id}/foto-{ts}`, PAUSAR/ACTIVAR, ELIMINAR with Modal confirm; writes check affected rows. `decidirSesion` gained `rolesPorMembresia` (beneficios panel = admin by rol, or beneficios by `roles[]`); login routes beneficios last and does not write `profiles.rol` for it; Usuarios: admin-only, assign adds the role (no divisions), EDITAR ROL and NUEVO USUARIO do not offer it. Copies with sync comments: `RUBROS` (`web/lib/beneficios.ts`) and `ROLES_SOLO_WEB` (`web/lib/rolesStaff.ts`). RED → GREEN: beneficios 15, rolesStaff 12, sesionPanel 16 casos ok; `npx tsc --noEmit` (web) clean (re-run by parent); `next build` ok with placeholder Supabase env vars (fails without them on an unrelated page).

## Next step
T3 (mobile).
