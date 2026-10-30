import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { esErrorDeRed } from '@/lib/offlineSync'
import { SIN_CONEXION } from '@/lib/errorFunction'

export interface UseMoverJugadorReturn {
  moviendo: boolean
  error: string | null
  limpiarError: () => void
  /** Devuelve true si el movimiento se completó. */
  mover: (jugadorId: string, divisionDestinoId: string) => Promise<boolean>
}

// El RPC `mover_jugador_division` da de baja la fila en la división origen
// (activo=false) y activa al jugador en la destino. Las validaciones (divisiones
// del coordinador, mismo deporte) viven en la base y devuelven texto en español.
export function useMoverJugador(): UseMoverJugadorReturn {
  const [moviendo, setMoviendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mover = useCallback(async (jugadorId: string, divisionDestinoId: string) => {
    setMoviendo(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('mover_jugador_division', {
      p_jugador_id: jugadorId,
      p_division_destino: divisionDestinoId,
    })

    setMoviendo(false)
    if (rpcError) {
      // Las validaciones del RPC (raise exception, P0001) ya vienen en español
      // y se muestran tal cual; un corte de red o cualquier otro error, no
      // ("Network request failed" no le dice nada al coordinador).
      if (esErrorDeRed(rpcError)) setError(SIN_CONEXION)
      else if (rpcError.code === 'P0001' && rpcError.message) setError(rpcError.message)
      else setError('No se pudo mover al jugador. Probá de nuevo.')
      return false
    }
    return true
  }, [])

  return { moviendo, error, limpiarError: () => setError(null), mover }
}
