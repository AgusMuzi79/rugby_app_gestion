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
- [ ] T2 — Edge Function `registro-tutor` (`solicitar`, `verificar`) using `_shared/email.ts`.
  Route: delegated.
- [ ] T3 — Edge Functions: `socios-qr` tutor branch; pushes to tutors in `notifications`
  (noticias + división), `importar-deuda`, `recordatorio-debito`. Route: delegated.
- [ ] T4 — Mobile: role `tutor` constants + routing; `registro-tutor` screen + link from
  `acceso-restringido`; `(tutor)` group reusing socio screens with a selected-minor store; hooks
  accept an explicit `socioId`. Route: delegated.
- [ ] T5 — Docs: `.claude/context` (estado-expo, estado-supabase, historial). Route: inline.

## Progress / evidence

- 2026-10-07: exploration done (email storage, socio data surfaces, RLS, push recipients).
  Feature doc created.
- 2026-10-07: T1 done (route: delegated) — migration written; SQL readback, idempotent
  DROP/CREATE, 12 new policy names unique across migrations. Not applied (no db push).
  jugadores intentionally without tutor policy (socios have none either). Commit: see git log
  `feat(tutores): esquema y permisos para tutores de menores`.

## Next step

T1.
