import { useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { mensajeErrorAuth } from '@/lib/errorFunction'
import { cerrarSesionRecupero } from '@/lib/cancelarRecupero'
import {
  erroresVisibles, hayErrores, todosTocados, validarFormPassword,
  type CampoPassword, type Errores, type Tocados,
} from '@/lib/validacionAuth'
import { EMAIL_KEY, PASSWORD_KEY } from './useLogin'

const CAMPOS: readonly CampoPassword[] = ['password', 'confirmacion']

export function useResetPassword() {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [completado, setCompletado] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [tocados, setTocados]       = useState<Tocados<CampoPassword>>({})
  const { clearAuth, setPasswordRecovery } = useAuthStore()

  // Al salir de un campo: desde ahí se muestra su error (lib/validacionAuth.ts).
  function tocar(campo: CampoPassword) {
    setTocados(t => (t[campo] ? t : { ...t, [campo]: true }))
  }

  // Errores a mostrar debajo de cada campo.
  function errores(password: string, confirmacion: string): Errores<CampoPassword> {
    return erroresVisibles(validarFormPassword({ password, confirmacion }), tocados)
  }

  async function actualizarPassword(password: string, confirmacion: string): Promise<void> {
    // Al enviar se marcan todos: cada campo muestra lo suyo.
    setTocados(todosTocados(CAMPOS))
    setError(null)
    if (hayErrores(validarFormPassword({ password, confirmacion }))) return

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
  // puesto, el guard devolvía siempre a esta pantalla. Primero se cierra la
  // sesión del link y recién después se limpia el flag (lib/cancelarRecupero.ts):
  // al revés, el guard llevaba la sesión viva al inicio del rol.
  async function cancelar(): Promise<void> {
    setCancelando(true)
    try {
      await cerrarSesionRecupero(
        opciones => supabase.auth.signOut(opciones),
        () => { setPasswordRecovery(false); clearAuth() },
      )
    } finally {
      setCancelando(false)
    }
  }

  return { actualizarPassword, cancelar, tocar, errores, loading, cancelando, error, completado }
}
