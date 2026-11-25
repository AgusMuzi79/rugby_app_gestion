# Lector Pileta

## Objective

Add a `pileta` scanner role: a staff member at the pool entrance scans member QR cards (attended, rear camera, same UX as `canchero`) and only members with the "Pileta" service get in.

## Problem / why

The pool season is coming. Access is only for people who paid the whole season. The pool is not a NUVIX service, so Secretaría will tick a manual "Pileta" service on each member from the web panel, and the scan must reflect it.

## Scope

- New role `pileta` (label "Pileta"), mobile only, assigned only by admin (same as other scanner roles).
- `socios-qr`: when the caller role is `pileta`, deny members without an active service whose name contains "pileta" (mirror of the gym gate `tieneServicioGimnasio`); log accesses with `punto = 'pileta'`.
- Catalog: seed a "Pileta" service in `servicios_opcionales` (amount 0, assigned by hand) so the name matches the gate.
- Mobile: role constants, initial route `/(porteria)/scanner`, header title, user management lists.
- Web: user management role list (admin).

## Out of scope (decided later / pending)

- Season end date (Agus: "después vemos hasta qué fecha lo dejamos habilitado").
- Non-members who pay the pool season (pending Agus asking Secretaría how they enter: NUVIX padrón or manual sign-up).
- Filtering the web accesos panel by `punto` (it already mixes gimnasio/tenis/buffet rows).

## Constraints

- Migration timestamp `20261120000000` (the tennis branch already uses `20261112000000`).
- `importar-servicios` only touches mapped services, so a manual "Pileta" link is never overwritten.
- No production deploy, OTA or migration push without Agus's explicit go-ahead.

## Delivery

Forecast ~300 authored changed lines, single PR (`ask-on-risk`, under budget).

## Tasks

- [x] T1 — DB: migration `20261120000000_rol_pileta.sql` (CHECK constraints + "Pileta" service seed) and `supabase/tests/rol_pileta.sql`. Route: delegated (writer, 2+ non-trivial files). Commit `c4af09c`.
- [x] T2 — `socios-qr` pileta gate + access logging; `permisos-usuarios` admin can create `pileta`, with checks. Route: delegated. Commit `e063979`.
- [x] T3 — Mobile: `roles.ts`, scanner header title, `useUsuarios`, `UsuariosScreen`, `guardRaiz.check.ts`, `rolMovil.check.ts`. Route: delegated. Commit `46668c1`.
- [x] T4 — Web: users page + `rolesStaff.check.ts`. Route: delegated. Commit `e626ec7`.
- [x] T5 — Docs: `CLAUDE.md` roles table and feature note, this document. Route: delegated. Commit: the docs commit that adds this document.

Route evidence: mapping touched 4+ files (mapping trigger) and the change spans 2+ non-trivial files (writer trigger).

## Acceptance criteria

- A `pileta` user scanning a member with the "Pileta" service gets allowed; without it, denied with a clear pool message.
- Rear camera, attended copy, header "PILETA · SCANNER".
- Admin can assign the role from app and web; subcomisión cannot.
- Accesses logged with `punto = 'pileta'`.

## Checks

- `npx --yes tsx@4.20.6` on touched `*.check.ts` (permisos-usuarios, guardRaiz, rolesStaff, rolMovil).
- `supabase/tests/rol_pileta.sql` in a throwaway postgres:17 container (if Docker is available).
- `npx tsc --noEmit` in `app/` and `web/` (compare with preexisting errors).

## Progress

- 2026-11-20: exploration done, feature document created.
- 2026-11-20: T1–T5 implemented by one delegated writer.

### Decisions

- The service gate per role moved to a pure helper, `supabase/functions/socios-qr/servicio-por-rol.ts` (`servicioRequeridoPorRol`, `pasaPorCategoria`), used by `decidirIngreso` and `registrarItemOffline`. The gym gate keeps the same pattern, messages and "Cliente Gimnasio passes by category" rule; pileta does not let Cliente Gimnasio in by category.
- Pileta gets no gym turnero, no one-time TOTP consumption and no guests: `registrar-invitado` keeps `pileta` out of its ALLOWED list (the mobile scanner only shows guests for `porteria`; the endpoint itself also accepts canchero/buffet, unchanged).
- Pileta stays out of the web login (mobile-only, like canchero) and out of subcomisión's `v_gestionables`.

### Verification evidence

- `supabase/tests/rol_pileta.sql` in throwaway `postgres:17`: 14 cases ok, "TODOS LOS CASOS OK". The script also asserts the pre-migration CHECK rejects `pileta` (RED inside the script).
- `permisos-usuarios.check.ts`: RED (new pileta cases failed, `actual: false`), then GREEN: 19 cases ok.
- `socios-qr/servicio-por-rol.check.ts`: RED (module missing), then GREEN: 6 cases ok.
- `app/lib/guardRaiz.check.ts`: RED (`pileta` went to `/(auth)/login`), then GREEN: 16 cases ok.
- `app/lib/rolMovil.check.ts`: RED (`pileta` normalized to `socio`), then GREEN: 14 cases ok.
- `web/lib/rolesStaff.check.ts`: 13 cases ok. No RED: `rolesStaff.ts` is role-agnostic, the new case only documents that pileta is not web-only.
- `npx tsc --noEmit` in `app/` and `web/`: exit 0 (after `npm ci --ignore-scripts` in the worktree).
- `deno check supabase/functions/socios-qr/index.ts`: unavailable (deno not installed).

### Review

- 2026-11-23: native review (risk medium, consent granted, one lens `review-reliability`) **approved** and acknowledged (lineage `review-8d7b8608f150ed7e`, authority burned). Non-blocking findings, kept as follow-ups:
  - `R3-gate-wiring-untested`: no behavioral check of `decidirIngreso` / `registrarItemOffline` for pileta, and `deno check` was unavailable. Mitigation: test on a phone after deploy (member with and without "Pileta").
  - `R3-pileta-ilike-broad`: the gate accepts any active service whose name contains "pileta" (e.g. a future swimming class). Revisit if the catalog gets another pool service.
  - `R3-route-group-guard-unverified`: checked by hand, not a bug: `app/app/(porteria)/_layout.tsx` has no role allowlist (it only distinguishes Buffet for the promos tab).

### Deploy (2026-11-23, Agus's go-ahead)

- PR #69 merged into `main` (`8fc2788`). The only failing check was the old "Vercel – web" project (known, unrelated).
- `supabase db push`: dry-run listed only `20261120000000_rol_pileta.sql`, then applied. Verified in production: both `profiles` CHECKs contain `pileta`; `servicios_opcionales` has "Pileta" (monto 0.00, activo).
- `socios-qr` deployed (v23) and `admin-usuarios` deployed (v31), function code identical to `origin/main`. Both answer 401 without a token.
- OTA `eas update --branch production`, runtime 1.0.9, Android + iOS, group `b0c99a89-dce8-447c-a525-f8c80e560f96`, published from the worktree (same tree as `main`) with `app/.env.local` copied from the main checkout.

### T6 — Pileta from the NUVIX services import (2026-11-25)

- Secretaría now loads the pool season in NUVIX. In the 2026-11-25 `servicios_frecuencias.xls` it is the band «Socio con Temporada Abonada» (8 members: 7051, 7179, 7180, 7181, 16080, 16129, 16702, 16703; all exist in `socios`; 7051 already had "Pileta" by hand). The two imports run that morning did not add it: the concept was not mapped.
- Change: `MAPEO_CONCEPTOS['SOCIO CON TEMPORADA ABONADA'] = Pileta` (`parse-padron-servicios.ts`), so `importar-servicios` mirrors it like Gimnasio. "Pileta" is now also locked against rename/delete in Secretaría › Servicios (`web/lib/serviciosCatalogo.ts`). Copy of the import screen and the function header updated.
- Consequence: NUVIX is the source of truth for Pileta. A hand-ticked "Pileta" not present in NUVIX shows up as a removal "(cargado a mano)" in the preview. If an export has no «Temporada Abonada» band, Pileta goes to `serviciosAusentes` and its removals come unticked.
- Evidence: `parse-padron-servicios.check.ts` RED (mapping missing) → GREEN, 24 cases ok. `serviciosCatalogo.check.ts` RED (Pileta not locked) → GREEN, 5 cases ok. The repo parser run on the real file yields 8 Pileta rows, and the only unmapped concepts are the ones in `CONCEPTOS_IGNORADOS`. `tsc --noEmit` in `web/`: exit 0.
- Deploy needed: `importar-servicios` (Edge Function) + web (Vercel, on merge to `main`). No migration, no OTA.

## Next step

Deploy T6 and re-run the services import; admin creates the pileta scanner account; test on a phone with a member with and without "Pileta". Still to decide: season end date and how non-members get in.
