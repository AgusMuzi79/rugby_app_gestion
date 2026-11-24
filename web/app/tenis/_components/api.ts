import { mensajeFalloInvitados, resultadoInvitados, type ResultadoInvitados } from '@/lib/tenis'

// Public client of the `tenis-invitados` Edge Function (deployed --no-verify-jwt).
// No Supabase session and no auth header: every request is POST JSON
// `{ action, ...payload }`. Personal data (DNI, email) and the confirmation
// token only travel in the body, never in a URL. The response mapping is pure
// (`resultadoInvitados` in lib/tenis.ts, checked in tenis.check.ts).
const TIMEOUT_MS = 20_000

export type Resultado<T> = ResultadoInvitados<T>

export async function tenisInvitados<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Resultado<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tenis-invitados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      signal: ctrl.signal,
    })
    return resultadoInvitados<T>(res.status, await res.text())
  } catch {
    return { ok: false, error: mensajeFalloInvitados(ctrl.signal.aborted) }
  } finally {
    clearTimeout(timer)
  }
}
