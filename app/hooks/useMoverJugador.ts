import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

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

    // RPC nuevo (migración 20261012000000): todavía no está en los tipos generados
    const { error: rpcError } = await supabase.rpc('mover_jugador_division' as never, {
      p_jugador_id: jugadorId,
      p_division_destino: divisionDestinoId,
    } as never)

    setMoviendo(false)
    if (rpcError) {
      setError(rpcError.message || 'No se pudo mover al jugador.')
      return false
    }
    return true
  }, [])

  return { moviendo, error, limpiarError: () => setError(null), mover }
}
