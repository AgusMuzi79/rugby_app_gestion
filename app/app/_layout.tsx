import { useEffect } from 'react'
import { Slot, useRouter } from 'expo-router'
import { useRootNavigationState } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Rol } from '@/constants/roles'

const ROL_RUTAS: Record<string, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador: '/(entrenador)/diario',
  manager: '/(manager)/diario',
  admin: '/(subcomision)/diario',
}

export default function RootLayout() {
  const router = useRouter()
  const navState = useRootNavigationState()
  const { session, rol, loading, setSession, setRol, clearAuth } = useAuthStore()

  // Escuchar cambios de sesión
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (newSession) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('rol')
            .eq('id', newSession.user.id)
            .single()
          setSession(newSession)
          setRol((profile?.rol as Rol) ?? null)
        } else {
          clearAuth()
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  // Guard de navegación — separado del listener de sesión
  useEffect(() => {
    if (!navState?.key || loading) return
    if (!session) {
      router.replace('/(auth)/login')
    } else if (rol) {
      router.replace(ROL_RUTAS[rol] ?? '/(auth)/login')
    }
  }, [navState?.key, session?.access_token, rol, loading])

  return <Slot />
}
