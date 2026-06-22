import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export interface JugadorAsistencia {
  id: string
  nombre_completo: string
  porcentaje: number | null
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
  sinDivisiones: boolean
  seleccionarDivision: (id: string) => void
  recargar: () => void
}

export function useAsistenciaCoordinador(): UseAsistenciaCoordinadorReturn {
  const { session } = useAuthStore()
  const [jugadores, setJugadores] = useState<JugadorAsistencia[]>([])
  const [divisiones, setDivisiones] = useState<{ id: string; nombre: string }[]>([])
  const [divisionSeleccionada, setDivisionSeleccionada] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sinDivisiones, setSinDivisiones] = useState(false)

  const divisionNombre = divisiones.find(d => d.id === divisionSeleccionada)?.nombre ?? ''

  useEffect(() => {
    if (session) fetchDivisiones()
  }, [session])
  useRefreshOnFocus(fetchDivisiones)

  const fetchJugadores = useCallback(async (divisionId: string) => {
    setLoading(true)

    const hoy = new Date().toISOString().split('T')[0]

    const hace30 = new Date()
    hace30.setDate(hace30.getDate() - 30)
    const hace30Str = hace30.toISOString().split('T')[0]

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
        .select('id')
        .eq('division_id', divisionId)
        .eq('cancelado', false)
        .gte('fecha', hace30Str)
        .lte('fecha', hoy),
      supabase
        .from('asistencias')
        .select('jugador_id, estado, created_at')
        .eq('division_id', divisionId)
        .gte('created_at', hace60Str)
        .order('created_at', { ascending: false }),
    ])

    const jugadoresData = jgsRes.data ?? []
    const eventoIds30 = (eventosRes.data ?? []).map(e => e.id)
    const asistencias60 = asistencias60Res.data ?? []

    // Fetch asistencias for the 30-day events in one batch
    let asistencias30: { jugador_id: string; estado: string }[] = []
    if (eventoIds30.length > 0) {
      const { data } = await supabase
        .from('asistencias')
        .select('jugador_id, estado')
        .in('evento_id', eventoIds30)
      asistencias30 = data ?? []
    }

    const totalEventos = eventoIds30.length

    const jugadoresConStats: JugadorAsistencia[] = jugadoresData.map(j => {
      const presentes = asistencias30.filter(
        a => a.jugador_id === j.id && a.estado === 'presente',
      ).length

      const porcentaje = totalEventos > 0
        ? Math.round((presentes / totalEventos) * 100)
        : null

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

    setJugadores(jugadoresConStats)
    setLoading(false)
  }, [])

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
      setLoading(false)
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
      setDivisionSeleccionada(divs[0].id)
    } else {
      setLoading(false)
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
    sinDivisiones,
    seleccionarDivision,
    recargar: () => { if (divisionSeleccionada) fetchJugadores(divisionSeleccionada) },
  }
}
