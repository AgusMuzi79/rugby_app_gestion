# Feature: auditoria-ux-manager-subcomision

Locator: `odd/tasks/auditoria-ux-manager-subcomision.md` (suggested branch `fix/auditoria-ux-manager-subcomision`) · Index: `odd/tasks/auditoria-ux-resto.md` · Full report (findings, fixes in code, what is fine, what was not verified): `odd/auditorias/2026-10-26/manager-subcomision.md`

## Objective

Every peso collected or spent on an event is stored exactly as typed, never overwritten, and every "% cobrado" in the app agrees with the event's real players.

## Scope / problem (audited 2026-10-26 @ `5a0ce4c`)

Scope: `(manager)/**`, `(subcomision)/**` mobile, `components/eventos/**`, their hooks and libs; RLS of `cobranzas`.

Result: auditor-ux S4 2 · S3 8 · S2 2 · impeccable 7/20. Code-only pass, no device.

## Decisions

- Follow the index order: Tanda 0 and the shared X-tasks first. Covered here: Tanda 0: T1, T2 · X4: T6 · X5: T9 · X6: T12 · X9: T8. Mark those `[x] covered by …` when the index task lands instead of redoing them.
- Backend tasks: write migrations/functions and their checks; do **not** deploy to production, leave the deploy steps in "Progress / evidence".
- Tasks marked **[decision]** wait for the user (consolidated list in the index).

## Compartido

- **`CronicaScreen.tsx` / `UsuariosScreen.tsx`** (otro agente): se integran como re-export directo: `(manager)/cronica.tsx`, `(subcomision)/cronica.tsx` (`export default CronicaScreen`) y `(subcomision)/usuarios.tsx`. Son pestañas: Manager 4 de 5, Subcomisión 2 y 4 de 6. El bug de contraste que tienen se ve en estos dos roles.
- **`components/eventos/estilo.ts`** lo usan Manager (Egresos) y Subcomisión (DetalleRecaudacion, CobrosPanel, EgresosPanel). Arreglar ahí los tokens (#6 y P2 theming) arregla los dos roles; `cobranzas.tsx`, `(subcomision)/eventos.tsx` y `fichajes.tsx` lo tienen que importar en vez de redeclarar.
- **`(subcomision)/eventos.tsx` (`EventosPantalla`)** lo usa también el Manager vía `(manager)/eventos.tsx`: los hallazgos #4 (cerrar evento), #9 (spinner que desmonta el detalle), contraste y Back afectan a los dos roles.
- **`useRefreshOnFocus` + `setLoading(true)`** (lección 3): además de este área, cualquier hook que lo combine así. Conviene que el hook exponga `refrescando` en lugar de cada pantalla.
- **`SafeAreaView` de `react-native`** con `edgeToEdgeEnabled: true`: probablemente se repite fuera de este área (`grep -rn "SafeAreaView,$" app/app`).
- **`constants/tabOptions.ts`**: hex fuera del tema (`#0E0E0E`, `#1A1A1A`, `#E8B53C`); compartido por todos los roles.

## Fuera de alcance pero grave

1. **La RLS de cobranzas del Manager no exige evento activo ni tipo.** `supabase/migrations/20261016000000_eventos_financieros_multi_division.sql:328-350`: `cobranzas_insert_manager` / `cobranzas_update_manager` sólo chequean rol, división del jugador y `jugador_en_evento_financiero`. La de Subcomisión sí exige `ef.estado = 'activo'` (`20261019000000…:64-80`, `p_escritura`). Un manager puede modificar cobranzas de un evento **cerrado** (por API, o si la UI deja de filtrar) y de **recaudaciones de la Subcomisión** (`useCobranzas.cargarEventos:127-132` no filtra `tipo`, así que hoy las lista y "GUARDAR TODOS" pisa lo que cargó la Subcomisión: hallazgo #1). Fix: agregar `AND EXISTS (SELECT 1 FROM eventos_financieros ef WHERE ef.id = cobranzas.evento_financiero_id AND ef.estado = 'activo')` a ambas policies y decidir si el manager cobra recaudaciones [decision].
2. **`useDashboard.ts:75-91`**: canal realtime `postgres_changes` sin filtro sobre `asistencias`, `fichajes`, `resultados` y `cobranzas` de todo el club. Hoy está muerto (pantalla inalcanzable), pero si alguien lo vuelve a enlazar, recarga 4 queries completas con cada asistencia que marque cualquier entrenador. Borrarlo con la pantalla.

---

## Tabla de contraste

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| Botones primarios GUARDAR / AGREGAR EGRESO / CREAR EVENTO / FICHAR, estados activos de chips y selectores (ver #6) | `#F5B41C` sobre `#F3EFE4` | 1,60:1 | texto `colors.sobreOro #15110A` sobre `colors.oro #F5B41C` | 10,24:1 |
| Badge OK `(manager)/diario.tsx:332-338` | `#F3EFE4` sobre `#F5B41C` | 1,60:1 | `#15110A` sobre `#F5B41C` | 10,24:1 |
| Barras de edición crema (label) `(manager)/diario.tsx:247`, `(subcomision)/diario.tsx:233`, `informes.tsx:327` | `#F5B41C` sobre `#F3EFE4` | 1,60:1 | `colors.oroSobreClaro #7A4F00` sobre `#F3EFE4` | 6,20:1 |
| Header de Protocolos (título) | `#FFFFFF` sobre `#F3EFE4` | 1,15:1 | `#15110A` sobre `#F3EFE4` | 16,37:1 |
| Meta del chip activo `egresos.tsx:165` | `#C9890A` sobre `#F3EFE4` | 2,59:1 | `#7A4F00` sobre `#F3EFE4` | 6,20:1 |
| Subtexto de banner OK `fichajes.tsx:528` | `#8E8574` sobre `#F3EFE4` | 3,17:1 | `#15110A` sobre `#F3EFE4` | 16,37:1 |
| CERRAR EVENTO del Manager `eventos.tsx:776-778` | `#CC4127` sobre `#F3EFE4` | 4,20:1 | `colors.rojoTexto #E5634A` sobre `#15110A`, botón outline | 5,57:1 |
| CERRAR EVENTO de Subcomisión `DetalleRecaudacion.tsx:151` | `#CC4127` sobre `#15110A` | 3,90:1 | `#E5634A` sobre `#15110A` | 5,57:1 |
| EGRESOS y NETO negativo `ResumenBalance.tsx:39`; PENDIENTE de los selectores `cobranzas.tsx:576`, `CobrosPanel.tsx:298` | `#CC4127` sobre `#1C1710` / `#15110A` | 3,69 / 3,90:1 | `#E5634A` sobre `#1C1710` | 5,27:1 |
| NETO positivo `ResumenBalance.tsx:38`; PAGADOS `cobranzas.tsx:528`, `eventos.tsx:751` | `#4A7C59` sobre `#1C1710` / `#15110A` | 3,66 / 3,87:1 | `colors.estadoActivo #2ECC71` sobre `#1C1710` | 8,47:1 |
| Subtexto de las stat cards `(subcomision)/diario.tsx:268` | `#7C7267` sobre `#1C1710` | 3,78:1 | `colors.muted #8E8574` | 4,88:1 |
| Detalle del pedido `(manager)/diario.tsx:312` | `#7C7267` sobre `#15110A` | 3,99:1 | `#8E8574` | 5,16:1 |
| Badge ALERTA de la crónica `(subcomision)/diario.tsx:74,79` | `#FFFFFF` sobre `#C9890A` | 2,97:1 | `#15110A` sobre `#C9890A` | 6,33:1 |
| Badge W `informes.tsx:377-378` | `#FFFFFF` sobre `#22C55E` | 2,28:1 | `#15110A` sobre `#22C55E` | 8,25:1 |
| Pills inactivas `informes.tsx:332-334` (14 px) | `#8E8574` sobre `#2C2418` | 4,19:1 | `colors.textoSecundario #B8AD96` | 6,89:1 |
| Badge VIAJE `(subcomision)/eventos.tsx:42,141` (12 px) | `#3B7FC4` sobre `#1C1710` | 4,26:1 | `#5B9BE0` | 6,11:1 |

OK (no tocar): `#8E8574` sobre `#15110A` 5,16 y sobre `#1C1710` 4,88; blanco sobre verde `#4A7C59` 4,86 (badge PAGADO); `#FFAAAA` sobre `#2A1010` 9,82; tab inactiva 5,29; `#C9890A` sobre `#15110A` 6,33.

---

## Tareas sugeridas

- [ ] T1 — **Manager cobranzas: save only changed rows, keep payment history** (S4 / P0-data). `useCobranzas.ts:280-297` upserts every player with local state; `:211-224` ignores the `cobranzas` read error (all show PENDIENTE → save wipes paid rows); `:291-292` re-stamps `fecha_pago`/`registrado_por` for every paid player on each save; `:49-51` uses the UTC date. Fix: track an `original` map, upsert only dirty rows, keep the previous `fecha_pago` for rows already paid, local `YYYY-MM-DD`, block saving when the read failed (error banner + retry). Modal GUARDAR saves that single player and awaits (`cobranzas.tsx:307`). [OTA]
- [ ] T2 — **Manager cobranzas: parse amounts with the local parser and require an amount when paid** (S4). `useCobranzas.ts:53-57` `parseFloat` turns "15.000" into 15 and "1.500,50" into 1.5 (verified). Fix: use `montoSugeridoDe` in the summary (`:79`) and the payload (`:289`); reject `pagado` with an empty/invalid amount ("Falta el monto de {nombre}"); add the "15.000" and "1.500,50" cases to `montoSugerido.check.ts`. [OTA]
- [ ] T3 — **Single source for "% cobrado" / pendientes (denominator = event players)** (S3). `useDiarioSubcomision.ts:127-134`, `useEventos.ts:257-271`, `useInformes.ts:301-323`, `useDiarioManager.ts:103-116` divide by `cobranzas` rows (only paid rows exist for subcomisión recaudaciones; pending rows have `monto null`) → 100 % with 3/80 paid, "$45k / $45k". Fix: RPC `resumen_cobranzas_eventos(p_ids uuid[])` returning `jugadores, pagados, cobrado` with the same visibility rules as `resumen_egresos_evento`; use it in the four hooks; drop `montoTotal` from the manager home. [backend: migration/function]
- [ ] T4 — **Surface network errors instead of empty / "sin división" states; check the close-event result** (S3). Locations in auditor-ux #4 (`useDiarioManager.ts:60-67`, `useCobranzas.ts:103-132,155-168`, `useFichajes.ts:101-126,336-343`, `useDiarioSubcomision.ts:66-155`, `useInformes.ts:101-327`, `useEventos.ts:291-301,361-373`, `useProtocolos.ts:57-64,142-146`). Fix: check `error` on each query, `errorCarga` + retry banner (pattern in `egresos.tsx:75-79`); `cerrarEvento` uses `.select('id')`, shows `errorCierre` on error or 0 rows. [OTA]
- [ ] T5 — **Payment modal: no silent unsaved state, Android Back closes it** (S3 / P1). `cobranzas.tsx:192,307,372,449`, `fichajes.tsx:329`. Fix: X discards that player's edits (restore from `original`); `onRequestClose` on both modals; leaving the event with dirty rows asks "Cambios sin guardar"; success/error banner next to the bottom button, not at the end of the list. [OTA]
- [ ] T6 — **Contrast: cream/gold primary buttons and the 15 other failing pairs** (S3). See the contrast table. Fix: semantic tokens in `components/eventos/estilo.ts` (`BOTON_PRIMARIO` = oro bg + `colors.sobreOro` text; active chips the same; `rojoTexto`, `estadoActivo`, `muted`); `cobranzas.tsx`, `(subcomision)/eventos.tsx`, `fichajes.tsx`, both `diario.tsx`, `informes.tsx`, `protocolos.tsx` import them; extend `lib/contraste.check.ts` with the new pairs. [OTA]
- [ ] T7 — **Accessibility names, roles and states** (S3). Icon-only buttons and selectors listed in auditor-ux #7. Fix: `accessibilityRole`/`accessibilityLabel` on icon buttons; `radio`/`radiogroup` + `accessibilityState.selected` on PAGADO/PENDIENTE, forma de pago, tipo, alcance, divisiones; `tab` on Cobros/Egresos and Activos/Historial; `accessibilityLiveRegion="polite"` on success/error banners + `AccessibilityInfo.announceForAccessibility` after saves. [OTA]
- [ ] T8 — **Decided 2026-10-26: tabs Inicio · Eventos · Noticias · Crónica · Usuarios, Mi perfil in the header avatar. No Protocolos tab or shortcut: the lesiones/protocolos module is hidden behind a flag (entrenador-coordinador T22). Delete `dashboard.tsx` + `useDashboard.ts`** — **Subcomisión navigation: 5 tabs, reach Protocolos, delete Dashboard** (S3). `(subcomision)/_layout.tsx` has 6 tabs; `protocolos.tsx` and `dashboard.tsx` have no entry point (entrenador screen says "La Subcomisión los publica aquí"). Fix: proposal = Inicio · Eventos · Noticias · Crónica · Usuarios, Mi perfil moves to the header avatar (as in socio); add "PROTOCOLOS DE LESIONES →" shortcut in `(subcomision)/diario.tsx:199-214`; delete `dashboard.tsx` + `useDashboard.ts`.
- [ ] T9 — **Focus refresh must not unmount the open detail or blank the screen** (S3). `useEventos.ts:146,153` + `(subcomision)/eventos.tsx:566-584` unmounts `DetalleRecaudacion` (typed egreso lost); full-screen spinner on focus in `informes.tsx:261`, both `diario.tsx`, `useFichajes`. Fix: silent `refrescando` state for focus refreshes, skip the list refetch while `paso === 'detalle'`, move `if (loading)` below the detail branches, `RefreshControl` for the silent state. [OTA]
- [ ] T10 — **Fichajes: choose the division; atomic player + fichaje creation** (S3). `useFichajes.ts:107` only uses `divisiones[0]`; `:209-250` creates the player and then the fichaje without a transaction (an orphan player blocks the retry with "ya existe ese DNI"). Fix: load all manager divisions, required DIVISIÓN selector in the modal and a filter on the list; RPC `fichar_jugador(...)` doing player + socio link + fichaje in one transaction. [backend: migration/function]
- [ ] T11 — **Real routes for the detail screens (system Back / edge swipe)** (P1). `cobranzas.tsx:338-447`, `fichajes.tsx:205-326`, `(subcomision)/eventos.tsx:575-596` fake a stack with `paso`. Fix: per-tab `Stack` with `[eventoId].tsx` / `[jugadorId].tsx` / `[id].tsx`; interim `BackHandler` that calls `volverA…` when a detail is open. [OTA]
- [ ] T12 — **Safe-area insets on Android edge-to-edge** (P1). `SafeAreaView` from `react-native` in `cobranzas.tsx:327`, `egresos.tsx:66`, `fichajes.tsx:192`, `(subcomision)/eventos.tsx:606`, `DetalleRecaudacion.tsx:55`, `CobrosPanel.tsx:51`; fixed `paddingTop: 60` in `informes.tsx:326` and `protocolos.tsx`. Fix: `SafeAreaView` from `react-native-safe-area-context` with `edges={['top']}`, `insets.top + 16` for the fixed headers. [OTA]
- [ ] T13 — **Manager home: AR money format and correct copy for club-wide events** (S2). `(manager)/diario.tsx:19-23` prints "$12.5k"; `:74-97` says "PEDIDO ABIERTO / confirmados / CONFIRMAR COMPROBANTE" for a cobranza and shows the raw `descripcion`. Fix: shared `formatMonto` from `estilo.ts` everywhere (remove the copies in `cobranzas.tsx:56`, `eventos.tsx:70`, `diario.tsx:19`, `informes.tsx:228,239`); card copy "COBRANZA DEL CLUB", "{p}/{t} pagaron", "COBRAR →", "$ X por jugador". [OTA]
- [ ] T14 — **Touch targets ≥ 44 pt** (S2). `EgresosPanel.tsx:360` (26), `modalClose` in `cobranzas.tsx:564`, `CobrosPanel.tsx:286`, `eventos.tsx:786`, `fichajes.tsx:536` (28), `backBtn` in `DetalleRecaudacion.tsx:131`, `eventos.tsx:735` (30), `noticias.tsx:266` (~35), the "Cancelar" links in `noticias.tsx:110` and `protocolos.tsx:141`, `fichajes.tsx:508`, pills `eventos.tsx:811`, `informes.tsx:332`, forma de pago `cobranzas.tsx:586`, `CobrosPanel.tsx:305`. Fix: `hitSlop` + `minWidth/minHeight: 44`. [OTA]
- [ ] T15 — **Ref-based double-submit guards** (P2). `useEgresos.ts:284`, `useEventos.ts:399`, `useFichajes.ts:196`. Fix: `useRef` in-flight flag around each submit. [OTA]
- [ ] T16 — **Decided 2026-10-26: managers DO collect on subcomisión recaudaciones as well as their own events. Keep `cargarEventos` listing them; still add the `estado = 'activo'` check to both manager policies; T1 (save only dirty rows) prevents overwriting subcomisión's rows** — **Manager RLS for cobranzas requires an active event** (out of scope, serious). `20261016000000…sql:328-350` lacks `estado = 'activo'` (subcomisión's policy has it); `useCobranzas.cargarEventos` also lists subcomisión recaudaciones. Fix: add the active-event check to `cobranzas_insert_manager` / `cobranzas_update_manager` + SQL scenario test. [backend: migration]

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
