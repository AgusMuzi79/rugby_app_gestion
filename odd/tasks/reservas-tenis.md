# Feature: reservas-tenis

## Objective
Replace OnDepor for tennis court bookings: members book from the app, non-members book from a public web page (email confirmation + payment receipt), the tennis subcomisión manages everything from her phone, and the canchero checks players in by DNI.

## Problem
Today the club uses OnDepor (club id 604). Players are registered with free text, so names are wrong, the "SOCIO A DESIGNAR" placeholder is used for paid second turns, guests are not validated, no-shows are hard to sanction, and the manager approves every new member by asking Secretaría by hand. The club publishes notices on Instagram to fix behaviour that the system should enforce.

## Why
The app already knows who is a member, who is up to date (NUVIX traffic light) and who has the "Carnet Tenis" service. Using that data removes the manual whitelist, computes prices automatically and lets the canchero validate every player against a real booking.

## Scope (decided with Agus and the tennis subco manager, 2026-11-17 → 2026-11-20)
- Tennis courts only. Rincón del Hincha / salón and tournaments are OUT (later). Viumi is OUT (later); payments are collected on site or by transfer receipt.
- 8 clay courts (01–08), 08:00–22:00, 30-minute modules. Singles 1 h, doubles 1 h 30 (the booking asks the match type).
- Turns start 5 minutes after the booked time (court sweeping); the app shows the real start ("18:05").
- Limits per titular: max 1 booking per day, max 2 active, up to 2 days ahead. A booking stops counting as active as soon as its turn ends (not at midnight).
- Cancellation up to 3 h before the turn. Refunds are paid in cash by club administration; the app only records them.
- Prices per player: socio single $9.000, socio doubles $10.000; non-member single $16.000, non-member doubles $18.000. A member with Carnet Tenis plays the first turn of the day for free; any further turn that day is charged at the socio price. Members without Carnet Tenis pay the socio price.
- Every player is identified: members are picked from the padrón (no free text, no app account needed); guests by DNI + name + surname.
- The titular (who booked) is responsible: on a no-show the full booking (all players) is charged to the titular and an infraction is logged.
- Sanctions: the first infraction is forgiven (warning), from the second one the manager sets a suspension with a free number of days; a suspended person cannot book or be added as a player.
- Minors 13–17 book by themselves and are responsible themselves (the app's 13+ floor still applies; under-13 only appear as players added by others).
- Bookings are recreational only; classes/academy are manager blocks.
- Guests (non-members) book on a public web page: DNI, name, surname, email → slot held 15 min → confirm through a one-time email link (otherwise discarded) → upload the transfer receipt (alias `uncas.tenis.macro`) until 3 h before the turn (otherwise auto-cancelled) → manager or canchero approves/rejects it in the app (rejection emails the guest with the reason).
- Manager (rol `subcomision` with `profiles.deporte = 'tenis'`, or `admin`) works ONLY from the mobile app (no admin web panel): daily grid per court, recurring blocks with an end date (academy, coaches), one-off blocks (rain, maintenance) that cancel affected bookings and notify them, phone bookings, pending receipts, infractions and suspensions, rules and prices.
- Canchero (rol `canchero`): types the DNI (or scans the QR) to check a player in; sees whether the person has a booking now, payment status and suspension; fixes players of a booking before they enter; marks a charge as collected; records an extension when players stay on a free court after their turn.
- Grid colors per booking type, same palette as OnDepor: Reserva Web `#10577D`, Reserva Telefónica `#4094C4`, Torneo `#F06B3A`, Clase/Escuelita `#499A6B`, Entrenamiento `#F5D580` (academy), No disponible `#BABFC2`, En suspenso `#ACD2E7`; guest bookings use the Web color with a "Invitado" label. Recurring blocks show a ↻ icon. Text color must keep AA contrast on each background (dark text on yellow/grey/light blue).

## Out of scope
Rincón del Hincha / salón, tournaments, Viumi / online payment, admin web panel, booking reminder push, reports (phase 2).

## Constraints
- Migrations are applied to production only with Agus's OK. Edge Functions are deployed only with Agus's OK. Mobile ships via OTA/build only when Agus asks.
- Behind feature flags: `FEATURES.tenis = false` in `app/constants/features.ts` (and `web/lib/features.ts`) until launch.
- RLS closed on every new table: reads/writes go through SECURITY DEFINER RPCs or service-role Edge Functions. Socios never read other people's data beyond a minimal player search (id, display name, member number).
- Time zone: Argentina (UTC-3), same approach as `gimnasio_ahora()`.
- UI copy in Spanish; colors as tokens in `app/constants/theme.ts`.
- Emails via `_shared/email.ts` (Resend, `uncasapp.com`). Push via `_shared/expoPush.ts`.
- `socio_habilitado_deporte(socio, 'tenis')` already matches the "Carnet Tenis" service and the "Becado Tenis" category; use it as the free-first-turn rule.

## Shared contract (all workstreams build against these names)

### Migration `supabase/migrations/20261112000000_reservas_tenis.sql`
Tables (all `enable row level security`, no client policies except where stated):
- `tenis_config` (single row, `id boolean primary key default true check (id)`): `hora_desde time default '08:00'`, `hora_hasta time default '22:00'`, `modulo_min int default 30`, `margen_inicio_min int default 5`, `singles_min int default 60`, `dobles_min int default 90`, `max_reservas_dia int default 1`, `max_activas int default 2`, `anticipacion_dias int default 2`, `cancelacion_horas int default 3`, `comprobante_horas_antes int default 3`, `hold_min int default 15`, `alias_pago text default 'uncas.tenis.macro'`, `precio_socio_single int default 9000`, `precio_socio_dobles int default 10000`, `precio_nosocio_single int default 16000`, `precio_nosocio_dobles int default 18000`, `bloquear_morosos boolean default true`, `updated_at`, `updated_by`.
- `tenis_canchas`: `id uuid pk`, `nombre text unique` ('01'..'08', seeded), `superficie text default 'polvo de ladrillo'`, `luz boolean default true`, `activa boolean default true`, `orden int`.
- `tenis_bloques`: `id uuid pk`, `cancha_id uuid null` (null = all courts), `tipo text check in ('clase','entrenamiento','torneo','no_disponible','en_suspenso')`, `titulo text not null`, `dia_semana int null check 1..7` (ISO; null = one-off), `fecha date null` (one-off), `hora_desde time`, `hora_hasta time`, `vigente_desde date`, `vigente_hasta date null`, `activo boolean default true`, `creado_por uuid`, `created_at`. Check: exactly one of (`dia_semana`, `fecha`) set.
- `tenis_invitados`: `id uuid pk`, `dni text unique not null`, `nombre text`, `apellido text`, `email text`, `created_at`, `updated_at`.
- `tenis_reservas`: `id uuid pk`, `cancha_id uuid not null`, `inicio timestamptz not null`, `fin timestamptz not null`, `rango tstzrange generated always as (tstzrange(inicio, fin, '[)')) stored`, `modalidad text check in ('singles','dobles')`, `origen text check in ('socio','invitado','telefonica','extension')`, `titular_socio_id uuid null`, `titular_invitado_id uuid null` (exactly one set), `estado text check in ('pendiente_confirmacion','pendiente_comprobante','confirmada','jugada','no_show','cancelada','vencida')`, `hold_vence_at timestamptz null`, `confirmacion_token_hash text null`, `comprobante_path text null`, `comprobante_estado text null check in ('pendiente','aprobado','rechazado')`, `comprobante_motivo text null`, `comprobante_vence_at timestamptz null`, `cancelada_por uuid null`, `cancelada_at timestamptz null`, `cancelacion_motivo text null`, `creado_por uuid null`, `created_at`.
  Exclusion constraint (`btree_gist`): no overlap of `rango` per `cancha_id` while `estado in ('pendiente_confirmacion','pendiente_comprobante','confirmada','jugada')`.
- `tenis_reserva_jugadores`: `id uuid pk`, `reserva_id uuid not null on delete cascade`, `socio_id uuid null`, `invitado_id uuid null` (exactly one set), `es_titular boolean default false`, `cargo int not null default 0`, `motivo_cargo text check in ('carnet_gratis','turno_extra','socio','no_socio','no_show')`, `cobrado boolean default false`, `cobrado_por uuid null`, `cobrado_at timestamptz null`, `check_in_at timestamptz null`, `check_in_por uuid null`. Unique (`reserva_id`, `socio_id`) and (`reserva_id`, `invitado_id`).
- `tenis_infracciones`: `id uuid pk`, `socio_id uuid null`, `invitado_id uuid null`, `reserva_id uuid null`, `tipo text check in ('no_show','jugadores_incorrectos','otra')`, `nota text`, `perdonada boolean default false`, `creado_por uuid null` (null = automatic), `created_at`.
- `tenis_suspensiones`: `id uuid pk`, `socio_id uuid null`, `invitado_id uuid null`, `desde date not null`, `hasta date not null`, `motivo text`, `creado_por uuid`, `created_at`.
- `tenis_invitados_intentos`: rate limit (`clave text`, `created_at`), same pattern as `recupero_intentos`.
- Storage bucket `tenis-comprobantes` (private; writes only via signed upload URLs issued by the Edge Function; read by gestor/canchero via signed URLs).

Helpers (SECURITY DEFINER, `search_path = public`, revoked from PUBLIC/anon unless stated):
- `tenis_ahora()` → timestamptz in Argentina; `es_gestor_tenis()` → admin, or rol subcomision with deporte 'tenis'; `es_canchero()` → rol canchero (or gestor).
- `tenis_cargo_jugador(p_socio_id uuid, p_invitado_id uuid, p_inicio timestamptz, p_modalidad text, p_excluir_reserva uuid)` → `(cargo int, motivo text)`: guest → non-member price; member with `socio_habilitado_deporte(socio,'tenis')` and no other non-cancelled booking that local day as player → 0 `carnet_gratis`; member with carnet and another turn that day → socio price `turno_extra`; other members → socio price `socio`.
- `tenis_suspendido(p_socio_id, p_invitado_id, p_fecha date)` → boolean.

RPCs callable by `authenticated` (each checks its own role; errors return stable codes via `raise exception using errcode = 'P0001', message = '<codigo>'`):
- Socio: `tenis_disponibilidad(p_fecha date)` → jsonb `{config, canchas, items:[{cancha_id, inicio, fin, tipo, titulo, recurrente, mio}]}` (no names of other people for socios); `tenis_buscar_jugadores(p_q text)` → up to 20 `{socio_id, nombre, numero_socio}` of active members, excluding suspended; `tenis_reservar(p_cancha_id uuid, p_inicio timestamptz, p_modalidad text, p_jugadores jsonb)` where `p_jugadores` = array of `{socio_id}` or `{invitado:{dni,nombre,apellido}}` excluding the titular (singles: 1, doubles: 3) → `{reserva_id, jugadores:[{nombre, cargo, motivo}], total}`; `tenis_cancelar(p_reserva_id uuid, p_motivo text)`; `tenis_mis_reservas()`.
- Gestor: `tenis_grilla(p_fecha date)` (like disponibilidad but with players, payment and check-in), `tenis_reservar_staff(...)` (same args + `p_titular jsonb`, `p_origen 'telefonica'`, skips day/active limits), `tenis_bloque_guardar(p jsonb)` → id, `tenis_bloque_borrar(p_id)`, `tenis_bloqueo_puntual(p_cancha_id uuid null, p_desde timestamptz, p_hasta timestamptz, p_tipo, p_titulo)` → `{bloque_id, reservas_canceladas:[ids]}`, `tenis_config_guardar(p jsonb)`, `tenis_comprobantes_pendientes()`, `tenis_comprobante_resolver(p_reserva_id, p_aprobado boolean, p_motivo text)`, `tenis_infracciones_listar()`, `tenis_infraccion_crear(...)`, `tenis_infraccion_perdonar(p_id)`, `tenis_suspender(p_socio_id, p_invitado_id, p_dias int, p_motivo text)`, `tenis_suspension_levantar(p_id)`.
- Canchero (also gestor): `tenis_checkin(p_dni text)` → `{persona:{tipo, nombre, semaforo}, reserva:{...} | null, jugador:{cargo, cobrado}, suspendido, resultado: 'ok'|'sin_reserva'|'suspendido'|'comprobante_pendiente'}` (window: from 15 min before `inicio` to `fin`; on ok sets `check_in_at` and inserts `accesos(socio_id, punto='tenis', semaforo)` for members), `tenis_jugadores_corregir(p_reserva_id, p_jugadores jsonb)` (recomputes charges, logs `jugadores_incorrectos` optionally), `tenis_cobro_marcar(p_jugador_id, p_cobrado boolean)`, `tenis_extension(p_cancha_id, p_hasta timestamptz, p_reserva_origen uuid)`.
- Service role only: `tenis_invitado_reservar(p_cancha_id, p_inicio, p_modalidad, p_titular jsonb, p_jugadores jsonb, p_token_hash text)` → `{reserva_id, hold_vence_at, total}`; `tenis_invitado_confirmar(p_token_hash)` → `{reserva_id, comprobante_vence_at, total, alias}`; `tenis_invitado_comprobante(p_reserva_id, p_token_hash, p_path)`; `tenis_procesar()` (cron): expire holds → `vencida`; `pendiente_comprobante` past `comprobante_vence_at` → `cancelada`; `confirmada` whose `fin` passed → `jugada` if any check-in else `no_show` (charge every player's price to the titular row with `motivo_cargo 'no_show'` and insert an automatic infraction; first infraction of a person is marked as warning). Returns jsonb summary of affected bookings for notifications.

### Edge Functions
- `tenis-invitados` (public, deploy `--no-verify-jwt`, CORS for `uncasapp.com`): actions `disponibilidad` (occupied slots only), `reservar` (validates, rate-limits by DNI/email/IP, creates hold with a random token, emails the confirmation link `https://uncasapp.com/tenis/confirmar?t=<token>`), `confirmar` (token → confirmed hold, returns amount + alias + deadline), `subir-comprobante` (token → signed upload URL to `tenis-comprobantes/<reserva_id>/<uuid>.<ext>`, max 5 MB, jpg/png/pdf), `registrar-comprobante` (token + path). Tokens are stored hashed (SHA-256), never logged.
- `tenis-gestion` (JWT, gestor/canchero): actions that need email/push after an RPC: `resolver-comprobante` (RPC then email to the guest), `bloqueo-puntual` (RPC then push to affected members / email to affected guests), `ver-comprobante` (signed read URL, 5 min).
- `tenis-cron` (`x-cron-secret`, deploy `--no-verify-jwt`, every 5 min): calls `tenis_procesar()` and sends pushes/emails for cancellations, no-shows and warnings.
- Pure rules in `supabase/functions/_shared/tenisReglas.ts` with `tenisReglas.check.ts` (slot math, start buffer, price per player, limits, deadlines).

### App (Expo)
- `FEATURES.tenis` flag. Tokens `tenis.*` in `app/constants/theme.ts` (the 7 colors + readable text color for each).
- Socio / tutor-view excluded: the socio's Agenda tab shows a "Tenis" section for every active member when the flag is on: day selector (today + 2 days), grid per court, booking form (singles/doubles, player search via `tenis_buscar_jugadores`, guest by DNI), price summary, "Mis reservas" with cancel (disabled under 3 h).
- Gestor: new "Canchas" tab for subcomisión with deporte tenis (and admin): daily grid with colors and ↻, block editor (recurring/one-off), phone booking, pending receipts (view image, approve/reject with reason), infractions and suspensions, rules and prices.
- Canchero: new "Tenis" tab in the `(porteria)` layout for rol canchero: DNI input + existing QR scanner hook, check-in result card, today's agenda per court, fix players, mark collected, extension.

### Web (Next.js)
- Public pages (no login) under `web/app/tenis/`: `reservar` (date + court grid of free slots, form: DNI, nombre, apellido, email, singles/doubles, other players as members-by-DNI-or-guests), `confirmar` (reads `?t=`, confirms, shows amount + alias `uncas.tenis.macro` + deadline + receipt upload), status/error states. Uses `tenis-invitados` only; no Supabase session. Guarded by `web/lib/features.ts` `tenis` flag (404 when off).

## Tasks
- [ ] T0 — Feature document + Engram mirror. Route: inline.
- [x] T1 — DB: migration `20261112000000_reservas_tenis.sql` (tables, constraints, seed courts + config, helpers, all RPCs, bucket) + SQL tests in `supabase/tests/`. Route: delegated writer (worktree `tenis-db`), parallel. Evidence: `supabase/tests/reservas_tenis.sql` in a disposable `postgres:17` container, 131/131 assertions ok, exit 0 (migration NOT applied to any Supabase project).
- [x] T2 — Edge Functions `tenis-invitados`, `tenis-gestion`, `tenis-cron` + `_shared/tenisReglas.ts` with `.check.ts`. Route: delegated writer (worktree `tenis-functions`), parallel.
- [x] T3 — App: flag, theme tokens, socio booking, gestor "Canchas" tab, canchero "Tenis" tab. Route: delegated writer (worktree `tenis-app`), parallel.
- [ ] T4 — Web: public guest booking + confirmation + receipt upload pages. Route: delegated writer (worktree `tenis-web`), parallel.
- [ ] T5 — Integration: merge the four branches into `feat/reservas-tenis`, fix contract mismatches, full checks. Route: inline/delegated as needed.

### T1 notes (deviations and additions to the contract; names unchanged)
- Players JSON also accepts `{dni}` (member by DNI, or an existing guest). `{invitado:{dni,...}}` whose DNI belongs to an active member resolves to that member. `tenis_invitado_reservar` rejects `{socio_id}` (public web) and a titular who is an active member (`titular_es_socio`).
- "Active member" = `socios.estado <> 'inactivo'` and category not `Cliente Gimnasio`.
- Non-titular players who are suspended or moroso fail with the same code `jugador_no_habilitado` (privacy); titulars get `titular_suspendido` / `titular_moroso`. The player search also hides suspended and (when `bloquear_morosos`) red-light members.
- Staff phone booking skips only the day/active limits; 2-days-ahead, grid, hours, blocks, suspension and moroso still apply.
- Guest bookings need `inicio - comprobante_horas_antes > now + hold_min` (`plazo_invitado`). Receipt deadline cancellation skips bookings whose receipt is waiting for review (`comprobante_estado = 'pendiente'`); a rejected receipt can be replaced until the deadline. Approving marks every player `cobrado`.
- No-show charge: list price (socio/non-member) of every unpaid player goes to the titular row (`motivo_cargo 'no_show'`), other unpaid rows go to 0. The first infraction of a person (automatic or manual) is stored with `perdonada = true`.
- Extra columns: `tenis_suspensiones.levantada_at/levantada_por` (lifting keeps history). Extra keys in several jsonb responses (e.g. `reservas` with notification data in `tenis_bloqueo_puntual`, `profile_id`/`email` of the titular in `tenis_procesar`).
- `tenis_infracciones_listar()` returns `{infracciones:[...], suspensiones:[...]}`; `tenis_infraccion_crear(p_socio_id, p_invitado_id, p_reserva_id, p_tipo, p_nota)` returns `{infraccion_id, advertencia}`; `tenis_jugadores_corregir` adds optional `p_registrar_infraccion boolean, p_nota text`.
- `tenis_bloque_guardar` does not cancel existing bookings (only `tenis_bloqueo_puntual` does). Cancelling the free carnet turn does not recompute the player's other bookings that day.
- Known gap: a guest receipt approved after the turn ended is resolved by the next cron as `no_show` (no check-in was possible while pending).

### T3 notes (app, branch `feat/reservas-tenis-app`)
- Commits: `35f8861` flag + tokens + `lib/tenis.ts` (test-first, `tenis.check.ts`), `07a4bd9` socio Agenda section, `b4a3743` gestor "Canchas" tab, `b956215` canchero "Tenis" tab.
- RPCs are called untyped through `app/hooks/useTenisRpc.ts` (not in `database.types.ts` yet); every response is parsed tolerantly in `lib/tenis.ts` / `hooks/useTenisGestor.ts`. Regenerate types after T1.
- Assumed shapes to reconcile in T5: grid items carry `tipo` = booking origin (`socio`/`invitado`/`telefonica`/`extension`) or block type, plus (grilla) `reserva_id`, `bloque_id`, `estado`, `modalidad`, `comprobante_estado`, `jugadores[{id, nombre, es_titular, cargo, motivo, cobrado, check_in_at, socio_id, invitado_id}]`, and for recurring blocks optional `dia_semana`, `vigente_desde`, `vigente_hasta`. `tenis_mis_reservas` → array of `{id, cancha, inicio, fin, modalidad, estado, es_titular, jugadores[{nombre,cargo,motivo}], total}`. `tenis_comprobantes_pendientes` → array of `{reserva_id, cancha, inicio, fin, modalidad, titular, email, total, comprobante_vence_at}`. `tenis_infracciones_listar` → `{infracciones:[{id, socio_id, invitado_id, nombre, tipo, nota, perdonada, creado_por, created_at}], suspensiones:[{id, socio_id, invitado_id, nombre, desde, hasta, motivo}]}`. `tenis_checkin` → `jugador.id` (row id, needed to mark collected) and `reserva.cancha`.
- Assumed args: `tenis_infraccion_crear(p_socio_id, p_invitado_id, p_reserva_id, p_tipo, p_nota)`; `tenis_jugadores_corregir(p_reserva_id, p_jugadores, p_infraccion boolean)` where a kept guest goes as `{invitado_id}`; `tenis_bloque_guardar(p)` with `{id?, cancha_id, tipo, titulo, dia_semana, fecha: null, hora_desde, hora_hasta, vigente_desde, vigente_hasta}`; `tenis-gestion` bodies `{action:'bloqueo-puntual', cancha_id, desde, hasta, tipo, titulo}` → `{reservas_canceladas}`, `{action:'ver-comprobante', reserva_id}` → `{url}`, `{action:'resolver-comprobante', reserva_id, aprobado, motivo}`; errors as `{codigo}` in the body.
- The canchero also calls `tenis_grilla` (today's agenda): `tenis_grilla` must accept `es_canchero()`, not only the gestor.
- Deviations: QR scan in the canchero tab not wired (`tenis_checkin` takes only `p_dni` and the scanner QR yields `numero_socio`; needs `p_numero_socio` or DNI from `socios-qr`). Admin lands on `(admin)`, so the "Canchas" tab is reachable only from the `(subcomision)` group (admin role check is there, but admin has no route to it). Error codes mapped in `lib/tenis.ts` `MENSAJES` are guesses; unknown codes fall back to a generic Spanish message.

Route evidence: 4 parallel writers explicitly requested by Agus on 2026-11-20 ("designa todos los agentes en simultaneo"); each runs in its own git worktree and touches a disjoint file surface; the shared contract above is the integration boundary.

## T2 notes
- Files: `_shared/tenisReglas.ts` (+ `.check.ts`, 20 cases), `tenis-invitados/index.ts`, `tenis-gestion/index.ts`, `tenis-gestion/notificar.ts` (DB reads + push/mail shared with `tenis-cron`), `tenis-cron/index.ts`. Nothing deployed.
- `tenis-gestion` calls the gestor/canchero RPCs with the caller JWT (anon client + Authorization), so `es_gestor_tenis()`/`es_canchero()` decide in the DB; service role only reads for notifications and signs URLs.
- Guest players are sent as `{dni, nombre?, apellido?}`: an active member DNI becomes `{socio_id}`, otherwise `{invitado:{...}}`. A titular whose DNI is an active member gets `titular_es_socio`.
- `disponibilidad` reads `tenis_config`/`tenis_canchas`/`tenis_reservas`/`tenis_bloques` directly (service role) and also returns free starts per modality.
- Rate limit (`reservar`): HMAC keys in `tenis_invitados_intentos` (5/h per DNI, 5/h per email, 20/h per IP via `cf-connecting-ip`); count-then-insert, not atomic.
- Expected `tenis_procesar()` summary: `{vencidas:[id], canceladas:[id], no_shows:[id], advertencias:[{socio_id|invitado_id, reserva_id}]}` (ids or objects with `reserva_id`; `canceladas_sin_comprobante` also accepted).
- For T1: bucket `tenis-comprobantes` should set `file_size_limit` 5 MB and `allowed_mime_types` jpg/png/pdf (signed upload URLs do not enforce size; `registrar-comprobante` re-checks it).
- Checks: `npx --yes tsx supabase/functions/_shared/tenisReglas.check.ts` → 20 casos ok; `deno` not installed, typechecked with `tsc --strict` + Deno shim instead (exit 0).

## Acceptance criteria
- A member books singles/doubles picking players from the padrón; prices follow the carnet rule; limits (1/day, 2 active, 2 days ahead) and the 3 h cancellation are enforced server-side.
- Two bookings can never overlap on the same court (exclusion constraint) and bookings never overlap a block.
- A guest booking that is not confirmed by email within 15 min disappears; a confirmed one without an uploaded receipt by 3 h before the turn is cancelled.
- The canchero checks a person in by DNI and sees booking/payment/suspension; without a booking the result is `sin_reserva`.
- A no-show charges all players to the titular and logs an infraction; the first one is a warning; a suspended person cannot book or be added.
- The manager does everything from the app; the grid uses the OnDepor palette with readable text.
- With `FEATURES.tenis = false` nothing new is visible in app or web.

## Checks
- `npx tsc --noEmit` in `app/` and `web/`; `npx tsx` for `*.check.ts`; `deno check` for the new Edge Functions; SQL tests reviewed (migration NOT applied to production).

## Delivery
Forecast well above 400 authored lines → chained PRs by workstream (DB → functions → app → web) under strategy `ask-on-risk`; slice boundaries recorded here after integration.

## Progress
- 2026-11-20: design closed with Agus and the tennis subco manager; document created; branch `feat/reservas-tenis` from `origin/main` (`afe721b`).

## Next step
Launch T1–T4 in parallel.
