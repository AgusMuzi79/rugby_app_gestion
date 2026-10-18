# Feature: socio "Agenda" tab (division events + gym bookings)

Branch: `feat/agenda-socio` (stacked on `feat/eventos-actividad`)
Mirror: Engram topic `odd/agenda-socio/tasks` (pending: Engram session not registered)

## Objective
Replace the socio "Gimnasio" tab (route `(socio)/turnos`, gym turnero) with an "Agenda" tab:
- socios linked to a division (sport service → automatic division by birth year) see the
  entrenamientos, partidos and actividades of their division(s);
- socios with the gym service also book gym turnos there (existing TurnosScreen);
- socios with neither do not see the tab.
The "Calendario" tab stays as is for every socio (partidos + resultados of all disciplines).

## Evidence (production, 2026-10-18)
- `division_automatica_config.activa = true`; 665/693 jugadores have `socio_id`.
- Rugby 239/243 and Hockey 288/288 socios with service have an active jugador; Gimnasio 286 socios.
- Socios cannot read `jugadores` under RLS; gym rule lives duplicated in `socios-qr` and
  `gimnasio-turnos` (categoría 'Cliente Gimnasio' OR active servicio ILIKE '%gimnasio%').

## Scope
- DB: SECURITY DEFINER RPC returning the logged-in socio's agenda: `tiene_gimnasio`, divisions
  (id, nombre, deporte) from active `jugadores.socio_id = get_socio_id()`, and non-cancelled eventos
  of those divisions in a date window. No RLS widening on `jugadores`.
- App socio: tab renamed "Agenda", hidden (`href: null`) when no gym and no division; screen shows
  "Mis eventos" (uses `app/lib/tipoEvento.ts` labels) and the gym turnero when `tiene_gimnasio`.
- App cliente-gimnasio: same tab label "Agenda" (turnero only).
Out of scope: tutor agenda for minors, Carnet Tenis (no division mapping), Calendario changes,
the stale "MI EQUIPO" lookup in `useCalendarioSocio`.

## Tasks
- [x] T1 RPC migration + SQL scenario test + types. Route: delegated (writer).
- [x] T2 Hook + pure helper (+ check) + Agenda screen + tab gating/rename. Route: delegated (writer).

Route evidence: mapping needed 4+ files (mapper ran); write spans 6+ non-trivial files -> one writer.

## Acceptance criteria
- Socio with division sees its division's upcoming eventos (all tipos) with correct labels.
- Socio with gym sees and can use the turnero inside Agenda; socio with both sees both.
- Socio with neither: tab hidden; RPC returns empty divisions and `tiene_gimnasio = false`.
- RPC never returns eventos of other divisions; non-socio roles get nothing.

## Checks
- SQL scenario in `supabase/tests/` (throwaway Postgres, Docker)
- `npm run test:admin` in `app/`; `npx tsc --noEmit` in `app/`

## Progress
- 2026-10-18: requirements confirmed with user; branch + document created.
- 2026-10-18 T1 (writer): migration `supabase/migrations/20261023000000_agenda_socio.sql`
  (`agenda_socio(p_desde, p_hasta)`, SECURITY DEFINER, window capped at 120 days, execute granted to
  authenticated only, anon revoked), scenario `supabase/tests/agenda_socio.sql` (18 cases),
  `app/lib/database.types.ts` Functions entry.
  RED: the `\ir` of the missing migration aborted the script. GREEN: throwaway postgres:17 ->
  "TODOS LOS CASOS OK". No role gate inside the RPC: it is scoped to the caller's own socio row
  (`get_socio_id()`); staff without a socio row get the empty result. Not applied to production.
- 2026-10-18 T2 (writer): `app/lib/agenda.ts` + `agenda.check.ts` (17 cases; RED = module not found,
  then GREEN), `app/hooks/useAgenda.ts` (`useAgendaEstado` + `AgendaContext`),
  `app/components/socio/AgendaEventos.tsx`, turnero extracted to
  `app/components/shared/TurnosGimnasio.tsx` (TurnosScreen is now Header + TurnosGimnasio; cliente-gimnasio
  behavior unchanged), `(socio)/turnos.tsx` is the Agenda screen, tab renamed "Agenda" (Feather "list")
  in socio and cliente-gimnasio.
  Decision: the (socio) layout fetches the agenda once and shares it via context (tab gating + screen);
  the screen refetches on focus. Tab hidden while the first load is pending, shown on error.
  Checks: `npm run test:admin` exit 0; `npx tsc --noEmit` exit 0. Not run on a device.
- Next: work-unit commits, native review assessment, apply the migration to production with user
  consent, OTA/build.
