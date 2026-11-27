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

- [x] T1 — Migration `20261129000000_noticias_imagenes.sql` (`imagenes text[] not null default '{}'`, backfill from `imagen_path`, max 6 check) + pure logic in `app/lib/noticiaSubcomision.ts` / `web/lib/noticiaSubcomision.ts` (`imagenes`, `imagen_path` = first, `debeNotificarNoticia`) + `.check.ts` RED→GREEN. Route: delegated (writer trigger: 2+ non-trivial files).
  - Evidence: RED `cd app && npm run test:noticias`: exit 1, AssertionError deepStrictEqual on the first case (payload without `imagenes`) before the lib change. GREEN `cd app && npm run test:noticias`: 12 casos ok. `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts` (new web check): 12 casos ok. `cd app && npx tsc --noEmit`: exit 0 (baseline exit 0). `cd web && npx tsc --noEmit`: exit 0 (baseline exit 0). `web` has no `lint` script (`npm run lint`: missing script, also on baseline). Migration not applied anywhere.
  - Note: `imagenes` is not in the generated `app/lib/database.types.ts` (outside this feature's edit surface), so the app hooks cast the insert/select with a comment; drop the casts when the types are regenerated. The app and web must not ship before the migration is applied (inserts now send `imagenes`).
- [x] T2 — App Subcomisión: pick/remove up to 6 images, upload all, insert `imagenes`, invoke push only when `debeNotificarNoticia`, helper text, delete cleanup of all paths, list thumb. Route: delegated.
  - Evidence (previous commit 389b753): `cd app && npm run test:noticias`: 13 casos ok (new `pathsImagenesNoticia` case, written together with the helper, no separate RED). `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts`: 13 casos ok. `cd app && npx tsc --noEmit`: exit 0. `cd web && npx tsc --noEmit`: exit 0. Runtime on a phone: pending (Agus).
  - Picker: `allowsMultipleSelection` + `selectionLimit: remaining` + `orderedSelection`, no cropping (unsupported with multi-select); the list is also capped to 6 in code. Uploads go to `{uid}/{timestamp}-{i}.jpg`; a failed upload or insert removes the files already uploaded.
- [x] T3 — App reader (`(socio)/noticias.tsx`, `useNoticias`): `imagenesUrls`, card shows first image + count badge, detail sheet paging gallery, tap opens full-screen viewer (`app/components/shared/VisorImagenes.tsx`), empty cuerpo not rendered. Route: delegated.
  - Evidence (previous commit bd01a59): `cd app && npx tsc --noEmit`: exit 0. `cd app && npm run test:noticias`: 13 casos ok (`pathsImagenesNoticia` drives the fallback to `imagen_path`). `npx tsx lib/tokens.check.ts`: 4 casos OK; `npx tsx lib/contraste.check.ts`: 39 casos OK. No runnable RED for UI (no component test runner); runtime on a phone pending (Agus): 0/1/N images, tap opens full screen, swipe, close, Android back, iOS pinch zoom.
  - The viewer is rendered inside the detail `Modal` so iOS presents it on top. Pinch zoom is iOS only (RN `ScrollView` zoom); Android shows the image fitted. Secretaría (`useNoticias(false)`) keeps `imagenUrl` (= first image).
- [x] T4 — Web Subcomisión: multi-file input with previews/removal, upload all, insert `imagenes`, conditional push, helper text, delete cleanup, thumbnails open in new tab. Route: delegated.
  - Evidence (previous commit 2903c58): `cd web && npx tsc --noEmit`: exit 0. `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts`: 13 casos ok. `cd web && npm run lint`: no `lint` script and no ESLint config in `web/` (same as baseline). No new Next.js API used (client component, plain `<a>`/`<img>`). Browser check pending (Agus).
  - Each picked file goes through `errorTamano` (over 10 MB is skipped with a message) and `prepararImagen` on upload; extra files beyond 6 are dropped with a message; object URLs are revoked on removal/close.

## Acceptance criteria

- ~~Title-only Subcomisión news → push sent; with description or any image → no push call, item visible in the feed.~~ Replaced by T5: Subcomisión news sends a push iff "Enviar notificación a los socios" is checked (unchecked by default).
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
- 2026-11-27: T1–T4 implemented on `feat/noticias-imagenes` (commits 389b753, bd01a59, 2903c58, T4). Pending: apply migration `20261129000000` (before any OTA or web deploy: app and web now read and write `imagenes`), phone and browser checks.
- 2026-11-27: rebased on main (60de144). The migration was renamed to `20261129000000` because main already had `20261128000000_tenis_paridad_ondepor.sql`.
- 2026-11-27: native review (risk medium, consent granted, lens reliability): **approved**, acknowledged (lineage `review-0d8dfbc27413559a`, authority burned). Advisory findings:
  - R3-web-prepare-throw-orphans (WARNING): **fixed** in a follow-up commit. `prepararImagen` now runs inside try/catch in the web upload loop, so a failure cleans up earlier uploads and unlocks the form.
  - R3-deploy-order-feed (WARNING): the socio/Secretaría feed selects `imagenes`, so the migration must be applied BEFORE any OTA or web deploy.
  - R3-picker-no-edit-format (SUGGESTION): the app picker uploads uncropped originals as `.jpg` without resizing. Check memory and upload time with 6 large photos on a phone; add `expo-image-manipulator` resizing if needed (it would need a native build).
  - R3-orchestration-untested (SUGGESTION): only the pure helpers are covered; the hook/page wiring is checked by hand.
- 2026-11-27: second native review of the whole branch including the web fix (lineage `review-495e3dd7280de360`): **approved**, acknowledged. New advisory R3-001: `imagenes` wins over `imagen_path`, so a flow that updates only `imagen_path` on an existing row would leave `imagenes` stale. Not reachable today: no flow updates `imagen_path` (Buffet and Subcomisión only insert and delete). If an edit-image flow is added, it must write both columns (`camposImagenesNoticia`).
- 2026-11-27: `imagenes` added to `app/lib/database.types.ts`; casts removed from `useNoticiasSubcomision.ts` (`cd app && npx tsc --noEmit`: exit 0; `npm run test:noticias`: 13 casos ok).

## Change request 2026-11-27 (after PR #90 shipped)

User: replace the automatic rule with a checkbox in the Subcomisión create form to choose whether the news item sends a push. Assumption: unchecked by default (avoids accidental pushes to every member). Buffet/Secretaría/Admin unchanged. Branch `feat/noticias-push-opcional`.

- [x] T5 — "Enviar notificación" checkbox in the app and web Subcomisión forms; push iff checked (independent of description/images); `debeNotificarNoticia` replaced by the explicit flag; helper text and checks updated. Route: delegated (writer trigger: 2+ non-trivial files).
  - The title-only push rule from PR #90 (objective 3 and the first acceptance criterion above) is **replaced**: the push now depends only on the checkbox. `debeNotificarNoticia` and its two check cases were removed from `app/lib` and `web/lib` (`rg debeNotificar` over app/web/supabase: no matches). `publicar(titulo, descripcion, imagenesUris, notificar)` in `useNoticiasSubcomision`; the web page keeps a `notificar` state. Both forms start unchecked and reset to unchecked on close/after publishing. Push payload, uploads, cleanup, insert and the push-failure warning are unchanged.
  - App: `Pressable` row with `accessibilityRole="checkbox"` + `accessibilityState`, Feather `check-square`/`square` (same glyphs as `ListadoReservas`), `tc.oro`/`tc.muted`, 44 pt min height. Web: native `<input type="checkbox">` inside a `<label>`, `accent-oro`, helper linked with `aria-describedby`; no new Next.js API.
  - Test-first exception: UI wiring only, no component test runner, and the pure helper was removed, so there is no meaningful RED.
  - Evidence: `cd app && npm run test:noticias`: 11 casos ok. `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts`: 11 casos ok. `cd app && npx tsc --noEmit`: exit 0. `cd web && npx tsc --noEmit`: exit 0. Phone and browser check pending (Agus): unchecked publishes without push, checked sends it (with and without description/images).

## Change request 2026-11-27 (2): featured news

User: add a checkbox to feature a news item so it stays on top for a while. Assumption: fixed 7 days (`DIAS_DESTACADA = 7`), unchecked by default, Subcomisión forms only (app + web). Featured items still in their window go first in the socio/tutor feed (most recent first among them), with a "DESTACADA" badge; afterwards they fall back to date order. No un-feature/edit flow (Subcomisión has no edit today).

- [x] T6 — Migration `20261204000000_noticias_destacada.sql` (`destacada_hasta timestamptz null`); pure helpers `destacadaHasta(ahora)` and `ordenarNoticiasFeed(noticias, ahora)` in the app with RED→GREEN checks; "Destacar noticia" checkbox in app + web Subcomisión forms; feed ordering + badge; staff list marker; types updated. Route: delegated (writer trigger: 2+ non-trivial files).

  - Evidence: RED `cd app && npm run test:noticias`: exit 1, AssertionError deepStrictEqual on the first case (payload without `destacada_hasta`), and `lib/ordenNoticias.check.ts` failed with `Cannot find module './ordenNoticias'` (checks written before the code). GREEN `cd app && npm run test:noticias`: 13 casos ok + 6 casos ok (`test:noticias` now chains `lib/ordenNoticias.check.ts`). `cd web && npx --yes tsx@4.20.6 lib/noticiaSubcomision.check.ts`: 13 casos ok. `cd app && npx tsc --noEmit`: exit 0. `cd web && npx tsc --noEmit`: exit 0. Migration not applied anywhere. Phone and browser check pending (Agus).
  - `buildNoticiaSubcomision` takes `destacar` (and an injectable `ahora`) and returns `destacada_hasta` (ISO = now + `DIAS_DESTACADA` days, or null); mirrored in `web/lib`. `app/lib/ordenNoticias.ts`: `estaDestacada` (strictly after now) and `ordenarNoticiasFeed` (featured first, then created_at desc, stable, non-mutating). Only the member feed (`useNoticias(true)`) is reordered; Secretaría (`useNoticias(false)`) keeps created_at desc. Badge "DESTACADA" in the socio card (`oro` / `sobreOro`) and markers in the app and web Subcomisión lists. No index: the feed reads every published noticia and orders in the client.
  - **Deploy order**: apply `20261204000000_noticias_destacada.sql` BEFORE any OTA or web deploy: the socio feed, the Subcomisión lists and the inserts now select/write `destacada_hasta`, and would fail without the column.
- 2026-11-27: native review of T5+T6 (lineage `review-750721d871fb5913`): approved, acknowledged. R3-001 (WARNING, client clock / unbounded `destacada_hasta`) fixed in the same migration with the `noticias_proteger_destacada_hasta` trigger: for client roles an insert asking to feature becomes `now() + 7 days` only for subcomisión/admin (null otherwise), and updates keep the old value. Checked in a disposable postgres:15 container (stub `get_rol`): subcomisión asking for 2099 got 7 days, buffet got null, a client update was ignored, service_role sets it freely. R3-002 (SUGGESTION): the flag wiring has no automated test; it is checked by hand.
