# Web panel for the entrenador

Branch: `feat/panel-web-entrenador` (from `main` at `afe721b`). Independent of the colaborador chain (PR #62–#64).

## Objective

Each entrenador can log into the web panel (`uncasapp.com`) and:

1. see the attendance of their divisions;
2. manage their matches with the full flow of the app: equipo → match attendance → mesa (titulares/suplentes among presentes) → resultado.

Today the entrenador only uses the Expo app; no web page accepts coordinador, entrenador or manager.

## Decisions

- User, 2026-11-10: attendance list + full match flow (all 4 steps), on the web.
- Assumptions (parent):
  - Only the `entrenador` role gets the panel (not colaborador, coordinador or manager). Admin keeps its own panel.
  - Login: `entrenador` joins the allowed web roles **after** the existing ones, so a subcomisión/secretaría user who is also entrenador still lands on their own panel. Like the other web roles, the login writes `profiles.rol = 'entrenador'`, because every entrenador RLS policy checks the active role (`get_rol()`).
  - No DB change: the existing RLS already limits the entrenador to their divisions (`tiene_acceso_division`) and lets them write asistencias, equipos, mesas (`guardar_mesa`) and resultados.
  - The match rules that live only in the app (15 titulares / 8 suplentes, the mandatory first equipo needs a mesa before the optional ones, automatic equipos per 35 players, infantil divisions skip mesa and resultado, the −7/+14 day window) are copied into pure `web/lib` modules with checks, with a comment pointing to the app source to keep both in sync.
  - The 4-absences push (`verificarCuartaAusencia`, app only) is also fired from the web after saving a match attendance, through the same `notifications` call the app makes.
  - Delivery: same chain strategy the user chose for the colaborador feature (`stacked-to-main`).

## Map (from exploration)

- No middleware: the guard is client-side, `web/components/PanelShell.tsx` (`PANELES`) + `web/lib/sesionPanel.ts` (`decidirSesion`, checks in `sesionPanel.check.ts`). One browser anon client (`web/lib/supabase.ts`, `selectAllRows`), so RLS runs with the user's JWT.
- Login: `web/app/login/page.tsx:35-68` (allowed roles, panel-role pick, `rol` rewrite, routing).
- Pattern to follow: the `(beneficios)` panel (PR #60).
- Attendance report to reuse: `web/lib/informesAsistencia.ts` (`informeAsistencia`, `TOPE_AUSENCIAS`), used by `web/app/(subcomision)/informes/page.tsx`.
- Match flow source: `app/hooks/usePartido.ts`, `app/app/(entrenador)/partido.tsx`, `app/lib/equiposPartido.ts`, `app/lib/partidosEntrenador.ts`, `app/lib/cargaPartido.ts`, `app/lib/ausenciasConsecutivas.ts`; RPC `guardar_mesa` (`20261103000000`).

## Tasks

- [x] T1 — Panel access: `entrenador` in the login allowed roles and routing (`/entrenador/asistencias`), `PANELES.entrenador` in `PanelShell` (nav: Asistencias, Partidos), `decidirSesion` cases, `web/app/(entrenador)/layout.tsx`. Route: delegated writer.
- [ ] T2 — Attendance page `/entrenador/asistencias`: division selector limited to the coach's divisions; "Por jugador" (reuse `informeAsistencia`: %, 4-absences alert) and "Por fecha" (each past entrenamiento/partido with presentes/ausentes/justificados, expandable to the names). Route: same writer as T1.
- [ ] T3 — Pure match logic in `web/lib` + checks (window, equipos sync, mesa validation, infantil rule, load of saved asistencia/mesa, 4-absences). Route: delegated writer.
- [ ] T4 — Match page `/entrenador/partidos`: the 4 steps on the web. Route: same writer as T3.
- [ ] T5 — Docs: CLAUDE.md (roles table + web panels line), this document.

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

- T1 (route: delegated writer). Files: `web/lib/panelLogin.ts` + `panelLogin.check.ts` (new: pure panel-role pick extracted from the login; `entrenador` last in `ROLES_WEB`, rewrites `profiles.rol`, lands on `/entrenador/asistencias`), `web/app/login/page.tsx` (uses it, same behavior for the existing roles), `web/components/PanelShell.tsx` (`PANELES.entrenador`, active rol only), `web/lib/sesionPanel.check.ts` (4 entrenador cases), `web/app/(entrenador)/layout.tsx`. RED: `panelLogin.check.ts` failed (module missing) before the helper; the `sesionPanel` cases passed without a code change, because `decidirSesion` is already generic (no RED possible there). GREEN: `panelLogin.check.ts` 6 ok, `sesionPanel.check.ts` 20 ok, `tsc --noEmit` clean. Nav has only "Asistencias": "Partidos" is added with its page in T4 (no placeholder in production).

## Deploy (user, after merge)

Web only (Vercel). No migration, no Edge Function.
