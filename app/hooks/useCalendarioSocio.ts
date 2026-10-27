import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { nombreMisDivisiones, parsearAgenda, ventanaAgenda, type DivisionAgenda } from '@/lib/agenda'
import { fechaLocal } from '@/lib/fecha'

export type FiltrodeDeporte = 'todos' | 'rugby' | 'hockey' | 'tenis'

export interface PartidoCalendario {
  id:              string
  fecha:           string
  hora:            string | null
  lugar:           string | null
  rival:           string
  division_id:     string
  division_nombre: string
  deporte:         string
  es_mi_division:  boolean
}

export interface ResultadoCalendario {
  id:              string
  fecha:           string
  rival:           string
  division_id:     string
  division_nombre: string
  deporte:         string
  puntos_propios:  number | null
  puntos_rival:    number | null
  es_mi_division:  boolean
}

// socioId: undefined = own socio (profile_id = auth.uid()); given = that socio
// by id (tutor viewing a linked minor). Only used to highlight "mi equipo",
// which today only works for the own socio (see agenda_socio below).
export function useCalendarioSocio(socioId?: string) {
  const { session } = useAuthStore()

  const [loading, setLoading]                         = useState(true)
  const [jugadorDivisionIds, setJugadorDivisionIds]   = useState<string[]>([])
  const [jugadorDivisionNombre, setJugadorDivisionNombre] = useState<string | null>(null)
  const [partidos, setPartidos]                       = useState<PartidoCalendario[]>([])
  const [resultados, setResultados]                   = useState<ResultadoCalendario[]>([])
  const [filtroDeporte, setFiltroDeporte]             = useState<FiltrodeDeporte>('todos')
  const [error, setError]                             = useState<string | null>(null)
  // Spinner de pantalla completa sólo hasta la primera carga exitosa: al
  // volver a la pestaña se recarga en silencio sin desmontar la lista.
  const [cargado, setCargado]                         = useState(false)
  const [refreshing, setRefreshing]                   = useState(false)

  useEffect(() => {
    setCargado(false)
    if (session) fetchDatos()
  }, [session, socioId])
  useRefreshOnFocus(fetchDatos)

  // Pull-to-refresh y "Reintentar": con su propio indicador.
  async function recargar() {
    setRefreshing(true)
    await fetchDatos()
    setRefreshing(false)
  }

  async function fetchDatos() {
    if (!session) return
    setLoading(true)
    setError(null)

    try {
      // ── Divisiones donde juega el socio ("MI EQUIPO") ────────────────────────
      // Los socios no pueden leer `jugadores` (RLS); agenda_socio() devuelve
      // sus divisiones de forma segura. Ventana de un día: sólo interesan las
      // divisiones, no los eventos. Resuelve el socio logueado, así que para
      // el tutor (socioId del menor) no aplica. Si falla, el calendario se
      // muestra igual sin destacar.
      let misDivisiones: DivisionAgenda[] = []
      if (!socioId) {
        const { data: agendaData, error: errAgenda } = await supabase.rpc('agenda_socio', ventanaAgenda(new Date(), 0))
        if (!errAgenda) misDivisiones = parsearAgenda(agendaData).divisiones
      }
      const misDivisionIds = new Set(misDivisiones.map(d => d.id))
      setJugadorDivisionIds([...misDivisionIds])
      setJugadorDivisionNombre(nombreMisDivisiones(misDivisiones))

      const hoy    = fechaLocal()
      const en60   = new Date()
      en60.setDate(en60.getDate() + 60)
      const hasta  = fechaLocal(en60)
      const hace30 = new Date()
      hace30.setDate(hace30.getDate() - 30)
      const desde  = fechaLocal(hace30)

      // ── Próximos partidos ──────────────────────────────────────────────────
      // supabase-js no tira: el error viene en la respuesta. Se relanza para
      // que el catch muestre "Error al cargar" en vez de "Sin partidos".
      const { data: eventosData, error: errEventos } = await supabase
        .from('eventos')
        .select('id, fecha, hora, lugar, rival, division_id, divisiones(nombre, deporte)')
        .eq('tipo', 'partido')
        .eq('cancelado', false)
        .gte('fecha', hoy)
        .lte('fecha', hasta)
        .order('fecha', { ascending: true })
      if (errEventos) throw errEventos

      type RawEvento = {
        id: string; fecha: string; hora: string | null; lugar: string | null
        rival: string | null; division_id: string
        divisiones: { nombre: string; deporte: string } | null
      }

      const partidosNorm: PartidoCalendario[] = (eventosData ?? []).map((e: RawEvento) => ({
        id:              e.id,
        fecha:           e.fecha,
        hora:            e.hora,
        lugar:           e.lugar,
        rival:           e.rival ?? 'Por confirmar',
        division_id:     e.division_id,
        division_nombre: e.divisiones?.nombre ?? '',
        deporte:         e.divisiones?.deporte ?? 'rugby',
        es_mi_division:  misDivisionIds.has(e.division_id),
      }))
      setPartidos(partidosNorm)

      // ── Resultados recientes ───────────────────────────────────────────────
      const { data: resultadosData, error: errResultados } = await supabase
        .from('eventos')
        .select('id, fecha, rival, division_id, divisiones(nombre, deporte), resultados(puntos_propios, puntos_rival)')
        .eq('tipo', 'partido')
        .eq('cancelado', false)
        .lt('fecha', hoy)
        .gte('fecha', desde)
        .order('fecha', { ascending: false })
        .limit(15)
      if (errResultados) throw errResultados

      type RawResultado = {
        id: string; fecha: string; rival: string | null; division_id: string
        divisiones: { nombre: string; deporte: string } | null
        resultados: { puntos_propios: number; puntos_rival: number }[] | null
      }

      const resultadosNorm: ResultadoCalendario[] = (resultadosData ?? []).map((e: RawResultado) => {
        const r = Array.isArray(e.resultados) ? e.resultados[0] : null
        return {
          id:              e.id,
          fecha:           e.fecha,
          rival:           e.rival ?? 'Por confirmar',
          division_id:     e.division_id,
          division_nombre: e.divisiones?.nombre ?? '',
          deporte:         e.divisiones?.deporte ?? 'rugby',
          puntos_propios:  r?.puntos_propios ?? null,
          puntos_rival:    r?.puntos_rival ?? null,
          es_mi_division:  misDivisionIds.has(e.division_id),
        }
      })
      setResultados(resultadosNorm)
      setCargado(true)
    } catch {
      setError('Error al cargar el calendario.')
    }

    setLoading(false)
  }

  const partidosFiltrados = filtroDeporte === 'todos'
    ? partidos
    : partidos.filter(p => p.deporte === filtroDeporte)

  const resultadosFiltrados = filtroDeporte === 'todos'
    ? resultados
    : resultados.filter(r => r.deporte === filtroDeporte)

  return {
    loading: loading && !cargado,
    refreshing,
    error,
    jugadorDivisionIds,
    jugadorDivisionNombre,
    partidos:   partidosFiltrados,
    resultados: resultadosFiltrados,
    filtroDeporte,
    setFiltroDeporte,
    recargar,
  }
}
