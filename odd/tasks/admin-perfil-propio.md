# Feature: admin-perfil-propio

## Objective
Give the `admin` role its own mobile experience instead of sharing the subcomisión one.

## Problem
Admin is routed to `/(subcomision)/diario` and sees the same tabs as subcomisión (Diario, Usuarios, Crónica, Sobre, plus Informes/Eventos via Diario). The owner does not want player/attendance/fichajes data; wants user management and a way to communicate with staff.

## Scope (mobile only, `app/`)
- New route group `app/app/(admin)/` with tabs: Usuarios, Comunicados, Sistema, Sobre.
- Admin routing (`app/app/_layout.tsx` ROL_RUTAS, `app/constants/roles.ts`) points to `(admin)`.
- Usuarios: reuse existing subcomisión usuarios screen/logic (no duplication).
- Comunicados: publish a noticia with audience cuerpo técnico (reusing existing noticias publish logic) and send push via existing `notifications` Edge Function if already supported.
- Sistema: read-only status: latest imports (`importaciones_socios`, `importaciones_deuda`, `importaciones_servicios`), recent `recordatorios_deuda_envios`, count of `push_tokens`.
- Out of scope: web panel, access shortcuts to Secretaría/Buffet/Gimnasio (second iteration), DB migrations unless RLS blocks admin reads.

## Constraints
- UI copy in Spanish (existing project language), neutral register.
- Subcomisión experience unchanged.

## Tasks
- [x] T1 — Admin route group + routing + Usuarios/Sobre tabs (route: delegated writer, trigger: 2+ non-trivial files) — `0bc71d5`
- [x] T2 — Comunicados tab (delegated writer) — `708ff35`
- [x] T3 — Sistema tab (delegated writer) — `efcdbcc`

## Checks
- `npx tsc --noEmit` in `app/`
- Existing tests (`npm test` in `app/` if present)
- No runnable RED for navigation/UI screens: structural + typecheck checks.

## Progress
- 2026-10-09: feature doc created; exploration done (admin == subco today).
- 2026-10-09 T1 (`0bc71d5`): `app/app/(admin)/` group (tabs Usuarios, Comunicados, Sistema, Sobre). Admin routes to `/(admin)/usuarios` in `app/_layout.tsx` ROL_RUTAS and `constants/roles.ts` ROL_RUTA_INICIAL. Usuarios screen moved to `components/shared/UsuariosScreen.tsx`, re-exported by `(subcomision)/usuarios.tsx` and `(admin)/usuarios.tsx`; header label now shows the logged-in role (subcomisión still reads "SUBCOMISIÓN"). Sobre reuses `SobreScreen`. No layout-level role guards exist in the app; routing is only by ROL_RUTAS / ROL_RUTA_INICIAL, and notification taps do not route.
- 2026-10-09 T2 (`708ff35`): `(admin)/comunicados.tsx` + `hooks/useComunicadosAdmin.ts`. Publishes immediately with audience `cuerpo_tecnico` or `todos` (labelled "Socios"), then invokes `notifications` (`noticia_publicada`). RLS: `noticias_insert_staff`, `noticias_select_staff`, `noticias_delete_staff` include admin; the Edge Function lets admin send any type.
- 2026-10-09 T3 (`efcdbcc`): `(admin)/sistema.tsx` + `hooks/useSistemaAdmin.ts`. Last 5 imports per table, last 10 debt-reminder runs, push token count. RLS allows admin SELECT on all five tables; a failed read is rendered as "No disponible".

## Verification evidence
- `npx tsc --noEmit` (app/): only 2 pre-existing errors in `app/(secretaria)/socios.tsx` (lines 112-113), identical on base; no new errors.
- No `test` script in `app/package.json`; no runnable RED for navigation/UI screens (structural + typecheck only).
- Not verified on a device: navigation, publishing and push delivery need a manual run with an admin account.

## Next step
Manual check on a device/emulator with an admin account; then decide on the second iteration (shortcuts to Secretaría/Buffet/Gimnasio).
