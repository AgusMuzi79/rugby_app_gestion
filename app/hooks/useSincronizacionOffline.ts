import { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { aplicarResultadoSync, cantidadNoEnviadas, obtenerCola, tamañoCola } from '@/lib/offlineQueue'
import { particionarFallidos, sincronizarItems, type PuertoSync } from '@/lib/offlineSync'

// Lo que queda en el teléfono: `pendientes` todavía se va a mandar;
// `noEnviadas` falló MAX_INTENTOS veces por un error que no es de red
// (permisos, jugador borrado) y no se reintenta más.
export const useColaOffline = create<{ pendientes: number; noEnviadas: number }>(() => ({
  pendientes: 0,
  noEnviadas: 0,
}))

// Siempre se cuenta de nuevo sobre lo que hay guardado: un número calculado
// antes de que termine una sincronización podía pisar uno encolado después.
export async function actualizarPendientes(): Promise<void> {
  const [pendientes, noEnviadas] = await Promise.all([tamañoCola(), cantidadNoEnviadas()])
  useColaOffline.setState({ pendientes, noEnviadas })
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
  // Misma alerta de 4 faltas que corre useAsistencia al guardar online.
  async alSincronizarEntrenamiento(divisionId, jugadorIds) {
    const [jugadoresRes, divisionRes] = await Promise.all([
      supabase.from('jugadores').select('id, nombre_completo').in('id', jugadorIds),
      supabase.from('divisiones').select('nombre').eq('id', divisionId).single(),
    ])
    if (jugadoresRes.error) throw jugadoresRes.error
    const divisionNombre = divisionRes.data?.nombre ?? ''
    await Promise.all((jugadoresRes.data ?? []).map(async j => {
      const { data: ultimas } = await supabase
        .from('asistencias')
        .select('estado')
        .eq('jugador_id', j.id)
        .eq('division_id', divisionId)
        .order('created_at', { ascending: false })
        .limit(4)
      if ((ultimas ?? []).length === 4 && ultimas!.every(a => a.estado === 'ausente')) {
        await supabase.functions.invoke('notifications', {
          body: {
            type: 'ausencias_consecutivas',
            payload: { jugadorNombre: j.nombre_completo, jugadorId: j.id, divisionNombre, divisionId },
          },
        })
      }
    }))
  },
}

// Una sola sincronización a la vez (montaje, vuelta de red y vuelta a primer
// plano pueden dispararse juntos).
let enCurso: Promise<void> | null = null

// Manda lo que haya en la cola y deja el conteo al día.
export function sincronizarCola(): Promise<void> {
  if (!enCurso) {
    enCurso = (async () => {
      try {
        const cola = await obtenerCola()
        if (cola.length > 0) {
          const r = await sincronizarItems(cola, puertoSupabase)
          const { reintentar, descartar } = particionarFallidos(cola, r.fallidos)
          await aplicarResultadoSync({ enviados: r.enviados, reintentar, descartar })
          for (const f of r.fallidos) console.warn('offline sync:', f.id, f.red ? 'red' : 'permanente', f.error)
        }
        await actualizarPendientes()
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
      await sincronizarCola()
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
