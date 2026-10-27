import { useEffect, useRef, useState } from 'react'
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
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { esErrorDeRed } from '@/lib/offlineSync'
import { useAuthStore } from '@/stores/authStore'
import type { Rol } from '@/constants/roles'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { registerPushToken } from '@/lib/notifications'
import { useTerminos } from '@/hooks/useTerminos'
import { useAccesoRestringido } from '@/hooks/useAccesoRestringido'
import { useMailSintetico } from '@/hooks/useMailSintetico'

SplashScreen.preventAutoHideAsync()

// Reintentos del perfil sin red (2 s … 1 min, unos 2 minutos en total).
const REINTENTOS_PERFIL = 6

const ROL_RUTAS: Record<string, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador:  '/(entrenador)/diario',
  manager:     '/(manager)/diario',
  admin:       '/(admin)/usuarios',
  secretaria:  '/(secretaria)/diario',
  porteria:    '/(porteria)/scanner',
  canchero:    '/(porteria)/scanner',
  buffet:      '/(porteria)/scanner',
  cliente_gimnasio: '/(cliente-gimnasio)/carnet',
  socio:       '/(socio)/carnet',
  tutor:       '/(tutor)/carnet',
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

  const router = useRouter()
  const {
    session, rol, loading, isPasswordRecovery, isNuevoUsuario,
    setSession, setRol, setRoles, clearAuth, setPasswordRecovery, setNuevoUsuario, setAvisoAuth,
  } = useAuthStore()
  // Perfil (rol) de la sesión. Si no carga, la persona quedaba en el login sin
  // ninguna explicación. Sin red: se avisa y se reintenta solo con espera
  // creciente (no se cierra la sesión: el carnet tiene que poder abrirse sin
  // señal). Cualquier otro error: se cierra la sesión y se explica.
  // Un único reintento pendiente a la vez, atado a la cuenta: se cancela si la
  // sesión cambia, así nunca se aplica el rol de la cuenta anterior.
  const reintentoPerfil = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Agotados los reintentos, un único listener vuelve a probar al recuperar la red.
  const esperaRedPerfil = useRef<(() => void) | null>(null)
  function cancelarReintentoPerfil() {
    if (reintentoPerfil.current) clearTimeout(reintentoPerfil.current)
    reintentoPerfil.current = null
    esperaRedPerfil.current?.()
    esperaRedPerfil.current = null
  }

  // Lee el perfil y aplica rol/roles. true = quedó cargado.
  async function cargarPerfil(userId: string, intento = 0): Promise<boolean> {
    cancelarReintentoPerfil()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('rol, roles')
      .eq('id', userId)
      .single()
    // La sesión cambió mientras se esperaba la respuesta: no es de esta cuenta.
    if (useAuthStore.getState().session?.user.id !== userId) return false
    if (profile && !error) {
      setAvisoAuth(null)
      setRol((profile.rol as Rol) ?? null)
      setRoles((profile.roles as Rol[]) ?? [profile.rol as Rol].filter(Boolean))
      // Cubre login fresco, login biométrico Y sesión restaurada al abrir la
      // app — antes sólo se llamaba desde useLogin.ts, así que una sesión ya
      // activa cuando se instala una build nueva nunca registraba el token nuevo.
      void registerPushToken()
      return true
    }
    if (esErrorDeRed(error)) {
      if (intento < REINTENTOS_PERFIL) {
        setAvisoAuth('Sin conexión: no pudimos cargar tu perfil. Se reintenta solo.')
        const espera = Math.min(60_000, 2_000 * 2 ** intento) // 2 s, 4 s, 8 s … hasta 1 min
        reintentoPerfil.current = setTimeout(() => { void cargarPerfil(userId, intento + 1) }, espera)
      } else {
        setAvisoAuth('Sin conexión: no pudimos cargar tu perfil. Se reintenta solo cuando vuelva la conexión.')
        // NetInfo avisa enseguida el estado actual: sólo se reintenta en un
        // cambio de "sin red" a "con red", así no se arma un bucle.
        // cargarPerfil ya canceló todo al empezar; igual se desarma uno previo.
        esperaRedPerfil.current?.()
        let habiaRed: boolean | null = null
        esperaRedPerfil.current = NetInfo.addEventListener(estado => {
          const hayRed = !!estado.isConnected && estado.isInternetReachable !== false
          const volvio = habiaRed === false && hayRed
          habiaRed = hayRed
          // Se desarma antes de reintentar: un único reintento por reconexión.
          if (volvio) { cancelarReintentoPerfil(); void cargarPerfil(userId, 0) }
        })
      }
      return false
    }
    await supabase.auth.signOut()
    setAvisoAuth('No pudimos cargar tu perfil. Volvé a iniciar sesión; si sigue pasando, avisá en Secretaría.')
    return false
  }

  const { pendiente: terminosPendiente, loading: terminosLoading } = useTerminos()
  const { restringido, loading: restringidoLoading } = useAccesoRestringido()
  const { pendiente: mailSinteticoPendiente, loading: mailSinteticoLoading } = useMailSintetico()

  // Esconde la splash recién cuando ya sabemos a dónde navegar — evita el
  // "flash" del login antes del redirect cuando hay una sesión guardada
  // (fuentes cargan rápido, pero perfil/rol y términos tardan un viaje de red).
  // Recovery/nuevo-usuario no esperan perfil/términos — mismo orden que el guard de abajo.
  useEffect(() => {
    if (!fontsLoaded || loading) return
    const esperandoPerfilOTerminos =
      session && !isPasswordRecovery && !isNuevoUsuario
      && (rol === null || terminosLoading || restringidoLoading || mailSinteticoLoading)
    if (esperandoPerfilOTerminos) return
    SplashScreen.hideAsync()
  }, [fontsLoaded, loading, session, rol, terminosLoading, restringidoLoading, mailSinteticoLoading, isPasswordRecovery, isNuevoUsuario])

  // Red de seguridad — si Supabase nunca responde, la splash no puede quedar
  // trabada para siempre. Peor caso: cae al login (index.tsx redirige ahí
  // incondicionalmente) y el usuario reintenta, en vez de ver una pantalla
  // negra infinita.
  useEffect(() => {
    const timer = setTimeout(() => { SplashScreen.hideAsync() }, 8000)
    return () => clearTimeout(timer)
  }, [])

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
      (event, newSession) => {
        if (event === 'PASSWORD_RECOVERY') {
          setSession(newSession!)
          setPasswordRecovery(true)
          return
        }
        if (!newSession) {
          cancelarReintentoPerfil()
          clearAuth()
          return
        }
        // Setea la sesión ANTES de esperar el perfil — useTerminos depende
        // de `session` en el store, así que dispara su query en paralelo
        // con la de perfil en vez de esperarla (antes eran secuenciales).
        setSession(newSession)
        // Ninguna llamada a Supabase puede hacerse DENTRO de este callback:
        // GoTrue lo corre bajo un lock exclusivo, y una query nuestra que
        // también necesita ese lock (cualquier .from()/.auth.*) se
        // deadlockea esperándolo para siempre — bug documentado de
        // supabase-js, no nuestro. setTimeout(...,0) la corre recién cuando
        // el callback ya terminó y el lock se liberó.
        // https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
        setTimeout(async () => {
          // cargarPerfil también registra el push token (ahí, para que un
          // reintento que carga el perfil más tarde lo registre igual).
          await cargarPerfil(newSession.user.id)
        }, 0)
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
      // registro-tutor runs without a session and signs out the restricted
      // minor on mount: that sign-out must not bounce it to the login. Read
      // from getState(), not as a dependency, so toggling the flag never
      // re-runs the guard by itself.
      if (useAuthStore.getState().registroSinSesion) return
      router.replace('/(auth)/login')
    } else if (rol) {
      if (restringidoLoading) return
      if (restringido) {
        router.replace('/(auth)/acceso-restringido')
        return
      }
      if (terminosLoading) return
      if (terminosPendiente) {
        router.replace('/(auth)/terminos')
        return
      }
      if (mailSinteticoLoading) return
      if (mailSinteticoPendiente) {
        router.replace('/(auth)/registrar-mail')
        return
      }
      router.replace(ROL_RUTAS[rol] ?? '/(auth)/login')
    }
  }, [
    mounted, session?.access_token, rol, loading, isPasswordRecovery, isNuevoUsuario,
    terminosPendiente, terminosLoading, restringido, restringidoLoading,
    mailSinteticoPendiente, mailSinteticoLoading,
  ])

  // Siempre renderizamos el árbol — el SplashScreen oculta la UI hasta que
  // fuentes/auth/perfil/términos resuelven. Retornar null aquí desmontaría la
  // navegación y causaría re-suscripciones en loop en React Navigation v7 + New Architecture.
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
