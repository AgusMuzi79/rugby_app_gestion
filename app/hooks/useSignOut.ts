import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function useSignOut() {
  const { clearAuth } = useAuthStore()

  async function signOut() {
    await supabase.auth.signOut()
    clearAuth()
  }

  return { signOut }
}
