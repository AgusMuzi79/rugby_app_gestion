import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import { FEATURES } from '@/constants/features'
import { mensajeErrorCarga } from '@/lib/errorCarga'
import { aplicarCarga, leerCronica, type ClienteCronica, type EstadoCronica } from '@/lib/cronicaCarga'

export type { FeedItem, FeedTipo } from '@/lib/cronica'

function hace7Dias() {
  const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString()
}

export function useCronica() {
  const { session, rol } = useAuthStore()
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [estado, setEstado] = useState<EstadoCronica>({ items: [], errorCarga: null })

  useEffect(() => { if (session && rol) void fetchTodo() }, [session, rol])
  useRefreshOnFocus(fetchTodo)

  // Las consultas (y el alcance por división) viven en lib/cronicaCarga.ts.
  async function fetchTodo() {
    if (!session || !rol) return
    empezar()
    try {
      // El cliente tipado por tablas es demasiado profundo para compararlo con
      // la interfaz mínima de la lib: se pasa tal cual (mismos métodos).
      const items = await leerCronica(supabase as unknown as ClienteCronica, {
        userId: session.user.id, rol, desde: hace7Dias(), conLesiones: FEATURES.lesiones,
      })
      setEstado(prev => aplicarCarga(prev, { tipo: 'ok', items }))
    } catch (err) {
      // Un fallo no es "sin novedades": se muestra el error y, si había una
      // lista de antes, queda debajo.
      const mensaje = mensajeErrorCarga('la crónica', err)
      setEstado(prev => aplicarCarga(prev, { tipo: 'error', mensaje }))
    }
    terminar()
  }

  return { loading, refrescando, items: estado.items, errorCarga: estado.errorCarga, rol: rol ?? '', refetch: fetchTodo }
}
