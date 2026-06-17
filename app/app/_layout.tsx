import { useEffect, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { Slot, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Barlow_400Regular,
  Barlow_600SemiBold,
  Barlow_700Bold,
  Barlow_900Black,
} from '@expo-google-fonts/barlow'
import {
  BarlowSemiCondensed_400Regular,
  BarlowSemiCondensed_600SemiBold,
  BarlowSemiCondensed_700Bold,
} from '@expo-google-fonts/barlow-semi-condensed'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Rol } from '@/constants/roles'
import { ThemeProvider } from '@/contexts/ThemeContext'

SplashScreen.preventAutoHideAsync()

const ROL_RUTAS: Record<string, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador:  '/(entrenador)/diario',
  manager:     '/(manager)/diario',
  admin:       '/(subcomision)/diario',
  secretaria:  '/(secretaria)/diario',
  porteria:    '/(porteria)/scanner',
  socio:       '/(socio)/carnet',
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_600SemiBold,
    Barlow_700Bold,
    Barlow_900Black,
    BarlowSemiCondensed_400Regular,
    BarlowSemiCondensed_600SemiBold,
    BarlowSemiCondensed_700Bold,
    JetBrainsMono_400Regular,
  })

  // Flag simple de mounted — evita suscribirse a useRootNavigationState()
  // que usa useNavigation() internamente y genera re-renders en loop con RN v7
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  const router = useRouter()
  const {
    session, rol, loading, isPasswordRecovery, isNuevoUsuario,
    setSession, setRol, setRoles, clearAuth, setPasswordRecovery, setNuevoUsuario,
  } = useAuthStore()

  // Parsear deep links de recovery/invite
  useEffect(() => {
    async function handleUrl(url: string) {
      const codeMatch = url.match(/[?&]code=([^&#]+)/)
      if (codeMatch) {
        const queryType = url.match(/[?&]type=([^&#]+)/)?.[1]
        if (queryType === 'invite' || queryType === 'signup' || queryType === 'magiclink') {
          setNuevoUsuario(true)
        }
        await supabase.auth.exchangeCodeForSession(decodeURIComponent(codeMatch[1]))
        return
      }
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
            .select('rol, roles')
            .eq('id', newSession.user.id)
            .single()
          setSession(newSession)
          setRol((profile?.rol as Rol) ?? null)
          setRoles((profile?.roles as Rol[]) ?? [profile?.rol as Rol].filter(Boolean))
        } else {
          clearAuth()
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  // Guard de navegación — espera a que el layout esté montado y auth resuelto
  useEffect(() => {
    if (!mounted || loading) return
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
  }, [mounted, session?.access_token, rol, loading, isPasswordRecovery, isNuevoUsuario])

  // Siempre renderizamos el árbol — el SplashScreen oculta la UI hasta que
  // fontsLoaded=true. Retornar null aquí desmontaría la navegación y causaría
  // re-suscripciones en loop en React Navigation v7 + New Architecture.
  return (
    <ThemeProvider>
      <View style={s.root}>
        <Slot />
      </View>
    </ThemeProvider>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15110A' },
})
