# Feature: import-servicios-panel

Locator: `odd/tasks/import-servicios-panel.md` (branch `feat/import-servicios-panel`, worktree `.claude/worktrees/import-servicios-panel`)
Engram mirror: `odd/import-servicios-panel/tasks`

## Objective

Secretaría uploads the NUVIX "Padrón de Servicios" report from the web panel, next to the Padrón Extendido import, and `socio_servicios` becomes a full mirror of it.

## Problem / why

Today `socio_servicios` is only loaded by `scripts/reconciliar-servicios-socios.mjs` (manual, service_role, CSVs, ran once on 2026-08-05). Every later alta stays without services (546 of 1399 active socios without any on 2026-09-29), and the Lector rejects gym users who are not loaded (Eduardo Mato, Mateo Vargas, Fermín Devoto were fixed by hand).

## Decisions

- **Full mirror** (user, 2026-10-05): add missing, update importe/variante, delete rows of mapped services that are not in the file — including manual rows. Deletions are shown separately in the preview; Secretaría can uncheck individual deletions before confirming (assumption from the recommended design, stated to the user).
- **Importe source**: the file has no importe column. Each NUVIX variant takes the `monto_mensual` of its catalog row; catalog prices match stored importes exactly as of 2026-10-05.
- **Mapping** (concept → `socio_servicios.servicio` + price catalog row + `variante_nuvix`):
  - `GYM Mayor` → Gimnasio, price from Gimnasio
  - `GYM Menor` → Gimnasio, price from Gimnasio Menor
  - `GYM Becado` → Gimnasio, price from Gimnasio Becado
  - `RUGBY CUOTA DEPORTIVA` → Rugby; `HOCKEY CUOTA DEPORTIVA` → Hockey; `CARNET TENIS` → Carnet Tenis; `RUGBY INCLUSIVO` → Rugby Inclusivo; `HOCKEY INCLUSIVO` → Hockey Inclusivo
  - Ignored: CUOTA ACTIVO MAYOR/MENOR, CUOTA DEPENDIENTE GRUPO FAMILIAR, CUOTA TITULARES GRUPO, ACTIVO UNQUITAS, CLIENTE GYM, GYM ALICUOTA (Cliente Gimnasio is identified by category; 0 Alícuota rows exist today).
  - Unknown concept in a future file → reported as a warning, never mapped silently.
- Socio with two variants of the same service in the file (1 case: GYM Mayor + GYM Menor) → conflict, reported, its row left unchanged.
- Socios with `excluir_de_import` are skipped; `numero_socio` without a match is reported.
- Parse server-side in a new Edge Function `importar-servicios` (same skeleton as `importar-socios`: FormData `archivo` + `modo` preview/confirmar, role secretaria/admin, no server state between preview and confirm).
- History in a new table `importaciones_servicios` (mirrors `importaciones_socios`).
- Delivery strategy: `single-pr` with work-unit commits (forecast ~900 authored lines; push/PR remain the user's decision).

## Scope

Allowed: new migration, `supabase/functions/_shared/parse-padron-servicios.ts` (+ diff + `.check.ts`), `supabase/functions/importar-servicios/`, `web/app/(secretaria)/secretaria/socios-import/page.tsx`, docs in `.claude/context/`.
Not in scope: deploying to production (needs explicit confirmation), changing the Padrón Extendido import, the reconciliation script.

## Tasks

- [x] T1 — Pure parser + mapping + diff in `_shared/parse-padron-servicios.ts` with `parse-padron-servicios.check.ts` (RED → GREEN, `npx --yes tsx`), validated also against the real sample `data/import/padron servicio socio.xls`. Route: delegated (writer).
- [ ] T2 — Migration `importaciones_servicios` + RLS. Route: delegated (same writer). **Blocked:** the authorized name `20261005000000_importaciones_servicios.sql` duplicates the version of the existing `20261005000000_gimnasio_turnos.sql` (and 20261006/20261007 already exist); needs authorization for `20261008000000_importaciones_servicios.sql`. Draft ready outside the repo.
- [x] T3 — Edge Function `importar-servicios` (preview/confirmar, omitted deletions, history row). Route: delegated (same writer).
- [x] T4 — Web section in `socios-import` page: upload, preview with altas/cambios/bajas (bajas checkable), confirm, history. Route: delegated (same writer).
- [x] T5 — Docs: `.claude/context/estado-web.md`, `estado-supabase.md`, `historial.md`. Route: delegated (same writer).
- [ ] T6 — Production deploy (migration + function) — only after user confirmation.

Route evidence: understanding required 4+ files (mapper ran, report received); implementation touches 2+ non-trivial files → one bounded writer.

## Acceptance criteria

- Preview against the real sample shows counts of agregados/actualizados/eliminados/sin cambio, conflicts, unknown concepts and unmatched socios, without writing anything.
- Confirm applies exactly the previewed diff minus unchecked deletions, records one `importaciones_servicios` row, and is idempotent (second run = 0 changes).
- Only secretaria/admin can call the function.

## Checks

- `npx --yes tsx supabase/functions/_shared/parse-padron-servicios.check.ts`
- `deno check supabase/functions/importar-servicios/index.ts` if deno is available, otherwise reported as unavailable
- `npm run build` in `web/`

## Progress / evidence

- 2026-10-05: exploration done; feature document created.
- T1: RED observed (`npx --yes tsx .../parse-padron-servicios.check.ts` → MODULE_NOT_FOUND before the module existed), GREEN 15/15 cases. Real sample (local one-off, not committed): 15 concepts, 2537 rows, 1525 distinct socios (the 1526 from exploration was off by one — the original `leerPadron` logic also gives 1525), GYM Mayor 182, GYM Menor 87, GYM Becado 2, RUGBY CUOTA DEPORTIVA 255, HOCKEY CUOTA DEPORTIVA 287, CARNET TENIS 152, RUGBY INCLUSIVO 8, HOCKEY INCLUSIVO 7, 0 unknown concepts, 1 conflict (GYM Mayor + GYM Menor). Same result with `raw: true` and `raw: false`.

- T1 commit: `2d57f4e`.
- T3: `deno` not on PATH → `deno check` unavailable. Substitute: `tsc --noEmit --strict` with Deno/npm shims over `importar-servicios/index.ts` → 0 errors. Writes go in batches of 500 (delete/insert) with per-row fallback to isolate errors; updates per row with concurrency 5. Rejects a file without any mapped service row (mirror safety). Catalog resolved by name; duplicate or missing mapped names abort with 500.

- T3 commit: `0d25bac`.
- T4: new colocated component `socios-import/seccion-servicios.tsx` mounted at the end of the page (its own upload, preview, checkable deletions, confirm and history). `npm ci` + `npm run build` in `web/` (dummy NEXT_PUBLIC_SUPABASE_* vars) → build OK, `/secretaria/socios-import` prerendered.

- T4 commit: `91e527f`.
- T5: docs updated (`estado-web.md`, `estado-supabase.md`, `historial.md`); structural readback only. Commit: the `docs(socios-import)` commit after `91e527f`.
- Open note: `historial.md` (2026-09-30) records stored importes per variant (Mayor 30000, Menor 22500, Rugby 28000, Hockey 35000, Carnet Tenis 70000, Inclusivos 21000) while the old migrations seed the catalog with lower prices; if the catalog `monto_mensual` is not aligned, the first preview will show those rows as "actualizados". Check the preview before confirming.

## Next step

T2 once a free migration version is authorized (proposed `supabase/migrations/20261008000000_importaciones_servicios.sql`), then T6 with user confirmation.
