import { supabase } from '@/lib/supabase'
import { interpretarRespuesta, mensajeFalloRed, type EdgeResponse } from '@/lib/edgeFunctionRespuesta'

export type { EdgeResponse } from '@/lib/edgeFunctionRespuesta'

// Único cliente de Edge Functions del panel. Antes había una copia por
// pantalla: un HTML del gateway rompía el `res.json()` y la pantalla quedaba en
// "IMPORTANDO…" para siempre. Acá nunca tira: siempre devuelve `{ error }`
// legible, con un límite de tiempo.
const TIMEOUT_MS = 30_000
// Los importadores procesan archivos grandes.
export const TIMEOUT_IMPORT_MS = 120_000

// POST autenticado con el JWT de la sesión a `${SUPABASE_URL}/functions/v1/<name>`.
// `body` como objeto (JSON) o FormData (archivos).
export async function callEdgeFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown> | FormData,
  opciones: { timeoutMs?: number } = {},
): Promise<EdgeResponse<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opciones.timeoutMs ?? TIMEOUT_MS)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const esForm = body instanceof FormData
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
      {
        method: 'POST',
        headers: {
          ...(esForm ? {} : { 'Content-Type': 'application/json' }),
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: esForm ? body : JSON.stringify(body),
        signal: ctrl.signal,
      }
    )
    return interpretarRespuesta<T>(res.status, await res.text())
  } catch {
    return { error: mensajeFalloRed(ctrl.signal.aborted), status: 0 } as EdgeResponse<T>
  } finally {
    clearTimeout(timer)
  }
}
