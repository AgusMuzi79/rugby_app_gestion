# Feature: tutor-menores

Branch: `worktree-tutor-menores` (worktree `.claude/worktrees/tutor-menores`)

## Objective

Let an adult who is NOT a club member (mother, father, legal guardian) self-register from the
"acceso restringido" screen shown to members under 13, get linked to the minor, and see ALL of the
minor's member data read-only (carnet QR, cuotas/deuda, servicios, comprobantes, noticias,
calendario, sobre) plus receive the minor's push notifications.

## Problem / why

`socios.cabecera_id` only links a minor to another `socios` row. A non-member parent has no socio
row, so today there is no way for them to see their child's data (real case reported 2026-10-07).

## Decisions (user, 2026-10-07)

- Entry point: link "¿Sos su familiar o tutor?" under the restricted-access screen.
- Form: relationship, email, birth date, minor's DNI (prefilled when known).
- Verification: the email typed must equal the email of the minor's auth account (when the adult is
  not a member, the NUVIX padrón stores the adult's real email on the minor). A 6-digit code is sent
  to that email via Resend. No Secretaría approval (rejected by user: small club).
- On success: the minor's auth email moves to the synthetic `socio-{numero_socio}@uncas.local`
  (minor can't use the app anyway, logs in by DNI), the adult gets a new account with that email,
  role `tutor`, linked to the minor.
- Email mismatch / synthetic email on minor: show "Acercate a Secretaría para actualizar tus datos";
  never reveal the stored email.
- Assumptions (not contradicted by user): read-only access; several tutors per minor and several
  minors per tutor allowed by the schema.

## Known limitations (v1)

- Second tutor or sibling: after the first link, the minor holds a synthetic email, and padrón
  siblings usually have synthetic emails too, so they cannot self-verify → Secretaría. A manual
  link tool for Secretaría is out of scope for v1.
- Titulares who ARE members keep today's behavior (carnet only for under-13 dependents).

## Scope / constraints

- No production deploy, migration push or EAS build without explicit user request.
- Generated artifacts (code, comments) in English; UI copy in Spanish like the rest of the app.
- `get_rol()` is the active role; the new role must be added to both profile CHECK constraints.

## Checks

- No test runner in app/ or web/ → test-first exception. Checks: `npx tsc --noEmit` (app/, web/ when
  touched), `deno check` on touched Edge Functions when deno is available, SQL readback.

## Tasks

- [x] T1 — DB migration `supabase/migrations/20261010000000_tutor_menores.sql` (20261009000000 was
  already taken by `importaciones_servicios`): role `tutor` in CHECK constraints; `tutores_menores` link table;
  `tutor_verificaciones` (hashed code, expiry, attempts; no client access); SECURITY DEFINER
  `tutor_menores_ids()`; SELECT policies for tutors on socios, profiles, cuotas, pagos_socios,
  socio_servicios, comprobantes_deuda, comprobantes storage; noticias/eventos/resultados accept
  `tutor`. Route: delegated (preparation + multi-policy write).
- [x] T2 — Edge Function `registro-tutor` (`solicitar`, `verificar`) using `_shared/email.ts`.
  Route: delegated.
- [x] T3 — Edge Functions: `socios-qr` tutor branch; pushes to tutors in `notifications`
  (noticias + división), `importar-deuda`, `recordatorio-debito`. Route: delegated.
- [x] T4 — Mobile: role `tutor` constants + routing; `registro-tutor` screen + link from
  `acceso-restringido`; `(tutor)` group reusing socio screens with a selected-minor store; hooks
  accept an explicit `socioId`. Route: delegated.
- [x] T5 — Docs: `.claude/context` (estado-expo, estado-supabase, historial). Route: inline.

## Progress / evidence

- 2026-10-07: exploration done (email storage, socio data surfaces, RLS, push recipients).
  Feature doc created.
- 2026-10-07: T1 done (route: delegated) — migration written; SQL readback, idempotent
  DROP/CREATE, 12 new policy names unique across migrations. Not applied (no db push).
  jugadores intentionally without tutor policy (socios have none either). Commit: dab3f77.
- 2026-10-07: T2 done (route: delegated) — `registro-tutor` (solicitar/verificar) + shared
  `_shared/tutores.ts`. Imports resolve; deno unavailable so no `deno check`. Deploy with
  `--no-verify-jwt` (not deployed). Commit: 2abaa35.
- 2026-10-07: T3 done (route: delegated) — socios-qr `get-secret` tutor branch (link-checked,
  no age gate); tutors added (deduped) to noticias 'todos' + división pushes (notifications),
  minors' debt reminders (importar-deuda) and débito reminder (recordatorio-debito). Not
  deployed. Commit: see `feat(tutores): carnet y notificaciones del menor llegan al tutor`.

- 2026-10-07: T3 commit 27f491f. Native review (medium, lens reliability, user granted) over
  5da1741..27f491f found R3-attempt-counter-race (CRITICAL: wrong-code attempt cap raceable by
  parallel guesses). Bounded correction abe7421: SQL RPC `tutor_verificacion_consumir_intento`
  consumes the attempt atomically before comparing. Targeted validation approved; acknowledged
  (lineage review-9fed867530d0fe7b, authority burned). Reviewed boundary: abe7421.

- 2026-10-07: T4 done (route: delegated — 2+ non-trivial files). Commits 73735ec (role `tutor`,
  `(tutor)` group re-exporting socio carnet/cuotas/noticias/calendario + own read-only "sobre",
  `useTutorStore` + `useSocioObjetivo`, `useCuotas`/`useDeudaDetalle`/`useCalendarioSocio` accept an
  optional `socioId`; `useCarnet` already did) and 4d2470b (`registro-tutor` screen + link from
  `acceso-restringido`; root guard skips the login redirect while `registroSinSesion` is set).
  `npx tsc --noEmit` (app/): baseline 2 errors (`app/(secretaria)/socios.tsx` 112/113, pre-existing),
  final 2 — same errors, none new. Socio regression readback: with `socioId` undefined every hook
  queries `profile_id = auth.uid()` exactly as before; the selector renders null for non-tutors.
  Decisions: birth date as DD/MM/AAAA text input (DatePickerField is light-styled and a calendar
  picker is slow for adult dates); "Ver cómo pagar" (alias + WhatsApp, no DB write) stays visible to
  tutors; no "turnos" tab; sign-out also clears the minors' cached TOTP secrets.
  Known gaps: no `jugadores` RLS for tutors (as for socios) so "mi equipo" never highlights; noticia
  author names depend on profiles RLS. Not built/run on a device (no EAS, no deploy).

## Next step

All tasks done and shipped (2026-10-07, each step requested by the user): PR #2 merged (4e84f2d),
migration applied, 5 Edge Functions deployed, app 1.0.8 built (Android vc 16, iOS build 22) and
submitted to review in both stores. Remaining: release iOS manually after approval and test the full
flow on a device with a real minor.

## Review evidence

- Mobile slice abe7421..98117c9: native review (medium, lens reliability, user granted), approved
  with no findings; acknowledged (lineage review-fcff79840a8d03f1, authority burned).
- T5 done (route: inline): estado-expo, estado-supabase and historial updated. Passive docs:
  structural readback only.
