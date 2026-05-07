import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Rol } from '@/constants/roles'
import { registerPushToken } from '@/lib/notifications'

export function useLogin() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setSession, setRol } = useAuthStore()

  async function login(email: string, password: string): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !data.session) {
        setError('Credenciales incorrectas. Verificá tu email y contraseña.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', data.user.id)
        .single()

      setSession(data.session)
      setRol((profile?.rol as Rol) ?? null)
      void registerPushToken()
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return { login, loading, error }
}
