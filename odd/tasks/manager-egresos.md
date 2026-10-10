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
  - Commit: `2dfa335 feat(db): add egresos_evento table with manager RLS`.
- [x] T2 — Mobile hook + balance helper with `.check.ts` + Egresos tab screen + layout entry (route: delegated writer, same)
  - RED: `npm run test:admin` failed with `Cannot find module './balanceEvento'` after adding `lib/balanceEvento.check.ts` to the script.
  - GREEN: `npm run test:admin` → comunicadosAdmin + sistemaAdmin + balanceEvento (15 cases) all `ok`, exit 0.
  - `npx tsc --noEmit` (app/) → exit 0, no output.
  - `lib/balanceEvento.ts`: `balanceEvento` (only `pagado` cobranzas, cents rounding, numeric-as-string tolerant), `parseFechaEgreso` (DD/MM/AAAA or ISO), `validarEgreso` (reuses `montoSugeridoDe` local-format parsing).
  - `hooks/useEgresos.ts`: lists visible viaje/tercer_tiempo events (active first), keeps the selection on refresh, loads egresos + paid cobranzas, add/delete with errors surfaced; delete uses `.select('id')` to detect RLS 0-row deletes. Accesses `egresos_evento` through an untyped client cast because `lib/database.types.ts` has no entry yet (regenerate types after applying the migration).
  - Screen `app/(manager)/egresos.tsx` + visible tab `egresos` (Feather `trending-down`) after Cobranzas; delete confirmed with `Alert.alert` (same as Secretaría noticias); form hidden with an info banner when the event is cerrado.
  - Note: "Cobrado" is what the manager can read under cobranzas RLS (players of its own divisions), same as Cobranzas.

  - Commit: `2e33dd2 feat(manager): add egresos tab per financial event`.
- [x] T3 — Fix T2 open points: whole-event balance, subcomisión sees all egresos, hand-written DB types, DatePickerField (route: delegated writer; trigger: 2+ non-trivial files across DB + app)
  - New migration `20261018000000_egresos_evento_resumen.sql` (20261017 left untouched): SELECT policy → subcomisión reads all egresos (any sport), manager keeps per-event visibility; RPC `resumen_egresos_evento(p_evento_id)` SECURITY DEFINER, `search_path = public`, returns `total_cobrado` (paid cobranzas of ALL divisions) + `total_egresos`, zero rows unless admin/subcomisión or a manager who created the event / it is global / it touches their divisions. Cobranzas RLS not widened. EXECUTE revoked from PUBLIC/anon.
  - RED: `psql -f /work/tests/egresos_evento_resumen.sql` (postgres:17 Docker) aborted at missing `20261018000000_egresos_evento_resumen.sql` (exit 3).
  - GREEN: same command → 15 `ok`, `TODOS LOS CASOS OK` (exit 0). Regression: `egresos_evento.sql` still 25 `ok`, exit 0.
  - App RED: `npx tsx lib/balanceEvento.check.ts` → `balanceDesdeResumen is not a function` (exit 1). GREEN: 18 cases ok; `npm run test:admin` exit 0 (31 `ok` lines); `npx tsc --noEmit` exit 0.
  - `lib/database.types.ts`: `egresos_evento` Row/Insert/Update/Relationships + functions `egreso_evento_editable_por_manager`, `resumen_egresos_evento`; untyped client cast removed from `useEgresos`.
  - Summary card now uses the RPC via `balanceDesdeResumen`; date input replaced by `components/ui/DatePickerField` (ISO value, max today); `fechaHoyEgreso` now returns ISO.

  - Commit: `8c8f832 fix(manager): whole-event egresos balance and subcomision visibility`.
- [x] T4 — DB: scope Subcomisión to its own recaudación events with cobros and egresos (user decision 2026-10-10; route: delegated writer; trigger: migration + test + types/app files)
  - New migration `20261019000000_subcomision_eventos_propios.sql` (earlier migrations untouched). Subco sport = `profiles.deporte` via `tiene_acceso_deporte` (subco profiles have no `divisiones`, so `deportes_del_usuario()` does not apply to them).
  - Helpers (SECURITY DEFINER, `search_path = public`, EXECUTE only for authenticated): `evento_financiero_visible_subcomision` (recaudación created by the subco, or with a division of its sport, or global created by someone of its sport), `cobranza_permitida_subcomision` (visible event + jugador of the event and of its sport; writes require `activo`), `egreso_evento_editable_por_subcomision`.
  - Policies replaced: eventos_financieros subco SELECT/UPDATE/DELETE; cobranzas subco SELECT/DELETE (+ new INSERT with `registrado_por = auth.uid()`, UPDATE); egresos_evento SELECT (subco limited to its events, reverts 20261018's read-all) + subco INSERT/DELETE. `resumen_egresos_evento`: subco only its events, and only cobranzas of its sport. Manager/admin/coordinador policies unchanged.
  - RED: `psql -f /work/tests/subcomision_eventos_propios.sql` aborted at missing `20261019000000_subcomision_eventos_propios.sql` (exit 3).
  - GREEN (postgres:17 Docker): `subcomision_eventos_propios.sql` 39 ok; regressions `egresos_evento.sql` 25 ok, `egresos_evento_resumen.sql` 15 ok, `eventos_financieros_manager_rls.sql` 29 ok, `eventos_financieros_multi_division.sql` 51 ok — all `TODOS LOS CASOS OK`, exit 0. Older tests load only their own migrations; `egresos_evento_resumen.sql`'s "subco hockey sees rugby egresos" is superseded by 20261019.
  - Impact on other subco readers (not edited): web `informes/page.tsx` and `dashboard/page.tsx`, mobile `useDashboard`, `useInformes`, `useDiarioSubcomision` now only see the subco's own recaudaciones and their cobranzas (no manager viajes/tercer tiempos, no other sport). Admin unaffected.

  - Commit: `29f9943 feat(db): scope subcomision to its own recaudacion events with cobros and egresos`.
- [x] T5 — Mobile: Subcomisión "Eventos" tab with Cobros | Egresos by division (route: delegated writer; trigger: 2+ non-trivial files)
  - `app/(subcomision)/_layout.tsx`: `eventos` visible (title "Eventos", Feather `dollar-sign`). List/creation unchanged (RLS now returns only its recaudaciones); closed events also open (read-only).
  - `components/eventos/DetalleRecaudacion.tsx`: summary Cobrado / Egresos / Neto (RPC), switch COBROS | EGRESOS, close button while active. The old detail's "Pedidos" section is not shown for Subcomisión (nothing in app/web creates `pedidos`).
  - `components/eventos/CobrosPanel.tsx` + `hooks/useCobrosSubcomision.ts`: players of the event divisions (all visible players if global) grouped by division with per-division paid/total and amount; modal marks pagado (monto prefilled with the suggested amount, forma de pago) or pendiente via upsert; refreshes the summary after saving.
  - Egresos shared: `useEgresos` split into `useEgresosEvento(evento)` (per event, used by both roles) + manager `useEgresos()`; UI extracted to `components/eventos/EgresosPanel.tsx`, `ResumenBalance.tsx`, `estilo.ts`; manager `egresos.tsx` now uses them.
  - Pure logic `lib/cobrosPorDivision.ts` + `.check.ts` (added to `test:admin`). RED: `npx tsx lib/cobrosPorDivision.check.ts` → `Cannot find module './cobrosPorDivision'`. GREEN: 7 cases ok.
  - `lib/database.types.ts`: added `cobranza_permitida_subcomision`, `egreso_evento_editable_por_subcomision`, `evento_financiero_visible_subcomision`.
  - `npm run test:admin` exit 0 (38 `ok` lines); `npx tsc --noEmit` exit 0.

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
Parent: review/assess the two work-unit commits. Pending user decisions: apply migrations `20261017000000` + `20261018000000` + `20261019000000` to production (together, in order), then OTA. Web subcomisión informes/dashboard will show only its own recaudaciones once 20261019 is applied.

## Production
- 2026-10-10: backup OK at `~/backups-uncas/2026-10-10-22-54-26`; `supabase migration list` showed only 20261017000000, 20261018000000, 20261019000000 pending; user ran `supabase db push` (auto mode blocked the agent), all three applied; remote `migration list` confirms them.
- Pending: device test, merge PR #19, OTA from the main checkout.
