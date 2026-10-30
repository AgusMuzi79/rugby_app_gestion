import { useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { mensajeErrorAuth } from '@/lib/errorFunction'
import { EMAIL_KEY, PASSWORD_KEY } from './useLogin'

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
        // Sin sesión del link (venció mientras tanto): reintentar no sirve.
        const sinSesion = updateError.name === 'AuthSessionMissingError' || updateError.code === 'session_not_found'
        setError(sinSesion
          ? 'El link venció. Tocá "Cancelar y volver al inicio" y pedí uno nuevo.'
          : mensajeErrorAuth(updateError, 'No se pudo actualizar la contraseña. Intentá de nuevo.'))
        return
      }
      setPasswordRecovery(false)
      setCompletado(true)
      await supabase.auth.signOut()
      clearAuth()
      // La contraseña guardada para biometría quedó vieja — se vuelve a ofrecer en el próximo login
      await Promise.all([SecureStore.deleteItemAsync(EMAIL_KEY), SecureStore.deleteItemAsync(PASSWORD_KEY)])
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // Salida de reset-password: sin esto, mientras el flag de recovery estaba
  // puesto, el guard devolvía siempre a esta pantalla. Cierre local: no
  // depende de la red (la sesión del link vence sola).
  async function cancelar(): Promise<void> {
    setPasswordRecovery(false)
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Igual se limpia el estado local abajo.
    }
    clearAuth()
  }

  return { actualizarPassword, cancelar, loading, error, completado }
}
