import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// Gate post-login: si el mail de la cuenta es el sintético que asigna la
// carga masiva (socio-{numero}@uncas.local, para quien no tenía mail propio
// en NUVIX) y todavía no eligió "ahora no", se lo manda a registrar un mail
// real antes de entrar a la app — ver app/(auth)/registrar-mail.tsx.
export function useMailSintetico() {
  const session = useAuthStore(s => s.session)
  const [loading, setLoading]     = useState(true)
  const [pendiente, setPendiente] = useState(false)

  const fetchEstado = useCallback(async () => {
    if (!session) { setLoading(false); return }

    const email = session.user.email ?? ''
    if (!email.endsWith('@uncas.local')) {
      setPendiente(false)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('mail_sintetico_omitido')
      .eq('id', session.user.id)
      .maybeSingle()

    setPendiente(!data?.mail_sintetico_omitido)
    setLoading(false)
  }, [session])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  return { loading, pendiente, refetch: fetchEstado }
}
