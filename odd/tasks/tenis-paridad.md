# Feature: tenis-paridad

## Objective
Bring the tennis bookings module to feature and visual parity with the booking system the club used before, as decided by Agus on 2026-11-26 (start with everything the way that system works and adjust afterwards).

## Problem
The first version (`odd/tasks/reservas-tenis.md`) covered the booking rules but not how the previous system looks and works day to day: the phone grid needs sideways scrolling and hides names, members only see 3 days, there is no weekly availability view, no bookings list/history/cancellations/reports for the manager, no tennis news board, and several planned items are missing (audit 2026-11-26).

## Evidence (read-only review of the previous booking system, 2026-11-26)
- Player calendar shows 7 days (14 full screen) while booking stays 2 days ahead; bookings outside the window are not shown as bookable.
- Players see every player's name in the grid ("APELLIDO, NOMBRE (CT nnnn)").
- Mobile daily grid: all 8 courts as narrow columns with a left hour column, no horizontal scroll, sticky header (court + "N reservas"), tall rows, rounded blocks in type colors listing all players, top bar with prev/next day, "Hoy", date, "jueves · 23 reservas · 8 espacios en vista", legend.
- Mobile weekly view ("Disponib."): 3 day columns per screen, paged; each half hour "N disponibles" with heat colors (green high, amber mid, orange low, dark red "Completo"); red line at the current time.
- Opening hours by weekday: Mon–Fri 08–22, Sat 09–22, Sun 10–17.
- Booking comment field; members can book with "Socio a designar" and fill names later; guests in member bookings are typed by name and surname only.
- Admin: bookings list with search, date range, filters and Excel export; per-booking change log (created by/at, every version with players/court/state and who changed it); edit modal; bulk select/cancel; cancellations list with reason, cancelled by and how early; 7 reports (monthly/daily/hourly usage, general, by booking type, ranking of bookings per player with cancellations and % cumplimiento, ranking of cancellations) with export; news board (cartelera) sent by email + push to tennis players.

## Scope (all decided to match the previous system)
1. Grid & calendar redesign (member, manager, canchero), day navigator, 7-day view window, weekly availability view, names visible in the grid.
2. Rules: opening hours per weekday, booking comment, "Socio a designar" players, member guests by name+surname only (no DNI), price quote before confirming.
3. Manager: bookings list + filters + export (CSV/text share, no new native modules), per-booking history, cancellations list, cancel from the grid, bulk cancel, collect no-show charge, tennis news board (push + email), opening hours and view window in Reglas.
4. Canchero: check-in card shows pending difference / no-show charge, approve receipts and settle adjustments from the canchero tab, extension on another free court.
5. Reports: monthly/daily/hourly usage, general, by type, ranking of bookings (with cancellations and % cumplimiento), ranking of cancellations, with export.
6. Audit leftovers: F10 (cron counts skipped mails as failures).

## Out of scope
Tournaments, Rincón del Hincha, Viumi, TOTP on QR check-in (open decision), tutor agenda, database.types.ts regeneration.

## Constraints
- Migrations and Edge Function deploys only with Agus's OK; OTA only when Agus asks. Never edit applied migrations (`20261112…`–`20261127…`): everything new goes in `20261128000000_tenis_paridad_ondepor.sql`.
- No new native modules (OTA only): use React Native `Share`, `expo-clipboard`, `expo-file-system`.
- Spanish UI copy; colors only from `app/constants/theme.ts` tokens; AA contrast.
- Test-first for SQL (throwaway `postgres:17`, `MSYS_NO_PATHCONV=1`) and pure helpers (`*.check.ts`).

## Shared contract (all workstreams build against these names)

### Migration `supabase/migrations/20261128000000_tenis_paridad_ondepor.sql`
1. **Opening hours by weekday**: table `tenis_horarios(dia_semana int primary key check 1..7 /*ISO*/, hora_desde time, hora_hasta time, activo boolean default true)`, seeded Mon–Fri 08:00–22:00, Sat 09:00–22:00, Sun 10:00–17:00. All slot validation uses the day's hours (fallback to `tenis_config.hora_desde/hasta` when a row is missing). `tenis_horarios_guardar(p jsonb)` (gestor) and the rows are returned in config payloads as `horarios: [{dia_semana, hora_desde, hora_hasta, activo}]`. Availability payloads add `horario: {desde, hasta}` for the requested date.
2. **View window**: `tenis_config.dias_vista int default 7` (editable in `tenis_config_guardar`). `tenis_disponibilidad(p_fecha)` and `tenis_grilla(p_fecha)` accept dates from today to today + `dias_vista - 1`; the payload adds `reservable boolean` (false when outside `anticipacion_dias`).
3. **Names visible**: `tenis_disponibilidad` booking items add `jugadores: [{nombre}]` for every booking (display name "APELLIDO, NOMBRE" from `nombre_padron`, guests "Nombre Apellido", placeholders "Socio a designar"); no ids/DNI for other people's bookings.
4. **Comment**: `tenis_reservas.comentario text` (≤ 280 chars, trimmed, null if empty). New trailing param `p_comentario text default null` on `tenis_reservar`, `tenis_reservar_staff`, `tenis_editar_reserva`, `tenis_invitado_reservar` (drop the old signatures and recreate; keep grants). Summaries include `comentario`.
5. **"Socio a designar"**: player entry `{a_designar: true}` creates a player row with `socio_id` and `invitado_id` null and `a_designar = true` (update the exactly-one check accordingly), charged at the socio price (`motivo_cargo 'a_designar'`). The titular replaces it later via `tenis_editar_reserva`; check-in/no-show treat it as an unpaid player of the titular.
6. **Member guests by name only**: entry `{invitado: {nombre, apellido}}` without `dni` is accepted in `tenis_reservar`, `tenis_reservar_staff`, `tenis_editar_reserva` (`tenis_invitados.dni` becomes nullable; a new guest row per booking when no DNI). Guest web titulars still require DNI + email.
7. **Weekly availability**: `tenis_disponibilidad_semana(p_desde date, p_dias int default 7, p_modalidad text default 'singles')` → `[{fecha, reservable, slots: [{hora 'HH:MM', libres int, total int}]}]` = courts where a turn of that modality can start (hours, blocks, overlaps; the no-gap rule applies to members except same day). Authenticated members; also used by gestor/canchero.
8. **Booking history**: table `tenis_reservas_historial(id, reserva_id, version int, accion text /*creada|editada|jugadores|cancelada|estado|cobro*/, snapshot jsonb /*fecha,inicio,fin,cancha,modalidad,estado,comentario,jugadores[nombre,cobrado]*/, hecho_por uuid null, hecho_at timestamptz)` filled by triggers (one row per committed change, coalescing player changes of the same statement where reasonable). RPC `tenis_reserva_historial(p_reserva_id)` → `{reserva:{tipo, creada_at, creada_por_nombre}, versiones:[{version, accion, snapshot, hecho_por_nombre, hecho_at}]}` for gestor/canchero and the titular of that booking.
9. **Cancellations**: `tenis_reservas.cancelacion_anticipacion_min int` set when a booking is cancelled (minutes before `inicio`, negative if after). RPC `tenis_canceladas_listar(p_desde date, p_hasta date, p_q text default null, p_motivo text default null, p_cancelado_por text default null /*titular|staff|sistema*/, p_limit int default 50, p_offset int default 0)` → `{total, items:[resumen + cancelacion_motivo, cancelado_por_nombre, cancelado_por_tipo, cancelacion_anticipacion_min]}` (gestor/canchero).
10. **Bookings list**: `tenis_reservas_listar(p_desde date, p_hasta date, p_q text default null, p_cancha_id uuid default null, p_origen text default null, p_estado text default null, p_limit int default 50, p_offset int default 0)` → `{total, items:[staff resumen + comentario + origen]}` (gestor/canchero). `p_q` matches player names, DNI or member number.
11. **Bulk cancel**: `tenis_cancelar_varias(p_ids uuid[], p_motivo text)` (gestor) → `{canceladas: [aviso], omitidas: [{reserva_id, codigo}]}`.
12. **Reports**: `tenis_reporte(p_tipo text, p_desde date, p_hasta date)` (gestor) with `p_tipo` in `uso_mensual | uso_diario | uso_hora | uso_general | uso_tipo | ranking_reservas | ranking_cancelaciones` → `{tipo, filas: [...]}`; usage = booked minutes / available minutes (opening hours × courts − blocks) as %, by month / weekday / hour; `uso_tipo` = minutes per booking type (web socio, telefónica, invitado, clase, entrenamiento, torneo, no disponible, en suspenso); `ranking_reservas` = per person {nombre, numero_socio, reservas, cancelaciones, no_shows, total, cumplimiento %}; `ranking_cancelaciones` = per person sorted by cancellations.
13. **News board**: table `tenis_novedades(id, titulo, texto, destacada boolean default false, creado_por, created_at, enviada_at, push_enviados int, mails_enviados int)`, RLS closed; RPCs `tenis_novedades_listar(p_limit int default 20)` (any authenticated member), `tenis_novedad_guardar(p jsonb) → id`, `tenis_novedad_borrar(p_id)` (gestor). Audience for sending: members with Carnet/Becado Tenis or any tennis booking in the last 120 days, plus their tutors (helper `tenis_audiencia_novedades()` → socio ids, service role).
14. **Canchero check-in**: `tenis_checkin` jugador adds `monto_cobrado`, `diferencia`, `cargo_no_show`, `cargo_no_show_cobrado`, `pendiente`.
15. **Quote**: `tenis_cotizar(p_cancha_id uuid, p_inicio timestamptz, p_modalidad text, p_jugadores jsonb, p_reserva_id uuid default null)` → `{jugadores:[{nombre, cargo, motivo}], total}` without writing (same validations as booking, returns their error codes).
16. New error codes go in the migration header list.

### Edge Functions
- `tenis-gestion`: new actions `publicar-novedad {novedad_id}` (push to `tenis_audiencia_novedades()` via `tenisNotificar`, mail to those with email; stores counts and `enviada_at`) and `cancelar-varias {reserva_ids, motivo}` (calls `tenis_cancelar_varias` with the caller JWT, then the same notices as `bloqueo-puntual`).
- `tenis-invitados`: `disponibilidad` honours opening hours per weekday (from the DB); `reservar` accepts `comentario`.
- `tenis-cron`: F10 — a skipped mail (no email) is not counted as a failure.

### App file ownership (to avoid conflicts)
- **Grid/calendar writer**: `app/components/tenis/GrillaCanchas.tsx`, new `NavegadorDia.tsx`, `DisponibilidadSemana.tsx`, `app/lib/tenisGrilla.ts` (+ `.check.ts`), wiring in `TenisSocio.tsx` (grid area only), `GrillaGestor.tsx`, `app/app/(porteria)/tenis.tsx` (grid area only).
- **Manager writer**: `app/app/(subcomision)/canchas.tsx`, new `ListadoReservas.tsx`, `HistorialReserva.tsx`, `Canceladas.tsx`, `Reportes.tsx`, `CarteleraTenis.tsx`, `DetalleItem.tsx`, `ReglasPrecios.tsx`, new `app/hooks/useTenisGestion.ts`, `app/lib/tenisGestion.ts` (+ `.check.ts`).
- **Member/canchero flow writer**: `FormReserva.tsx`, `BuscadorJugador.tsx`, new `NovedadesTenis.tsx`, `TenisSocio.tsx` (form/novedades areas only), `app/app/(porteria)/tenis.tsx` (check-in card, receipts/adjustments access, extension), `app/lib/tenisReserva.ts` (+ `.check.ts`), `app/hooks/useTenisSocio.ts`.
- Shared `app/lib/tenis.ts`: only additive parser/type changes for new payload fields; prefer the new lib files.

## Tasks
- [x] P0 — Feature document + Engram mirror. Route: inline.
- [x] P1 — DB migration + SQL tests (contract 1–16). Route: delegated writer, worktree `tenis-p-db`.
- [x] P2 — Edge Functions + guest web (hours per weekday, comment) + F10. Route: delegated writer, worktree `tenis-p-fn`.
- [x] P3 — Grid/calendar redesign. Route: delegated writer, worktree `tenis-p-grilla`.
- [x] P4 — Manager screens (list, history, cancellations, bulk cancel, no-show collect, reports, news board, hours/window in Reglas). Route: delegated writer, worktree `tenis-p-gestion`.
- [x] P5 — Member/canchero flows (comment, a designar, guests by name, quote, news in the sheet, canchero card/receipts/extension). Route: delegated writer, worktree `tenis-p-flujo`.
- [ ] P6 — Integration, checks, sliced review, PRs, deploy with OK.
- [x] P7 — multi-court blocks, fullscreen landscape grid (OTA), review fixes. Route: delegated writer (2+ non-trivial files). Commits `979b6da` (news send resumable, weekday hours seeded from config, SQL tests) and `314a30c` (multi-court blocks, `GrillaPantallaCompleta`, review fixes). Checks: app tsc clean; 58 `app/lib/*.check.ts` ok; `tenisReglas.check` 36; `web/lib/tenis.check` 27; strict tsc of the 3 functions clean; SQL 176/40/49/76/181 ok.
- [x] P10 — canchero sees carnet turns of the day. Route: delegated writer, worktree `tenis-carnet-turnos` (branch `feat/tenis-canchero-turnos-carnet`). Migration `20261202000000_tenis_checkin_turnos_carnet.sql` redefines only `tenis_checkin`: each `jugador` adds `carnet` (`socio_habilitado_deporte(socio, 'tenis')`: tennis service or "Becado Tenis" category; false for guests), `turnos_dia` and `turno_n`. Counting mirrors `tenis_cargo_jugador` (20261128000000, lines 307–321): the person's bookings that day (Argentina time) not `cancelada`/`vencida`, extensions included; `turno_n` orders them by `created_at` (booked first = the free one, not the earliest start). The charge shown is still the stored `cargo`/`motivo`. The check-in card shows "Carnet Tenis · Nº turno de hoy (juega N hoy) · sin cargo / paga como socio $ X" (`etiquetaCarnetTurno` in `app/lib/tenisReserva.ts`). Booking detail (`DetalleItem`) not touched: the reservation summary has no per-day count. Commits `cf0b068` (SQL + test), `529c2e8` (app). Checks: RED then GREEN `tenis_checkin_turnos_carnet` 10 ok; SQL 176/40/49/76/181 ok; app tsc clean; `tenisReserva.check` 15, `tenis.check` 47 ok. Deploy: apply the migration, then OTA.

Route evidence: 5 parallel writers in separate worktrees with disjoint file ownership; authorised by Agus 2026-11-26.

## Acceptance criteria
- On a 390px phone the daily grid shows all 8 courts without horizontal scroll, sticky header, names of all players in each block, day navigation and a weekly availability view; members see 7 days and can only book within the booking window.
- Opening hours per weekday enforced on app, web and server.
- Manager can list/search/export bookings, see a booking's history, list cancellations, cancel one or many, collect no-show charges, publish tennis news with push, read the 7 reports.
- Canchero sees pending differences, can approve receipts/settle adjustments and extend on another court.
- Members can add a comment, book with "Socio a designar", add guests by name only, and see the price before confirming.

## Progress
- 2026-11-26: analysis of the previous booking system (features + mobile UI) and audit of the current code; document created on the feature branch from `origin/main` (`58508b4`).
- 2026-11-26: P1 `6de95b3` (migration + 165 SQL tests), P2 `10b078e` (functions + guest web + F10), P3 `d3852c5` (grid redesign), P4 `61299e9` (manager screens), P5 `49bf3d6` (member/canchero flows) merged into this branch (`98d17be`); integration `6df2508` + `572e19f` (parsers, phone-booking comment/quote, keep placeholders on correction, canchero a-designar collection, novedad totals via RPC).
- Checks after integration: app tsc clean; 58 `app/lib/*.check.ts` ok; `tenisReglas.check` 36; `web/lib/tenis.check` 27; web tsc clean; strict tsc of the 3 functions clean; SQL tests 176/40/49/76/165 ok. The four older SQL files run with the full chain only differ by design (weekday hours, visible names) or by a pre-existing 1127 behaviour.
- Deviations from the contract: staff see any date (window applies to members); names shown as stored in the padrón ("Pérez Juan"), not "APELLIDO, NOMBRE"; canchero can cancel single bookings, bulk cancel is gestor-only; news mail in Resend batches of 100.
- Open: decision on a paid "Socio a designar" replaced by a real player (today: refund + full charge to the new player); canchero card has no separate no-show-only collect button; `CorregirJugadores` still asks DNI for new guests; history starts with this migration (older bookings have no versions); Android CSV export goes as text.
- 2026-11-26 (P7, decided by Agus): a new fixed or one-off block can go on several courts (one block per court; TODAS or every court = one all-courts block; editing stays single-court). "PANTALLA COMPLETA" in the gestora and canchero grids opens the day grid rotated 90° in a modal (app stays portrait, no native modules, ships by OTA). Review fixes: news sending is claimed with `tenis_novedad_reclamar` and records push and mail stages, so a cut send can be retried after 15 minutes without repeating the push (mails are resent whole); the app no longer offers "VOLVER A PUBLICAR" (the server never allowed it), it shows "REINTENTAR ENVÍO" for an unfinished send. `tenis_horarios` seeds Mon–Fri from `tenis_config` hours. Exports page through the 500-row RPC cap (the cancellations export was silently capped at 500) and warn above 2000 rows.
- Left open from the review: `mailsDeProfiles` latency for big audiences (one auth lookup per profile); `useNovedadesTenis` has no latest-request guard (`useTenisSocio.ts`, outside P7 surfaces); weekly view treats a missing `reservable` as not bookable (conservative, server always sends it); header counts use all items (the grid RPC returns one day only); `tenis_validar_persona` with an "a designar" slot is covered by the passing SQL tests; component-level tests (no runner in `app/`). To test on a phone: fullscreen grid on iPhone and Android (rotation, taps, detail and editor modals over it).
- Next: P6 sliced review, PR(s), backup + migration + functions deploy + OTA only with Agus's OK.
