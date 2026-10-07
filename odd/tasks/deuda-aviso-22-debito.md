# Feature: deuda-aviso-22-debito

Locator: `odd/tasks/deuda-aviso-22-debito.md` (branch `feat/deuda-aviso-22-debito`, worktree `.claude/worktrees/import-servicios-panel`)
Engram mirror: `odd/deuda-aviso-22-debito/tasks`

## Objective

The debt reminder push reaches only socios who really owe, and socios with automatic debit do not look in debt before their debit is charged.

## Problem / why (observed 2026-10-07)

- The push is sent on every debt import. Secretaría imported the NUVIX report on 07/10, the October cuota due date: 119 of 122 notified socios owed only October, 98 of them pay by automatic debit (not charged yet; October debit date is 15/10).
- `importar-deuda` resolves socios with one unpaginated `.in('numero_socio', …)` query capped at 1000 rows: on 07/10 only 1000 of 1305 report codes matched; 68 active socios with real overdue debt show verde and got no reminder.

## Decisions

- Reminder moves to a monthly job on **day 22** (Secretaría's idea, user-approved 2026-10-07): by then the automatic debit was charged, so whoever still owes did not pay manually or the debit failed.
- Freshness guard: the day-22 send is skipped if the latest `importaciones_deuda.fecha_corte` is more than 2 days old; the skip is recorded and shown in the panel. Better no reminder than a wrong one.
- Debt import no longer sends pushes; it only recomputes the semáforo.
- Automatic-debit socios (`socios.cobro_con_tarjeta = true`): when the import's `fecha_corte` day is < 22, their comprobantes of concept `cuota` for the current period (`periodo = to_char(fecha_corte, 'YYYY-MM')`) with `vencido > 0` are reclassified as `a_vencer` (vencido moved to a_vencer) and their `vencimiento` set to that month's date in `fechas_debito_automatico` (fallback: day 22 of that month). Server-only: the mobile app already renders `a_vencer` under "PRÓXIMOS VENCIMIENTOS — Vence el …", and the semáforo stays verde. No mobile build needed.
- Day 22 is a business constant (all loaded debit dates are ≤ 17).
- Reminder recipients and text unchanged (amarillo + rojo; minors attributed to the titular via `cabecera_id`; "Cuotas pendientes / Tenés N período(s) pendiente(s) por $X"). The 15-day cadence is dropped (monthly job); `recordatorio_deuda_enviado_at` keeps being stamped.

## Tasks

- [x] T1 — `importar-deuda`: chunk/paginate the 3 socios queries (codes lookup, deudores, titulares); remove the reminder from the import path (keep the shared reminder builder reusable). Route: delegated writer. Commit `b69a95b`.
- [x] T2 — Migration redefining `importar_deuda_nuvix`: reclassify automatic-debit current-period cuota before day 22, before computing the semáforo. Route: delegated writer. Commit `6f01646` (SQL re-read only, no DB available).
- [x] T3 — New Edge Function `recordatorio-deuda` (x-cron-secret, day-22 send, freshness guard, paginated, log table `recordatorios_deuda_envios`) + migration for the log table + cron SQL documented (registered by hand). Route: delegated writer. Commit `9915b58`.
- [x] T4 — Web `/secretaria/deuda`: show the last reminder run (sent / skipped + reason) and that reminders go out on the 22nd. Route: delegated writer. Commit `429909a`.
- [x] T5 — Docs (`.claude/context/estado-supabase.md`, `estado-web.md`, `historial.md`). Route: delegated writer. Commit: the `docs(deuda)` commit that also updates this document.
- [ ] T6 — Production deploy (migrations, functions, cron registration, web) — run by the user (permission classifier blocks prod deploys), after review.

## Acceptance criteria

- Importing a report with > 1000 distinct codes matches every code that exists in `socios`.
- With fecha_corte before day 22, an automatic-debit socio owing only the current cuota ends verde and its comprobante shows as a_vencer with the debit date; a manual-payment socio in the same situation ends amarillo.
- From day 22 on, the same automatic-debit socio ends amarillo.
- The import response no longer reports sent reminders; the day-22 function sends them, or skips with a recorded reason when data is stale.

## Checks

- Pure logic in `_shared` with `*.check.ts` run via `npx --yes tsx` (RED → GREEN).
- `tsc --noEmit --strict` with Deno shims for the Edge Functions (deno not installed).
- `npm run build` in `web/` with dummy NEXT_PUBLIC_SUPABASE_* vars.

## Progress / evidence

- 2026-10-07: problem verified with read-only queries against production; mapping done; feature document created.
- 2026-10-07: T1–T5 implemented by one delegated writer (commits `b69a95b`, `6f01646`, `9915b58`, `429909a`, plus the `docs(deuda)` commit).
  - Shared module `supabase/functions/_shared/recordatorio-deuda.ts`: pure decision/grouping/date logic plus paginated/chunked queries that take the client as a parameter; delivery reuses `_shared/expoPush.ts`.
  - `npx --yes tsx supabase/functions/_shared/recordatorio-deuda.check.ts`: RED (module not found) → GREEN, 14 cases OK, including 1305 codes resolved against a fake PostgREST capped at 1000 rows and more than 1000 deudores paginated.
  - `tsc --noEmit --strict` (Deno shims) over `importar-deuda/index.ts` and `recordatorio-deuda/index.ts`: no errors.
  - `npm run build --prefix web` with dummy NEXT_PUBLIC_SUPABASE_* vars: OK, `/secretaria/deuda` prerendered.
  - Migrations re-read for syntax; the RPC body diff against `20260804000002` is only the new constant and the reclassification UPDATE.
  - `forzar` skips only the day-22 check; monthly idempotency and freshness still apply (a forced send counts as the month's send).

## Next step

Review, then T6 (deploy by the user): apply `20261010000000` and `20261010000001`, deploy `importar-deuda` and `recordatorio-deuda --no-verify-jwt`, register the cron by hand (SQL in `20261010000001`), deploy web.
