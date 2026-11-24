import { interpretarRespuesta, type EdgeResponse } from '@/lib/edgeFunctionRespuesta'
import { mensajeRespuesta } from '@/lib/tenis'

// Public client of the `tenis-invitados` Edge Function (deployed --no-verify-jwt).
// No Supabase session and no auth header: every request is POST JSON
// `{ action, ...payload }`. Personal data (DNI, email) and the confirmation
// token only travel in the body, never in a URL.
const TIMEOUT_MS = 20_000

// On a failure `data` keeps the raw body (e.g. `dni` of jugador_sin_nombre).
export type Resultado<T> =
  | { ok: true; data: EdgeResponse<T> }
  | { ok: false; error: string; codigo?: string; data?: Record<string, unknown> }

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
    const r = interpretarRespuesta<T>(res.status, await res.text())
    // Business failures: 200 { ok:false, codigo, motivo }; real errors: { error }.
    if (r.error || r.ok === false) {
      const { codigo, mensaje } = mensajeRespuesta(r as { codigo?: unknown; motivo?: unknown; error?: unknown })
      return { ok: false, error: mensaje, codigo, data: r as unknown as Record<string, unknown> }
    }
    return { ok: true, data: r }
  } catch {
    return {
      ok: false,
      error: ctrl.signal.aborted
        ? 'El servidor tardó demasiado. Probá de nuevo en un momento.'
        : 'No hay conexión. Revisá internet y probá de nuevo.',
    }
  } finally {
    clearTimeout(timer)
  }
}
