# Feature: auditoria-ux-porteria

Locator: `odd/tasks/auditoria-ux-porteria.md` (suggested branch `fix/auditoria-ux-porteria`) · Index: `odd/tasks/auditoria-ux-resto.md` · Full report (findings, fixes in code, what is fine, what was not verified): `odd/auditorias/2026-10-26/porteria.md`

## Objective

At the door and the gym tablet, the result answers "¿entra o no entra?" in under a second, never lets in someone who should not enter, and keeps working (or fails honestly) without network.

## Scope / problem (audited 2026-10-26 @ `5a0ce4c`)

Scope: Mobile `(porteria)`, `(cliente-gimnasio)`, `components/shared/TurnosGimnasio.tsx`, `useScanner`, `useCarnet` (shared); web `(porteria)`; functions `socios-qr`, `_shared/totp.ts`.

Result: auditor-ux S4 4 · S3 8 · impeccable 10/20. Code-only pass, no device.

## Decisions

- Follow the index order: Tanda 0 and the shared X-tasks first. Covered here: Tanda 0: T1, T2, T3, T8 · X4: T12 + contrast part of T15 · X5: spinner part of T14 · X8: sidebar part of T15. Mark those `[x] covered by …` when the index task lands instead of redoing them.
- Backend tasks: write migrations/functions and their checks; do **not** deploy to production, leave the deploy steps in "Progress / evidence".
- Tasks marked **[decision]** wait for the user (consolidated list in the index).

## Compartido

- **`app/hooks/useCarnet.ts`** (auditor-ux #4: QR que desaparece sin red): lo usan `(socio)/carnet.tsx`, `(cliente-gimnasio)/carnet.tsx` y el carnet del tutor. Arreglarlo una vez acá; que las otras áreas no lo reporten de nuevo.
- **Texto "CÓDIGO DE HOY / dictá este código"** (auditor-ux #5): también está en `app/app/(socio)/carnet.tsx:354-366`, ya auditado y cerrado, pero quedó sin arreglar porque el escáner no tiene ese input.
- **`colors.tinta` como fondo de `edicionBar` con texto `oro`**: además de cliente gimnasio, el mismo bloque está en `app/app/(entrenador)/diario.tsx:222-226` y `app/app/(manager)/diario.tsx:243-247` (no verifiqué el color de su label: le toca al área de esos roles).
- **`constants/tabOptions.ts`**: hex sueltos (`#0E0E0E`, `#E8B53C`) usados por todas las barras de pestañas.

## Fuera de alcance pero grave

1. **En el gimnasio (autoservicio), cualquiera puede entrar tipeando el DNI de otro socio.** `socios-qr/index.ts:442-489` (`validate-dni`) no tiene segundo factor, y el comentario de las l. 34-38 asume que la tablet está atendida. Pero en el rol `porteria` es la misma persona que quiere entrar la que tipea en la tablet (`scanner.tsx:353-354`: "Ingresá **tu** DNI"), y el propio código dice que "el escaneo ES el control de acceso" (l. 264-267). Además le registra un ingreso (y una asistencia al turno) al dueño de ese DNI. Fix: en `porteria`, reemplazar DNI por Nº de socio + código TOTP (auditor-ux #5), o exigir DNI + los últimos 3 dígitos del Nº de socio y mostrar la foto a pantalla completa. → tarea [decision].
2. **El QR se puede reusar y compartir por captura de pantalla durante ~3 minutos.** `_shared/totp.ts:5` (paso de 60 s) + `verifyTOTP(..., drift = 1)` (l. 65-70) aceptan el código anterior, el actual y el siguiente, sin marcar el código como usado. Una captura mandada por WhatsApp abre el gimnasio, donde nadie mira la foto. Fix: guardar `socios_secrets.ultimo_paso_usado` y rechazar `paso <= ultimo_paso_usado` en `validate` (de paso corta también el doble disparo del lado del server); evaluar `drift` asimétrico (−1, 0). [backend: migration + function]

---

## Tareas sugeridas

- [ ] T1 — **Four-state scan verdict (pass / pass-with-warning / denied / offline)** (S4 / P0). `scanner.tsx:75-78,160-185,233-241` renders moroso (allowed) and denied with the same red band, icon and alert sound, and labels every denial "QR NO VÁLIDO". Fix: add `veredicto()` + `VEREDICTO_UI` (titles "PUEDE PASAR" / "PASA · CON AVISO" / "NO PUEDE PASAR" / "SIN CONEXIÓN"), reason line under the title, a third sound `assets/sounds/aviso.wav`; keep "QR NO VÁLIDO" only for TOTP/format failures. [OTA]
- [ ] T2 — **Reject inactive (dado de baja) members at every reader** (S4 / P0). `socios-qr/index.ts:364-489` never checks `estado`, so `inactivo` returns `valido: true` and the app shows green "AL DÍA" (`scanner.tsx:15-18,184`). Fix: `if (row.estado === 'inactivo') return jsonOk({ valido: false, motivo: 'Socio dado de baja. Consultá en Secretaría.' })` in `handleValidate` and `handleValidateDni`; also map `inactivo` → `no_pasa` client-side (T1). [backend: function] + [OTA]
- [ ] T3 — **Scanner timeout, cancel and human network errors** (S4 / P0). `useScanner.ts:68-116` has no timeout and shows raw `res.error.message` as an invalid QR; `scanner.tsx:169-173` spinner has no exit. Fix: `AbortController` 6 s, `errorRed: true` results with Spanish messages (401 → "La sesión de esta tablet venció"), a CANCELAR button in the validating state, and a `NetInfo` "SIN CONEXIÓN" banner on the camera view. [OTA]
- [ ] T4 — **Decided 2026-10-26: option (b) — let in when offline, queue the `accesos` rows (AsyncStorage + NetInfo) and sync when back; the screen tells the gym staff "SIN CONEXIÓN · ingreso registrado sin validar" so they check the person by eye** — **Offline policy at the door** (S4 / P0). With no network nobody can be validated (`useScanner.ts`), and the club context requires the reader to work with limited connectivity. Fix options: (a) deny with "SIN CONEXIÓN" (T3 only); (b) let in with a deferred queue of `accesos` (AsyncStorage + NetInfo); (c) periodically cache a signed list of members with Gimnasio on the tablet.
- [ ] T5 — **Carnet QR must keep rotating offline** (S4 / P0). `useCarnet.ts:154-158,226-232` refetches the DB every 60 s and on a network error replaces the QR with an error (`(cliente-gimnasio)/carnet.tsx:94-97`, same in socio). Fix: regenerate the code locally from the cached secret when data exists; never `setError` over existing data; persist last `CarnetData` in AsyncStorage and show "Sin conexión · estado al HH:MM". [OTA]
- [x] T6 — **WON'T DO (user decision 2026-10-26: keep the DNI-only fallback — gym staff is present at the tablet and checks the photo/person)** — **Remove the untrusted DNI fallback from the self-service gym** (S4 security / P0). `validate-dni` (`socios-qr/index.ts:442-489`) has no second factor and in rol `porteria` the person entering types it (`scanner.tsx:353-354`). Fix: in `porteria`, replace "Ingresar DNI" with "Nº de socio + código" (T7) or DNI + last 3 digits of Nº socio with full-screen photo.
- [ ] T7 — **Manual code entry in the scanner + honest copy on the carnet** (S3 / P1). Carnets say "dictá este código" (`(cliente-gimnasio)/carnet.tsx:124-133`, `(socio)/carnet.tsx:354-366`) but `scanner.tsx:343-378` only accepts DNI. Fix: add an "Ingresar código" mode (Nº socio + 6 digits → `handleQR(`${n}:${c}`)`); rename "CÓDIGO DE HOY" → "CÓDIGO MANUAL · CAMBIA CADA MINUTO". [OTA]
- [ ] T8 — **Single-use TOTP codes** (S3 security / P1). `_shared/totp.ts:5,65-70` accepts a code for ~180 s and reuse is unlimited, so a WhatsApp screenshot works. Fix: `socios_secrets.ultimo_paso_usado int`, reject `paso <= ultimo_paso_usado` in `validate`, consider drift (−1, 0). [backend: migration + function]
- [ ] T9 — **Ref lock against duplicate barcode events** (S3 / P1). `useScanner.ts:53-66` locks with React state, so `onBarcodeScanned` (`scanner.tsx:392`) can fire several invokes and `accesos` inserts per QR. Fix: `lockRef` + `onBarcodeScanned={scanning ? handler : undefined}`, release in `reset`. [OTA]
- [ ] T10 — **Cut scan latency** (S3 / P1). `socios-qr/index.ts:61-430` chains ~7 sequential awaits including `await registrarAcceso` (comment says fire & forget), then the client does a 2nd round trip for the photo (`useScanner.ts:78-83`). Fix: `EdgeRuntime.waitUntil(registrarAcceso(...))`, `Promise.all` service + turno, return `foto_url` from the function, render band before photo. Measure before/after with `console.time`. [backend: function] + [OTA]
- [ ] T11 — **Separate denied attempts from entries in Accesos** (S3 / P1). Denied scans are logged (`socios-qr/index.ts:413,420,468,475`) and counted as "INGRESOS" (`web/.../accesos/page.tsx:297`, CSV `:132-142`); `sin_reserva` marks both allowed and denied. Fix: `accesos.denegado boolean default false`, write it on denials, show "N INGRESOS · M RECHAZADOS" and "RECHAZADO · …" tags, exclude from CSV entries/attendance. [backend: migration + function] + web deploy
- [ ] T12 — **Contrast fixes (lesson #1 + red text)** (S3 / P1). See table below. Fix: `oroSobreClaro` on cream, `estadoTextoColor()` on the cliente-gimnasio badge, gold buttons with `sobreOro` text in promos, `rojoTexto` for red text on dark in the scanner. [OTA]
- [ ] T13 — **Scanner accessibility semantics + target sizes** (S3 / P1). `scanner.tsx` has no `accessibilityRole/Label/LiveRegion`; "Volver a escanear QR" (`:333,372`) ≈17 pt, promos "Cancelar"/"QUITAR" (`promos.tsx:100,130`) < 24 pt. Fix: `accessibilityRole="alert"` + `accessibilityLiveRegion="assertive"` + `announceForAccessibility` on the result band; `accessibilityRole="button"`, `minHeight: 44` + `hitSlop` on links; chips `paddingVertical: 12`. [OTA]
- [ ] T14 — **Promos: surface fetch errors, stop full-screen spinner on focus** (S3 / P1). `usePromosBuffet.ts:39-57` ignores `error` and sets `loading` on every focus; `promos.tsx:177-183` replaces the list. Fix: error state + REINTENTAR; full spinner only when `promos.length === 0`; focus refetch via `refreshing`. [OTA]
- [ ] T15 — **Web panel: contrast, label association, responsive sidebar** (S3 / P1). `text-tinta/40` = 3.49:1 (`accesos/page.tsx:281,288,296`, `turnos/page.tsx:157,1105,1117,1134,1150`); `<label>` without `htmlFor` (accesos `:157,167,206,237`, turnos `:198,359-377,943-986,1099-1128`); `layout.tsx:53` `ml-56` + `SidebarLector.tsx:26` fixed `w-56`. Fix: `text-tinta/60`, `htmlFor`/`id`, `hidden md:flex` sidebar + mobile top bar, `md:ml-56`. [web deploy]
- [ ] T16 — **Keyboard-safe DNI / guest forms** (P1). `scanner.tsx:269-375` has no `KeyboardAvoidingView`; iOS `number-pad` has no return key so `onSubmitEditing` (`:365`) never fires. Fix: `KeyboardAvoidingView` + `ScrollView keyboardShouldPersistTaps="handled"`, auto-submit at 7–8 digits, normalize `replace(/\D/g,'')` client + server, clear input only after a valid result. [OTA] (+ [backend: function] for server normalization)
- [ ] T17 — **Haptic feedback for attended readers** (P1). `scanner.tsx:73-79` audio only; `expo-haptics` not installed. Fix: install, Success/Warning/Error per verdict when `!esAutoservicio`. [native build]

### Contraste

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| `(cliente-gimnasio)/carnet.tsx:151` "SECCIÓN · GIMNASIO" | `#F5B41C` / `#F3EFE4` | 1.60 | `#7A4F00` (`oroSobreClaro`) | 6.20 |
| `(cliente-gimnasio)/carnet.tsx:187` badge AL DÍA | `#FFFFFF` / `#2ECC71` | 2.10 | `#15110A` (`sobreOro`) | 8.95 |
| `(cliente-gimnasio)/carnet.tsx:187` badge PENDIENTE | `#FFFFFF` / `#E67E22` | 2.85 | `#15110A` | 6.60 |
| `promos.tsx:236` "+ Nueva", `:274` "PUBLICAR PROMOCIÓN" | `#F5B41C` / `#F3EFE4` | 1.60 | fondo `#F5B41C`, texto `#15110A` | 10.24 |
| `scanner.tsx:216` ESTADO "MOROSO" (16 px) | `#CC4127` / `#15110A` | 3.90 | `#E5634A` (`rojoTexto`) | 5.57 |
| `scanner.tsx:237` motivo bloqueado (18 px, móvil) | `#CC4127` / `#15110A` | 3.90 | `#E5634A` | 5.57 |
| `scanner.tsx:282,317` invitado (15 px) | `#CC4127` / `#15110A` | 3.90 | `#E5634A` | 5.57 |
| `scanner.tsx:177,183` banda verde/roja (referencia, OK) | `#FFFFFF` / `#1A7A1A` · `#CC4127` | 5.46 · 4.82 | — | — |
| `scanner.tsx:225` turno con reserva (OK) | `#5DBB63` / `#15110A` | 7.84 | `colors.estadoActivo` (token) | — |
| web `text-tinta/40` (≈`#6E6A61`) | / `#15110A` | 3.49 | `text-tinta/60` (verificar) · `tinta/50` = 4.78 | ≥ 4.5 |

## Acceptance criteria

- Every task's failure scenario (in its line or in the full report) is reproduced before the fix and passes after, as a `*.check.ts`, SQL scenario or written manual step.
- Every contrast pair listed here is ≥ 4.5:1 (≥ 3:1 for large text / UI components) and added to the contrast check.
- No screen in scope shows an empty or "sin datos" state when the request actually failed.

## Checks

- `npx tsc --noEmit` in `app/` · `npm run build` in `web/` when web files change.
- Pure logic in modules with `*.check.ts` via `npx --yes tsx` (RED → GREEN).
- Device pass at max font size + TalkBack/VoiceOver on the area's main flow.

## Progress / evidence

- 2026-10-26: audit run (auditor-ux + impeccable); S4s re-verified against code; this document created from the report.
