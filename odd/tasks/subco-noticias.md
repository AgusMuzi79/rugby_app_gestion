# Feature: subco-noticias

## Objective
Let Subcomisión create real news (`noticias`) for members, with title, optional description and optional image, and send a push with the title to members on publish. Available in the mobile app and the web panel.

## Problem
On 2026-10-09 the hockey Subcomisión used Crónica → "+ NUEVA NOTIFICACIÓN" ("ENVIAR A TODOS"). That path (`useCronica.enviarNotificacion`) only inserts into `notificaciones` and invokes the `manual` push, which targets coordinador/entrenador/manager only. No noticia is created, members never see it, and the Crónica row is not pressable (route null, text cut at 80 chars). The hidden `(subcomision)/notificaciones.tsx` screen uses `void supabase.from('noticias').insert(...)`, which never executes. `notifications` Edge Function only allows `noticia_publicada` for secretaria/buffet.

## Why
Subcomisión (rugby, hockey, tenis) needs to communicate with members. "Notification only" = a noticia with just a title.

## Scope
- Mobile: new Subcomisión "Noticias" tab: list own-club noticias + create form (title, optional description, optional image), delete. Mirrors Buffet promos (`usePromosBuffet`).
- Web: new `(subcomision)/noticias` page, mirrors `web/app/(buffet)/buffet/promos/page.tsx`, plus nav entry.
- Edge Function `notifications`: allow `subcomision` for `noticia_publicada`.
- Crónica: replace the misleading "+ NUEVA NOTIFICACIÓN" with a shortcut to the new Noticias flow; INFO rows openable to see the full text.
- Remove the dead broken path (`useCronica.enviarNotificacion`, orphan `notificaciones.tsx` + `useNotificaciones.ts`).

## Constraints
- No migration: RLS already allows subcomision insert/delete on `noticias` and `noticias-imagenes` storage. `cuerpo` is NOT NULL → title-only stores `cuerpo = ''`.
- `etiquetas` = `[profiles.deporte]` when the subco has a sport (so it shows under that sport filter for members), else `[]`. `audiencia = 'todos'`, `publicada = true`.
- Edge Function change must be deployed to production — ask Agus before deploying. Mobile change ships via OTA/build only when Agus asks.

## Tasks
- [x] T1 — Pure helper `buildNoticiaSubcomision` (+ `.check.ts`) and Edge Function role change. Route: delegated (writer trigger, 2+ files).
- [x] T2 — Mobile Noticias tab + hook + Crónica fixes + remove dead path. Route: delegated.
- [x] T3 — Web `(subcomision)/noticias` page + nav. Route: delegated.
- [x] T4 — Deploy `notifications` Edge Function (needs Agus's OK). Deployed 2026-10-09 15:48 UTC as v21 after Agus's OK; deployed v20 was diffed first (only difference was this change); v21 verified to contain `subcomision`.

## Acceptance criteria
- Subco creates a noticia (title only, title+description, with/without image) on app and web; it appears in the member Noticias feed and opens in the detail modal.
- Members receive a push with the title.
- Crónica no longer offers a staff-only "send to everyone" action; INFO rows open.

## Checks
- `npx tsc --noEmit` in `app/` and `web/`; `next lint`/build in web if available; helper `.check.ts` via tsx.

## Progress / evidence
- Delivery strategy: single-pr. Forecast ~600 authored lines, but mostly new screens that copy the buffet pattern; one cohesive feature, work-unit commits per task.

- T1 (delegated writer) — commit 949d8d6. RED observed (module not found) before implementing; GREEN `npx tsx lib/noticiaSubcomision.check.ts` → 8 casos ok. Script `test:noticias` added. Edge Function: `noticia_publicada` now allows `subcomision` (admin already always allowed by the `callerRol !== 'admin'` guard).
- T2 (delegated writer) — commit bed7f40. New tab `(subcomision)/noticias` + `useNoticiasSubcomision`; Crónica button now "+ NUEVA NOTICIA" → Noticias tab; INFO rows open a sheet with the full message (`FeedItem.mensaje`); removed `enviarNotificacion`, `notificaciones.tsx`, `useNotificaciones.ts`. `useDiarioSubcomision` left as is. `npx tsc --noEmit` (app) clean.
- T3 (delegated writer) — commit 7f66262. `web/app/(subcomision)/noticias/page.tsx` + `web/lib/noticiaSubcomision.ts` (copy of the app helper; web does not import from app/) + Sidebar entry. `npx tsc --noEmit` (web) clean. ESLint skipped: no eslint config in web/.
- Push failure after a successful insert shows a warning but keeps the noticia; image upload failure blocks publishing; a failed insert removes the uploaded image.

- Native review (RDD on): assessed medium, `slice_budget_reached`; consent granted by Agus; lens review-reliability → approved, acknowledged (lineage review-7f46ff74ae9bb753, authority burned). Reviewed boundary advances to 7f66262 (+ doc commit).
- Non-blocking follow-ups from review: Crónica "+ NUEVA NOTICIA" navigates to `/(subcomision)/noticias` even for admin (check admin group); deporte fetch race — publishing before `profiles.deporte` loads saves empty etiquetas (mobile + web); list/delete is unscoped (subco sees and can delete every noticia, incl. secretaría/buffet); web helper copy and publish failure paths are untested; web image extension/objectURL handling.

## Next step
T4: deploy the `notifications` Edge Function after Agus OKs it (until then, subcomisión publishes succeed but the push returns 403 and the UI shows the "no se pudo enviar la notificación" warning). Mobile ships via OTA/build when Agus asks.
