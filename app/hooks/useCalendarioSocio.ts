import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

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

export function useCalendarioSocio() {
  const { session } = useAuthStore()

  const [loading, setLoading]                         = useState(true)
  const [jugadorDivisionId, setJugadorDivisionId]     = useState<string | null>(null)
  const [jugadorDivisionNombre, setJugadorDivisionNombre] = useState<string | null>(null)
  const [partidos, setPartidos]                       = useState<PartidoCalendario[]>([])
  const [resultados, setResultados]                   = useState<ResultadoCalendario[]>([])
  const [filtroDeporte, setFiltroDeporte]             = useState<FiltrodeDeporte>('todos')
  const [error, setError]                             = useState<string | null>(null)

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  async function fetchDatos() {
    if (!session) return
    setLoading(true)
    setError(null)

    try {
      // ── Detectar si el socio es jugador ──────────────────────────────────────
      const { data: socio } = await supabase
        .from('socios')
        .select('id, dni')
        .eq('profile_id', session.user.id)
        .maybeSingle()

      if (socio?.dni) {
        const { data: jugador } = await supabase
          .from('jugadores')
          .select('division_id, divisiones(nombre)')
          .eq('dni', socio.dni)
          .eq('activo', true)
          .maybeSingle()

        if (jugador?.division_id) {
          const div = jugador.divisiones as { nombre: string } | null
          setJugadorDivisionId(jugador.division_id)
          setJugadorDivisionNombre(div?.nombre ?? null)
        } else {
          setJugadorDivisionId(null)
          setJugadorDivisionNombre(null)
        }
      }

      const hoy    = new Date().toISOString().split('T')[0]
      const en60   = new Date()
      en60.setDate(en60.getDate() + 60)
      const hasta  = en60.toISOString().split('T')[0]
      const hace30 = new Date()
      hace30.setDate(hace30.getDate() - 30)
      const desde  = hace30.toISOString().split('T')[0]

      // ── Próximos partidos ──────────────────────────────────────────────────
      const { data: eventosData } = await supabase
        .from('eventos')
        .select('id, fecha, hora, lugar, rival, division_id, divisiones(nombre, deporte)')
        .eq('tipo', 'partido')
        .eq('cancelado', false)
        .gte('fecha', hoy)
        .lte('fecha', hasta)
        .order('fecha', { ascending: true })

      type RawEvento = {
        id: string; fecha: string; hora: string | null; lugar: string | null
        rival: string | null; division_id: string
        divisiones: { nombre: string; deporte: string } | null
      }

      const miDivisionId = jugadorDivisionId ?? null

      const partidosNorm: PartidoCalendario[] = (eventosData ?? []).map((e: RawEvento) => ({
        id:              e.id,
        fecha:           e.fecha,
        hora:            e.hora,
        lugar:           e.lugar,
        rival:           e.rival ?? 'Por confirmar',
        division_id:     e.division_id,
        division_nombre: e.divisiones?.nombre ?? '',
        deporte:         e.divisiones?.deporte ?? 'rugby',
        es_mi_division:  e.division_id === miDivisionId,
      }))
      setPartidos(partidosNorm)

      // ── Resultados recientes ───────────────────────────────────────────────
      const { data: resultadosData } = await supabase
        .from('eventos')
        .select('id, fecha, rival, division_id, divisiones(nombre, deporte), resultados(puntos_propios, puntos_rival)')
        .eq('tipo', 'partido')
        .eq('cancelado', false)
        .lt('fecha', hoy)
        .gte('fecha', desde)
        .order('fecha', { ascending: false })
        .limit(15)

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
          es_mi_division:  e.division_id === miDivisionId,
        }
      })
      setResultados(resultadosNorm)
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
    loading,
    error,
    jugadorDivisionId,
    jugadorDivisionNombre,
    partidos:   partidosFiltrados,
    resultados: resultadosFiltrados,
    filtroDeporte,
    setFiltroDeporte,
    recargar: fetchDatos,
  }
}
