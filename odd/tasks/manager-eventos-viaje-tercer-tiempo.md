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
