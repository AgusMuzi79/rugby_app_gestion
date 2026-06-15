import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useForgotPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  async function enviarLink(email: string): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const timeout = new Promise<{ error: Error }>(resolve =>
        setTimeout(() => resolve({ error: new Error('timeout') }), 15000)
      )
      const { error: resetError } = await Promise.race([
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'uncasrugby://reset-password',
        }),
        timeout,
      ])

      if (resetError) {
        setError('No se pudo enviar el link. Verificá el email y la conexión.')
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
