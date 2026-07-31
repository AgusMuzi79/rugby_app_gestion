import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { totpSecretKey } from './useCarnet'
import { EMAIL_KEY, PASSWORD_KEY } from './useLogin'

export function useSignOut() {
  const { session, clearAuth } = useAuthStore()

  async function signOut() {
    const userId = session?.user.id

    await supabase.auth.signOut()
    clearAuth()

    // Dispositivo compartido (588 grupos familiares): no dejar el secreto TOTP
    // ni las credenciales de biometría disponibles para la próxima sesión.
    const keys = [EMAIL_KEY, PASSWORD_KEY, ...(userId ? [totpSecretKey(userId)] : [])]
    await Promise.all(keys.map(key => SecureStore.deleteItemAsync(key)))
  }

  return { signOut }
}
