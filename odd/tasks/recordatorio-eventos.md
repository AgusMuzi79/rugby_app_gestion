# Feature: push reminder 30 minutes before trainings and activities

Branch: `feat/recordatorio-eventos` (from `origin/main` @ f250e17)
Mirror: Engram topic `odd/recordatorio-eventos/tasks`

## Objective
Players and the division's entrenadores get a push ~30 minutes before every entrenamiento and
actividad of their division. Partidos are excluded (arrival time varies). Requested by the user on
2026-10-19; entrenadores + no-duplicate rule added the same day.

## Evidence
- Today the only event push is the cancellation (`notifications` → `notificarCancelacion`,
  audience `getTokensJugadoresDivision`: division players with socio + their tutors).
- No event cron exists. Existing cron pattern: Edge Function with `x-cron-secret` header,
  deployed `--no-verify-jwt`, `cron.schedule` + `net.http_post` registered manually
  (see `20261011000001_recordatorios_deuda_envios.sql`, `recordatorio-deuda`).
- Agenda rule (migrations `20261024000000` + `20261025000000`): a division counts for a socio
  if they have an active servicio whose name contains `divisiones.deporte`, or a category
  `Becado <deporte>`.

## Scope
- DB: `eventos.recordatorio_enviado_at timestamptz`; trigger resets it when `fecha`/`hora`
  change; helper `socio_habilitado_deporte(socio, deporte)` shared with `agenda_socio()`;
  service-role-only RPC that atomically claims due eventos (tipo entrenamiento|actividad,
  not cancelled, with hora, start in (now, now + 30 min] in America/Argentina/Buenos_Aires,
  not yet reminded) and returns them with the recipient socio ids (active jugadores of the
  division that pass the Agenda rule) and the entrenador profile ids (active profiles with
  'entrenador' in `roles[]` and the division in `divisiones[]`; NULL divisiones = none).
- No duplicate pushes: the same session is usually loaded once per division (e.g. "Gimnasio
  20:30" for M19, M20, M21, M22 and Mayores). Claimed eventos are grouped by session (fecha, hora,
  tipo, titulo, lugar) and each profile gets ONE push per session, deduplicated across players,
  tutors and entrenadores; the body lists that recipient's divisions in the group
  ("Arranca a las 20:30 (M19, M20, M21, M22 y Mayores)").
- Edge Function `recordatorio-eventos` (cron secret): claims, resolves push tokens of those
  socios' profiles (+ their tutors, like cancellations) plus the entrenadores, sends one push per
  person per session (grouping/dedupe/texts in `_shared/recordatorio-eventos.ts`).
- Cron every 5 minutes (registered manually after deploy, with user consent).
Out of scope: partidos; eventos without hora (cannot be reminded); in-app notification list.

## Tasks
- [x] T1 Migration + SQL scenario test. Route: delegated (writer).
- [x] T2 Edge Function `recordatorio-eventos` (+ pure helper and check). Route: delegated (writer).
- [ ] T3 Production: apply migration, deploy function, register cron (needs user consent).

## Acceptance criteria
- An entrenamiento/actividad starting in ≤30 min is claimed exactly once; partidos, cancelled,
  past, without hora or already reminded are not.
- Changing fecha/hora re-arms the reminder.
- Recipients = division players passing the Agenda rule (service or becado) + their tutors +
  active entrenadores assigned to the division (not those with NULL or other divisiones).
- One push per person per session: an entrenador of 5 divisions with the same session gets 1 push
  listing the 5; a player gets 1 with only their division; a profile that is player and
  entrenador gets 1; different sessions at the same time (other titulo/lugar) are not merged.
- `agenda_socio()` behavior unchanged (existing scenario stays green).

## Checks
- `supabase/tests/agenda_socio.sql` and new `supabase/tests/recordatorio_eventos.sql` on
  throwaway postgres:17.
- Any `*.check.ts` added runs with tsx.

## Progress
- 2026-10-19: requirements confirmed with user; branch + document created.
- 2026-10-19: T1 + T2 implemented (not committed). Files: migration
  `20261026000000_recordatorio_eventos.sql` (column, re-arm trigger, `socio_habilitado_deporte`,
  `agenda_socio` refactor, `reclamar_recordatorios_eventos` with `socio_ids` +
  `entrenador_profile_ids`, commented cron every 5 min), `supabase/tests/recordatorio_eventos.sql`,
  `agenda_socio.sql` (+ `\ir` of the new migration, service_role and profiles columns in stubs),
  `functions/recordatorio-eventos/index.ts`, `_shared/recordatorio-eventos.ts` + `.check.ts`
  (chained into `app` `test:admin`).
  Evidence:
  - `recordatorio_eventos.sql` on postgres:17: RED (`\ir` migration missing) → GREEN, 20 cases,
    "TODOS LOS CASOS OK".
  - `agenda_socio.sql` on postgres:17 with the new migration: "TODOS LOS CASOS OK" (32 cases, same
    as on main).
  - `recordatorio-eventos.check.ts`: RED (module/exports missing) → GREEN, 14 cases;
    `cd app && npm run test:admin`: exit 0. Helper type-checked with `tsc --strict` (exit 0).
  - Edge Function `index.ts` NOT type-checked (no Deno locally).
  `supabase/config.toml` unchanged: it declares no per-function settings; cron functions are
  deployed with `--no-verify-jwt`.
  Next: T3 (apply migration, deploy `--no-verify-jwt`, register cron) with user consent.
