# Web panel for the entrenador

Branch: `feat/panel-web-entrenador` (from `main` at `afe721b`). Independent of the colaborador chain (PR #62–#64).

## Objective

Each entrenador can log into the web panel (`uncasapp.com`) and:

1. see the attendance of their divisions;
2. manage their matches with the full flow of the app: equipo → match attendance → mesa (titulares/suplentes among presentes) → resultado.

Today the entrenador only uses the Expo app; no web page accepts coordinador, entrenador or manager.

## Decisions

- User, 2026-11-10: attendance list + full match flow (all 4 steps), on the web.
- User, 2026-11-10: like the app, saving a match attendance does not send the 4-absences push (the app only sends it for entrenamientos).
- Assumptions (parent):
  - Only the `entrenador` role gets the panel (not colaborador, coordinador or manager). Admin keeps its own panel.
  - Login: `entrenador` joins the allowed web roles **after** the existing ones, so a subcomisión/secretaría user who is also entrenador still lands on their own panel. Like the other web roles, the login writes `profiles.rol = 'entrenador'`, because every entrenador RLS policy checks the active role (`get_rol()`).
  - No DB change: the existing RLS already limits the entrenador to their divisions (`tiene_acceso_division`) and lets them write asistencias, equipos, mesas (`guardar_mesa`) and resultados.
  - The match rules that live only in the app (15 titulares / 8 suplentes, the mandatory first equipo needs a mesa before the optional ones, automatic equipos per 35 players, infantil divisions skip mesa and resultado, the −7/+14 day window) are copied into pure `web/lib` modules with checks, with a comment pointing to the app source to keep both in sync.
  - Delivery: same chain strategy the user chose for the colaborador feature (`stacked-to-main`).

## Map (from exploration)

- No middleware: the guard is client-side, `web/components/PanelShell.tsx` (`PANELES`) + `web/lib/sesionPanel.ts` (`decidirSesion`, checks in `sesionPanel.check.ts`). One browser anon client (`web/lib/supabase.ts`, `selectAllRows`), so RLS runs with the user's JWT.
- Login: `web/app/login/page.tsx:35-68` (allowed roles, panel-role pick, `rol` rewrite, routing).
- Pattern to follow: the `(beneficios)` panel (PR #60).
- Attendance report to reuse: `web/lib/informesAsistencia.ts` (`informeAsistencia`, `TOPE_AUSENCIAS`), used by `web/app/(subcomision)/informes/page.tsx`.
- Match flow source: `app/hooks/usePartido.ts`, `app/app/(entrenador)/partido.tsx`, `app/lib/equiposPartido.ts`, `app/lib/partidosEntrenador.ts`, `app/lib/cargaPartido.ts`, `app/lib/ausenciasConsecutivas.ts`; RPC `guardar_mesa` (`20261103000000`).

## Tasks

- [x] T1 — Panel access: `entrenador` in the login allowed roles and routing (`/entrenador/asistencias`), `PANELES.entrenador` in `PanelShell` (nav: Asistencias, Partidos), `decidirSesion` cases, `web/app/(entrenador)/layout.tsx`. Route: delegated writer.
- [x] T2 — Attendance page `/entrenador/asistencias`: division selector limited to the coach's divisions; "Por jugador" (reuse `informeAsistencia`: %, 4-absences alert) and "Por fecha" (each past entrenamiento/partido with presentes/ausentes/justificados, expandable to the names). Route: same writer as T1.
- [x] T3 — Pure match logic in `web/lib` + checks (window, equipos sync, mesa validation, infantil rule, load of saved asistencia/mesa, 4-absences — removed afterwards, see Progress). Route: delegated writer.
- [x] T4 — Match page `/entrenador/partidos`: the 4 steps on the web. Route: same writer as T3.
- [x] T5 — Docs: CLAUDE.md (roles table + web panels line + backlog line), this document. Route: same writer as T3.

## Acceptance criteria

- An entrenador logs into the web and lands on Asistencias; sees only their divisions.
- They can pick a match, its equipo, mark the match attendance, build and save the mesa with the same limits as the app, and load the result; reopening shows what was saved (also what was saved from the app).
- A subcomisión/secretaría/admin user who is also entrenador keeps landing on their own panel.
- A non-entrenador cannot open `/entrenador/*` (guard signs them out or redirects as today).

## Checks

- `npx --yes tsx web/lib/sesionPanel.check.ts` and the new `web/lib/*.check.ts`.
- `npx tsc --noEmit` and `npm run build` in `web/` (junction to the main checkout's `web/node_modules`, removed afterwards).

## Delivery

Forecast ~1500 authored lines → `stacked-to-main`:

- PR A `feat/panel-web-entrenador` → `main`: T1 + T2.
- PR B `feat/panel-web-entrenador-partidos` (based on PR A): T3 + T4 + T5.

## Progress

- T1 (route: delegated writer). Files: `web/lib/panelLogin.ts` + `panelLogin.check.ts` (new: pure panel-role pick extracted from the login; `entrenador` last in `ROLES_WEB`, rewrites `profiles.rol`, lands on `/entrenador/asistencias`), `web/app/login/page.tsx` (uses it, same behavior for the existing roles), `web/components/PanelShell.tsx` (`PANELES.entrenador`, active rol only), `web/lib/sesionPanel.check.ts` (4 entrenador cases), `web/app/(entrenador)/layout.tsx`. RED: `panelLogin.check.ts` failed (module missing) before the helper; the `sesionPanel` cases passed without a code change, because `decidirSesion` is already generic (no RED possible there). GREEN: `panelLogin.check.ts` 6 ok, `sesionPanel.check.ts` 20 ok, `tsc --noEmit` clean. Nav has only "Asistencias": "Partidos" is added with its page in T4 (no placeholder in production). Commit `878e52d`.
- T2 (route: delegated writer, same as T1). Files: `web/lib/asistenciasPorFecha.ts` + `asistenciasPorFecha.check.ts` (past entrenamientos/partidos, today included, activities out, newest first like Informes; presentes / ausentes / justificados / sin marcar with names; sin marcar = active players of the division without a row; a saved row of a player now de baja still counts; `restarDias` for the range), `web/app/(entrenador)/entrenador/asistencias/page.tsx` (divisions from `profiles.divisiones`, selector only with 2+; jugadores, eventos (not cancelled, no actividades) and asistencias filtered with `.in('division_id', ids)` through `selectAllRows`; "Por jugador" reuses `informeAsistencia` over active players; "Por fecha" with range 30 días (default) / 90 días / todo, expandable rows; loading, empty (no divisions / no players / no events) and error with REINTENTAR). RED: `asistenciasPorFecha.check.ts` failed (module missing). GREEN: `asistenciasPorFecha.check.ts` 9 ok, `informesAsistencia.check.ts` 15 ok, `sesionPanel.check.ts` 20 ok, `panelLogin.check.ts` 6 ok, `tsc --noEmit` clean, `next build --webpack` ok (27 pages, `/entrenador/asistencias` included) with placeholder `NEXT_PUBLIC_SUPABASE_*` values. `npm run build` (Turbopack) cannot run in the worktree: it rejects the `node_modules` junction ("points out of the filesystem root"); Vercel uses `vercel-build` = `next build --webpack`, which is what ran. Not checked against real data (needs an entrenador login).
- RDD review of PR A (base `afe721b` → `0a31ab1`, medium, 777 lines, `slice_budget_reached`; lineage `review-c8f3b0994e3ba89d`, lens reliability): consent granted, **approved and acknowledged**. Next reviewed boundary: `0a31ab1`. WARNING: the login ignored the result of the `profiles.rol` rewrite, so a failed write would route the entrenador into a guard sign-out with no message → fixed inline by the parent (`web/app/login/page.tsx`: on error, sign out and show "No pudimos abrir tu panel…"; `tsc --noEmit` clean). SUGGESTION (not taken): a saved row with an unexpected `estado` is left out of every "Por fecha" group (the DB CHECK only allows presente/ausente/justificado).

- T3 (route: delegated writer, PR B branch `feat/panel-web-entrenador-partidos` from `dcfdfe2`). Files (each with a header naming its app source and "keep both in sync"): `web/lib/partidosWeb.ts` (−7/+14 window, SIN RESULTADO / PRÓXIMOS / JUGADOS, `elegirDivision`, `pasosPartido`: infantil = equipo + asistencia), `equiposPartidoWeb.ts` (names, one equipo per 35 players, upsert ignoreDuplicates with 42P10 → insert fallback, oldest duplicate wins, first = obligatorio), `mesaPartido.ts` (15/8 caps with the app messages, only presentes, ausente leaves the mesa, `guardar_mesa` payload without duplicates, obligatorio-first rule, error-code mapping, points 0–999), `cargaPartidoWeb.ts` (`abrirPaso` with its own retry, saved asistencia + mesa + resultado applied to the list), `ausenciasConsecutivasWeb.ts` (streak + crossing rule, `marcasDelGuardado`), `marcasSinGuardarWeb.ts` (presence diff + mesa diff, web only), and one extra file `mensajeErrorWeb.ts` (save-error messages, browser network errors) used by the mesa mapping and the page. Each with its `.check.ts` (cases ported from the app checks). RED: the 7 new checks failed with "Cannot find module" before the modules. GREEN: partidosWeb 6, equiposPartidoWeb 9, mesaPartido 10, mensajeErrorWeb 5, cargaPartidoWeb 7, ausenciasConsecutivasWeb 9, marcasSinGuardarWeb 3 ok; `tsc --noEmit` clean. Commit `f829623`.
- T4 (route: same writer). Files: `web/app/(entrenador)/entrenador/partidos/page.tsx` (state + Supabase reads/writes) and `PasosPartido.tsx` (presentational steps), `web/components/PanelShell.tsx` (nav "Partidos"). Division selector with 2+ divisions (only on step 1); partidos in sections; step indicator Equipo → Asistencia → Mesa → Resultado (infantil: two steps). Asistencia upsert on (evento_id, jugador_id) with `division_id` and `registrado_por` like the app; mesa via `rpc('guardar_mesa')` with the obligatorio check first; resultado upsert on (evento_id, equipo_id); reopening reads the saved asistencia, mesa and resultado (also those saved from the app). Unsaved changes: `confirm` before changing partido or división, going back to step 1, or leaving the mesa to Asistencia (discard restores the saved mesa); `beforeunload` while there are unsaved marks. Loading, empty (no divisions / no partidos) and error with REINTENTAR (retries exactly what failed). Checks: all `web/lib` checks above + `sesionPanel` 20, `panelLogin` 6, `asistenciasPorFecha` 9, `informesAsistencia` 15 ok; `tsc --noEmit` clean; `next build --webpack` ok (28 pages, `/entrenador/partidos` included) with placeholder `NEXT_PUBLIC_SUPABASE_*`. Not checked against real data (needs an entrenador login). Commit `4e3c9cc`.
- Differences from the app (T4): (1) ~~the 4-absences check runs after a match attendance save on the web~~ — removed (see below), so the web now matches the app: no 4-absences push on a match attendance save; (2) no offline queue: without connection the save shows "No hay conexión…"; (3) the sidebar links are not blocked by the unsaved-changes guard (only `beforeunload` and the in-page actions); (4) no deep link from an Inicio task (the web has no Inicio).
- T5 (route: same writer). `CLAUDE.md`: Entrenador row (also uses the web panel), web panels line, backlog line for the real-coach test. This document.
- 4-absences push removed from the web match flow (user decision 2026-11-10, delegated writer): `partidos/page.tsx` no longer calls `verificarCuartaAusencia` (function, `alertas` and `estadosPrevios` state removed), `PasosPartido.tsx` no longer shows the "Con 4 ausencias seguidas…" notice, and `web/lib/ausenciasConsecutivasWeb.ts` + its check were deleted (nothing else used them). The app only sends the push for entrenamientos (`app/hooks/useAsistencia.ts`, `app/hooks/useSincronizacionOffline.ts`). Commit `fix(web): no 4-absences push on match attendance, like the app`.
- Review suggestion on PR #65 (not fixed yet): in 'Por fecha', 'sin marcar' uses today's active players, so older events can count players who joined later and drop players now de baja without a row.

## Deploy (user, after merge)

Web only (Vercel). No migration, no Edge Function.
