# Feature: auditoria-ux-secretaria

Locator: `odd/tasks/auditoria-ux-secretaria.md` (suggested branch `fix/auditoria-ux-secretaria`) · Index: `odd/tasks/auditoria-ux-resto.md` · Full report (findings, fixes in code, what is fine, what was not verified): `odd/auditorias/2026-10-26/secretaria.md`

## Objective

Secretaría can import, search and correct members without losing data or silently dropping real members, and finds "did this payment land?" in one screen.

## Scope / problem (audited 2026-10-26 @ `5a0ce4c`)

Scope: Web `(secretaria)/**`, `SidebarSecretaria`, `components/secretaria/**`; mobile `(secretaria)/**`; functions `importar-socios`, `importar-deuda`, `importar-servicios`, `admin-socios`, `socios-pagos` (as seen by Secretaría).

Result: auditor-ux S4 3 · S3 9 · S2 4 · impeccable web 8/20, mobile 8/20. Code-only pass, no device.

## Decisions

- Follow the index order: Tanda 0 and the shared X-tasks first. Covered here: Tanda 0: T1, T2, T4, T6 · X3: T13 · X4: T8, T9 · X5: flicker part of T17 · X8: T14. Mark those `[x] covered by …` when the index task lands instead of redoing them.
- Backend tasks: write migrations/functions and their checks; do **not** deploy to production, leave the deploy steps in "Progress / evidence".
- Tasks marked **[decision]** wait for the user (consolidated list in the index).

## Compartido

- **`colors.tinta` como fondo (lección 1)**: el mismo bug de `CronicaScreen.tsx`/`UsuariosScreen.tsx` está en las 3 pantallas mobile de Secretaría (`edicionBar`, `crearBtn`, chips activos). Si otra área ya propone un helper o un token `colors.superficieClara`/`sobreOro` para "barra de edición", reusarlo acá y no inventar otro.
- **`app/hooks/useNoticias.ts`**: lo comparten socio (`useNoticias(true)`) y secretaría (`useNoticias(false)`). El fix del push va en `togglePublicar`, que sólo usa secretaría, y no afecta a socio. El parpadeo (`:33` + `:74`) sí afecta a los dos roles; la auditoría socio lo arregló en la pantalla, no en el hook, así que hay que revisar que no se rompa.
- **`web/components/ListaColapsable.tsx`**: está bien. Sólo le falta `aria-expanded` en el botón (`:22-28`). También lo usan las pantallas de import; si otra área lo reporta, es el mismo hallazgo.
- **Helper de fetch a Edge Functions** (4 copias en Secretaría): si subcomisión (`/usuarios`) tiene la misma copia (`estado-web.md` menciona `callEdgeFunction` en `/usuarios`), conviene un solo `web/lib/edge.ts` para todo el panel.

## Fuera de alcance pero grave

1. **Número de tarjeta completo + CVV pasan por el panel de Secretaría y por una Edge Function propia (PCI DSS).** `web/.../socios/page.tsx:439-470` y `app/app/(secretaria)/socios.tsx:287-329` capturan el PAN y el CVV en texto. `socios-pagos/index.ts:944-1000` los recibe en el body y los reenvía a Mercado Pago. Eso pone al club en el alcance PCI más amplio (SAQ D) cuando lo correcto es tokenizar del lado del cliente con el SDK de MP (SAQ A). Además el flujo está descartado por la directiva. **Fix:** sacar `associate-card` de la UI (hallazgo de tarjeta) y que la function devuelva 410 en `associate-card`/`charge-card` desde el rol secretaria. [backend: function]
2. **`socios-pagos` `handleManual` ignora el error del insert en `pagos_socios`** (`socios-pagos/index.ts:633-647`): marca la cuota como `pagado` aunque el pago no se haya guardado, y en ese caso no sale el comprobante (`pagoId` queda undefined). La secretaria ve "Pago registrado ✓" con un registro a medias. **Fix:** mirar `pagoRes.error` y revertir el `update` de la cuota, o hacerlo en una RPC transaccional. [backend: function]
3. **"Registrar pago" en la app y NUVIX como fuente de verdad son dos verdades distintas.** `handleManual` escribe `cuotas`/`pagos_socios` y manda un PDF por mail (`:650-655` → `generarYEnviarComprobante`), cuando el club decidió que NUVIX manda los transaccionales ("sin mail", CLAUDE.md) y la app del socio muestra la deuda NUVIX. Un pago cargado sólo acá no cambia la deuda que ve el socio hasta que entra en NUVIX, y le llega un comprobante duplicado. [decision: ¿Registrar pago sigue existiendo? Si la secretaria carga todo en NUVIX, sacarlo del panel y de mobile; si no, como mínimo cortar el mail.]

---

## Tareas sugeridas

- [ ] T1 — **Decided 2026-10-26: remove manual member creation entirely; every member enters through the NUVIX roster import. Remove "+ NUEVO SOCIO" (web `socios/page.tsx:541-606`, mobile `socios.tsx:37-159`) and make `admin-socios` `create` return 410** — **Manual member creation must carry the NUVIX member number** (S4 / P1). `admin-socios/index.ts:105-121` inserts without `numero_socio` (sequence value), so the next `importar-socios` run (`:351-366`) bans the member, emails "Baja de tu cuenta" (`:595-616`) and recreates them with a synthetic mail (`:416-418`). Web `socios/page.tsx:541-606` and mobile `socios.tsx:37-159` don't ask for it, and the button falsely says "ENVIAR INVITACIÓN". Fix: required "Nº DE SOCIO (NUVIX)" field, 409 on duplicate, store it in `socios.numero_socio`, button "CREAR SOCIO" + helper text about the DNI password. [backend: function] + [OTA] —
- [ ] T2 — **Block deleting a service that members have; lock renaming of mapped services** (S4 / P1). `servicios/page.tsx:76-80` deletes and `20260609000000_servicios_opcionales.sql:19` cascades to every `socio_servicios` row (gym access lost for everyone). Renaming breaks `importar-servicios:137-160` and `socios-qr:288`. Fix: count links first and refuse with "lo tienen N socios: desactivalo"; disable the name input for the six mapped names; migration `ON DELETE RESTRICT`. [backend: migration] + [OTA web]
- [ ] T3 — **Keyboard access to member detail and column sort** (S4 / P1). `socios/page.tsx:892-895` (`tr onClick`), `:701-706` and `deudas/page.tsx:446-449` (`th onClick`). Fix: name cell `<button>`, `<th aria-sort>` wrapping a `<button>`, `focus-visible:outline-oro`. [OTA web]
- [ ] T4 — **Roster import preview: show names on removals + mass-removal guard** (S3 / P1). `importar-socios/index.ts:361` leaves `nombre` empty for "ausencia" removals, rendered as "—" (`socios-import/page.tsx:90`); raw `motivo`; no guard like services' 30 % rule. Fix: fall back to `nombre_padron`, human labels for motivo, `baja_masiva` flag (> max(20, 3 % of active)) with typed "BAJAS" confirmation. [backend: function] + [OTA web]
- [ ] T5 — **Debt import: reject older reports, legible reconciliation error, honest "datos al"** (S3 / P1). `importar-deuda/index.ts:94-99` returns raw JSON; the RPC (`20261011000000:152-183`) recomputes every member's traffic light from whatever was just imported; `deudas/page.tsx:498-503` shows max `fecha_corte`. Fix: 409 when `fecha_corte` < latest unless `forzar=1` (with "IMPORTAR IGUAL" button), human error text, header shows the import that produced the current traffic light. [backend: function] + [OTA web]
- [ ] T6 — **Remove the abandoned card flow from member detail (web + mobile)** (S3 / P1). Web `socios/page.tsx:244-257, 290-315, 431-537, 887, 906-910` (associate is broken: sends `cardData` nested vs `socios-pagos/index.ts:953` reading top-level); mobile `socios.tsx:285-509, 632-707` + hook `associateCard/removeCard/chargeCard`. Fix: delete the section, three modals and the TARJETA column; make the function return 410 for those actions from staff. [OTA] + [backend: function]
- [ ] T7 — **Answer "did my payment land?" in one screen** (S3 / P1). Member detail (`socios/page.tsx:195-209`) lacks NUVIX debt; `deudas/page.tsx:463, 550-557` applies search on top of the default ROJO filter and says "SIN RESULTADOS"; lists search `profiles.nombre` (user-editable) instead of `nombre_padron`. Fix: search ignores the traffic-light filter, empty state names the filter, add DEUDA NUVIX row to detail, select and search `nombre_padron` + app name. [OTA web]
- [ ] T8 — **Web contrast fixes** (S3 / P1). `text-tinta/40` (3.49:1), `text-tinta/30` (2.49:1), `text-rojo` errors (3.90:1), `text-rojo/40` (1.56:1), `text-rojo/60` (2.12:1); locations in the contrast table. Fix: `/60` for secondary text; new token `--color-rojo-texto: #E5634A` for error/destructive text. [OTA web]
- [ ] T9 — **Mobile secretaría: semantic tokens instead of `colors.tinta` backgrounds** (S3 / P1). `diario.tsx:193-197`, `socios.tsx:939-946, 1011-1028, 1039-1042, 1077-1083, 918, 970-971`, `noticias.tsx` edicionBar/deporteChipActivo/crearBtn, `diario.tsx:224`. Fix: `colors.card` bars, `colors.oro` + `colors.sobreOro` for primary buttons/active chips/FAB icon/status badges, `colors.muted` for sub text. [OTA]
- [ ] T10 — **Mobile home and filters must use NUVIX data** (S3 / P1). `useDiarioSecretaria.ts:46-50` counts `estado='moroso'` (never set); "ÚLTIMOS PAGOS" reads app-only `pagos_socios`; `socios.tsx:32` MOROSO filter; `socios.tsx:550-553` sums catalog price instead of link `importe`. Fix: count `semaforo='rojo'`, replace recent payments with last debt-report date, drop MOROSO filter, sum `importe ?? monto_mensual`. [OTA]
- [ ] T11 — **News publish: confirm, notify once, and notify from mobile too** (S3 / P1). Web `noticias/page.tsx:76-88` pushes on every publish without confirmation and swallows errors; mobile `useNoticias.ts:114-124` never pushes. Fix: confirm dialog stating "se avisa a todos los socios", `noticias.notificada_at` to avoid re-push, same invoke from mobile, surface push failure. [backend: migration] + [OTA]
- [ ] T12 — **Stop swallowing Supabase errors in secretaría screens** (S3 / P1). `socios/page.tsx:146-154, 740-751, 778-784`; `servicios/page.tsx:25-31, 70-80`; `categorias/page.tsx:25-33, 74-79`; `debito-automatico/page.tsx:309-317, 355-359` (also add delete confirmation); `noticias/page.tsx:49-93`; `comprobantes/page.tsx:162-188`; `deuda/page.tsx:278-305`; `socios-import/page.tsx:269-292`; `seccion-servicios.tsx:510-532`; `useDiarioSecretaria.ts:46-87`; `layout.tsx:23-33` (network error must not sign out). Fix: `error` state + "REINTENTAR" block with `role="alert"`. [OTA web] + [OTA]
- [ ] T13 — **Single robust Edge Function client with try/finally** (P1). `deuda/page.tsx:66-107`, `socios-import/page.tsx:54-139`, `socios/page.tsx:66-80`, `comprobantes/page.tsx:36-50` can leave "IMPORTANDO…" stuck when the gateway returns non-JSON. Fix: `web/lib/edge.ts` based on `seccion-servicios.tsx:115-143`; every handler in try/finally; timeout message "revisá el historial antes de reintentar". [OTA web]
- [ ] T14 — **Accessible modals and status messages (web)** (P1). `socios/page.tsx:610-622`, `comprobantes/page.tsx:113-117`, `noticias/page.tsx:207-213`; status in `socios/page.tsx:183-185`, `comprobantes/page.tsx:211-213`. Fix: native `<dialog>` with `showModal()`, `aria-label="Cerrar"`, `role="status"`/`role="alert"`, no auto-hide timers. [OTA web]
- [ ] T15 — **Member list performance (web)** (P1). `socios/page.tsx:796-806, 891-912, 791-794`; `deudas/page.tsx:550-561`. Fix: `useMemo` + `useDeferredValue`, render 100 rows with "ver más", refetch only the edited member after detail actions. [OTA web]
- [ ] T16 — **Mobile targets and labels** (P1). Close icons `socios.tsx:85, 222, 348, 474`, `noticias.tsx:123`; `noticias.tsx:57-70, 318-320` (32 pt); FABs; `socios.tsx:954` filters (~36 pt). Fix: `hitSlop={12}`, `minWidth/minHeight: 44`, `accessibilityLabel`/`accessibilityRole`/`accessibilityState`. [OTA]
- [ ] T17 — **Mobile list: no flicker on focus + search** (P1). `useSociosSecretaria.ts:111, 159`, `socios.tsx:899`, `useDiarioSecretaria.ts:39`, `useNoticias.ts:33`; no search in `socios.tsx:870-915`. Fix: first-load-only spinner, `refreshing` for focus/pull, keep FlatList mounted; add search input over `nombre_padron`/DNI/Nº. [OTA]
- [ ] T18 — **Decided 2026-10-26: remove "Registrar pago" (web + mobile) and everything that generates or emails comprobantes (`handleManual`, `generarYEnviarComprobante`); `socios-pagos` manual action returns 410. NUVIX is the only payment record** — **Manual payment: transactional write and decide if it stays** (out of scope, grave). `socios-pagos/index.ts:633-655` ignores `pagoRes.error` and emails a PDF while NUVIX is the source of truth. Fix: check the error and roll back the cuota (or RPC); stop the email. [backend: function] —
- [ ] T19 — **Decided 2026-10-26: delete `/secretaria/comprobantes` and the aprobar/rechazar-comprobante UI and function actions** — **Orphan `/secretaria/comprobantes` page** (S2). Not linked in `SidebarSecretaria.tsx:7-16`; the `en_revision` flow is unused since WhatsApp receipts. Fix: delete page + `aprobar/rechazar-comprobante` UI, or link it.

### Tabla de contraste

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| Web — textos secundarios / vacíos / CARGANDO (`text-tinta/40` sobre papel) | `#6E6A61` / `#15110A` | 3.49:1 | `text-tinta/60` → `#9A968D` | 6.38:1 |
| Web — badge INACTIVO, Exento, notas (`text-tinta/30` sobre papel) | `#58544B` / `#15110A` | 2.49:1 | `text-tinta/60` → `#9A968D` | 6.38:1 |
| Web — `text-tinta/30` sobre card (SIN FOTO, Sin comprobante) | `#5C5850` / `#1C1710` | 2.52:1 | `text-tinta/60` → `#9D998F` | 6.26:1 |
| Web — errores `text-rojo` sobre papel | `#CC4127` / `#15110A` | 3.90:1 | `#E5634A` | 5.57:1 |
| Web — errores `text-rojo` sobre card | `#CC4127` / `#1C1710` | 3.69:1 | `#E5634A` | 5.27:1 |
| Web — ELIMINAR servicios (`text-rojo/40`) | `#5E2416` / `#15110A` | 1.56:1 | `#E5634A` | 5.57:1 |
| Web — ELIMINAR noticias (`text-rojo/60`) | `#832E1B` / `#15110A` | 2.12:1 | `#E5634A` | 5.57:1 |
| Mobile — `edicionBar` / `crearBtn` / chips activos (oro sobre `colors.tinta`) | `#F5B41C` / `#F3EFE4` | 1.60:1 | oro sobre `colors.card`/`fondo`, o `sobreOro` sobre oro | 10.24:1 |
| Mobile — `tarjetaCard` (TEXTO sobre `colors.tinta`) | `#F3EFE4` / `#F3EFE4` | 1.00:1 | se elimina (T6) | — |
| Mobile — FAB ícono (`colors.tinta` sobre oro) | `#F3EFE4` / `#F5B41C` | 1.60:1 | `colors.sobreOro` `#15110A` | 10.24:1 |
| Mobile — badge estado (blanco sobre verde) | `#FFFFFF` / `#2ECC71` | 2.10:1 | `#15110A` | 8.95:1* |
| Mobile — badge estado (blanco sobre naranja) | `#FFFFFF` / `#E67E22` | 2.85:1 | `#15110A` | 6.60:1* |
| Mobile — `statSub` del Inicio | `#7C7267` / `#1C1710` | 3.78:1 | `colors.muted` `#8E8574` | 4.88:1 |

\* Ratio simétrico medido con el script como `#2ECC71`/`#E67E22` sobre `#15110A`. El contraste es el mismo en la dirección inversa.

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
