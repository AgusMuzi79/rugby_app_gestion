# Feature: club-beneficios

## Objective
Benefits club for members: partner shops/places with discounts or promotions that members can browse in the app and redeem by showing their carnet.

## Problem
The club was asked to offer a benefits club. Today there is nowhere in the app to list partner shops and their promotions.

## Why
Adds value to the membership and pushes members to keep their fee up to date (benefits are for members "al día"; the shop checks the carnet traffic light).

## Scope (approved UX, 2026-11-04)
- Entry point from the member Carnet screen: a banner "Tus beneficios — N locales adheridos" below the QR (no 6th tab; the member is already on Carnet when paying in the shop).
- List screen: search box, category (rubro) chips, featured carousel, cards with logo, name, discount label, rubro, short condition and area.
- Detail screen: photo, big discount label, conditions (days, payment methods, valid until), address that opens Maps, WhatsApp / Instagram links, "MOSTRAR MI CARNET" button that goes back to the carnet.
- Expired benefits (`vigente_hasta` in the past) or inactive ones are hidden automatically.
- If the member is not "al día", the detail shows a notice that benefits require the fee to be up to date (no hard block in the app; the shop validates with the carnet).

## Out of scope (decided 2026-11-04)
- Loading UI: Secretaría will NOT load benefits. Who loads them and how is decided later. Until then only `admin` can write (RLS), via Supabase dashboard / SQL.
- Push on new benefit (depends on the loading flow).
- Map of nearby shops and usage metrics (phase 2).

## Constraints
- Migration must be applied to production only with Agus's OK. Mobile ships via OTA only when Agus asks.
- Read access: authenticated users whose role sees the member carnet (socio, tutor). Write: admin only.
- Images in a public-read Storage bucket `beneficios`, admin-only write.
- Use semantic tokens from `app/constants/theme.ts`; UI copy in Spanish like the rest of the app.

## Tasks
- [x] T1 — Migration `beneficios` table + RLS + storage bucket, and pure helper `app/lib/beneficios.ts` (vigencia filter, rubro/search filtering, Maps/WhatsApp/Instagram URL builders) with `.check.ts`. Route: delegated (writer trigger, 2+ non-trivial files).
- [x] T2 — Mobile: `useBeneficios` hook, list + detail screens, Carnet banner, "MOSTRAR MI CARNET". Route: delegated (writer trigger).

## Acceptance criteria
- A member with active benefits loaded sees the banner on Carnet with the count, opens the list, filters by rubro and search, opens a detail, opens Maps/WhatsApp/Instagram and goes back to the carnet.
- Expired/inactive benefits never appear. With zero benefits the banner is hidden.
- Non-admin users cannot insert/update/delete `beneficios` or upload to the bucket.

## Checks
- `npx tsc --noEmit` in `app/`; helper `.check.ts` via `npx tsx`; migration reviewed (not applied).

## Progress / evidence
- Delivery strategy: single-pr (forecast ~600 authored lines, one cohesive feature, work-unit commits per task).

- T1 (delegated writer) — migration `20261110000000_club_beneficios.sql` (NOT applied): table `beneficios`, rubro check `gastronomia, deportes, salud, belleza, indumentaria, educacion, servicios, otros` (mirrors `RUBROS` in the helper — change together), vigencia check, `set_updated_at()` trigger, RLS with `(select get_rol())`: socio/tutor read active + in-vigencia (Argentina date), admin reads all and is the only writer; bucket `beneficios` public read, 5 MB, jpeg/png/webp, admin-only write. Helper `app/lib/beneficios.ts`. RED observed (`Cannot find module './beneficios'`), GREEN `npm run -s test:beneficios` → 26 casos ok (re-run by parent); `npx tsc --noEmit` clean. Assumption: `urlWhatsapp` treats every number as Argentine.

- T1 native review (RDD on): medium, `slice_budget_reached`; consent granted by Agus; lens review-reliability → approved, acknowledged (lineage review-91fd9a07406f3a6d, authority burned). Non-blocking: RLS unproved until the migration is applied (verify as socio/non-admin after applying); Instagram non-profile URLs and test aggregation (fixed in T2); 4-digit area code case (added in T2).
- T2 (delegated writer + parent inline for tutor routes) — `useBeneficios` / `useSocioAlDia` / `useGrupoBeneficios` hooks; hidden tabs `beneficios` and `beneficio/[id]` in `(socio)` and re-exported in `(tutor)` (root guard bounces cross-group navigation); Carnet banner (socio + tutor, not cliente gimnasio, hidden at 0/error); detail shows "Para usar los beneficios tenés que tener la cuota al día." when `estado != 'activo'` or `semaforo = 'rojo'` (same rule as carnet `estadoVisual` — change together). Back buttons navigate explicitly (Tabs `backBehavior: firstRoute`). New `urlSitioWeb` helper; Instagram host anchored + non-profile paths → null; beneficios check in `test:admin`. RED observed for new cases, GREEN `test:beneficios` → 31 casos ok; `test:admin` exit 0; `npx tsc --noEmit` clean (all re-run by parent). Not tested on a device.

- T2 native review: medium, `slice_budget_reached`; consent granted by Agus; review-reliability → approved, acknowledged (lineage review-87850230c93b363d, authority burned). Follow-up applied inline after the review: `useSocioAlDia` clears the status on each fetch and ignores out-of-order responses (tutor switching minors); `useBeneficios` uses try/catch/finally and drops stale responses. `npx tsc --noEmit` clean, `test:beneficios` 31 ok. Pending (non-blocking): the "al día" rule and `urlImagen` live in hooks, not covered by checks.

- Full-branch native review (stop-hook candidate vs main): consent granted by Agus; review-reliability → approved, acknowledged (lineage review-6662a7c965a0d9a9). Follow-up applied: only the latest benefits request calls `terminar()` (an older one could end the first load early and flash "ya no está disponible"); `useSocioAlDia` clears the status only when the member/session changes (no flicker on focus) and catches thrown errors. Still pending: RLS proof (after applying the migration) and checks for the "al día" rule / `urlImagen`.

- Deploy (2026-11-05, Agus: "mandale con todo"): PR #58 opened; backup `~/backups-uncas/2026-11-05-02-43-56`; `supabase db push --dry-run` listed only `20261110000000_club_beneficios.sql`; `supabase db push` applied it. RLS proof in a rolled-back transaction as a real active socio (`get_rol()` = socio): with 3 test rows (active, inactive, expired) only the active one is visible; insert denied; update and delete affect 0 rows; upload to the `beneficios` bucket denied. Table left with 0 rows.

## Next step
Merge PR #58, then OTA from `main` (`eas update --branch production`, main checkout with `app/.env.local`). The banner stays hidden until a benefit exists, so the OTA is safe before loading data. Load the first benefits as admin (Supabase dashboard) once the club sends them, test on a phone, and decide who loads benefits (loader UI is out of scope).
