import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useTutorStore } from '@/stores/tutorStore'
import { totpSecretKey } from './useCarnet'
import { EMAIL_KEY, PASSWORD_KEY } from './useLogin'

export function useSignOut() {
  const { session, clearAuth } = useAuthStore()

  async function signOut() {
    const userId = session?.user.id
    // Tutor: the carnet secrets are cached per minor socio id (useCarnet).
    const menorIds = useTutorStore.getState().menores.map(m => m.id)

    await supabase.auth.signOut()
    clearAuth()
    useTutorStore.getState().clearTutor()

    // Dispositivo compartido (588 grupos familiares): no dejar el secreto TOTP
    // ni las credenciales de biometría disponibles para la próxima sesión.
    const keys = [
      EMAIL_KEY,
      PASSWORD_KEY,
      ...(userId ? [totpSecretKey(userId)] : []),
      ...menorIds.map(totpSecretKey),
    ]
    await Promise.all(keys.map(key => SecureStore.deleteItemAsync(key)))
  }

  return { signOut }
}
