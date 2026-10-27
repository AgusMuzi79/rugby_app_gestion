# Feature: auditoria-ux-resto (index)

Locator: `odd/tasks/auditoria-ux-resto.md` — index for the audit of every role except socio. One feature doc per area (below); full reports in `odd/auditorias/2026-10-26/`.

## Objective

Nobody loses data or money because of the app, the door lets in exactly who should get in, and every role's screens are readable, tappable and native — before store launch.

## Problem / why (audited 2026-10-26)

Six areas audited in parallel over `main` @ `5a0ce4c` (code only, no device), each with **auditor-ux** (Nielsen + WCAG 2.2 AA, S0–S4) and **impeccable audit** (native or web, /20). Every S4 below was re-checked against the code before writing this doc.

| Area | Doc | auditor-ux | impeccable | Tasks |
|---|---|---|---|---|
| Portería + gimnasio (mobile + web) | `auditoria-ux-porteria.md` | S4 4 · S3 8 | 10/20 | 17 |
| Secretaría (web + mobile) | `auditoria-ux-secretaria.md` | S4 3 · S3 9 · S2 4 | web 8 · mobile 8 | 19 |
| Entrenador + Coordinador | `auditoria-ux-entrenador-coordinador.md` | S4 3 · S3 8 · S2 1 | 8/20 | 21 |
| Manager + Subcomisión mobile | `auditoria-ux-manager-subcomision.md` | S4 2 · S3 8 · S2 2 | 7/20 | 16 |
| Web Subcomisión + Buffet + public pages | `auditoria-ux-web-subcomision.md` | S4 2 · S3 9 · S2 1 | 8/20 | 18 |
| Auth + Tutor + Admin | `auditoria-ux-auth-tutor-admin.md` | S4 2 · S3 9 · S2 1 | 8/20 | 17 |

Same root causes as the socio audit, now in the other roles: inverted `colors.tinta` (gold on cream 1.60:1 on most primary buttons), swallowed Supabase errors shown as "empty", spinner on every focus, targets < 44pt. New ones: dates computed in UTC, Edge Function error messages never reaching the screen, and destructive backend paths (cascades, permissive functions).

## Decisions

- Task IDs are per doc: "porteria T2" = T2 in `auditoria-ux-porteria.md`.
- **Order: Tanda 0 → Tanda 1 → area docs → Tanda 3.** Tanda 0 is data loss / security / store blockers; Tanda 1 builds shared helpers once so the area docs don't each reinvent them. When an area task is covered by an X-task below, mark it `[x] covered by Xn` instead of redoing it.
- Backend changes (migrations, functions) are written and tested, **never applied to production by the agent** — deploy steps go in the doc, the user deploys.
- Tasks marked **[decision]** wait for the user (list at the end).

## Tanda 0 — data loss, money, door, store (do first)

| # | Task | Why |
|---|---|---|
| 1 | **secretaria T2** — block deleting a service members have; `ON DELETE RESTRICT` | Deleting "Gimnasio" removes it from every member; the gym reader then denies everyone. |
| 2 | **web-subcomision T1 + auth T16** (same function) — `admin-usuarios`: `delete`/`deactivate`/`get-user` check target role; only admin deletes; never delete an account with a socio row | Today any Subcomisión account can delete or ban any user (admin included) by API; delete cascades to socio, cuotas, pagos. |
| 3 | **X1** — DB guard: `BEFORE DELETE ON profiles` trigger that raises if a `socios` row exists (or `socios.profile_id … ON DELETE SET NULL`) | Last line of defense: also stops "Delete user" in the Supabase dashboard from wiping a member's accounting history (`profiles → socios → cuotas/pagos_socios/accesos` all cascade). |
| 4 | **manager T1 + T2** — cobranzas: parse "15.000" correctly, upsert only changed rows, keep `fecha_pago` | "15.000" is saved as $15 (`parseFloat`); "GUARDAR TODOS" can overwrite every payment of the event. |
| 5 | **porteria T2** — reject `inactivo` in `socios-qr` validate + validate-dni | A member dado de baja is shown green "AL DÍA" at the door. |
| 6 | **porteria T8** — single-use TOTP step (`ultimo_paso_usado`) | A QR screenshot sent by WhatsApp works for ~3 min, unlimited times. |
| 7 | **porteria T1 + T3** — four-state verdict + scanner timeout/cancel | "¿Entra o no entra?" is ambiguous; with no network the scanner hangs. |
| 8 | **secretaria T1 + T4** — remove manual member creation (everything enters via the NUVIX import); roster preview shows names on removals + mass-removal guard | A manually created member is banned and re-created with a synthetic mail by the next roster import. |
| 8b | **secretaria T18 + T19** — remove "Registrar pago", every comprobante PDF/email, and `/secretaria/comprobantes` | Duplicate comprobantes and a second payment record next to NUVIX. |
| 9 | **entrenador T1** — drain `lib/offlineQueue.ts` | Attendance and injuries saved offline never reach the DB (no consumer); the screen says "registrada". |
| 10 | **secretaria T6** — remove the abandoned card flow (PAN + CVV through the panel) | PCI exposure for a flow the club already dropped; associate is broken anyway. |
| 11 | **auth T2 + T3** — normalize DNI with dots, tell first-time members the password is their DNI, surface real errors | ~1500 members' first login fails with "Credenciales incorrectas". |
| 12 | **auth T6** — terms gate must not skip on a read error | A network error lets users in without accepting the active terms (legal). |
| 13 | **web-subcomision T10** — privacy policy lists AWS Rekognition (member photos, minors included) and Mercado Pago; `eliminar-cuenta` "Qué se conserva" matches the real flow (padrón baja → import bans, nothing deleted) | Store review; Ley 25.326. |
| 13b | **X10** — verify the account-deletion path end to end: a member removed from the padrón is banned by the next import (`importar-socios:475-479`), cannot log in (`login-dni` returns a clear message, not "Credenciales incorrectas"), and is rejected at the door (porteria T2) | It is now the only deletion path (decision 6). |
| 13c | **entrenador-coordinador T22** — hide the lesiones / protocolos module behind a feature flag (code, tables and protocol content stay) and delete the injury records after the user reviews the export | Health data the club does not want to hold. |
| 14 | **auth T17** — measure GoTrue sign-in rate limit behind `login-dni` **after the DB migration to the club's account** (no staging before that); meanwhile check Auth → Rate Limits in production | All logins come from the function's IP: the launch WhatsApp blast could lock out the club. |

## Tanda 1 — shared foundations (once, app-wide)

- [x] **X2 — Local dates.** (`dc86203`) `lib/fecha.ts` (`fechaLocal()`, `fechaLocalMasDias(n)`) + `lib/fecha.check.ts`; replace every "today" built with `toISOString().split('T')[0]` / `.slice(0,10)` (28 places app-wide; list in entrenador T2, plus `useCobranzas.ts:49-51`, `useFichajes.ts:44`, `useDiarioSubcomision.ts:29-32`). Keep `timestamptz` uses. Covers entrenador T2. [OTA]
- [x] **X3 — Edge Function errors.** (`902cc03` + `696fc2b`) App `lib/errorFunction.ts` (`FunctionsHttpError` → `await error.context.json()`, `FunctionsFetchError` → "No hay conexión…") used by every `functions.invoke`; web `web/lib/edge.ts` (based on `seccion-servicios.tsx:115-143`, try/finally, timeout copy). Covers auth T3 (helper part), secretaria T13. [OTA]
- [x] **X4 — Contrast, one pass.** (`80feb1f`) App: finish replacing `colors.tinta`-as-dark call sites everywhere left (`CronicaScreen`, `UsuariosScreen`, every `edicionBar`, auth screens, admin, porteria, secretaria, entrenador, coordinador, manager, subcomisión, `components/eventos/estilo.ts`) with `sobreOro` / `oroSobreClaro` / `rojoTexto` / `muted`; move `constants/tabOptions.ts` hex to tokens; extend `lib/contraste.check.ts` with every pair in the area tables. Web: tokens in `globals.css` (`--color-rojo-texto #E5634A`, `--color-texto-2 #9D998F`, `--color-borde-control #7A7060`), replace `text-tinta/30|/40`, `text-rojo*`. Covers the contrast tasks of every area (porteria T12 + web part of T15, secretaria T8 + T9, entrenador T4, manager T6, web-subcomision T9, auth T1). [OTA]
- [x] **X5 — Silent focus refresh.** (`c0f7ea5`) `useRefreshOnFocus` callers expose `refrescando`; full-screen spinner only on first load; never unmount an open detail. Covers porteria T14 (spinner part), secretaria T17 (flicker part), entrenador T17, manager T9. [OTA]
- [x] **X6 — Safe area on Android edge-to-edge.** (`415ab90`) Replace `SafeAreaView` from `react-native` with `react-native-safe-area-context` (explicit `edges`) and fixed `paddingTop: 60` with insets, app-wide (`grep -rn "SafeAreaView" app/app app/components`). Covers entrenador T12, manager T12, auth T14. [OTA]
- [x] **X7 — Root guard.** (`5ca30c1`) auth T7 (no `router.replace` on every token refresh; affects every role). [OTA]
- [ ] **X8 — Web panel shell.** One responsive `PanelSidebar` (off-canvas below `lg`), shared `Modal` on native `<dialog>`, global `:focus-visible`, per-page titles; applied to subcomisión, buffet, secretaría, portería layouts. Covers web-subcomision T8, T11 (modal/focus part), T13, T17, T18; secretaria T14; porteria T15 (sidebar part). [OTA web]
- [x] **X9 — Tab bars ≤ 5 with Perfil in the header avatar** (`3ec4732`) (same pattern as socio T7). Subcomisión: Inicio · Eventos · Noticias · Crónica · Usuarios. Entrenador: Inicio · Asistencia · Partido · Crónica. Covers manager T8 and entrenador T14. Do after entrenador T22 (lesiones hidden).
- [x] **X10 — Deletion path check** (`35f69b2`, done in Tanda 0 #13b): `login-dni` maps a banned user to "Tu cuenta está dada de baja. Consultá en Secretaría."; scenario test from padrón removal to rejected login and rejected scan.

## New features from the decisions

- **entrenador-coordinador T23 — role `colaborador`** (attendance only; entrenador keeps it too). After T22 and the attendance fixes.
- **web-subcomision T6 — divisions are admin-only** (Subcomisión no longer creates/edits them).

## Area docs (after Tanda 0–1), suggested order

1. `auditoria-ux-porteria.md` 2. `auditoria-ux-secretaria.md` 3. `auditoria-ux-manager-subcomision.md` 4. `auditoria-ux-entrenador-coordinador.md` 5. `auditoria-ux-auth-tutor-admin.md` 6. `auditoria-ux-web-subcomision.md`

## Tanda 3 — native build batch

`expo-haptics` (porteria T17, entrenador T5), `expo-crypto` if missing (entrenador T1), any other native dependency an area task adds. One build for all.

## User decisions (2026-10-26)

1. Gym tablet offline → let in, queue the access and sync later; the screen warns the gym staff (porteria T4).
2. DNI-only fallback at the gym tablet → **keep**; gym staff checks the person (porteria T6 won't do).
3. Manual member creation → **remove**; everything enters through the NUVIX import (secretaria T1).
4. "Registrar pago" → **remove**, with everything that generates or sends comprobantes (secretaria T18).
5. `/secretaria/comprobantes` → **delete** (secretaria T19).
6. Account deletion → **stays as today**: Mi Perfil opens `/eliminar-cuenta`, the member messages Secretaría, Secretaría removes them from the padrón, the import bans the account. No in-app request, nothing deleted in Auth (web-subcomision T12 won't do; X10 verifies the path).
7. "BORRADOR" banner on the privacy policy → stays until the lawyer closes the text (days).
8. Divisions → **Subcomisión can no longer create them**; admin only (web-subcomision T6).
9. Subcomisión tabs → Inicio · Eventos · Noticias · Crónica · Usuarios; **the lesiones / protocolos module is hidden, not removed** (feature flag), and **only the injury records are deleted**, after the user reviews the export (entrenador-coordinador T22).
10. Managers **do** collect on subcomisión recaudaciones too (manager T16; RLS still requires an active event).
11. "Justificado" → excluded from attendance % (entrenador T9).
12. Entrenador tabs → Inicio · Asistencia · Partido · Crónica; **new role `colaborador`** that only takes attendance, entrenador keeps it too (entrenador-coordinador T23).
13. Injury `fecha_alta` → not now, module hidden (entrenador T21 won't do; revisit if the module is re-enabled).
14. Login shows "¿Primera vez? Tu contraseña es tu DNI, sin puntos." (auth T2).
15. Rate-limit test → after the DB migration to the club's account (no staging yet); meanwhile check Auth → Rate Limits in production (auth T17).

Still to confirm: T23 assumptions (colaborador created by Subcomisión/Admin, assigned to divisions like an entrenador).

## Acceptance criteria

- Tanda 0: each listed scenario fails before and passes after (write it as a `*.check.ts`, SQL scenario or reproducible manual step in the area doc).
- No `colors.tinta` used as a dark background or as text on gold anywhere in `app/`; `lib/contraste.check.ts` passes with every pair from the area tables.
- `grep -rn "toISOString().split('T')\[0\]\|toISOString().slice(0, 10)" app/` returns only reviewed `timestamptz` uses.
- No `functions.invoke` result shows "Edge Function returned a non-2xx status code" to a user.

## Checks

- `npx tsc --noEmit` in `app/`; `npm run build` in `web/` (dummy `NEXT_PUBLIC_SUPABASE_*`).
- Pure logic in modules with `*.check.ts` via `npx --yes tsx` (RED → GREEN).
- Edge Functions: `tsc --noEmit --strict` with Deno shims; migrations re-read (no DB available to the agent).
- Device pass per role at max font size + TalkBack/VoiceOver on the main flow; the door flow tested with a real phone and the gym tablet.

## Progress / evidence

- 2026-10-26: user decisions 1–15 recorded (by voice); added entrenador-coordinador T22 (hide lesiones, delete records — revised same day from "remove the module") and T23 (colaborador), X10 (deletion path).
- 2026-10-26: six area audits run in parallel (auditor-ux + impeccable) over `5a0ce4c`; S4s re-verified against code (`socios-qr` validate never checks `inactivo`; TOTP ±1 step with no reuse check; `admin-socios` inserts without NUVIX `numero_socio`; `servicios_opcionales` cascade; `parseFloat("15.000") = 15` in `useCobranzas`; `offlineQueue` has no consumer; `admin-usuarios` delete/deactivate only check caller ∈ {subcomision, admin}; `login-dni` only `trim()`s the DNI; privacy page omits Rekognition; `useTerminos` sets `pendiente: false` when the read returns nothing). Index + six area docs created.
- 2026-10-26: Tanda 0 implemented on `fix/auditoria-tanda-0` in table order, one commit per task: #1 `babe67a` · #2 `0f4691d` · #3 X1 `e294dde` · #4 `7fe837c` · #5 `1941a75` · #6 `ad994af` · #7 `4ef3755` · #8 `c3052ed` + `617898f` · #8b `47234db` + `c7999a6` · #9 `3ae35a8` · #10 `fb248fa` · #11 `3e68915` + `c66c28f` · #12 `dd0ec7a` · #13 `26905b3` · #13b X10 `35f69b2` · #13c `82657cf` · #14 pending (user: Auth → Rate Limits now; load test after the DB migration). Evidence per task in each area doc.
  - X1 `e294dde`: migration `20261028000001_profiles_no_borrar_socios.sql` (`BEFORE DELETE ON profiles` trigger, `restrict_violation` when a socio row exists). SQL scenario on a throwaway Postgres 17: before, deleting the member's `auth.users` row left 0 cuotas; after, the delete fails and cuotas stay; a staff-only account still deletes; idempotent. Importer / admin-socios / registro-tutor rollbacks delete before the socio row exists, so they are unaffected.
  - Tools: pure modules checked with `npx --yes tsx`; Edge Functions with `tsc --noEmit --strict` with Deno shims (remaining errors are pre-existing PostgREST join casts in untouched lines); migrations run on a throwaway `postgres:17-alpine` container with a minimal schema of the involved tables.
  - Not applied anywhere. Deploy order (user): (1) backup (`node scripts/backup-supabase.mjs`); (2) `supabase db push` → `20261028000000`, `20261028000001`, `20261028000002`; (3) no secret needed for lesiones (off unless `FEATURE_LESIONES=true`); (4) `supabase functions deploy admin-usuarios admin-socios importar-socios socios-qr notifications`; (5) `supabase functions deploy login-dni --no-verify-jwt` and `supabase functions deploy socios-pagos --no-verify-jwt`; (6) web deploy; (7) OTA from `main` after merge.
- 2026-10-27: Tanda 0 reviewed by Gentle AI in five slices (the whole branch exceeded the reviewer context budget): `ef065f7..0f4691d`, `..4ef3755`, `..c7999a6`, `..fb248fa` (reliability lens each) and `..4956e09` (high risk, four lenses). All five **approved** and acknowledged; no correction opened. Non-blocking findings, kept as follow-ups (do in the area docs or Tanda 1):
  - **porteria** — a client timeout after a slow but successful `validate` shows SIN CONEXIÓN while the server already consumed the TOTP step and registered the entry, so the retry with the same code says "ya se usó" (and a second reader in the same minute is rejected); `createSignedUrl` is outside the 6 s abort. Single-use is only proven by the SQL scenario, not at handler level.
  - **manager** — `parseMontoCobranza` rejects 0, so a `pagado` with $0 (beca / fee waived) can no longer be saved. Decide whether $0 is valid.
  - **secretaria** — `declarar-comprobante` still exists (no app caller today) and could leave cuotas `en_revision` with nobody to resolve them: retire it or define the path. If the padrón changes between preview and confirm and crosses the mass-removal threshold, the 409 asks for BAJAS but the UI has no field (preview said false). `nombreBaja` does not fall back on an empty-string name.
  - **entrenador (offline queue)** — the pending count can be overwritten with a stale value during a sync (screen says "guardada" for an unsent item); `encolar` and `eliminarVariosDeCola` race on AsyncStorage (an item enqueued mid-sync can be lost); permanent failures (RLS, FK) retry forever with no cap or dead letter; queued attendance never runs the 4-absences check.
  - **auth** — the root-guard profile retry registers NetInfo listeners that are never removed (can apply a previous user's role after a re-login) and has no backoff/cap; the terms gate now holds a restored session offline (conflicts with "the carnet opens without signal"), and REINTENTAR only refetches the screen's own `useTerminos` instance, not the root one; the dotted-DNI second password attempt doubles GoTrue sign-in usage from the function IP (relevant to T17); the weak-password copy hard-codes 8 characters.
  - **lesiones flag** — `FEATURE_LESIONES` defaults to enabled in `notifications` (skips only when exactly `false`) while app/web default to off; the secret must be set at deploy (already in the deploy steps) or the default flipped. The entrenador diario duplicates the ATAJOS grid for the flag-off branch.
- 2026-10-27: follow-ups of the Tanda 0 review fixed on the same branch, one commit per area:
  - `7d0cafd` porteria — TOTP consumed only by the self-service gym reader (canchero/buffet attended, a member can pass both in the same minute); the tablet remembers a QR whose validation timed out or was cancelled and shows PASA · CON AVISO when its retry returns `codigo_ya_usado` (`resolverReintento`, veredictoScan.check.ts 9 cases); photo signed URL inside the 6 s abort.
  - `6346e8e` secretaria — `declarar-comprobante` returns 410 (no app caller; nobody could resolve `en_revision` anymore); a confirm-time 409 turns the BAJAS field on; blank file names fall back on `nombre_padron` (bajas-import.check.ts +1 case). Cuotas already `en_revision` in production: check with `select count(*) from cuotas where estado = 'en_revision'` before deploy.
  - `31129a9` entrenador — queue writes under one lock and a single locked write per sync (no lost items), pending count recounted from storage, permanent failures capped at `MAX_INTENTOS` and kept in a "no enviadas" list shown on the attendance screen, 4-absences alert for attendance sent from the queue (offlineSync.check.ts 12 cases).
  - `cfcbf97` auth — one GoTrue sign-in per login (`passwordAProbar`: the account's own DNI without separators, anything else as typed; login-identificador.check.ts); `MIN_PASSWORD` named and documented.
  - `9e19083` auth — root-guard profile retry: one timer with growing waits (2 s … 1 min, 6 tries), cancelled on sign-out and ignored if the session changed account; no NetInfo listeners; push token registered on success.
  - `0287dc4` auth — terms state shared by every screen (REINTENTAR releases the root gate); an account that accepted on this phone opens offline, the DB decides when online (terminos.check.ts 7 cases).
  - `5e8aea7` lesiones — `notifications` lesion pushes off unless `FEATURE_LESIONES=true`; entrenador shortcuts from one filtered list.
  - `6810e9a` db — the services RESTRICT migration drops the FK found by its columns and raises if any CASCADE remains (tested with a non-default FK name).
  - Cobranzas $0: user decision 2026-10-27 — $0 counts as not paid; current behavior (rejected, player stays pending) kept, no code change.
  - Not done: handler-level tests for `admin-usuarios` routing, `useCobranzas` guard paths and the single-use TOTP path (no Deno / RN test runner in the repo; covered by pure checks + the SQL scenario).
- 2026-10-27: Tanda 1 on `fix/auditoria-tanda-1` (from `main` after PR #44), one commit per X; covered area tasks marked `[x] covered by Xn` (partial ones keep a note and stay open):
  - X2 `dc86203` — `app/lib/fecha.ts` (`fechaLocal`, `fechaLocalMasDias`; fecha.check.ts 3 cases with `TZ=America/Argentina/Buenos_Aires`) replaces 27 UTC "today" uses in 14 files plus the local copy in `useCobranzas`. The 3 web "hoy" uses (debito-automatico, deudas, porteria turnos) were left as they are (server/browser local, not part of the app list).
  - X3 `902cc03` + `696fc2b` — deviation: the existing `web/lib/edgeFunction.ts` was extended (JSON or FormData, never throws, 30 s timeout, `TIMEOUT_IMPORT_MS = 120_000`) instead of creating `web/lib/edge.ts`; pure `edgeFunctionRespuesta.ts` (`interpretarRespuesta` with `motivo` fallback, `mensajeFalloRed`; edgeFunction.check.ts 7 cases). The local copies in accesos, socios, usuarios, deuda, socios-import and seccion-servicios use it; app hooks use `mensajeErrorFunction` / `cuerpoErrorFunction`. Reviewed (X2+X3 slice): approved.
  - X4 `80feb1f` (delegated writer) — 45 app + 24 web files; contraste.check.ts 39 cases, `web/lib/contraste.check.ts` 10 cases; new token `mutedSobreClaro #5C4A2E`; web tokens `--color-rojo-texto`, `--color-texto-2`, `--color-borde-control`. Deviations: edit bars stay cream with `oroSobreClaro`; the lesiones G3 badge stays below 4.5:1 (module hidden); `tokens.check.ts` does not list `mutedSobreClaro`.
  - X5 `c0f7ea5` (delegated writer) — `lib/estadoCarga.ts` (`transicionCarga`; estadoCarga.check.ts 3 cases) + `hooks/useEstadoCarga.ts`; ~38 screens: full spinner only on first load, `refrescando` on RefreshControl; Eventos never unmounts an open detail on focus. Possible overlap with entrenador T17 wording ("refreshing bound to manual pull only") — refresh on focus stays silent instead.
  - X6 `415ab90` — 15 files move `SafeAreaView` to `react-native-safe-area-context` (`edges={['top']}` on screen roots; Modals keep all edges); fixed `paddingTop: 60` headers (subcomisión protocolos, informes, UsuariosScreen) use `useSafeAreaInsets().top + 16`.
  - X7 `5ca30c1` — pure `lib/guardRaiz.ts` (`destinoGuard`, `yaEstaEnDestino`; guardRaiz.check.ts 8 cases, RED = missing module) + `useSegments()`: no `replace` when already in the destination group; `(auth)` screens reached without the guard (forgot-password, registro-tutor) count as the login / acceso-restringido destination; `segments[0]` in deps. `useMailSintetico` became a shared store cleared by `marcarMailResuelto()` on save/skip (otherwise the new dep bounced the user back to registrar-mail); saving the mail calls `refreshSession()`. Read errors no longer gate.
  - X9 `3ec4732` — subcomisión Inicio · Eventos · Noticias · Crónica · Usuarios (`dashboard.tsx` + `useDashboard.ts` deleted); entrenador Inicio · Asistencia · Partido · Crónica; `sobre` is `href: null`. `AvatarPerfil` exported from `Header` and added to the screens with their own header (eventos, noticias, UsuariosScreen list, asistencia, partido) so Perfil stays reachable from every tab.
  - Checks: `npx tsc --noEmit` (app) exit 0 before each app commit; web `npm run build` before each web commit; every `*.check.ts` touched passes. Not verified on device: insets on Android edge-to-edge, guard behaviour across a real token refresh, header crowding with GUARDAR + avatar on small phones.
