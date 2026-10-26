import { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { eliminarVariosDeCola, obtenerCola, tamañoCola } from '@/lib/offlineQueue'
import { sincronizarItems, type PuertoSync } from '@/lib/offlineSync'

// Ítems guardados en el teléfono que todavía no llegaron a la base. Lo leen
// las pantallas que encolan para decir cuánto falta enviar.
export const useColaOffline = create<{ pendientes: number }>(() => ({ pendientes: 0 }))

export async function actualizarPendientes(): Promise<void> {
  useColaOffline.setState({ pendientes: await tamañoCola() })
}

// La base real para lib/offlineSync.ts. Nunca `.maybeSingle()` por (división,
// fecha, tipo): con dos entrenamientos ese día tiraría error. Se usa el primero.
const puertoSupabase: PuertoSync = {
  async buscarEntrenamiento(divisionId, fecha) {
    const { data, error } = await supabase
      .from('eventos')
      .select('id')
      .eq('tipo', 'entrenamiento')
      .eq('division_id', divisionId)
      .eq('fecha', fecha)
      .eq('cancelado', false)
      .order('created_at')
      .limit(1)
    if (error) throw error
    return data?.[0]?.id ?? null
  },
  async crearEntrenamiento(divisionId, fecha, creadoPor) {
    const { data, error } = await supabase
      .from('eventos')
      .insert({ tipo: 'entrenamiento', division_id: divisionId, fecha, creado_por: creadoPor })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  },
  async upsertAsistencias(filas) {
    const { error } = await supabase
      .from('asistencias')
      .upsert(filas, { onConflict: 'evento_id,jugador_id' })
    if (error) throw error
  },
}

// Una sola sincronización a la vez (montaje, vuelta de red y vuelta a primer
// plano pueden dispararse juntos).
let enCurso: Promise<number> | null = null

// Manda lo que haya en la cola y devuelve cuántos ítems quedan pendientes.
export function sincronizarCola(): Promise<number> {
  if (!enCurso) {
    enCurso = (async () => {
      try {
        const cola = await obtenerCola()
        if (cola.length === 0) return 0
        const r = await sincronizarItems(cola, puertoSupabase)
        await eliminarVariosDeCola(r.enviados)
        for (const f of r.fallidos) console.warn('offline sync:', f.id, f.error)
        return cola.length - r.enviados.length
      } finally {
        enCurso = null
      }
    })()
  }
  return enCurso
}

// Se monta en el layout del rol que encola (entrenador). `pendientes` cuenta
// también las lesiones guardadas, que quedan en la cola mientras el módulo
// está oculto.
export function useSincronizacionOffline() {
  const pendientes = useColaOffline(s => s.pendientes)

  const sincronizar = useCallback(async () => {
    try {
      useColaOffline.setState({ pendientes: await sincronizarCola() })
    } catch (e) {
      console.warn('offline sync:', e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    sincronizar()
    const quitarRed = NetInfo.addEventListener(estado => {
      if (estado.isConnected && estado.isInternetReachable !== false) sincronizar()
    })
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') sincronizar()
    })
    return () => { quitarRed(); sub.remove() }
  }, [sincronizar])

  return { pendientes, sincronizar }
}
