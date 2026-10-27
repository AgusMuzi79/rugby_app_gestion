import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { SIN_CONEXION, mensajeErrorFunction } from '@/lib/errorFunction'
import { esErrorDeRed } from '@/lib/offlineSync'

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
      // El motivo real viene en el body del non-2xx (antes se veía
      // "Edge Function returned a non-2xx status code").
      setError(await mensajeErrorFunction(fnError, 'No se pudo registrar el mail. Probá de nuevo.', data))
      return false
    }
    return true
  }, [])

  const omitir = useCallback(async (): Promise<boolean> => {
    if (!session) return false
    setOmitiendo(true)
    setError(null)
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ mail_sintetico_omitido: true })
      .eq('id', session.user.id)
    setOmitiendo(false)
    if (updateErr) {
      setError(esErrorDeRed(updateErr) ? SIN_CONEXION : 'No se pudo guardar. Probá de nuevo.')
      return false
    }
    return true
  }, [session])

  return { guardar, omitir, guardando, omitiendo, error }
}
