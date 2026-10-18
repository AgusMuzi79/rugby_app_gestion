import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { parsearAgenda, type Agenda } from '@/lib/agenda'

// Agenda del socio logueado (RPC `agenda_socio`). El layout de (socio) la
// carga una sola vez con `useAgendaEstado` (decide si se ve la pestaña) y la
// comparte por `AgendaContext`; la pantalla la lee con `useAgenda` y recarga
// al recibir el foco. Así no se pide dos veces.

export interface EstadoAgenda {
  agenda:  Agenda | null
  loading: boolean
  error:   string | null
  refetch: () => Promise<void>
}

const ERROR_GENERICO = 'No se pudo cargar tu agenda. Probá de nuevo en un rato.'

export function useAgendaEstado(): EstadoAgenda {
  // Por usuario y no por objeto de sesión: el refresh del token no recarga.
  const userId = useAuthStore(s => s.session?.user.id)
  const [agenda,  setAgenda]  = useState<Agenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('agenda_socio')
      if (err) throw err
      setAgenda(parsearAgenda(data))
      setError(null)
    } catch {
      setError(ERROR_GENERICO)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setAgenda(null)
    refetch()
  }, [refetch])

  return { agenda, loading, error, refetch }
}

export const AgendaContext = createContext<EstadoAgenda | null>(null)

export function useAgenda(): EstadoAgenda {
  const ctx = useContext(AgendaContext)
  if (!ctx) throw new Error('useAgenda debe usarse dentro del layout de (socio)')
  return ctx
}
