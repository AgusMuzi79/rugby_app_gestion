import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Rol } from '@/constants/roles'
import { registerPushToken } from '@/lib/notifications'

const EMAIL_KEY    = 'biometria_email'
const PASSWORD_KEY = 'biometria_password'

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
        .select('rol, roles')
        .eq('id', data.user.id)
        .single()

      // Ofrecer biometría solo si está disponible y no hay credenciales guardadas aún
      if (biometriaDisponible) {
        const existingEmail = await SecureStore.getItemAsync(EMAIL_KEY)
        if (!existingEmail) {
          Alert.alert(
            'Acceso rápido',
            '¿Querés ingresar con huella o Face ID la próxima vez?',
            [
              { text: 'No, gracias', style: 'cancel' },
              {
                text: 'Activar',
                onPress: async () => {
                  await SecureStore.setItemAsync(EMAIL_KEY, email)
                  await SecureStore.setItemAsync(PASSWORD_KEY, password)
                  setCredencialesGuardadas(true)
                },
              },
            ],
          )
        }
      }

      setSession(data.session)
      setRol((profile?.rol as Rol) ?? null)
      setRoles((profile?.roles as Rol[]) ?? [profile?.rol as Rol].filter(Boolean))
      console.log('[login] Sesión establecida, disparando registerPushToken()')
      void registerPushToken()
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
        promptMessage: 'Ingresá a La Bitácora',
        fallbackLabel: 'Usar contraseña',
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
      void registerPushToken()
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
