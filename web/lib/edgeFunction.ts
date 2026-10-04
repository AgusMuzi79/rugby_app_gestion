import { supabase } from '@/lib/supabase'

// Respuesta común de las Edge Functions de gestión: fallas de validación llegan como
// 200 { ok:false, motivo }; errores reales como { error } (o texto plano envuelto en { error }).
export type EdgeResponse<T = Record<string, unknown>> = T & {
  ok?: boolean
  motivo?: string
  error?: string
}

// POST autenticado con el JWT de la sesión a `${SUPABASE_URL}/functions/v1/<name>`.
export async function callEdgeFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>,
): Promise<EdgeResponse<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    }
  )
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text } as EdgeResponse<T> }
}
