# Feature: manager-egresos

## Objective
Give the Manager a new bottom tab "Egresos" to record expenses of trips (`viaje`) and tercer tiempos (`tercer_tiempo`), each expense linked to its financial event.

## Problem / why
Managers asked to track what they spend on each trip / tercer tiempo. Today only income (`cobranzas`) exists; nothing models expenses. `guard_evento_financiero_update` blocks managers from editing `eventos_financieros`, so expenses need their own table.

## Scope
- New table `egresos_evento` (evento_financiero_id, concepto, monto, fecha, registrado_por, timestamps) + RLS.
- Manager: SELECT/INSERT/DELETE expenses of `viaje`/`tercer_tiempo` events it can see (created by it or touching its divisions), only while the event is `activo`. Subcomisión/admin: read-only.
- Mobile: new visible tab `egresos` in `app/app/(manager)/_layout.tsx`; screen lets the manager pick an event, list its expenses with total, balance (cobrado − egresos), add and delete an expense.
- Out of scope: receipt photos, web panel, editing expenses (delete + re-add).

## Constraints
- Migration must not be applied to production in this feature (user decides).
- UI copy in Spanish matching the existing app; code identifiers follow existing naming.

## Delivery strategy
ask-on-risk. Forecast ~350–450 authored lines.

## Tasks
- [x] T1 — Migration `egresos_evento` + RLS + SQL scenario test (route: delegated writer; trigger: 2+ non-trivial files across DB + app)
  - RED: `psql -f /work/tests/egresos_evento.sql` in postgres:17 Docker aborted at `\ir ../migrations/20261017000000_egresos_evento.sql: No such file or directory` (exit 3).
  - GREEN: same command → 25 `ok` cases, `TODOS LOS CASOS OK` (exit 0).
  - Design: helper `egreso_evento_editable_por_manager` (SECURITY DEFINER: viaje/tercer_tiempo, activo, creado_por = uid OR `evento_financiero_toca_mis_divisiones`); SELECT for manager/subcomision via parent-event RLS (subcomisión limited to its sport, same as the event); INSERT requires `registrado_por = auth.uid()`; DELETE by any manager of the active event; admin FOR ALL (repo convention); no UPDATE policy.
- [ ] T2 — Mobile hook + balance helper with `.check.ts` + Egresos tab screen + layout entry (route: delegated writer, same)

## Acceptance criteria
- Manager can add/delete expenses only on active viaje/tercer_tiempo events it can access; cannot on closed events, recaudaciones, or other sports' events.
- Subcomisión can read but not write.
- Tab shows per-event total egresos and balance.

## Checks
- `supabase/tests/egresos_evento.sql` run in throwaway postgres:17 Docker (same harness as existing tests).
- `npm run test:admin` (app/) including new `lib/balanceEvento.check.ts`.
- `npx tsc --noEmit` in app/.

## Progress
- Branch `feat/manager-egresos` created from origin/main.

## Next step
Delegate T1+T2 to one writer.
