# Web password reset page

Locator: `odd/tasks/web-reset-password.md` · Engram mirror: `odd/web-reset-password/tasks` · Branch: `feat/web-reset-password`

## Objective

Let a user set a new password from the recovery email no matter where they open it (PC or phone), through a public page at `https://uncasapp.com/reset-password`.

## Problem

The recovery email links to the app deep link `uncasrugby://reset-password` (`REDIRECT_RECUPERO` in `supabase/functions/_shared/recupero-password.ts`, and hardcoded again in `app/hooks/useSobre.ts`). Opened on a PC, Supabase consumes the one-time token, the browser cannot open the deep link, and there is no screen to set the password. The user is stuck.

Real case, 2026-11-19: socio 15620 asked for recovery at 14:05:01 UTC and opened the link 16 s later from Chrome on Windows. Her password was never changed. Unblocked by setting her password to her DNI by SQL (verified with a real `login-dni` call).

## Scope (authorized 2026-11-19: "armá la página web de reset")

- New public page `web/app/reset-password/page.tsx` (top level, outside panel route groups, so it is not gated).
  - Dedicated in-memory Supabase client (`persistSession: false`, `detectSessionInUrl: false`) so it never touches the panel session in localStorage.
  - Reads the implicit-flow fragment (`#access_token`, `refresh_token`, `type=recovery`) or the error fragment (`error_code`, e.g. `otp_expired`). Without a recovery fragment it shows "link vencido o inválido" and never shows the form (a logged-in staff member visiting the URL must not get a password form).
  - Same rules as the app: at least 8 characters, confirmation must match. Same copy style (voseo).
  - On success: `updateUser({ password })`, sign out, clear the fragment from the URL, show "Contraseña actualizada. Ya podés ingresar en la app con tu nueva contraseña."
- Pure helpers in `web/lib/resetPassword.ts` + `web/lib/resetPassword.check.ts`.
- Redirect becomes `https://uncasapp.com/reset-password` in `REDIRECT_RECUPERO` (and its check) and in `app/hooks/useSobre.ts`.
- Docs: `.claude/context/estado-web.md`, `.claude/context/stack.md`, `.claude/context/estado-expo.md` (stale `useForgotPassword` note).

Out of scope: PKCE `?code=` links (a server-sent mail has no verifier), deep-link handoff from the page to the app, server-side password policy.

## Rollout order (manual, Agus)

1. Supabase Dashboard → Auth → URL Configuration: add `https://uncasapp.com/reset-password` to Redirect URLs (keep `uncasrugby://reset-password` for old builds). If it is missing, Supabase falls back to the Site URL.
2. Merge → Vercel deploys the page.
3. `supabase functions deploy login-dni --no-verify-jwt`.
4. OTA for `useSobre.ts` (optional: old builds keep the deep link and still work on phones).

## Tasks

- [x] T1 — Web page + helpers + checks, redirect change, docs. Route: delegated direct (writer trigger: 2+ non-trivial files).

## Checks

- `npx --yes tsx web/lib/resetPassword.check.ts`
- `npx --yes tsx supabase/functions/_shared/recupero-password.check.ts`
- `npx tsc --noEmit` in `web/`
- `npx next build --webpack` in `web/` if dependencies are installed

## Progress

- 2026-11-19: document created.
- 2026-11-19 (T1, writer): added `web/lib/resetPassword.ts` (`parsearFragmentoRecupero`, `validarNuevaPassword`, `AVISO_LINK_VENCIDO`, `MIN_PASSWORD`) + `web/lib/resetPassword.check.ts` (16 cases, `npm run test:reset-password`), page `web/app/reset-password/page.tsx` (in-memory client, fragment read once into a ref and stripped with `history.replaceState`, states cargando / invalido / formulario / listo, `updateUser` then `signOut({ scope: 'local' })`, error mapping for `same_password`, `weak_password`, missing session). `REDIRECT_RECUPERO` and `useSobre.ts` now point to `https://uncasapp.com/reset-password`; check case renamed. Docs updated (estado-web, stack, estado-expo, incl. the stale `useForgotPassword` note).
  - RED: `resetPassword.check.ts` failed with `Cannot find module './resetPassword'`; `recupero-password.check.ts` failed on the new redirect assert (actual `uncasrugby://reset-password`).
  - GREEN: `resetPassword.check.ts` 16 casos ok; `recupero-password.check.ts` 15 casos ok; `npx tsc --noEmit` (web) exit 0; `npx next build --webpack` (dummy public env) exit 0, `/reset-password` prerendered static.
  - Not checked: real browser run against Supabase (needs the Redirect URL allow-list entry and a real recovery mail).
