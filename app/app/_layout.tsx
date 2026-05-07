import '../global.css'
import { useEffect } from 'react'
import { Slot, useRouter, useRootNavigationState } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Rol, ROL_RUTA_INICIAL } from '@/constants/roles'

export default function RootLayout() {
  const { session, rol, loading, setSession, setRol } = useAuthStore()
  const router = useRouter()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)

      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('rol')
          .eq('id', session.user.id)
          .single()

        setRol((profile?.rol as Rol) ?? null)
      } else {
        setRol(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!navigationState?.key) return
    if (loading) return

    if (!session) {
      router.replace('/(auth)/login')
    } else if (session && rol) {
      router.replace(ROL_RUTA_INICIAL[rol] as never)
    }
  }, [session, rol, loading, navigationState?.key])

  return <Slot />
}
