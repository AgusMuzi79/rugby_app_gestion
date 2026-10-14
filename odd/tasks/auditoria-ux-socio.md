# Feature: auditoria-ux-socio

Locator: `odd/tasks/auditoria-ux-socio.md` — branch `fix/auditoria-ux-socio`

## Objective

A socio can pay the right amount, knows when their payment was received, and every socio screen is readable, tappable and behaves like a native app — before store launch.

## Problem / why (audited 2026-10-13)

Two passes over the socio mobile screens (`app/app/(socio)/*`, `components/shared/{SobreScreen,TurnosScreen,Header,TutorMenorSelector}.tsx`, their hooks) at commit `fcc59b0`, code-only (no device screenshots):

- **auditor-ux** (Nielsen + WCAG 2.2 AA): S4 0 · S3 9 · S2 1 · S1 2. Worst area: Cuotas (wrong amount to transfer, no feedback after sending the comprobante, network errors shown as "al día").
- **impeccable audit, native** (HIG / Material): 8/20 (Poor) — a11y 1, perf 2, theming 1, conformance 2, adaptivity 2.
- Overlap: 4 findings. Combined: ~19. Severity below uses auditor-ux S-levels where it found the issue, impeccable P-levels otherwise.

Root cause of most contrast failures: commit `cab360a` (new visual identity) inverted `colors.tinta` (`#0E0E0E` → `#F3EFE4`) and `colors.papel`. Every place that meant "dark text on gold" now renders cream on gold. 143 usages of `colors.tinta` across 26 files; most are now correct, so **do not revert `theme.ts`** — fix call sites.

## Decisions

- Priority order = money/trust first (Cuotas), then contrast, then load states, then navigation, then native polish.
- OTA-able unless marked **[native build]**. Native-build items are batched in T15.
- Ratios measured with the auditor-ux `contraste.py` (WCAG relative luminance).
- Decisions still pending from the user are marked **[decision]** — do not implement those parts until confirmed.
- **Sequence (user, 2026-10-13):** implement the whole audit first (T1–T18) on the current look; afterwards a Claude Design prompt rebuilds the visual identity on top of the corrected app. T4 + T17 leave semantic tokens, so the redesign only changes token values.
- User decisions 2026-10-13: tab bar goes to **5 tabs**; Perfil leaves the tab bar and moves to an avatar button top-right in the header (layout reference: image pending from the user). Account deletion = **request to Secretaría** (deleting the account means leaving the club). Socio **may edit name and photo** in Mi Perfil, but the **carnet shows the padrón name** and the user's photo. Comprobante feedback stays client-side, reconciled against the NUVIX import (T2).

## Tasks

### Cuotas (money and trust)

- [x] T1 — **Amount to transfer comes from NUVIX, not the catalog price** (S3). `useCuotas.ts:112-122` builds the virtual cuota with `monto: total` (one month) even when `semaforo` is rojo (2+ periods owed); `cuotas.tsx:440-447` then says "Tenés 1 cuota pendiente" next to the NUVIX banner. Fix: compute `deudaTotal = Σ periodos.vencido + saldoAnterior` (exclude `regCesantesTotal`) with the same query as `useDeudaDetalle`; virtual cuota `monto = deudaTotal`; PagoModal title "DEUDA AL dd/mm" for the virtual cuota; pending banner counts NUVIX periods. Keep the "no virtual cuota for `cobro_con_tarjeta`" rule. — commit `737f6bf`
- [x] T2 — **Feedback after sending the comprobante, reconciled with the NUVIX import** (S3). — commit `657a689` The WhatsApp flow (`cuotas.tsx:133-137`) never sets `en_revision` (only `socios-pagos` does, on file upload), so the card stays PENDIENTE for days. Design (user idea, 2026-10-13), OTA, no backend:
  - On press, before `Linking.openURL`, store `comprobante:${socioId ?? 'yo'}:${periodo}` = `{ enviadoAt: ISO }` in AsyncStorage (for the virtual cuota, key by the set of NUVIX periods it covers).
  - Pure function `estadoComprobante(enviadoAt, fechaCorte, periodoSigueAdeudado)` in its own module, unit-checked with `npx --yes tsx`:
    - `fechaCorte` null or `fechaCorte < enviadoAt + 2 días` → **ENVIADO** ("Mandaste el comprobante el dd/mm por WhatsApp. Secretaría lo carga y se actualiza con la próxima importación.") — 2-day grace because Secretaría loads it into NUVIX by hand.
    - `fechaCorte ≥ enviadoAt + 2 días` and the period no longer owed → **REGISTRADO** ("Pago registrado ✓"); delete the key after it has been shown once.
    - `fechaCorte ≥ enviadoAt + 2 días` and still owed → **NO REGISTRADO** ("Todavía no figura tu pago. Escribile a Secretaría.") + WhatsApp button reusing the same number.
  - Badge + line in CuotaCard; the pending banner (T1) does not count ENVIADO periods as "pendientes" while in grace.
  - Known limit: per device (reinstall or second phone loses it). Later upgrade, not now: table `comprobantes_enviados(socio_id, periodo, enviado_at)` insertable by the socio via RLS, same states, visible to Secretaría.
- [x] T3 — **Pay action visible + copyable alias** (S3 ×2). Move the "VER CÓMO PAGAR" button out of the `expandida` block (`cuotas.tsx:352-361`) so every pending card shows it. Alias: `<Text selectable>` on `cuotas.tsx:128` now; "COPIAR ALIAS" button with `expo-clipboard` in T15. — commit `031da4b`

### Contrast

- [x] T4 — commit `77e7143` — **Fix inverted-token call sites** (S3 / P1, WCAG 1.4.3). Add semantic tokens in `constants/theme.ts`: `sobreOro: '#15110A'`, `oroSobreClaro: '#7A4F00'`, `rojoTexto: '#E5634A'`. Replace:

  | Location | Now | Ratio | Use | Ratio |
  |---|---|---|---|---|
  | `cuotas.tsx:358,589` pay button text/icon | cream on oro | 1.60 | `sobreOro` | 10.24 |
  | `cuotas.tsx:452-453` banner en revisión | cream on oro | 1.60 | `sobreOro` | 10.24 |
  | `cuotas.tsx:442,555,561` banner pendiente | cream on oroHondo | 2.59 | `sobreOro` | 6.33 |
  | `cuotas.tsx:292,574` badge EN REVISIÓN | cream on oroHondo | 2.59 | `sobreOro` | 6.33 |
  | `carnet.tsx:280-281` banner foto | cream on `#E67E22` | 2.48 | `sobreOro` | 6.60 |
  | `carnet.tsx:451,564` badge ACTIVO / PENDIENTE | white on `#2ECC71` / `#E67E22` | 2.10 / 2.85 | `sobreOro` (MOROSO/INACTIVO keep white, 4.82) | 8.95 / 6.60 |
  | edición bar label: `carnet.tsx:381`, `cuotas.tsx:529`, `noticias.tsx:229`, `calendario.tsx:270` | oro on cream | 1.60 | `oroSobreClaro` | 6.20 |
  | `noticias.tsx:262` active filter chip text | oro on cream | 1.60 | `sobreOro` | 16.37 |
  | tarjeta física `carnet.tsx:504,508,587` | oro / oroHondo on cream | 1.60–2.59 | `oroSobreClaro` | 6.20 |
  | `carnet.tsx:578` badge J | cream on oro | 1.60 | `sobreOro` | 10.24 |
  | `TurnosScreen.tsx:243,265` red text | `#CC4127` on card | 3.69 | `rojoTexto` | 5.27 |
  | `carnet.tsx:462` error text | `#CC4127` on fondo | 3.90 | `rojoTexto` | 5.57 |

  Out of scope but same bug: `CronicaScreen.tsx`, `UsuariosScreen.tsx` (other roles).

### Load states

- [x] T5 — **Errors are not swallowed** (S3). — commit `8df9f0a` `useCuotas.ts` ignores every query `error` and starts `alDia = true`, so a failed fetch shows "No hay cuotas registradas aún." and no debt banner. Add `error` state, `alDia: boolean | null` (null = unknown, show nothing), and an error + "Reintentar" view copying `calendario.tsx:234-240`. Add a retry button to `carnet.tsx:266-269`. Check `useNoticias` read path for the same.
- [x] T6 — **No spinner on refocus** (P1). — commit `6e023db` `useRefreshOnFocus` → `setLoading(true)` unmounts the list in Cuotas, Noticias and Calendario on every tab switch (flash + lost scroll). Show the full-screen spinner only on first load (`loading && data.length === 0`, as `TurnosScreen.tsx:183` does); refreshes keep the list and use `RefreshControl`. Do together with T5 (same hooks).

### Navigation and accessibility

- [x] T7 — commit `389f763` — **Tab bar with labels** (S3 / P1). `constants/tabOptions.ts`: `tabBarShowLabel: true`, `tabBarLabelStyle: { fontFamily: fonts.label, fontSize: 11 }`; add `title` to every `Tabs.Screen` in **all** role layouts that use `TAB_SCREEN_OPTIONS`. Socio goes to **5 tabs**: Carnet · Cuotas · Gimnasio · Noticias · Calendario. Perfil (`sobre`) leaves the bar (`href: null` in `(socio)/_layout.tsx`) and opens from an avatar button top-right in `components/shared/Header.tsx` (foto or iniciales, 44×44, `accessibilityLabel="Mi perfil"`). Apply the same Header avatar to every role that shows Perfil as a tab, so the 5-tab rule holds app-wide. Noticias icon `rss` → `file-text`. Exact header layout: follow the user's reference image (pending).
- [ ] T8 — **Roles, states and labels for screen readers** (P1, WCAG 4.1.2). Photo button `SobreScreen.tsx:79`: `accessibilityLabel="Cambiar foto de perfil"`, `accessibilityRole="button"`. Filter chips (noticias, calendario) and familia chips (carnet): `accessibilityRole="button"` + `accessibilityState={{ selected }}` (pattern: `TutorMenorSelector.tsx:39-40`). Expandable CuotaCard: `accessibilityState={{ expanded }}`.
- [ ] T9 — **Touch targets ≥ 44pt / 48dp** (S3 / P1). Measured: Turnos links "HACER TURNO FIJO" / "CANCELAR" ~15 (`TurnosScreen.tsx:264-265` → `paddingVertical: 14`), noticias filter chips ~27 (`noticias.tsx:254`), calendario chips ~30 (`calendario.tsx:277`), carnet familia chips ~31 (`carnet.tsx:397`), modal CERRAR ~32 (`cuotas.tsx:643`), Reintentar ~32 (`calendario.tsx:317`). Use padding or `hitSlop` to reach 44.

### Mi Perfil

- [ ] T10 — **Keyboard + Términos** (P2 / S3). `SobreScreen.tsx`: `keyboardShouldPersistTaps="handled"` on the ScrollView (today the first tap on "Guardar" only dismisses the keyboard) and `KeyboardAvoidingView`. New row "Términos y condiciones" in CUENTA opening `pdfUrl` from `useTerminos`.
- [ ] T11 — **Account deletion initiated in-app, processed by Secretaría** (S3, App Store Guideline 5.1.1(v): accounts are created in-app via `(auth)/registro.tsx`). User decision: deleting the account = leaving the club, so the app sends a request instead of deleting.
  - Do **not** delete `profiles` or the auth user from code: `socios.profile_id … REFERENCES profiles(id) ON DELETE CASCADE` (`20260601000000_socios_schema.sql`) would wipe the socio row and everything hanging from it.
  - Mi Perfil › CUENTA: "SOLICITAR BAJA DE LA CUENTA" → Alert that says it plainly ("Se le pide a Secretaría que te dé de baja como socio y se elimina tu acceso a la app. Secretaría te contacta para confirmarlo.") → table `solicitudes_baja(socio_id, created_at, estado)` (RLS: socio inserts own row; Secretaría reads/updates) + push/visible item in the Secretaría web panel. After sending, the row shows "Baja solicitada el dd/mm" instead of the button.
  - Risk to know: Apple accepts deletion completed by a human process only if it is initiated in the app and clearly explained; an "only call/email us" flow is rejected. Keep the in-app initiation and the confirmation copy explicit; mention it in the review notes.
- [ ] T12 — **Carnet shows the padrón name, not the editable one** (S2). Today there is one name: `profiles.nombre`, edited by the socio (`SobreScreen.tsx:134` → `useSobre.ts:102`), shown on the carnet (`useCarnet.ts:130`) and overwritten by `importar-socios` when the padrón differs (`importar-socios/index.ts:518-519`) — so an edit shows on the carnet until the next import silently reverts it. Fix: migration adding `socios.nombre_padron text`, backfilled from `profiles.nombre`; `importar-socios` writes `nombre_padron` and **stops overwriting `profiles.nombre`**; `useCarnet` reads `nombre_padron` (fallback `profiles.nombre`) for the carnet, tarjeta física and dependientes; Mi Perfil keeps editing `profiles.nombre` with a hint "En tu carnet figura el nombre del padrón del club." Photo: unchanged by decision (the carnet shows the user's photo as soon as it is uploaded). Check Portería's scan result uses the same `nombre_padron`.

### Native polish

- [ ] T13 — **Text scaling** (P2). Line heights below 1.2× font size clip at large system font: `cuotas.tsx:658` (13/15), `cuotas.tsx:695` (13/15), `carnet.tsx:577` badge J (13/12). Tarjeta física has fixed `CARD_HEIGHT` with text inside — allow it to grow or cap `maxFontSizeMultiplier` on that card only.
- [ ] T14 — **Bottom sheets** (P2). `cuotas.tsx` and `noticias.tsx` modals draw a drag handle that does nothing and use fixed `paddingBottom: 36`. Use `insets.bottom + 24`; either implement swipe-to-dismiss or remove the handle.
- [ ] T15 — **[native build] batch**: `expo-clipboard` ("COPIAR ALIAS" with "✓ COPIADO" for 2s, T3); `supportsTablet: false` in `app.config.js` until there is an iPad layout (today `CARD_WIDTH` from module-load `Dimensions` stretches the carnet to ~720pt); `expo-image` for news images (caching); optional `expo-brightness` at 100% while the carnet is focused, only if T-verify below shows the QR fails at the door.
- [x] T16 — **Carnet re-renders every second** (P2). `secondsLeft` lives in `data`, so the whole screen and the QR SVG re-render each tick. Move the countdown into its own component with its own interval; `React.memo` the QR on `qrContent`. — commit `6a5352e`
- [ ] T17 — **Tokens: one source** (P2). 126 hex literals in the socio screens (`#8E8574` ×34, `#2C2418` ×27) while `ThemeContext` already has `muted`, `card`, `fondo`. Merge `constants/theme.ts` and `ThemeContext` into one semantic set and replace literals. Large mechanical change — do last, after T4, in its own commit.
- [ ] T18 — P3, if time: single icon set (Feather + MaterialCommunityIcons mixed in calendario); `noticias.tsx:105` `onTextLayout` → `setState` per card; `verCarnetBtn` without horizontal margin (`carnet.tsx:464`).

## Acceptance criteria

- A socio with semáforo rojo and 3 periods owed sees the 3-period total under "TOTAL A TRANSFERIR" and a banner that agrees with "DEUDA SEGÚN EL CLUB".
- After tapping "ENVIAR COMPROBANTE POR WHATSAPP" and returning, the card shows ENVIADO with the date.
- With airplane mode, Cuotas shows an error with "Reintentar", never "No hay cuotas" or an "al día" state.
- Switching tabs back to Cuotas / Noticias / Calendario keeps the list and scroll position (no spinner).
- Every text pair listed in T4 is ≥ 4.5:1 (≥ 3:1 for text ≥ 24px or bold ≥ 18.66px).
- Every tappable control on the socio screens is ≥ 44×44pt including padding/hitSlop.
- The tab bar shows a text label per tab; VoiceOver / TalkBack read a meaningful name for each tab and for the photo button, and announce selected/expanded states.
- With system font at maximum, no text in Cuotas, Carnet or Mi Perfil is clipped.

## Checks

- `npx tsc --noEmit` in `app/`.
- Contrast: re-run `contraste.py` on any new color pair.
- Device pass (Android `adb shell settings put system font_scale 1.3`, restore 1.0; iOS largest Dynamic Type): Carnet, Cuotas (both modals), Mi Perfil.
- Quick VoiceOver + TalkBack pass on the tab bar, Cuotas cards and Mi Perfil.

## Not verified (needs device or people)

- Real rendering and clipping at large font sizes; real screen-reader reading order.
- QR legibility at the door at low brightness / night light (decides the `expo-brightness` part of T15).
- Tutor flows with several minors; "VISTA ACTIVA" role switch under network errors.
- Heuristic single pass covers roughly a third of real problems: before launch, watch 3–5 real socios "pagar la cuota de este mes".

## Progress / evidence

- 2026-10-13: auditor-ux and impeccable audit (native) run over the code at `fcc59b0`; contrast measured with `contraste.py`; this document created.
- 2026-10-13 T1 (route: delegated writer) — commit `737f6bf`. Pure module `app/lib/deudaSocio.ts` (`agruparDeuda`, `deudaTotal`, `contarPendientes`) + `deudaSocio.check.ts` added to `test:admin`. RED: `Error: Cannot find module './deudaSocio'` (exit 1). GREEN: `9 casos OK`. `useDeudaDetalle` now exports `cargarDeudaDetalle(socioId)` (same query, aggregation moved to the pure module) and `useCuotas` reuses it. Virtual cuota `monto = deudaTotal` (fallback to the monthly total only if NUVIX has no rows for the socio); card and PagoModal title "DEUDA AL dd/mm" (fecha de corte, date column parsed by parts to avoid the UTC-midnight off-by-one); virtual breakdown lists the NUVIX periods + saldo anterior instead of category + services (those no longer add up to the total); WhatsApp message says "mi deuda al dd/mm". `npx tsc --noEmit` exit 0; `npm run test:admin` all ok. Not verified on device.
- 2026-10-13 T2 (route: delegated writer) — commit `657a689`. Pure module `app/lib/comprobanteEnviado.ts` (`estadoComprobante`, `claveComprobante`/`prefijoComprobantes`, `periodoCuotaVirtual`, `parseEntradaComprobante`, `sigueAdeudado`, `comprobanteParaPeriodos`, `periodosEnGracia`) + `comprobanteEnviado.check.ts` (boundaries: null corte, corte before send, inside grace, exactly +2 days, afternoon send vs midnight corte, timestamp corte, invalid date) added to `test:admin`; AsyncStorage I/O in `app/lib/comprobantesStorage.ts`; `contarPendientes` gained `enviadosEnGracia`. RED: `Error: Cannot find module './comprobanteEnviado'` (exit 1). GREEN: `19 casos OK` (and `deudaSocio` 9 OK). `npx tsc --noEmit` exit 0; `npm run test:admin` all ok. Choices made: stored value is `{ enviadoAt, periodos }` so an entry survives the virtual cuota's period set changing between imports (cards match the most recent entry whose periods overlap); virtual key with no NUVIX periods (only saldo anterior) uses `saldo-anterior`; "still owed" = any covered period still in the latest import (saldo-only: socio still not al día); grace compares the `fecha_corte` date at local midnight against `enviadoAt + 48h`; useCuotas now always loads the NUVIX debt (2 extra queries for socios al día) because reconciliation needs `fecha_corte`; REGISTRADO is shown as a banner at the top ("Pago registrado ✓ — …") because the virtual card disappears once the debt is paid, and its key is deleted right after loading (kept in memory while the screen is mounted); the modal closes after opening WhatsApp so the card is visible on return; NO REGISTRADO button label "ESCRIBIR A SECRETARÍA". Own socio key uses `yo` as specified, so two accounts on the same phone share entries. Not verified on device.
- 2026-10-13 T5 (route: delegated writer) — commit `8df9f0a`. No pure logic (exception to test-first: the change is Supabase error plumbing and JSX, no runnable RED without a React/Supabase harness); proportional check = typecheck + existing checks. `useCuotas`: `error` state, `alDia: boolean | null` (initial null; banner only on `alDia === false`), socio query moved from `.single()` to `.maybeSingle()` so "no row" is not an error, any query error (socio, socio_servicios, cuotas, NUVIX debt via `cargarDeudaDetalle`) clears the state and Cuotas shows the calendario-style error + "Reintentar". Carnet: "Reintentar" button in the error view (spinner while retrying); `useCarnet` now reports a network/server error on the socio query as "No se pudo cargar el carnet. Revisá tu conexión." instead of "No se encontró tu registro de socio." (PGRST116 still means no row). `useNoticias` read path had the same bug: now exposes `error`; Noticias shows error + "Reintentar" when there is nothing cached (Secretaría's screen ignores the new field). Extra, same bug class: `useCalendarioSocio` ignored Supabase response errors (supabase-js does not throw), so offline showed "Sin partidos…"; it now rethrows them into its existing catch. `npx tsc --noEmit` exit 0; `npm run test:admin` all ok. Airplane-mode behavior not verified on device.
- 2026-10-13 T6 (route: delegated writer) — commit `6e023db`. No pure logic (same test-first exception as T5). `useCuotas` and `useCalendarioSocio` return `loading` only until the first successful load (`cargado` flag, reset on socio change and after an error so "Reintentar" shows the spinner); Noticias uses `loading && noticias.length === 0` as in `TurnosScreen` (its `loading` also fires on realtime refetches and is shared with Secretaría, whose behavior is unchanged). Pull-to-refresh uses a separate `refreshing` flag (`refetch` in useCuotas, `refrescar` in useNoticias, `recargar` in useCalendarioSocio), so focus refetches are silent. `useRefreshOnFocus` unchanged. Tutor switching minors clears the previous minor's cuotas before the new fetch. Known gap: an empty Noticias list still shows the spinner briefly on refocus (nothing to keep mounted). `npx tsc --noEmit` exit 0; `npm run test:admin` all ok. Scroll preservation not verified on device.
- 2026-10-13 T16 (route: delegated writer) — commit `6a5352e`. Refactor, no pure logic (no RED applicable). New `app/components/socio/CarnetQR.tsx`: `QRCarnet` (`React.memo` on `value` = `qrContent`) and `CuentaRegresivaQR` (own 1s interval over `secondsUntilRefresh()`, same styles moved from carnet.tsx). `useCarnet` got an option `{ tickEnData }` (default `true`): the socio carnet passes `false`, so `data` only changes when the TOTP step changes (the step-change rebuild interval stays); the default keeps `(cliente-gimnasio)/carnet.tsx` (outside this tanda's edit surface) working unchanged — migrate it to the same component later and drop the option. `npx tsc --noEmit` exit 0; `npm run test:admin` all ok. Render count not profiled on device.
- 2026-10-13 Tanda 1 review (RDD): assess over `48e22f9..0a0e2b4` = medium, `slice_budget_reached` (17 files, 1278 lines); user granted consent; native review lens `review-reliability` → approved, acknowledged (authority burned). 3 non-blocking findings, fixed by user decision in commit `4dfdbbd` (route: inline, 4 small edits):
  - False REGISTRADO for a real cuota whose period is missing from NUVIX: `sigueAdeudado` gained `deudaSinPeriodo` (saldo anterior, or semáforo with debt and no import rows) and `useCuotas` also counts unpaid app cuotas as owed. RED: new check case → `AssertionError` (actual false, expected true). GREEN: `20 casos OK`.
  - Stale fetch after a tutor switches minor: request counter `reqRef` in `useCuotas`; only the latest load writes state.
  - Noticias refresh failure with cached items now shows an inline error line (`accessibilityRole="alert"`).
  - `npx tsc --noEmit` exit 0; `npm run test:admin` exit 0. Not verified on device.
- 2026-10-13 T3 (route: delegated writer) — commit `031da4b`. `CuotaCard`: "VER CÓMO PAGAR" moved out of the `expandida` block, rendered at the bottom of every `pendiente` card (also ENVIADO / NO REGISTRADO, which are still pending); the expansion keeps the desglose and estado lines. PagoModal alias is `<Text selectable>` (long-press to copy); the clipboard button stays in T15. Test-first exception: pure JSX move, no logic to RED. `npx tsc --noEmit` exit 0; `npm run test:admin` exit 0. Not verified on device (nested touchable inside the card, long-press selection on Android).
- 2026-10-13 T4 (route: delegated writer) — commit `77e7143`. Added `sobreOro`, `oroSobreClaro`, `rojoTexto` to `constants/theme.ts` (existing tokens untouched). Pure module `app/lib/contraste.ts` (WCAG relative-luminance ratio) + `contraste.check.ts` added to `test:admin`; the check asserts every new pair ≥ 4.5 against the real tokens. RED: `Error: Cannot find module './contraste'` (exit 1). GREEN: `12 casos OK` — sobreOro/oro 10.24, sobreOro/oroHondo 6.33, sobreOro/#E67E22 6.60, sobreOro/#2ECC71 8.95, sobreOro/tinta 16.37, oroSobreClaro/tinta 6.20, rojoTexto/fondo 5.57, rojoTexto/card 5.27, blanco/rojoUrgente 4.82. Call sites: Cuotas pay button text+icon, banner en revisión, banner pendiente (text + icon), EN REVISIÓN and ENVIADO badges (text color per badge, `sobreOro` only on oroHondo), edición bar label, error text; Carnet banner foto, ACTIVO/PENDIENTE badge in the carnet and the tarjeta física (`estadoTextoColor`: sobreOro on green/orange, white on red), edición label, tarjeta física header club/year + footer, badge J, error text; Noticias edición label, active filter chip text, both error texts; Calendario edición label, error text; Turnos aviso + CANCELAR. Notes: NO REGISTRADO badge is on `#3A2800` (not oroHondo), cream there is 12.32, unchanged. Tanda 1's `#EF4444` error texts were already 5.00 on fondo; switched to `rojoTexto` (5.57) for one source. Calendario's `ROJO` result color (lost match, 4.73 on card) left as is. Not in the table and left for follow-up: Mi Perfil "CERRAR SESIÓN" `#CC4127` on fondo = 3.90 (fails AA). `npx tsc --noEmit` exit 0; `npm run test:admin` exit 0. Not verified on device.
- 2026-10-13 T7 (route: delegated writer) — commit `389f763`. `TAB_SCREEN_OPTIONS`: `tabBarShowLabel: true`, `tabBarLabelStyle { fonts.label, 11 }`; `title` on every visible `Tabs.Screen` of the 10 role layouts (socio: Carnet · Cuotas · Gimnasio · Noticias · Calendario; Inicio for `diario`, Escanear / Promos for portería, Mi perfil for `sobre`). Noticias icon `rss` → `file-text` in socio, tutor and secretaría (admin "Comunicados" keeps `rss`). Header: 44×44 round avatar button top-right (`accessibilityRole="button"`, `accessibilityLabel="Mi perfil"`), photo or initials (Feather `user` if no name), navigates to `/<grupo actual>/sobre` from `useSegments()`; hidden outside role groups. Avatar data: no existing store had name + photo, so `app/lib/perfilAvatarStore.ts` (zustand) loads `profiles.nombre` + `socios.foto_path` signed URL (fallback the local `@perfil_foto_` like `useSobre`) once per user, renewed after 50 min (signed URL lasts 1 h); `useSobre` pushes the data it already loads, and name/photo changes, into the store (no extra fetch). Pure module `app/lib/perfilAvatar.ts` (`inicialesNombre`, `rutaPerfil`, `avatarVencido`) + check in `test:admin`. RED: `Error: Cannot find module './perfilAvatar'` (exit 1). GREEN: `9 casos OK`. Safety rule — `sobre` left the tab bar (`href: null`) where every visible tab renders `Header`: **socio** (carnet, cuotas, turnos→TurnosScreen, noticias, calendario), **tutor** (re-exported socio screens), **cliente-gimnasio** (carnet, turnos), **secretaría** (diario, socios, noticias). `sobre` stays as a tab in: **admin** (usuarios → UsuariosScreen without Header), **coordinador** (calendario, jugadores), **entrenador** (asistencia), **manager** (cobranzas, egresos), **portería/buffet** (scanner, promos), **subcomisión** (usuarios, eventos, noticias). Extra (deviation): inactive tab tint `#666666` → `#8E8574` because the new text labels were 3.36:1 on the bar (now 5.29; active 10.21), pairs added to `contraste.check.ts`. `npx tsc --noEmit` exit 0; `npm run test:admin` exit 0. Not verified on device: header layout with the avatar on small phones, label truncation with 5–6 tabs, screen-reader names, avatar refresh after changing the photo.
