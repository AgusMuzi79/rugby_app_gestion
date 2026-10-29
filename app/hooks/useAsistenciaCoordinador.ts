import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import { fechaLocal } from '@/lib/fecha'
import { estadisticaJugador, eventosQueCuentan } from '@/lib/porcentajeAsistencia'

export interface JugadorAsistencia {
  id: string
  nombre_completo: string
  porcentaje: number | null
  // Eventos pasados (30 días) con fila del jugador, sin contar justificados.
  totalEventos: number
  totalPresentes: number
  ausenciasConsecutivas: boolean
}

export interface UseAsistenciaCoordinadorReturn {
  jugadores: JugadorAsistencia[]
  divisiones: { id: string; nombre: string }[]
  divisionSeleccionada: string | null
  divisionNombre: string
  loading: boolean
  refrescando: boolean
  sinDivisiones: boolean
  seleccionarDivision: (id: string) => void
  recargar: () => void
}

export function useAsistenciaCoordinador(): UseAsistenciaCoordinadorReturn {
  const { session } = useAuthStore()
  const [jugadores, setJugadores] = useState<JugadorAsistencia[]>([])
  const [divisiones, setDivisiones] = useState<{ id: string; nombre: string }[]>([])
  const [divisionSeleccionada, setDivisionSeleccionada] = useState<string | null>(null)
  const { loading: primeraCarga, refrescando: releyendo, empezar, terminar } = useEstadoCarga()
  // División de la lista que está en pantalla: al cambiar de división la lista
  // es otra, así que se muestra el spinner; al volver a la pestaña, no.
  const [divisionCargada, setDivisionCargada] = useState<string | null>(null)
  const [sinDivisiones, setSinDivisiones] = useState(false)

  const divisionNombre = divisiones.find(d => d.id === divisionSeleccionada)?.nombre ?? ''
  const cambiandoDivision = divisionCargada !== null && divisionCargada !== divisionSeleccionada
  const loading     = primeraCarga || cambiandoDivision
  const refrescando = releyendo && !cambiandoDivision

  useEffect(() => {
    if (session) fetchDivisiones()
  }, [session])
  // Relectura silenciosa: divisiones (mantiene la elegida) y la lista en pantalla.
  useRefreshOnFocus(() => {
    fetchDivisiones()
    if (divisionSeleccionada) fetchJugadores(divisionSeleccionada)
  })

  // Sólo la última lectura escribe: si una lectura vieja (otra división, o la
  // relectura al volver a la pestaña) termina después de la nueva, dejaba
  // divisionCargada en la división equivocada y el spinner no se iba más.
  const ultimaLectura = useRef(0)

  const fetchJugadores = useCallback(async (divisionId: string) => {
    const lectura = ++ultimaLectura.current
    empezar()

    const hoy = fechaLocal()

    const hace30 = new Date()
    hace30.setDate(hace30.getDate() - 30)
    const hace30Str = fechaLocal(hace30)

    const hace60 = new Date()
    hace60.setDate(hace60.getDate() - 60)
    const hace60Str = hace60.toISOString()

    const [jgsRes, eventosRes, asistencias60Res] = await Promise.all([
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', divisionId)
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('eventos')
        .select('id, fecha, tipo')
        .eq('division_id', divisionId)
        .eq('cancelado', false)
        .gte('fecha', hace30Str)
        .lte('fecha', hoy)
        // Activities take no attendance; counting them would lower every percentage.
        .neq('tipo', 'actividad'),
      supabase
        .from('asistencias')
        .select('jugador_id, estado, created_at')
        .eq('division_id', divisionId)
        .gte('created_at', hace60Str)
        .order('created_at', { ascending: false }),
    ])

    const jugadoresData = jgsRes.data ?? []
    // Eventos ya pasados (hoy no) y no actividades; por jugador sólo cuentan
    // los que tienen fila suya (lib/porcentajeAsistencia.ts).
    const cuentan = eventosQueCuentan(eventosRes.data ?? [], hoy)
    const eventoIds30 = [...cuentan]
    const asistencias60 = asistencias60Res.data ?? []

    // Fetch asistencias for the 30-day events in one batch
    let asistencias30: { jugador_id: string; evento_id: string; estado: string }[] = []
    if (eventoIds30.length > 0) {
      const { data } = await supabase
        .from('asistencias')
        .select('jugador_id, evento_id, estado')
        .in('evento_id', eventoIds30)
      asistencias30 = data ?? []
    }

    const jugadoresConStats: JugadorAsistencia[] = jugadoresData.map(j => {
      const { presentes, total: totalEventos, porcentaje } = estadisticaJugador(j.id, asistencias30, cuentan)

      // Consecutive ausencias: last 4 registered asistencias in last 60 days
      const ultimas4 = asistencias60.filter(a => a.jugador_id === j.id).slice(0, 4)
      const ausenciasConsecutivas =
        ultimas4.length === 4 && ultimas4.every(a => a.estado === 'ausente')

      return {
        id: j.id,
        nombre_completo: j.nombre_completo,
        porcentaje,
        totalEventos,
        totalPresentes: presentes,
        ausenciasConsecutivas,
      }
    })

    if (lectura !== ultimaLectura.current) return
    setJugadores(jugadoresConStats)
    setDivisionCargada(divisionId)
    terminar()
  }, [empezar, terminar])

  async function fetchDivisiones() {
    if (!session) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divIds: string[] = (profile?.divisiones as string[] | null) ?? []

    if (divIds.length === 0) {
      setSinDivisiones(true)
      terminar()
      return
    }

    const { data: divsData } = await supabase
      .from('divisiones')
      .select('id, nombre')
      .in('id', divIds)
      .order('nombre')

    const divs = divsData ?? []
    setDivisiones(divs)

    if (divs.length > 0) {
      // Mantener la elegida si sigue siendo válida (el foco no la resetea)
      setDivisionSeleccionada(prev => (prev && divs.some(d => d.id === prev) ? prev : divs[0].id))
    } else {
      terminar()
    }
  }

  useEffect(() => {
    if (divisionSeleccionada) fetchJugadores(divisionSeleccionada)
  }, [divisionSeleccionada, fetchJugadores])

  function seleccionarDivision(id: string) {
    setDivisionSeleccionada(id)
  }

  return {
    jugadores,
    divisiones,
    divisionSeleccionada,
    divisionNombre,
    loading,
    refrescando,
    sinDivisiones,
    seleccionarDivision,
    recargar: () => { if (divisionSeleccionada) fetchJugadores(divisionSeleccionada) },
  }
}
