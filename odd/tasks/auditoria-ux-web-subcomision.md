# Feature: auditoria-ux-web-subcomision

Locator: `odd/tasks/auditoria-ux-web-subcomision.md` (suggested branch `fix/auditoria-ux-web-subcomision`) · Index: `odd/tasks/auditoria-ux-resto.md` · Full report (findings, fixes in code, what is fine, what was not verified): `odd/auditorias/2026-10-26/web-subcomision.md`

## Objective

The Subcomisión and Buffet panels are safe (no destructive action without guard), correct past 1000 rows, usable by keyboard and at 320px; the public pages tell the stores the truth.

## Scope / problem (audited 2026-10-26 @ `5a0ce4c`)

Scope: Web `(subcomision)/**`, `(buffet)/**`, `login`, `soporte`, `privacidad`, `eliminar-cuenta`, root `layout`/`page`, `globals.css`, `Sidebar*.tsx`; function `admin-usuarios` (delete).

Result: auditor-ux S4 2 · S3 9 · S2 1 · impeccable 8/20. Code-only pass, no device.

## Decisions

- Follow the index order: Tanda 0 and the shared X-tasks first. Covered here: Tanda 0: T1, T10, T12 · X4: T9 · X8: T8, T11 (modal/focus), T13, T17, T18. Mark those `[x] covered by …` when the index task lands instead of redoing them.
- Backend tasks: write migrations/functions and their checks; do **not** deploy to production, leave the deploy steps in "Progress / evidence".
- Tasks marked **[decision]** wait for the user (consolidated list in the index).

## Compartido

- **`supabase/functions/admin-usuarios` `delete`** (auditor-ux #1): la app mobile usa la misma acción, `app/hooks/useUsuarios.ts:389-390` (pantalla de usuarios del admin/subcomisión, `UsuariosScreen`). El fix de backend cubre las dos; el área mobile de Usuarios no debería reportarlo de nuevo, pero sí ajustar su botón.
- **`web/app/globals.css` (tokens)**: el contraste de #9 y el `:focus-visible` global afectan también a `(secretaria)` y `(porteria)`. El área web-secretaría no debería re-medir `tinta/40` ni `rojo`.
- **`web/components/SidebarSecretaria.tsx`**: misma sidebar fija sin breakpoint y con hex inline (fuera de mi alcance, mismo fix que #8 y P2 "Sidebar ×4").
- **`web/app/(porteria)/layout.tsx:29,52`**: acepta `subcomision` y renderiza `SidebarLector` (auditor-ux #12); el fix vive en el área de portería.
- **Pocos web**: los modales de `(secretaria)` probablemente repiten el patrón sin `<dialog>`. No los leí.

## Fuera de alcance pero grave

1. **Subcomisión puede borrar cuentas (con su socio) sin ser admin.** `admin-usuarios/index.ts:41` deja pasar a `subcomision` en todas las acciones, incluidas `delete` y `deactivate` (ban de 100 años) de cualquier perfil no-admin. La UI solo le muestra staff, pero la función acepta cualquier `userId`: una cuenta de subco puede banear o borrar a un socio común por API. Fix: en `delete` y `deactivate`, exigir `callerRol === 'admin'`, o verificar que el `userId` destino tenga un rol de `ROLES_POR_CALLER[callerRol]` en `roles[]`.
2. **Cascada destructiva en el modelo**: `profiles → socios → cuotas/pagos_socios/accesos/turnos` es todo `ON DELETE CASCADE` (`20260506000000:51`, `20260601000000:86,114,128,152`). Cualquier borrado de usuario en Auth, incluido el botón "Delete user" del Dashboard de Supabase que Secretaría podría usar para "procesar" una baja pedida por mail, borra el historial contable que `eliminar-cuenta` dice conservar. Fix de backend: `socios.profile_id ... ON DELETE SET NULL` (columna nullable) o un trigger `BEFORE DELETE ON profiles` que rechace si existe un socio.
3. **Fotos de menores procesadas por un tercero no declarado** (AWS Rekognition, ver auditor-ux #10). Lo repito acá porque no es solo UX: es tratamiento de datos de menores (Ley 25.326, Play Families si aplica).

## Tareas sugeridas

- [ ] T1 — **Block account deletion for members and non-admins** (S4 / P0). `web/app/(subcomision)/usuarios/page.tsx:189-194,352` → `admin-usuarios/index.ts:245-253` deletes the auth user, which cascades to `socios`, `cuotas` and `pagos_socios` (`20260506000000:51`, `20260601000000:86,128,152`). Fix: `handleEliminar` returns 409 if a `socios` row exists for `userId` and 403 if `callerRol !== 'admin'`; add a `remove-role` action (drop the staff role from `roles[]`, set `rol='socio'`); the web shows ELIMINAR only for `isAdmin && !roles.includes('socio')`, otherwise "QUITAR ROL DE STAFF", placed away from DESACTIVAR. Same guard for `deactivate` (target must hold a role the caller can manage). Mobile `useUsuarios.ts:389` gets the same button change. [backend: function] + [OTA]
- [ ] T2 — **Keyboard-reachable image picker** (S4 / P1). `noticias/page.tsx:290`, `promos/page.tsx:229` use `className="hidden"` on the file input. Fix: `sr-only` + `focus-within:outline-2 focus-within:outline-oro` on the label. [OTA]
- [ ] T3 — **Informes/Portada: paginate past 1000 rows and surface errors** (S3 / P1). `informes/page.tsx:43-50`, `dashboard/page.tsx:30-53` read whole tables (PostgREST `max_rows=1000`) and ignore `error`. Fix: `selectAllRows` from `web/lib/supabase.ts` for asistencias, jugadores, eventos, fichajes, resultados, cobranzas; error state with "Reintentar"; ideally an RPC `resumen_dashboard()` for the 5 numbers. [OTA] (RPC: [backend: migration])
- [ ] T4 — **Fix the "4 AUS." flag** (S3 / P1). `informes/page.tsx:82-88` takes the 4 latest events club-wide including future ones, so it never fires. Fix: per-player past events of `jugador.division_id` (`fecha <= today`), lookup via a `Map`; extract to `web/lib/informesAsistencia.ts` + `.check.ts` (future event, other division, 4 real absences). [OTA]
- [ ] T5 — **Usuarios: write `roles[]`, check errors, list by `roles`, show `activo`** (S3 / P1). `usuarios/page.tsx:164-179` ignores errors and only writes `rol`; `:122-127` filters by active `rol`, so staff in "vista socio" disappear; `activo` is never selected (`:123`), so both DESACTIVAR and REACTIVAR show. Fix: select `roles, activo`, `.overlaps('roles', ROLES_*)`; `saveRol` replaces the old staff role in `roles[]`; error → `role="status"` aviso; one toggle button + "DESACTIVADO" chip. Verify the `profiles` UPDATE policy for subcomisión. [OTA]
- [ ] T6 — **Decided 2026-10-26: Subcomisión can no longer create (or edit rama/recibe_adultos of) divisions — admin only. Hide create/edit in the web panel for non-admin; RLS `divisiones` insert/update only `admin`. Keep the client validation for the admin form** — **Divisiones: prevent divisions the auto-assignment ignores** (S3 / P1). The form defaults RAMA to "—" and allows Mixto/duplicate RECIBE ADULTOS (`divisiones/page.tsx:378-423`), but `_destino_division_por_servicio` (`20261014000000:205-280`) only matches `rama = damas|caballeros` and returns `adultos_ambiguo` on duplicates. Fix: client validation (duplicate recibe_adultos per deporte+rama, mixto), hint under RAMA when empty; unique partial index `on divisiones (deporte, rama) where activa and recibe_adultos`. [OTA] + [backend: migration] +
- [ ] T7 — **Noticias/Promos: own items by default, show author and draft state, handle errors** (S3 / P1). `noticias/page.tsx:47-52` lists and lets delete every club noticia (Secretaría, Buffet, other sports, drafts), the counter counts drafts; `promos/page.tsx:35-38` shows everything to admin and swallows errors (`:35-52`, `:72`). Fix: `.eq('autor_id', uid)` with a read-only "VER TODAS" toggle, author + BORRADOR/CUERPO TÉCNICO chips, `promos` error handling copied from `noticias:54-58,108-114`. [OTA]
- [ ] T8 — **Responsive panel shell** (S3 / P1). `(subcomision)/layout.tsx:56`, `(buffet)/layout.tsx:53`, `Sidebar*.tsx` fixed `w-56` + `ml-56` leave 32px of content at 320px. Fix: single `PanelSidebar` off-canvas below `lg` (MENÚ button 44px, `aria-expanded`, close on route change/Escape), `lg:ml-56 p-4 sm:p-8`, `flex-wrap` on page headers, `grid-cols-1 sm:grid-cols-2` in Usuarios. Also apply to `SidebarSecretaria`. [OTA]
- [ ] T9 — **Semantic color tokens for AA contrast** (S3 / P1). 62× `text-tinta/40` (3.47:1), 4× `/30` (2.52:1), all error text `text-rojo` (3.69:1), `text-rojo/60` (2.11:1), destructive hover/badge (3.90:1), input borders (2.52:1). Fix: `--color-rojo-texto:#E5634A` (= app `rojoTexto`), `--color-texto-2:#9D998F`, `--color-borde-control:#7A7060` in `globals.css`, then replace (see contrast table). Add a web `contraste.check.ts` like the app's. [OTA]
- [ ] T10 — **Decided 2026-10-26: keep the BORRADOR banner until the lawyer closes the text (days). Account deletion stays as today (see T12): rewrite "Qué se conserva" to match it — Secretaría removes the member from the padrón, the next import bans the account (`importar-socios:475-479`, `ban_duration 876000h`), nothing is deleted in Auth. Remove the "registros de lesiones" line (`privacidad:53`) while lesiones is hidden (entrenador-coordinador T22). Rekognition + Mercado Pago lines still required** — **Public pages match what the app does** (S3 / P1). `privacidad/page.tsx:47-88` omits AWS Rekognition (`admin-socios:212-271`, called on every member photo upload from `useSobre.ts:197`) and Mercado Pago card storage (`socios-pagos:861-1043`); `:99-111` has no contact channel; `eliminar-cuenta/page.tsx:52-58` promises payment records are kept "disociados", but the FKs cascade. Fix: add both processors and card data, add email/WhatsApp + link to `/eliminar-cuenta`, rewrite "Qué se conserva" to match the real process. [OTA] + +
- [ ] T11 — **Form labels, visible focus, live errors, accessible modals** (S3 / P1). Labels without `htmlFor` in every form (login, divisiones, noticias, promos, usuarios); `usuarios:278` select with `outline-none` and no focus style; errors without `role="alert"`; toggles without `aria-pressed`; tabs without `role="tab"`; sidebar without `aria-current`; modals (`noticias:236`, `promos:176`, `usuarios:481`) with no dialog role, no Escape, no focus management, unnamed `×`. Fix: id/htmlFor pairs, global `:focus-visible { outline:2px solid var(--color-oro); outline-offset:2px }`, `role="alert"`, `aria-pressed`, `aria-current="page"`, shared `Modal` on native `<dialog>` with `aria-labelledby` and `aria-label="Cerrar"` (44×44). [OTA]
- [x] T12 — **WON'T DO (user decision 2026-10-26: keep the current flow: Mi Perfil → `/eliminar-cuenta` guide → member messages Secretaría → Secretaría da de baja en el padrón → import bans the account. No in-app request. Accepted risk: Apple may question an email/message-only deletion; answer in review notes)** — **Account deletion parity (dark-pattern risk)** (S3 / P1). Deletion is "email us from your registered address" (`eliminar-cuenta:33-42`, opened from `SobreScreen.tsx:26-40`); minors and tutor-linked accounts have synthetic emails, and T11 itself notes Apple rejects email-only flows. Fix: re-enable the built in-app `solicitudes_baja` flow (page stays as fallback), or at least add WhatsApp and the in-app path to the page. + [native build/OTA depending on choice]
- [ ] T13 — **Per-page titles** (P1). `web/app/layout.tsx:17-20` gives every panel page the same title (SC 2.4.2). Fix: `title.template` + a server `layout.tsx` per route with its own `metadata`. [OTA]
- [ ] T14 — **Auth guard that does not log out on network errors** (P2). `(subcomision)/layout.tsx:26-36`, `(buffet)/layout.tsx:23-33`. Fix: shared `useRolGuard`; on `error` show retry, `signOut` only on a confirmed wrong role. [OTA]
- [ ] T15 — **Informes performance** (P2). `informes/page.tsx:74-91` O(players × attendance) per render. Fix: precomputed Maps (with T4), later an RPC `informe_asistencia`. [OTA]
- [ ] T16 — **Lazy, resized news images** (P2). `noticias:212`, `promos:155` load originals as 64px thumbs; uploads not resized (`noticias:143`, `promos:88`). Fix: `loading="lazy" width/height`, client resize to 1600px JPEG 0.82, 10 MB limit with message. [OTA]
- [ ] T17 — **Extract PanelSidebar + Modal, drop inline hex** (P2). `Sidebar.tsx:31`, `SidebarBuffet.tsx:25`, `SidebarLector.tsx:26`, `globals.css:19-26`. Do together with T8/T11. [OTA]
- [ ] T18 — **Subcomisión "Turnos" keeps its own sidebar** (S2 / P2). `Sidebar.tsx:13` → `(porteria)/layout.tsx:52` swaps to `SidebarLector`. Fix: render `Sidebar` for subcomision/admin in the porteria layout. [OTA]

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
