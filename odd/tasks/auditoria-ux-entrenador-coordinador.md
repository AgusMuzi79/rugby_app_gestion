# Feature: auditoria-ux-entrenador-coordinador

Locator: `odd/tasks/auditoria-ux-entrenador-coordinador.md` (suggested branch `fix/auditoria-ux-entrenador-coordinador`) · Index: `odd/tasks/auditoria-ux-resto.md` · Full report (findings, fixes in code, what is fine, what was not verified): `odd/auditorias/2026-10-26/entrenador-coordinador.md`

## Objective

A coach can take attendance for 30 players in a few taps at the field, with or without signal, on the right event and the right date; the coordinator sees correct numbers.

## Scope / problem (audited 2026-10-26 @ `5a0ce4c`)

Scope: `(entrenador)/**`, `(coordinador)/**`, `components/coordinador/**`, `components/shared/CronicaScreen.tsx` (shared), `components/ui/DatePickerField.tsx` (shared), their hooks, `lib/offlineQueue.ts`.

Result: auditor-ux S4 3 · S3 8 · S2 1 · impeccable 8/20. Code-only pass, no device.

## Decisions

- Follow the index order: Tanda 0 and the shared X-tasks first. Covered here: Tanda 0: T1 · X2: T2 · X4: T4 (and contrast part of T19) · X5: T17 · X6: T12 · X9: T14. Mark those `[x] covered by …` when the index task lands instead of redoing them.
- Backend tasks: write migrations/functions and their checks; do **not** deploy to production, leave the deploy steps in "Progress / evidence".
- Tasks marked **[decision]** wait for the user (consolidated list in the index).

## Compartido

- **`app/components/shared/CronicaScreen.tsx` (entrenador, coordinador, manager, subcomisión)** — auditada acá, no re-reportar:
  - Contraste (incluido en la tabla): badges `FICHAJE` oro/crema 1.60, `RESULTADO` crema/oroHondo 2.59, `ASISTENCIA` crema/oro 1.60 (`:19-21`); barra "SECCIÓN · CRÓNICA" oro/crema 1.60 (`:190-195`); "+ NUEVA NOTICIA" crema/oro 1.60 (`:210-217`, sólo subcomisión); fila urgente con título oro/crema 1.60, desc `#C9B98A`/crema 1.69, autor `#7A6D50`/crema 4.42 (`:60-73,226-230`); `feedDesc` `#7C7267`/fondo 3.99 (`:251-254`).
  - `useCronica.ts:64-68,167`: errores tragados → "Sin novedades en los últimos 7 días" falso; `divIds[0]` (coordinador/entrenador con varias divisiones sólo ve la primera); resultados filtrados por división **después** de `.limit(5)` global (`:82-85,129-132`) → puede mostrar 0 teniendo resultados propios.
  - **Falsos "Nuevo fichaje"**: el feed usa `jugadores.created_at` (`useCronica.ts:77-80`), pero `mover_jugador_division` y `pase_de_temporada` crean una fila nueva por división (`20261013000001_…sql:65-90`). Cada movimiento del coordinador aparece como "Nuevo fichaje — X", y el 1/1 el pase de temporada inunda la Crónica. Fix: leer de la tabla `fichajes` (o filtrar filas cuyo `dni` ya tenía otra fila), no de `jugadores`.
  - Botón ✕ del modal de detalle: `hitSlop` 10/16 sobre texto de 16 → ~40×52, OK; sin `accessibilityLabel` (incluido en el S3 de labels).
- **`app/components/ui/DatePickerField.tsx`** (usado por lesiones, calendario y otras áreas): campo blanco `#fff` con paleta propia en una UI oscura (`:6-9,134`). Lo dejo como P2 de theming acá; el área que audite `components/ui` no debería re-reportarlo.
- **`app/lib/offlineQueue.ts`** (sin consumidor) y la ausencia de `lib/fecha.ts`: los fixes S4 crean módulos compartidos; cualquier otra área que encole o use `toISOString()` para "hoy" (p. ej. `useFichajes.ts:44`, `useDiarioSubcomision.ts:29-32`) debería usar los mismos helpers.

## Fuera de alcance pero grave

1. **Guardar mesa no es atómico: un fallo a mitad borra la mesa entera.** `app/hooks/usePartido.ts:461-472`: `delete` de `mesa_jugadores` (error ignorado) y después `insert`. Si el insert falla (red, RLS), la mesa queda vacía pero existe, así que el chequeo de "equipo obligatorio con mesa" (`:427-439`) pasa igual. Fix: RPC `guardar_mesa(p_evento, p_equipo, p_jugadores jsonb)` que haga upsert de la mesa + delete + insert en una transacción. [backend: migration]
2. **Equipos duplicados al abrir Partido por primera vez.** `usePartido.ts:106-120`: el `useEffect` y el `useFocusEffect` llaman los dos a `fetchDatos()` en el primer montaje (con `divisionId` todavía null) → dos `doSincronizarEquipos` en paralelo → ambos ven "no existe M15" e insertan (`:141-148`). `equipos` no tiene unique `(division_id, nombre)` (`20260507000001_add_equipos.sql:10-20`). Resultado: dos "Primera" en el selector, mesa cargada en una y resultado en la otra. Fix: unique index `(division_id, nombre)` + `upsert(..., { onConflict: 'division_id,nombre', ignoreDuplicates: true })`, y sacar el `fetchDatos` del `useFocusEffect` cuando ya corre el `useEffect`. Antes de la migración, contar duplicados existentes: `select division_id, nombre, count(*) from equipos group by 1,2 having count(*) > 1`. [backend: migration]
3. **`eventos` sin protección contra duplicados por (división, fecha, tipo)** combinado con `.maybeSingle()` en `useAsistencia.ts:115-122,212-220`: cada guardado con dos entrenamientos ese día crea un tercero (detalle en el S3 "evento equivocado"). No propongo unique (doble turno es legítimo); el fix es del lado de la app.

---

## Tareas sugeridas

- [x] T1 — (`3ae35a8`, Tanda 0) **Drain the offline queue** (S4 / P0-equivalent). `lib/offlineQueue.ts` has no consumer; `useAsistencia.ts:193-206`, `usePartido.ts:377-390`, `useLesiones.ts:223-233` enqueue and show "pendiente"/"registrada" forever. Also network failures with `isConnected === true` don't fall back to the queue. Fix: new `lib/offlineSync.ts` `sincronizarCola()` (asistencia: resolve/create event by `division_id`+`fecha`, upsert; lesion: insert + then invoke `notifications`), triggered on mount of `(entrenador)/_layout.tsx`, NetInfo `isInternetReachable` and AppState `active`; enqueue on network errors; show pending count; replace `crypto.randomUUID()` with `expo-crypto`. Add `lib/offlineSync.check.ts` with a mocked supabase. [OTA] (if `expo-crypto` isn't installed: [native build])
- [ ] T2 — **Local date instead of UTC** (S4). `toISOString().split('T')[0]` in 13 places (`useAsistencia.ts:52`, `useLesiones.ts:33`, `usePartido.ts:192-193`, `useDiarioEntrenador.ts:33-35`, `useDiarioCoordinador.ts:46-48`, `useAsistenciaCoordinador.ts:44-48`, `useCalendario.ts:136-137`, `(entrenador)/diario.tsx:17`, `(coordinador)/calendario.tsx:44,48`): after 21:00 ART attendance goes to tomorrow and creates a phantom event. Fix: `lib/fecha.ts` `fechaLocal()` / `fechaLocalMasDias(n)`, reuse from `lib/agenda.ts`, `lib/fecha.check.ts`. Leave `useCronica.ts:22` (timestamptz). [OTA]
- [ ] T3 — **Confirm before discarding unsaved attendance** (S4). `useAsistencia.ts:143-146` division switch wipes marks; `usePartido.ts:251-260` same on match switch. Fix: track `estadoGuardado` per player, `Alert` with Seguir / Guardar y cambiar / Descartar; `guardarAsistencia` returns boolean. [OTA]
- [ ] T4 — **Fix inverted-token call sites in coach/coordinator screens + Crónica** (S3 / P2 theming). 24 locations in the contrast table below at 1.15–2.98:1. Fix: text on cream → `colors.oroSobreClaro`; text on oro/oroHondo → `colors.sobreOro`; small red/green text → `colors.rojoTexto` / `colors.confirmacion`; replace per-file `FONDO/TEXTO/CARD/MUTED/DIVIDER` consts with `colors.*`; add pairs to `lib/contraste.check.ts`. [OTA]
- [ ] T5 — **Attendance in 5 taps instead of 31** (S3). `asistencia.tsx:106-123,399-411`: ~24 pt badges with 5 pt gap, no bulk action, GUARDAR top-right. Fix: "TODOS PRESENTES" button, 44 pt segments with 8 pt gap, sticky bottom GUARDAR with `marcados/total`, prompt for unmarked players, `expo-haptics` selection feedback. [OTA] (haptics: [native build] if `expo-haptics` isn't in the binary)
- [ ] T6 — **Attendance targets the right event** (S3). `diario.tsx:61-65,144` sends any next event to a screen hard-wired to today's entrenamiento (`useAsistencia.ts:115-122,212-231`, `.maybeSingle()`). Fix: show "TOMAR ASISTENCIA" only for today's entrenamiento and pass `eventoId`; partido → Partido screen; hook lists today's entrenamientos and lets the coach pick if >1; never `.maybeSingle()` on eventos by (division, fecha, tipo). [OTA]
- [ ] T7 — **Load results for past matches + multi-division coach** (S3). `usePartido.ts:188,192-211` only `divisiones[0]` and `fecha >= hoy`; the RESULTADO task (`useDiarioEntrenador.ts:85-89,120-126`) dead-ends. Fix: window −7/+14 days, "SIN RESULTADO" section first, deep link from the task preselects match + `resultado` step; division selector like `useAsistencia`; diario queries `.in('division_id', divIds)`. [OTA]
- [ ] T8 — **Stop swallowing network errors** (S3). 9 hooks (list in the finding) treat a failed query as "Sin división asignada"/empty. Fix: `errorCarga` + Reintentar banner (pattern of `useJugadoresDivision.ts`), never set `sinDivision` on error; cache last roster per division in AsyncStorage for offline marking. [OTA]
- [ ] T9 — **Decided 2026-10-26: `justificado` is excluded from both numerator and denominator** — **Correct coordinator attendance %** (S3). `useAsistenciaCoordinador.ts:61-69,92-101` divides by all events in 30 days, including ones without attendance and today's; `:148-149` resets the selected division on focus. Fix: denominator = events with at least one asistencia row (per player: their rows); keep selection. [OTA]
- [ ] T10 — **Accessible names/state + live regions** (S3). 0 accessibility props in `(entrenador)`; list in the finding (`asistencia.tsx:110-120`, `partido.tsx:78-146`, `lesiones.tsx:148-150,249-258,430-439,585-592`, `calendario.tsx:89-91,153-166`). Fix: `radiogroup`/`radio` + `accessibilityState`, labels with player name, `accessibilityLiveRegion="polite"` + `announceForAccessibility` on save results. [OTA]
- [ ] T11 — **44 pt minimum targets** (S3). Table in the finding: `lesiones.tsx:118-125,148-150,585-592`, `calendario.tsx:89-91,143-145,330-332`, `ModalMoverJugador.tsx:61-69`, `jugadores.tsx:187-189,262`, `partido.tsx:850,864`, division chips. Fix: `minHeight/minWidth: 44` + `hitSlop` on text links. [OTA]
- [ ] T12 — **Android safe area (edge-to-edge)** (P1). RN `SafeAreaView` in `(entrenador)/{asistencia,partido,lesiones}.tsx`, `(coordinador)/{jugadores,calendario,asistencia}.tsx`, `ModalMoverJugador.tsx` does nothing on Android with `edgeToEdgeEnabled: true` (`app.config.js:39`). Fix: `SafeAreaView` from `react-native-safe-area-context` with explicit `edges`. [OTA]
- [ ] T13 — **Android Back on "Nueva lesión" modal** (P1). `lesiones.tsx:573` has no `onRequestClose`. Fix: add it with a discard confirmation when the form has data; same guard on the ✕. [OTA]
- [ ] T14 — **Decided 2026-10-26: tabs Inicio · Asistencia · Partido · Crónica (no Lesiones — module hidden, T22), Mi perfil in the header avatar like socio** — **Partido and Lesiones out of hidden tabs** (P1). `(entrenador)/_layout.tsx:24-26` `href: null`: no back, no highlighted tab. [OTA]
- [ ] T15 — **Non-atomic mesa save** (out of scope, data). `usePartido.ts:461-472` delete-then-insert, delete error ignored. Fix: RPC `guardar_mesa(p_evento uuid, p_equipo uuid, p_jugadores jsonb)` in one transaction. [backend: migration]
- [ ] T16 — **Duplicate equipos on first open** (out of scope, data). Double `fetchDatos()` (`usePartido.ts:106-120`) + no unique on `equipos(division_id, nombre)`. Fix: dedupe existing rows, unique index, `upsert … ignoreDuplicates`, single initial fetch. [backend: migration]
- [ ] T17 — **Silent refresh on focus** (P2). `useDiarioEntrenador.ts:48-52`, `useDiarioCoordinador.ts:61-65`, `useCronica.ts:57-61`, `useCalendario.ts:99-101` + `calendario.tsx:467`, `useAsistenciaCoordinador.ts:39-42`. Fix: spinner only on first load; `refreshing` bound to manual pull only. [OTA]
- [ ] T18 — **One query for 4-absences check; notify only on transition** (P2). `useAsistencia.ts:233-268` N+1 and re-sends push on every save. Fix: single `.in('jugador_id', ids)` query grouped in memory; notify only when this save makes the 4th consecutive absence; run after showing "guardada". [OTA]
- [ ] T19 — **Crónica: real fichajes, multi-division, errors** (shared). `useCronica.ts:77-80` counts moved/season-passed players as "Nuevo fichaje"; `:68` `divIds[0]`; `:82-85,129-132` filter after `limit(5)`; `:167` swallowed errors. Fix: read from `fichajes`, `.in('division_id', divIds)` server-side, `errorCarga` banner. [OTA]
- [ ] T20 — **Human error messages** (P2). Raw `error.message` in `useAsistencia.ts:185`, `usePartido.ts:373,456,468,511`, `useLesiones.ts:206`, `useCalendario.ts:247`. Fix: `lib/mensajeError.ts` mapping network / RLS (42501) / default, with `.check.ts`. [OTA]
- [x] T21 — **WON'T DO (user decision 2026-10-26: lesiones module is hidden (T22))** — **Lesiones: honest label + edit** (S2). `lesiones.tsx:539-545` "ACTIVAS" lists every lesion ever; no way to fix a wrong entry (RLS already allows update, `rls_policies.sql:470-475`). Fix: rename to "REGISTRADAS" with "ÚLTIMOS 30 DÍAS"/"ANTERIORES", EDITAR in the expanded card. [OTA]
- [x] T22 — (`82657cf`, Tanda 0) **Hide the lesiones / protocolos module (keep code, tables and protocol content) and delete the injury records** (user decision 2026-10-26, revised: hide, don't remove; health data + contract risk). Skip the lesiones parts of T1 (queue op `'lesion'`), T10, T11, T13 and T20 while hidden.
  - Flag: `app/constants/features.ts` → `export const FEATURES = { lesiones: false } as const` (web: same constant in `web/lib/features.ts`). Everything below reads the flag, so turning it back on restores the module without code changes.
  - App (OTA): `(entrenador)/_layout.tsx` and `(subcomision)/_layout.tsx` → `href: null` for `lesiones` / `protocolos` when the flag is off, and each screen returns `<Redirect href=…diario />` if opened by deep link; hide the "+ LESIÓN" shortcut and the lesiones block in `(entrenador)/diario.tsx` / `useDiarioEntrenador.ts`, the lesiones stats/alerts in `(subcomision)/diario.tsx` / `useDiarioSubcomision.ts`, and lesion items in `useCronica.ts`; skip the lesiones queries entirely (not just the UI) so nothing reads the table. Do **not** delete `lesiones.tsx`, `protocolos.tsx`, `useLesiones.ts`, `useProtocolos.ts` or the `'lesion'` queue op.
  - Web (OTA web): hide the lesiones count in `web/app/(subcomision)/dashboard/page.tsx` behind the flag.
  - Function: `notifications/index.ts` skips lesion events while the flag is off (secret `FEATURE_LESIONES`; off unless it is exactly `true`, since `5e8aea7`).
  - Privacy: while hidden and with no records, remove "registros de lesiones" from `web/app/privacidad/page.tsx:53`; put it back if the module is re-enabled.
  - DB [backend: migration, user runs it **only after reviewing the export**]: delete the records, keep everything else (tables, RLS, `protocolos_lesion` / `protocolo_pasos` / `protocolo_alertas` / `grtp_etapas` content, `protocolos` bucket). No FK points to `lesiones`, so:
    ```sql
    begin;
    delete from notificaciones where evento_referencia_tipo = 'lesion';
    delete from lesiones;
    commit;
    ```
  - Export first (Supabase SQL editor):
    ```sql
    select l.fecha, l.created_at, j.nombre_completo as jugador, d.nombre as division,
           l.grado, l.descripcion, p.nombre as registrado_por
    from lesiones l
    left join jugadores  j on j.id = l.jugador_id
    left join divisiones d on d.id = l.division_id
    left join profiles   p on p.id = l.registrado_por
    order by l.created_at;
    ```
- [ ] T23 — **New role `colaborador`: takes attendance only** (user decision 2026-10-26). Entrenador keeps attendance and everything else. Assumptions to confirm: created by Subcomisión/Admin like an entrenador, assigned to divisions with the same mechanism `tiene_acceso_division()` reads.
  - App: `constants/roles.ts` (`COLABORADOR: 'colaborador'`, label "Colaborador", `ROL_RUTA_INICIAL` → `/(colaborador)/asistencia`); move `(entrenador)/asistencia.tsx` into `components/shared/AsistenciaScreen.tsx` and re-export it from `(entrenador)` and a new `app/app/(colaborador)/` group (single screen, Mi perfil in the header avatar, no tab bar or one tab); root guard in `app/_layout.tsx` routes the role.
  - DB [backend: migration]: allow `colaborador` in `profiles.rol` / `roles[]` checks; RLS select on `jugadores`, `eventos`, `asistencias` and insert/update on `asistencias` for `colaborador` with `tiene_acceso_division(division_id)`; today's training event creation (`useAsistencia.ts` inserts it) needs an `eventos` insert policy limited to `tipo = 'entrenamiento'`, or move it to an RPC.
  - Functions: `admin-usuarios` `RolCreable` + `ROLES_POR_CALLER` (subcomision and admin); web `usuarios/page.tsx` and mobile `UsuariosScreen.tsx` role lists. The 4-absences push keeps going to the entrenador.
  - Do it after T22 and T1–T5 (it reuses the fixed attendance screen).

### Tabla de contraste

Medido con `auditor-ux/scripts/contraste.py`. Mínimo AA 4.5:1 (texto normal), 3:1 (≥18.66 px bold / ≥24 px).

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| `ModalMoverJugador.tsx:181-183` CONFIRMAR CAMBIO | `#F5B41C` sobre `#F3EFE4` | 1.60 | `oroSobreClaro` #7A4F00 | 6.20 |
| `partido.tsx:856-859` botones primarios (texto `:858`) | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `partido.tsx:834-840` jugador en mesa (nombre oro, ✕ oroHondo) | oro / crema · `#C9890A` / crema | 1.60 · 2.59 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:835-837` REGISTRAR LESIÓN | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:726-728` pestaña activa | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:796-799` grado activo | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:745,751,761` tarjeta urgente (nombre, label) | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:753` fecha urgente · `:832` sub banner OK | `#9A8870` / crema | 2.98 | `#5C4A2E` | 7.39 |
| `lesiones.tsx:830-831` banner "LESIÓN REGISTRADA" | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `lesiones.tsx:34-35,768` badge G2 | `#FFFFFF` / `#C4960A` | 2.72 | `sobreOro` #15110A | 6.91 |
| `(entrenador)/diario.tsx:222-229,246-256` barra edición + tarjeta próximo evento | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `(entrenador)/diario.tsx:265-272` TOMAR ASISTENCIA | crema / oro | 1.60 | `sobreOro` | 10.24 |
| `(entrenador)/diario.tsx:298-300` atajo "+ LESIÓN" | crema / oro | 1.60 | `sobreOro` | 10.24 |
| `(entrenador)/diario.tsx:76,283-286` badge MESA | `#FFFFFF` / crema | **1.15** | `sobreOro` sobre crema #15110A | 16.37 |
| `(entrenador)/diario.tsx:75,283-286` badge RESULTADO | `#FFFFFF` / `#C9890A` | 2.97 | `sobreOro` | 6.33 |
| `(entrenador)/asistencia.tsx:328,332` chip división activo | crema / oro | 1.60 | `sobreOro` | 10.24 |
| `(entrenador)/asistencia.tsx:385-391,432-437` "⚠ 4 AUSENCIAS", error (12–13 px) | `#CC4127` / `#15110A` | 3.90 | `rojoTexto` #E5634A | 5.57 |
| `(entrenador)/asistencia.tsx:420-425` "✓ Asistencia guardada" · `partido.tsx:870` | `#4A7C59` / `#15110A` | 3.87 | `confirmacion` #22C55E | 8.25 |
| `(entrenador)/asistencia.tsx:293-298` meta header (13 px) | `#7A7060` / `#15110A` | 3.86 | `muted` #8E8574 | 5.16 |
| `(coordinador)/jugadores.tsx:247-249`, `asistencia.tsx` (coord) `:208-210` pill activa | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `(coordinador)/calendario.tsx:502-503,545-551,554-556,514+517` + Nuevo, tipo/división activos, GUARDAR, badge "P" | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `(coordinador)/calendario.tsx:523-524` badge HOY | `#FFFFFF` / `#22C55E` | 2.28 | `sobreOro` | 8.25 |
| `(coordinador)/diario.tsx:241-245` barra edición · `:280-284` COBRANZA ACTIVA | oro / crema · crema / oro | 1.60 | `oroSobreClaro` · `sobreOro` | 6.20 · 10.24 |
| `(coordinador)/diario.tsx` `alertaDesc` (14 px) · `CronicaScreen.tsx:251-254` | `#7C7267` / `#15110A` | 3.99 | `muted` #8E8574 | 5.16 |
| `CronicaScreen.tsx:19,190-195,226-230,60,65` FICHAJE, barra, fila urgente | oro / crema | 1.60 | `oroSobreClaro` | 6.20 |
| `CronicaScreen.tsx:20` RESULTADO · `:21` ASISTENCIA · `:216` NUEVA NOTICIA | crema / oroHondo · crema / oro | 2.59 · 1.60 | `sobreOro` | 6.33 · 10.24 |
| `CronicaScreen.tsx:69` desc urgente | `#C9B98A` / crema | 1.69 | `#5C4A2E` | 7.39 |
| `CronicaScreen.tsx:73` autor urgente (11 px) | `#7A6D50` / crema | 4.42 | `#5C4A2E` | 7.39 |

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
- 2026-10-26 (Tanda 0, branch `fix/auditoria-tanda-0`):
  - T1 `3ae35a8`: `app/lib/offlineSync.ts` + `.check.ts` RED → GREEN 8 cases (mocked DB): training attendance resolves the day's event (first non-cancelled, never `.maybeSingle()`) or creates it, match attendance keeps its `evento_id`, failures stay queued, a broken payload does not block the rest, lesion items stay in the queue while the module is hidden. `useSincronizacionOffline` in `(entrenador)/_layout.tsx` drains on mount, on reconnect and on foreground; network errors with `isConnected=true` also queue (asistencia and partido); the attendance screen shows the honest pending text. Queue ids are plain JS (no `crypto.randomUUID`), so `expo-crypto` is **not** needed. App tsc OK.
  - T22 `82657cf`: `FEATURES.lesiones = false` (`app/constants/features.ts`, `web/lib/features.ts`). Hidden: + LESIÓN / PROTOCOLOS shortcuts, lesiones queries in `useDiarioEntrenador`, `useDiarioSubcomision`, `useCronica` and the web dashboard (the table is not read), LESIONES stat and lesion items in the Subcomisión crónica; `lesiones` / `protocolos` routes redirect to Inicio. `notifications` skips lesion events when `FEATURE_LESIONES=false`. Kept: screens, hooks, tables, protocol content, `protocolos` bucket, queue op. App tsc, web build OK.
  - T22 records: **pending, user action** — run the export query above, review it, then the delete SQL above (nothing was deleted by the agent).
  - Deploy (user): `supabase functions deploy notifications` (no secret needed: lesion pushes are off unless `FEATURE_LESIONES=true`); web deploy; OTA for the app.
