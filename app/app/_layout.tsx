import { useEffect } from 'react'
import { Linking } from 'react-native'
import { Slot, useRouter, useRootNavigationState } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Rol } from '@/constants/roles'
import { ThemeProvider } from '@/contexts/ThemeContext'

const ROL_RUTAS: Record<string, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador:  '/(entrenador)/diario',
  manager:     '/(manager)/diario',
  admin:       '/(subcomision)/diario',
}

export default function RootLayout() {
  const router   = useRouter()
  const navState = useRootNavigationState()
  const {
    session, rol, loading, isPasswordRecovery, isNuevoUsuario,
    setSession, setRol, clearAuth, setPasswordRecovery, setNuevoUsuario,
  } = useAuthStore()

  // Parsear deep links de recovery/invite
  useEffect(() => {
    async function handleUrl(url: string) {
      // PKCE flow: ?code=...
      const codeMatch = url.match(/[?&]code=([^&#]+)/)
      if (codeMatch) {
        const queryType = url.match(/[?&]type=([^&#]+)/)?.[1]
        if (queryType === 'invite' || queryType === 'signup' || queryType === 'magiclink') {
          setNuevoUsuario(true)
        }
        await supabase.auth.exchangeCodeForSession(decodeURIComponent(codeMatch[1]))
        return
      }
      // Implicit flow: #access_token=...
      const fragment = url.split('#')[1]
      if (!fragment) return
      const params       = new URLSearchParams(fragment)
      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type         = params.get('type')
      if (accessToken && refreshToken) {
        if (type === 'recovery') setPasswordRecovery(true)
        if (type === 'invite' || type === 'signup' || type === 'magiclink') setNuevoUsuario(true)
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      }
    }

    Linking.getInitialURL().then(url => { if (url) handleUrl(url) })
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => sub.remove()
  }, [])

  // Listener de cambios de sesión Supabase
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === 'PASSWORD_RECOVERY') {
          setSession(newSession!)
          setPasswordRecovery(true)
          return
        }
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

  // Guard de navegación
  useEffect(() => {
    if (!navState?.key || loading) return
    if (isNuevoUsuario && session) {
      router.replace('/(auth)/registro')
      return
    }
    if (isPasswordRecovery) {
      router.replace('/(auth)/reset-password')
      return
    }
    if (!session) {
      router.replace('/(auth)/login')
    } else if (rol) {
      router.replace(ROL_RUTAS[rol] ?? '/(auth)/login')
    }
  }, [navState?.key, session?.access_token, rol, loading, isPasswordRecovery, isNuevoUsuario])

  return <ThemeProvider><Slot /></ThemeProvider>
}
