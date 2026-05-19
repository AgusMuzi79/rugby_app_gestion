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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'uncasrugby://reset-password',
      })

      if (resetError) {
        setError('No se pudo enviar el link. Verificá el email ingresado.')
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
