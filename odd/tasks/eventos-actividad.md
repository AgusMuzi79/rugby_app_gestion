# Feature: calendar event type `actividad`

Branch: `feat/eventos-actividad` (from `origin/main` @ 2b32f0d)
Mirror: Engram topic `odd/eventos-actividad/tasks`

## Objective
Let the calendar hold non-training activities (nutrition talk, sports psychology, gym tests,
anthropometrics, Sevens, group activity) so the plantel superior post-season schedule
(`CRONOGRAMA FINAL POST TEMPORADA 2026.pdf`, 2026-10-15 to 2026-12-12) can be loaded.

## Problem / why
`eventos.tipo` only allows `entrenamiento | partido` and the table has no title. Several UI and
notification paths assume "not partido => entrenamiento", and attendance stats count every evento,
so an activity without attendance would distort percentages and hide the 4-absences alert.

## Scope
- DB: `tipo` adds `actividad`; new nullable `titulo text`, required when `tipo = 'actividad'`.
  Entrenador insert policy stays training-only (entrenadores do not create activities).
- Mobile coordinador calendar: create an `actividad` with a title; badge, labels, cancel modal.
- Cancellation noticia + push label an activity by its title.
- Diarios (entrenador/coordinador): show the title; no attendance button for activities.
- Attendance stats and 4-absences alerts (mobile + web informes) ignore activities.
- `app/lib/database.types.ts` gets `titulo`.

Out of scope: socio/tutor calendar (today it only shows partidos), web calendar UI (none exists),
loading the schedule data (separate step, production write, needs confirmation).

## Constraints
- Artifacts in English except existing Spanish UI copy conventions of the app (UI copy is Spanish).
- No jest/vitest: pure helper + `*.check.ts` run with tsx, chained into `test:admin`.

## Tasks
- [x] T1 Migration `20261022000000_eventos_actividad.sql` + `database.types.ts` + SQL scenario test. Route: delegated (writer).
- [x] T2 Pure helper `app/lib/tipoEvento.ts` (+ `.check.ts`) and mobile/web/edge call sites. Route: delegated (writer).
- [x] T3 Load the schedule for plantel superior (after migration is applied to production, with confirmation).

Route evidence: mapping needed 4+ files (mapper ran); write spans 10+ non-trivial files -> one writer.

## Acceptance criteria
- Inserting `tipo='actividad'` without `titulo` fails; with `titulo` succeeds; `entrenamiento`/`partido` unchanged.
- Coordinador can create an activity with a title for one or more divisions; it renders with its title.
- Cancelling an activity produces noticia/push text using the title, not "Entrenamiento".
- Activities never get "TOMAR ASISTENCIA" and are excluded from attendance % and 4-absences checks.

## Checks
- `npx tsc --noEmit` in `app/` and `web/`
- `npm run test:admin` in `app/` (includes new `tipoEvento.check.ts`)
- SQL scenario in `supabase/tests/` against throwaway Postgres (if Docker available)

## Progress
- 2026-10-18: branch created, mapping done, document created.
- 2026-10-18: T1 + T2 implemented by the delegated writer (not committed, not applied to any remote DB).
  - T1: migration drops the unnamed inline tipo check (looked up in `pg_constraint`), adds named
    `eventos_tipo_check` and `eventos_titulo_actividad_check`, plus `titulo text`. Types updated.
    SQL scenario `supabase/tests/eventos_actividad.sql` on throwaway `postgres:17` (Docker):
    9/9 cases ok, "TODOS LOS CASOS OK", exit 0.
  - T2: `app/lib/tipoEvento.ts` (`etiquetaEvento`, `tituloCancelacion`, `letraEvento`,
    `admiteAsistencia`, `tituloActividadValido`). RED observed first (tsx: module not found, exit 1),
    then GREEN (11 cases). Wired into calendar (type selector, required Título input, oro badge with
    `sobreOro` text, cancel modal), cancel noticia + push (`tituloEvento` in payload, inline equivalent
    in the notifications Edge Function), both diarios (title shown, no TOMAR ASISTENCIA for
    actividad), attendance stats (`.neq('tipo','actividad')` in useAsistenciaCoordinador,
    useDiarioCoordinador 30-day/last-4 query, web informes).
  - Decision: partidos keep the TOMAR ASISTENCIA button (today's behavior); only actividad loses it.
  - Decision: activity cancel title is `Cancelado: <título> — <división>` (titles can be of either
    gender); entrenamiento/partido keep `<Etiqueta> cancelado — <división>`.
  - Checks: `npm run test:admin` (app) exit 0 incl. tipoEvento (11 casos OK); `npx tsc --noEmit` app
    exit 0; `npx tsc --noEmit` web exit 0. Edge Function not type-checked (no Deno installed).
- 2026-10-18: work-unit commits 18bd952 (db) + 67257d2 (app/web/edge). Native review: medium risk,
  consent granted, lens review-reliability, approved and acknowledged (lineage review-0643627a4b055033).
  Engram mirror pending (session not registered).
- 2026-10-18: T3 prepared: `scripts/cronograma-post-temporada-2026.sql` (dry-run by default, idempotent,
  lists superior divisions when none given). Gym at 20:30 (user: starts 20:45, cite earlier); Saturday
  activities and Seven trainings without hour. Tested on throwaway postgres:17: 36 events/division,
  dry-run rolls back, rerun inserts 0. Not run in production (prod access not authorized in session).
- 2026-10-18: user authorized production. Migration 20261022000000 applied (`supabase db push`,
  confirmed in `migration list`). Loader run for division `Mayores` (rugby plantel superior; M19 -> Mayores):
  dry-run 36 to insert / 0 existing, then commit; verified 36 rows (24 gym 20:30, 3 Seven, 9 actividades).
- Next: open PR, merge, deploy `notifications` Edge Function and publish OTA from main
  so coordinators can create activities and cancellations push the right label.
