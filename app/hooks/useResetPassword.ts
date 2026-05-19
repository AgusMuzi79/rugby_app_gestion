import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function useResetPassword() {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [completado, setCompletado] = useState(false)
  const { clearAuth, setPasswordRecovery } = useAuthStore()

  async function actualizarPassword(password: string, confirmacion: string): Promise<void> {
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError('No se pudo actualizar la contraseña. Intentá de nuevo.')
        return
      }
      setPasswordRecovery(false)
      setCompletado(true)
      await supabase.auth.signOut()
      clearAuth()
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return { actualizarPassword, loading, error, completado }
}
