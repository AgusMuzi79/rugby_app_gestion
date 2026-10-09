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
- [x] T1 Migration `20261015000000_eventos_financieros_manager.sql`: manager INSERT/UPDATE policies + subcomisión INSERT restricted to recaudación. Route: delegated writer.
- [x] T2 Mobile: `useEventos(modo)`; `EventosPantalla` shared by `(subcomision)/eventos.tsx` (recaudación only) and new hidden tab `(manager)/eventos.tsx`; entry buttons in manager diario/cobranzas; copy updates. Route: delegated writer (2+ non-trivial files).
- [x] T3 Docs: financiero spec, reglas-negocio, estado-supabase, estado-expo.

- [x] T4 Review advisories (user asked to fix them): manager UPDATE limited to closing (trigger guard: only estado activo→cerrado); useEventos error state for profile load + loading never stuck without session; SQL scenario test `supabase/tests/eventos_financieros_manager_rls.sql` (Docker, RED before GREEN). Route: delegated writer (3+ non-trivial files).
- [x] T5 Cobranzas: amount field defaults to the event's suggested amount (stored in `descripcion`) when the player has no registered amount; still editable. `app/lib/montoSugerido.ts` + `montoSugerido.check.ts` (RED: module missing → GREEN 6 cases); `useCobranzas.ts` uses it; eventos screen reuses the parser. Parser accepts local format ("2.500" = 2500, "2.500,50") after review warning (RED 2.5 -> GREEN 8 cases). Route: inline (small, understood).

### Phase 2 — multi-division events (branch `feat/eventos-financieros-multi-division`, 2026-10-09)
User request: viaje, tercer tiempo and recaudación can include several divisions. Decision (user): a Manager may pick any division of **its sport** (sport of its assigned divisions); each manager sees the event and charges only players of its own divisions in the event. Also: Cobranzas showed players not in the event's division (likely stale `jugadores` data before 2026-10-08 division cleanup; code always used manager `divisiones[0]`).

Design (assumed, user may override):
- New table `eventos_financieros_divisiones(evento_financiero_id, division_id)` = source of truth. No rows on a recaudación = whole club (global).
- `eventos_financieros.division_id` kept for compatibility with the published app: first chosen division (null for global). Backfill join table from it.
- Creation through RPC `crear_evento_financiero(...)` (SECURITY INVOKER, atomic, RLS applies).
- Manager: insert viaje/tercer_tiempo with ≥1 division, all of its sport; closes events where it is creator or has access to any event division (still only activo→cerrado). Event divisions immutable for managers.
- Subcomisión: recaudación for whole club or chosen divisions (deporte filter).
- Visibility: manager/coordinador/entrenador see events that are global, include one of their divisions, or they created.
- Cobranzas: manager sees events touching any of its divisions (all of them, not just `[0]`) or global; player list = active players of (event divisions ∩ manager divisions), or all manager divisions for global. RLS on cobranzas insert/update also requires the player's division to be in the event (or event global).

- [x] T6 Migration `20261016000000_eventos_financieros_multi_division.sql` + test `supabase/tests/eventos_financieros_multi_division.sql` (RED 29 failing → GREEN 51/51; existing manager test still GREEN; parent re-ran both GREEN). Deviations: surrogate PK + UNIQUE on the join table (avoid PostgREST ambiguous embed for the published app — verify after push); AFTER INSERT sync trigger copies `division_id` into the join table so inserts from the published app stay visible. Route: delegated writer.
- [x] T7 Mobile multi-select (manager: its sports, own preselected; subco: todo el club / elegir), RPC `crear_evento_financiero`, Cobranzas uses all manager divisions and event∩mine players, diario/dashboard/informes + web informes read the join table. Checks: app tsc exit 0, web tsc exit 0, montoSugerido check 8 OK. Route: same writer.
- [x] T8 Docs updated (spec financiero, reglas-negocio, estado-supabase/expo/web).
- Known limits: subcomisión select/update/delete still keyed on `division_id` sport (multi-sport recaudación visible to a single-sport subco only if its first division matches); old cobranza rows for players outside the event's divisions can no longer be updated by managers.

## Delivery
- PR #13 https://github.com/AgusMuzi79/rugby_app_gestion/pull/13 (origin/main merged into branch; migration renamed 20261014→20261015 to avoid collision with division_automatica_por_servicio). Review approved + acknowledged on the full diff vs origin/main.
- PR #13 merged (116e86a) and PR #15 merged (df0b618), 2026-10-09.
- 2026-10-09, run by the agent with user authorization: backup OK at `~/backups-uncas/2026-10-09-15-56-12` (first attempt failed on auth.sql with a pooler timeout; retry succeeded); `supabase migration list` showed only 20261015000000 and 20261016000000 pending; `supabase db push` applied both.
- OTA still PENDING: the agent cannot create `app/.env.local` in the worktree (deny rule), so the user publishes from the main checkout. As of 2026-10-09 the latest `production` update is "Icono y deporte en el calendario del socio", not this feature.

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
