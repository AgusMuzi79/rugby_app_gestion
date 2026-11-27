# Noticias: varias imágenes, visor a pantalla completa y push sólo para avisos

Locator: `odd/tasks/noticias-imagenes.md` · Engram mirror: `odd/noticias-imagenes/tasks` · Branch: `feat/noticias-imagenes`

## Objective

1. A news item can carry several images (Subcomisión, app and web).
2. Readers (socio / tutor feed in the app) can tap an image and open it full screen, swiping between images.
3. Push rule for Subcomisión news: a title-only item is a quick notice and sends a push; an item with a description or at least one image is published to the feed without a push.

## Problem / why

- `noticias.imagen_path` holds one image; the club wants galleries.
- Images in the feed and the detail sheet are not tappable, so small details are unreadable.
- Subcomisión wants pushes only for short notices; full news should not ping every member.

## Scope and constraints

- User decision (2026-11-27): the push rule applies **only to Subcomisión** (app `(subcomision)/noticias.tsx` and web `(subcomision)/noticias`). Buffet, Secretaría and Admin keep pushing as today.
- Multi-image upload only in the Subcomisión forms (assumption: Buffet promos stay single-image; follow-up if wanted). The reader handles any item with 1..N images.
- Backward compatible: keep `imagen_path` = first image so existing rows and older readers keep working; new column `imagenes text[]`.
- Max 6 images per news item.
- No new native dependency (OTA-safe): full-screen viewer built with RN `Modal` + horizontal paging + `expo-image` `contentFit="contain"`.
- Web has no member feed; staff list thumbnails just open the image in a new tab.

## Tasks

- [x] T1 — Migration `20261128000000_noticias_imagenes.sql` (`imagenes text[] not null default '{}'`, backfill from `imagen_path`, max 6 check) + pure logic in `app/lib/noticiaSubcomision.ts` / `web/lib/noticiaSubcomision.ts` (`imagenes`, `imagen_path` = first, `debeNotificarNoticia`) + `.check.ts` RED→GREEN. Route: delegated (writer trigger: 2+ non-trivial files).
  - Evidence: RED `cd app && npm run test:noticias`: exit 1, AssertionError deepStrictEqual on the first case (payload without `imagenes`) before the lib change. GREEN `cd app && npm run test:noticias`: 12 casos ok. `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts` (new web check): 12 casos ok. `cd app && npx tsc --noEmit`: exit 0 (baseline exit 0). `cd web && npx tsc --noEmit`: exit 0 (baseline exit 0). `web` has no `lint` script (`npm run lint`: missing script, also on baseline). Migration not applied anywhere.
  - Note: `imagenes` is not in the generated `app/lib/database.types.ts` (outside this feature's edit surface), so the app hooks cast the insert/select with a comment; drop the casts when the types are regenerated. The app and web must not ship before the migration is applied (inserts now send `imagenes`).
- [x] T2 — App Subcomisión: pick/remove up to 6 images, upload all, insert `imagenes`, invoke push only when `debeNotificarNoticia`, helper text, delete cleanup of all paths, list thumb. Route: delegated.
  - Evidence (previous commit 389b753): `cd app && npm run test:noticias`: 13 casos ok (new `pathsImagenesNoticia` case, written together with the helper, no separate RED). `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts`: 13 casos ok. `cd app && npx tsc --noEmit`: exit 0. `cd web && npx tsc --noEmit`: exit 0. Runtime on a phone: pending (Agus).
  - Picker: `allowsMultipleSelection` + `selectionLimit: remaining` + `orderedSelection`, no cropping (unsupported with multi-select); the list is also capped to 6 in code. Uploads go to `{uid}/{timestamp}-{i}.jpg`; a failed upload or insert removes the files already uploaded.
- [x] T3 — App reader (`(socio)/noticias.tsx`, `useNoticias`): `imagenesUrls`, card shows first image + count badge, detail sheet paging gallery, tap opens full-screen viewer (`app/components/shared/VisorImagenes.tsx`), empty cuerpo not rendered. Route: delegated.
  - Evidence (previous commit bd01a59): `cd app && npx tsc --noEmit`: exit 0. `cd app && npm run test:noticias`: 13 casos ok (`pathsImagenesNoticia` drives the fallback to `imagen_path`). `npx tsx lib/tokens.check.ts`: 4 casos OK; `npx tsx lib/contraste.check.ts`: 39 casos OK. No runnable RED for UI (no component test runner); runtime on a phone pending (Agus): 0/1/N images, tap opens full screen, swipe, close, Android back, iOS pinch zoom.
  - The viewer is rendered inside the detail `Modal` so iOS presents it on top. Pinch zoom is iOS only (RN `ScrollView` zoom); Android shows the image fitted. Secretaría (`useNoticias(false)`) keeps `imagenUrl` (= first image).
- [ ] T4 — Web Subcomisión: multi-file input with previews/removal, upload all, insert `imagenes`, conditional push, helper text, delete cleanup, thumbnails open in new tab. Route: delegated.

## Acceptance criteria

- Title-only Subcomisión news → push sent; with description or any image → no push call, item visible in the feed.
- Buffet/Secretaría/Admin push unchanged.
- Feed shows items with 0, 1 or N images; tapping an image opens it full screen; swipe moves between images; close returns.
- Old rows with only `imagen_path` still show their image.

## Checks

- `cd app && npm run test:noticias` (RED before T1 logic, GREEN after).
- `cd app && npx tsc --noEmit`; `cd web && npx tsc --noEmit` and `npm run lint` if present.
- Migration reviewed (not applied to prod without Agus's OK).

## Delivery

Strategy: `ask-on-risk`. Forecast ~450 authored lines.

## Progress / evidence

- 2026-11-27: mapping done (explorer), push scope decided by user (Subcomisión only).
