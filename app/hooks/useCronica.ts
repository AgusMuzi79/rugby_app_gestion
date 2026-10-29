import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import { FEATURES } from '@/constants/features'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import {
  alcanceCronica, tiposNotificacion, ordenarFeed,
  itemLesion, itemFichaje, itemResultado, itemNotificacion,
  type FilaLesion, type FilaFichaje, type FilaResultado, type FilaNotificacion,
} from '@/lib/cronica'

export type { FeedItem, FeedTipo } from '@/lib/cronica'

function hace7Dias() {
  const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString()
}

type Respuesta = { data: unknown[] | null; error: unknown }
const VACIA: Respuesta = { data: [], error: null }

export function useCronica() {
  const { session, rol } = useAuthStore()
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [items, setItems]           = useState<ReturnType<typeof ordenarFeed>>([])
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  useEffect(() => { if (session && rol) void fetchTodo() }, [session, rol])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session || !rol) return
    empezar()
    try {
      await cargar(session.user.id, rol)
    } catch (err) {
      // Un fallo no es "sin novedades": se muestra el error y, si había una
      // lista de antes, queda debajo.
      setErrorCarga(mensajeErrorCarga('la crónica', err))
    }
    terminar()
  }

  async function cargar(userId: string, rolActual: string) {
    const { data: profile, error: errProfile } = await supabase
      .from('profiles').select('divisiones').eq('id', userId).single()
    if (errProfile) throw errProfile

    const alcance = alcanceCronica(rolActual, (profile?.divisiones as string[] | null) ?? [])
    // Sin divisiones asignadas (y sin ser subcomisión) no hay nada de división que leer.
    const conDivisiones = alcance.todas || alcance.divisiones.length > 0
    const desde = hace7Dias()

    // El filtro por división va en la query (antes del limit): si se filtrara
    // después, el límite global podía dejar afuera los resultados propios.
    let lesionesQ = supabase.from('lesiones')
      .select('id, created_at, grado, descripcion, jugadores(nombre_completo), divisiones(nombre)')
      .gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(10)

    // Fichajes reales (tabla `fichajes`): mover de división o el pase de
    // temporada crean filas nuevas en `jugadores`, pero no un fichaje.
    let fichajesQ = supabase.from('fichajes')
      .select('id, created_at, jugadores!inner(nombre_completo, division_id, divisiones(nombre))')
      .gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(5)

    let resultadosQ = supabase.from('resultados')
      .select('id, created_at, eventos!inner(rival, division_id, divisiones(nombre))')
      .gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(5)

    const notifQ = supabase.from('notificaciones')
      .select('id, titulo, mensaje, tipo, created_at')
      .gte('created_at', desde)
      .in('tipo', tiposNotificacion(rolActual))
      .order('created_at', { ascending: false }).limit(5)

    if (!alcance.todas) {
      lesionesQ   = lesionesQ.in('division_id', alcance.divisiones)
      fichajesQ   = fichajesQ.in('jugadores.division_id', alcance.divisiones)
      resultadosQ = resultadosQ.in('eventos.division_id', alcance.divisiones)
    }

    // Módulo de lesiones oculto (FEATURES.lesiones): ni se consulta la tabla.
    const [lesionesRes, fichajesRes, resultadosRes, notifRes]: Respuesta[] = await Promise.all([
      FEATURES.lesiones && conDivisiones ? lesionesQ : Promise.resolve(VACIA),
      conDivisiones ? fichajesQ : Promise.resolve(VACIA),
      conDivisiones ? resultadosQ : Promise.resolve(VACIA),
      notifQ,
    ])

    const error = primerError(lesionesRes.error, fichajesRes.error, resultadosRes.error, notifRes.error)
    if (error) throw error

    setItems(ordenarFeed(
      ((lesionesRes.data ?? []) as FilaLesion[]).map(r => itemLesion(r, rolActual)),
      ((fichajesRes.data ?? []) as FilaFichaje[]).map(r => itemFichaje(r, rolActual)),
      ((resultadosRes.data ?? []) as FilaResultado[]).map(r => itemResultado(r, rolActual)),
      ((notifRes.data ?? []) as FilaNotificacion[]).map(r => itemNotificacion(r, rolActual)),
    ))
    setErrorCarga(null)
  }

  return { loading, refrescando, items, errorCarga, rol: rol ?? '', refetch: fetchTodo }
}
