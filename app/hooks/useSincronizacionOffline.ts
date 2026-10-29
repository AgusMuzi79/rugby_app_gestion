import { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { aplicarResultadoSync, cantidadNoEnviadas, obtenerCola, tamañoCola } from '@/lib/offlineQueue'
import { particionarFallidos, sincronizarAccesosOffline, sincronizarItems, type PuertoAccesos, type PuertoSync, type ResultadoAccesoOffline } from '@/lib/offlineSync'
import { VENTANA_EVENTOS, jugadoresQueLleganAlTope, type MarcaGuardada } from '@/lib/ausenciasConsecutivas'
import { fechaLocal } from '@/lib/fecha'

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
  async alSincronizarEntrenamiento(divisionId, eventoId, marcas) {
    await verificarCuartaAusencia({ divisionId, eventoId, marcas })
  },
}

// Alerta de 4 ausencias seguidas, compartida por el guardado online
// (useAsistencia) y la sync offline. Dos lecturas en total (no una por
// jugador) y push sólo a quienes esta carga les completa la 4ª falta.
// Devuelve los nombres de esos jugadores. Tira si falla una lectura.
export async function verificarCuartaAusencia({
  divisionId,
  eventoId,
  marcas,
  divisionNombre,
  nombres,
}: {
  divisionId: string
  eventoId: string
  marcas: MarcaGuardada[]
  divisionNombre?: string
  nombres?: Record<string, string>
}): Promise<string[]> {
  if (!marcas.some(m => m.estado === 'ausente')) return []

  const { data: eventos, error: errEventos } = await supabase
    .from('eventos')
    .select('id')
    .eq('division_id', divisionId)
    .eq('cancelado', false)
    // Las actividades no toman asistencia: no cortan ni suman la racha.
    .neq('tipo', 'actividad')
    .lte('fecha', fechaLocal())
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(VENTANA_EVENTOS)
  if (errEventos) throw errEventos
  const ids = (eventos ?? []).map(e => e.id)
  if (!ids.includes(eventoId)) return []

  const { data: filas, error: errFilas } = await supabase
    .from('asistencias')
    .select('jugador_id, evento_id, estado')
    .in('evento_id', ids)
    .in('jugador_id', marcas.map(m => m.jugador_id))
  if (errFilas) throw errFilas

  const llegan = jugadoresQueLleganAlTope(ids, filas ?? [], eventoId, marcas)
  if (llegan.length === 0) return []

  let porId = nombres ?? {}
  if (llegan.some(id => !porId[id])) {
    const { data } = await supabase.from('jugadores').select('id, nombre_completo').in('id', llegan)
    porId = { ...porId, ...Object.fromEntries((data ?? []).map(j => [j.id, j.nombre_completo])) }
  }
  let divNombre = divisionNombre
  if (divNombre === undefined) {
    const { data } = await supabase.from('divisiones').select('nombre').eq('id', divisionId).single()
    divNombre = data?.nombre ?? ''
  }

  for (const id of llegan) {
    void supabase.functions.invoke('notifications', {
      body: {
        type: 'ausencias_consecutivas',
        payload: { jugadorNombre: porId[id] ?? '', jugadorId: id, divisionNombre: divNombre, divisionId },
      },
    })
  }
  return llegan.map(id => porId[id] ?? '')
}

// Escaneos de la puerta que se dejaron pasar sin conexión (portería T4): socios-qr
// los valida a posteriori y los registra (acción registrar-offline).
const puertoAccesos: PuertoAccesos = {
  async registrarAccesosOffline(lote) {
    const res = await supabase.functions.invoke('socios-qr', { body: { action: 'registrar-offline', items: lote } })
    if (res.error) {
      const status = (res.error as { context?: { status?: number } }).context?.status
      // Sin status HTTP no llegó al servidor: es de red (se reintenta sin sumar
      // intentos). Una sesión vencida (401) tampoco suma: los ingresos esperan a
      // que vuelvan a iniciar sesión en la tablet, no pasan a "no enviadas".
      if (typeof status !== 'number' || status === 401) throw new Error(`network error: ${status ?? 'sin respuesta'} ${res.error.message}`)
      throw new Error(`socios-qr ${status}: ${res.error.message}`)
    }
    const data = res.data as { ok?: boolean; motivo?: string; resultados?: ResultadoAccesoOffline[] } | null
    if (!data?.ok || !Array.isArray(data.resultados)) throw new Error(data?.motivo ?? 'respuesta inesperada de socios-qr')
    return data.resultados
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
          // Asistencia (entrenador) y escaneos de la puerta (portería): cada
          // envío deja pasar los ítems del otro.
          const r = await sincronizarItems(cola, puertoSupabase)
          const ra = cola.some(i => i.tipo === 'acceso') ? await sincronizarAccesosOffline(cola, puertoAccesos) : null
          const enviados = [...r.enviados, ...(ra?.enviados ?? [])]
          const fallidos = [...r.fallidos, ...(ra?.fallidos ?? [])]
          const { reintentar, descartar } = particionarFallidos(cola, fallidos)
          await aplicarResultadoSync({ enviados, reintentar, descartar })
          for (const f of fallidos) console.warn('offline sync:', f.id, f.red ? 'red' : 'permanente', f.error)
        }
        await actualizarPendientes()
      } finally {
        enCurso = null
      }
    })()
  }
  return enCurso
}

// Se monta en el layout de los roles que encolan (entrenador; portería, que
// encola los escaneos sin conexión). `pendientes` cuenta
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
