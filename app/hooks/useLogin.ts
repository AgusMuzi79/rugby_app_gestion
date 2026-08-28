import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Rol } from '@/constants/roles'

export const EMAIL_KEY    = 'biometria_email'
export const PASSWORD_KEY = 'biometria_password'

export function useLogin() {
  const [loading, setLoading]                       = useState(false)
  const [error, setError]                           = useState<string | null>(null)
  const [biometriaDisponible, setBiometriaDisponible] = useState(false)
  const [credencialesGuardadas, setCredencialesGuardadas] = useState(false)
  const { setSession, setRol, setRoles } = useAuthStore()

  useEffect(() => {
    void verificarBiometria()
  }, [])

  async function verificarBiometria() {
    const hardware = await LocalAuthentication.hasHardwareAsync()
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    if (!hardware || !enrolled) return

    const savedEmail = await SecureStore.getItemAsync(EMAIL_KEY)
    setBiometriaDisponible(true)
    setCredencialesGuardadas(!!savedEmail)
  }

  async function login(dni: string, password: string): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      // login-dni resuelve DNI -> email real (sintético o propio) del lado
      // del servidor y valida la contraseña ahí mismo — el cliente nunca ve
      // el email, sólo recibe los tokens de sesión ya armados.
      const { data: loginData, error: loginError } = await supabase.functions.invoke('login-dni', {
        body: { dni, password },
      })

      if (loginError || !loginData?.access_token || !loginData?.refresh_token) {
        setError('Credenciales incorrectas. Verificá tu DNI y contraseña.')
        return
      }

      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: loginData.access_token,
        refresh_token: loginData.refresh_token,
      })

      if (sessionError || !data.session || !data.user) {
        setError('Credenciales incorrectas. Verificá tu DNI y contraseña.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol, roles')
        .eq('id', data.user.id)
        .single()

      // Ofrecer biometría solo si está disponible y no hay credenciales guardadas aún.
      // Se guarda el email real ya resuelto (no el DNI) — loginConBiometria sigue
      // llamando a signInWithPassword directo, sin pasar por login-dni de nuevo.
      if (biometriaDisponible) {
        const existingEmail = await SecureStore.getItemAsync(EMAIL_KEY)
        if (!existingEmail && data.user.email) {
          const emailResuelto = data.user.email
          Alert.alert(
            'Acceso rápido',
            '¿Querés ingresar con huella o Face ID la próxima vez?',
            [
              { text: 'No, gracias', style: 'cancel' },
              {
                text: 'Activar',
                onPress: async () => {
                  await SecureStore.setItemAsync(EMAIL_KEY, emailResuelto)
                  await SecureStore.setItemAsync(PASSWORD_KEY, password)
                  setCredencialesGuardadas(true)
                },
              },
            ],
          )
        }
      }

      // setSession dispara onAuthStateChange en _layout.tsx, que setea rol/roles
      // y registra el push token — centralizado ahí para cubrir también la
      // sesión restaurada al abrir la app, no sólo el login explícito.
      setSession(data.session)
      setRol((profile?.rol as Rol) ?? null)
      setRoles((profile?.roles as Rol[]) ?? [profile?.rol as Rol].filter(Boolean))
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function loginConBiometria(): Promise<void> {
    setLoading(true)
    setError(null)

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Ingresá a Uncas Rugby',
        fallbackLabel: 'Usar contraseña',
        disableDeviceFallback: true,
      })

      if (!result.success) {
        setLoading(false)
        return
      }

      const email    = await SecureStore.getItemAsync(EMAIL_KEY)
      const password = await SecureStore.getItemAsync(PASSWORD_KEY)

      if (!email || !password) {
        setError('No se encontraron credenciales guardadas.')
        setCredencialesGuardadas(false)
        setLoading(false)
        return
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError || !data.session) {
        // Credenciales guardadas ya no son válidas — limpiar y pedir login manual
        await SecureStore.deleteItemAsync(EMAIL_KEY)
        await SecureStore.deleteItemAsync(PASSWORD_KEY)
        setCredencialesGuardadas(false)
        setError('Sesión expirada. Ingresá con tu contraseña.')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol, roles')
        .eq('id', data.user.id)
        .single()

      setSession(data.session)
      setRol((profile?.rol as Rol) ?? null)
      setRoles((profile?.roles as Rol[]) ?? [profile?.rol as Rol].filter(Boolean))
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return {
    login,
    loginConBiometria,
    loading,
    error,
    biometriaDisponible,
    credencialesGuardadas,
  }
}
