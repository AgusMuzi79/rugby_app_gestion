# Feature: manager-eventos-viaje-tercer-tiempo

Branch: `feat/manager-eventos-viaje-tercer-tiempo`

## Objective
Move creation of `viaje` and `tercer_tiempo` financial events (`eventos_financieros`) from Subcomisión to the Manager of each division. Subcomisión keeps creating `recaudacion` (fundraising) events.

## Why
Managers run trips and third halves for their own team; Subcomisión only needs to drive club-wide fundraising.

## Scope / decisions (assumed defaults, user may override)
- Manager: INSERT viaje/tercer_tiempo only in a division they have access to (`tiene_acceso_division`), `creado_por = auth.uid()`; UPDATE (close) those rows, cannot turn them into `recaudacion`. No DELETE.
- Subcomisión: INSERT restricted to `tipo = 'recaudacion'`; SELECT/UPDATE/DELETE unchanged (oversight, close, delete).
- Coordinador policies untouched (no UI uses them).
- Mobile: subcomisión form only creates recaudación; manager gets a create/close flow for viaje/tercer tiempo in its division (`divisiones[0]`, same as other manager screens).
- Web: no changes (web panel never created these events).
- Docs: `openspec/specs/financiero/spec.md`, `.claude/context/reglas-negocio.md`, `.claude/context/estado-supabase.md`, `.claude/context/estado-expo.md`.

## Tasks
- [x] T1 Migration `20261014000000_eventos_financieros_manager.sql`: manager INSERT/UPDATE policies + subcomisión INSERT restricted to recaudación. Route: delegated writer.
- [x] T2 Mobile: `useEventos(modo)`; `EventosPantalla` shared by `(subcomision)/eventos.tsx` (recaudación only) and new hidden tab `(manager)/eventos.tsx`; entry buttons in manager diario/cobranzas; copy updates. Route: delegated writer (2+ non-trivial files).
- [x] T3 Docs: financiero spec, reglas-negocio, estado-supabase, estado-expo.

- [x] T4 Review advisories (user asked to fix them): manager UPDATE limited to closing (trigger guard: only estado activo→cerrado); useEventos error state for profile load + loading never stuck without session; SQL scenario test `supabase/tests/eventos_financieros_manager_rls.sql` (Docker, RED before GREEN). Route: delegated writer (3+ non-trivial files).
- [x] T5 Cobranzas: amount field defaults to the event's suggested amount (stored in `descripcion`) when the player has no registered amount; still editable. `app/lib/montoSugerido.ts` + `montoSugerido.check.ts` (RED: module missing → GREEN 6 cases); `useCobranzas.ts` uses it; eventos screen reuses the parser. Route: inline (small, understood).

## Follow-ups
- Apply migration to production (pending user approval; run backup first).
- Ship mobile change via OTA/build when the user decides.
- Optional: move `EventosPantalla` to `components/` (today `(manager)/eventos.tsx` imports it from `(subcomision)/eventos.tsx`).

## Checks
- `npx tsc --noEmit` in `app/`.
- No runnable SQL/RLS test harness in repo → structural review of migration (test-first exception).
- Migration NOT applied to production until the user approves.

## Progress / evidence
- `npx tsc --noEmit` (app/): only 2 pre-existing errors in `app/(secretaria)/socios.tsx:112-113` (file untouched); no errors in changed files.
- Migration structural readback by parent: OK.
- Migration NOT applied; app not shipped.
- Commit e8946c5: risk medium; native review granted → approved and acknowledged (lineage review-b62029186a81a2c4). Non-blocking advisories (later work): manager UPDATE does not restrict which columns change (could reopen or rename events); profile load error shown as "no division" in useEventos.ts:107-117; loading may stay stuck without a session (useEventos.ts:94); RLS has no automated tests.
- T4: trigger `guard_eventos_financieros_update` (manager only activo→cerrado); `errorCarga` + retry in useEventos/EventosPantalla; loading always resets. Test `supabase/tests/eventos_financieros_manager_rls.sql` (Docker postgres:17): RED 10 failing cases before trigger → GREEN 34/34 after; parent re-run GREEN. tsc: only the 2 pre-existing socios.tsx errors.
