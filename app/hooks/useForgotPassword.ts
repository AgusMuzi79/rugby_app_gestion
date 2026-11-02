import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cuerpoErrorFunction, fallaRecupero, mensajeRecupero } from '@/lib/errorFunction'
import { faltaPedidoRecupero } from '@/lib/validacionAuth'

// Espera máxima del pedido. Pasada, se corta de verdad (AbortController): antes
// sólo se dejaba de esperar, el pedido seguía y se mostraba "sin conexión"
// aunque el mail pudiera llegar, y el reintento mandaba otro link.
const ESPERA_MAXIMA_MS = 15_000

export function useForgotPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  // `dniOMail`: lo mismo que se tipea en el login. login-dni resuelve el DNI
  // al mail de la cuenta y manda el link; nunca dice si la cuenta existe ni
  // si su mail es sintético (siempre { ok: true }).
  async function enviarLink(dniOMail: string): Promise<void> {
    setError(null)
    const falta = faltaPedidoRecupero(dniOMail)
    if (falta) {
      setError(mensajeRecupero({ motivo: falta }))
      return
    }
    setLoading(true)

    const controller = new AbortController()
    let tardo = false
    const timer = setTimeout(() => { tardo = true; controller.abort() }, ESPERA_MAXIMA_MS)

    try {
      const { data, error: resetError } = await supabase.functions.invoke('login-dni', {
        body: { action: 'reset', dni: dniOMail },
        signal: controller.signal,
      })
      const cuerpo = resetError && !tardo ? await cuerpoErrorFunction(resetError) : null
      const falla = fallaRecupero({ tardo, error: resetError, data, cuerpo })
      if (falla) {
        setError(mensajeRecupero(falla))
        return
      }
      setEnviado(true)
    } catch {
      setError(tardo ? mensajeRecupero({ motivo: 'tardo' }) : 'Ocurrió un error. Intentá de nuevo.')
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }

  return { enviarLink, loading, error, enviado }
}
