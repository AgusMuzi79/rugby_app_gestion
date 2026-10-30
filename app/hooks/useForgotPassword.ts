import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mensajeRecupero, statusErrorFunction } from '@/lib/errorFunction'

export function useForgotPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  // `dniOMail`: lo mismo que se tipea en el login. login-dni resuelve el DNI
  // al mail de la cuenta y manda el link; nunca dice si la cuenta existe ni
  // si su mail es sintético (siempre { ok: true }).
  async function enviarLink(dniOMail: string): Promise<void> {
    setError(null)
    if (!dniOMail.trim()) {
      setError(mensajeRecupero({ status: 400 }))
      return
    }
    setLoading(true)

    try {
      const timeout = new Promise<{ data: null; error: { name: string } }>(resolve =>
        setTimeout(() => resolve({ data: null, error: { name: 'FunctionsFetchError' } }), 15000)
      )
      const { data, error: resetError } = await Promise.race([
        supabase.functions.invoke('login-dni', {
          body: { action: 'reset', dni: dniOMail },
        }),
        timeout,
      ])

      if (resetError) {
        const sinRed = (resetError as { name?: string }).name === 'FunctionsFetchError'
        setError(mensajeRecupero({ sinRed, status: statusErrorFunction(resetError) }))
        return
      }
      if (!data?.ok) {
        setError(mensajeRecupero({ status: 500 }))
        return
      }

      setEnviado(true)
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return { enviarLink, loading, error, enviado }
}
