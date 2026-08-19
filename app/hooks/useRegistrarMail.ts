import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function useRegistrarMail() {
  const session = useAuthStore(s => s.session)
  const [guardando, setGuardando] = useState(false)
  const [omitiendo, setOmitiendo] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const guardar = useCallback(async (email: string): Promise<boolean> => {
    setGuardando(true)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke('actualizar-mi-mail', {
      body: { email: email.trim().toLowerCase() },
    })
    setGuardando(false)
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'No se pudo registrar el mail. Probá de nuevo.')
      return false
    }
    return true
  }, [])

  const omitir = useCallback(async (): Promise<boolean> => {
    if (!session) return false
    setOmitiendo(true)
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ mail_sintetico_omitido: true })
      .eq('id', session.user.id)
    setOmitiendo(false)
    return !updateErr
  }, [session])

  return { guardar, omitir, guardando, omitiendo, error }
}
