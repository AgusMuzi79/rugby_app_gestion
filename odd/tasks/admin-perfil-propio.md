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
- [x] T4 — Review fixes in Comunicados/Sistema: visible load error, confirmed delete, unknown audience, publicando reset, tsx checks (delegated writer) — `38a81c9`
- [x] T5 — Second review advisories: header label fallback, try/finally in fetches, guarded delete, tsx pinned to 4.20.6 (inline, mechanical)

## Checks
- `npx tsc --noEmit` in `app/`
- `npm run test:admin` in `app/` (tsx checks for `lib/comunicadosAdmin.ts` and `lib/sistemaAdmin.ts`)
- No runnable RED for navigation/UI screens: structural + typecheck checks.

## Progress
- 2026-10-09: feature doc created; exploration done (admin == subco today).
- 2026-10-09 T1 (`0bc71d5`): `app/app/(admin)/` group (tabs Usuarios, Comunicados, Sistema, Sobre). Admin routes to `/(admin)/usuarios` in `app/_layout.tsx` ROL_RUTAS and `constants/roles.ts` ROL_RUTA_INICIAL. Usuarios screen moved to `components/shared/UsuariosScreen.tsx`, re-exported by `(subcomision)/usuarios.tsx` and `(admin)/usuarios.tsx`; header label now shows the logged-in role (subcomisión still reads "SUBCOMISIÓN"). Sobre reuses `SobreScreen`. No layout-level role guards exist in the app; routing is only by ROL_RUTAS / ROL_RUTA_INICIAL, and notification taps do not route.
- 2026-10-09 T2 (`708ff35`): `(admin)/comunicados.tsx` + `hooks/useComunicadosAdmin.ts`. Publishes immediately with audience `cuerpo_tecnico` or `todos` (labelled "Socios"), then invokes `notifications` (`noticia_publicada`). RLS: `noticias_insert_staff`, `noticias_select_staff`, `noticias_delete_staff` include admin; the Edge Function lets admin send any type.
- 2026-10-09 T3 (`efcdbcc`): `(admin)/sistema.tsx` + `hooks/useSistemaAdmin.ts`. Last 5 imports per table, last 10 debt-reminder runs, push token count. RLS allows admin SELECT on all five tables; a failed read is rendered as "No disponible".
- 2026-10-09 T4 (`38a81c9`): review fixes. Comunicados load error now shows "No se pudieron cargar los comunicados." + REINTENTAR (list cleared) instead of the empty state. Delete uses `.select('id')`; zero rows (RLS or already removed) alerts and refetches, only a returned row removes it locally. Unknown `audiencia` values render as "SIN DEFINIR" (`AudienciaMostrada`), no longer coerced to `todos`. `publicar` uses try/finally so `publicando` always resets; a throw alerts and returns false. Pure logic in `app/lib/comunicadosAdmin.ts` / `app/lib/sistemaAdmin.ts` (no RN/supabase imports), used by both hooks.

- 2026-10-09 T5: UsuariosScreen header uses ROL_LABELS[rol]?.toUpperCase() ?? ''; fetchComunicados/fetchSistema use try/finally (thrown errors show error state / "No disponible"); eliminar catches thrown errors; test:admin pins tsx@4.20.6 (not added as devDependency because the worktree node_modules is a junction to the main checkout).

## Verification evidence
- T5: npm run test:admin -> 7 + 6 casos ok; npx tsc --noEmit -> only the 2 pre-existing socios.tsx errors.
- `npx tsc --noEmit` (app/): only 2 pre-existing errors in `app/(secretaria)/socios.tsx` (lines 112-113), identical on base; no new errors.
- No `test` script in `app/package.json` before T4; no runnable RED for navigation/UI screens (structural + typecheck only).
- T4 RED: `npx --yes tsx lib/comunicadosAdmin.check.ts` → `Error: Cannot find module './comunicadosAdmin'`, exit 1 (same for sistemaAdmin) before the lib files existed.
- T4 GREEN: `npm run test:admin` → 7 + 6 casos ok, exit 0. `npx tsc --noEmit` → only the 2 pre-existing `socios.tsx:112-113` errors.
- Not verified on a device: navigation, publishing and push delivery need a manual run with an admin account.

## Next step
Manual check on a device/emulator with an admin account; then decide on the second iteration (shortcuts to Secretaría/Buffet/Gimnasio).
