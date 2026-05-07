import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface DivisionOpcion {
  id:        string
  nombre:    string
  categoria: string
}

export interface AsistenciaDivision {
  divisionId:     string
  divisionNombre: string
  porcentaje:     number | null
  totalJugadores: number
  presentes:      number
  tieneAlertas:   boolean
}

export interface ResultadoResumen {
  id:             string
  divisionId:     string
  divisionNombre: string
  categoria:      string
  equipoNombre:   string | null
  fecha:          string
  puntosPropios:  number
  puntosRival:    number
  rival:          string | null
}

export interface FichajesDivision {
  divisionId:     string
  divisionNombre: string
  total:          number
}

export interface EventoFinancieroResumen {
  id:              string
  nombre:          string
  tipo:            string
  divisionId:      string | null
  divisionNombre:  string | null
  totalCobrado:    number
  countPagados:    number
  countPendientes: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboard() {
  const { session } = useAuthStore()

  const [loading, setLoading]             = useState(true)
  const [divisiones, setDivisiones]       = useState<DivisionOpcion[]>([])
  const [divisionFiltro, setDivisionFiltro] = useState<string | null>(null)

  const [asistencias, setAsistencias] = useState<AsistenciaDivision[]>([])
  const [resultados, setResultados]   = useState<ResultadoResumen[]>([])
  const [fichajes, setFichajes]       = useState<FichajesDivision[]>([])
  const [financiero, setFinanciero]   = useState<EventoFinancieroResumen[]>([])

  useEffect(() => {
    if (session) fetchTodo()
  }, [session])

  // Realtime — un canal, cuatro tablas
  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('dashboard-subcomision')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias' },
        () => { fetchAsistencias() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichajes' },
        () => { fetchFichajes() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultados' },
        () => { fetchResultados() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobranzas' },
        () => { fetchFinanciero() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session])

  // ─── Carga ───────────────────────────────────────────────────────────────

  async function fetchTodo() {
    setLoading(true)
    await Promise.all([
      fetchDivisiones(),
      fetchAsistencias(),
      fetchResultados(),
      fetchFichajes(),
      fetchFinanciero(),
    ])
    setLoading(false)
  }

  async function fetchDivisiones() {
    const { data } = await supabase
      .from('divisiones')
      .select('id, nombre, categoria')
      .eq('activa', true)
      .order('nombre')
    setDivisiones(data ?? [])
  }

  async function fetchAsistencias() {
    const fechaLimite = new Date()
    fechaLimite.setDate(fechaLimite.getDate() - 60)
    const fechaLimiteStr = fechaLimite.toISOString().split('T')[0]

    const { data: eventos } = await supabase
      .from('eventos')
      .select('id, division_id, fecha')
      .eq('tipo', 'entrenamiento')
      .eq('cancelado', false)
      .gte('fecha', fechaLimiteStr)
      .order('fecha', { ascending: false })

    if (!eventos?.length) { setAsistencias([]); return }

    // Hasta 4 eventos más recientes por división
    const eventosPorDiv = new Map<string, typeof eventos>()
    const eventoIdsParaQuery: string[] = []

    for (const ev of eventos) {
      const arr = eventosPorDiv.get(ev.division_id)
      if (!arr) {
        eventosPorDiv.set(ev.division_id, [ev])
        eventoIdsParaQuery.push(ev.id)
      } else if (arr.length < 4) {
        arr.push(ev)
        eventoIdsParaQuery.push(ev.id)
      }
    }

    const [asistRes, jugRes, divRes] = await Promise.all([
      supabase
        .from('asistencias')
        .select('jugador_id, evento_id, estado')
        .in('evento_id', eventoIdsParaQuery),
      supabase
        .from('jugadores')
        .select('id, division_id')
        .eq('activo', true),
      supabase
        .from('divisiones')
        .select('id, nombre')
        .eq('activa', true),
    ])

    const asists = asistRes.data ?? []
    const jugs   = jugRes.data   ?? []
    const divMap = new Map((divRes.data ?? []).map(d => [d.id, d.nombre]))

    const result: AsistenciaDivision[] = []

    for (const [divId, divEventos] of eventosPorDiv) {
      const ultimoEvento  = divEventos[0]
      const asistUltimo   = asists.filter(a => a.evento_id === ultimoEvento.id)
      const jugadoresDiv  = jugs.filter(j => j.division_id === divId)

      const presentes  = asistUltimo.filter(a => a.estado === 'presente').length
      const total      = jugadoresDiv.length
      const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : null

      // 4+ ausencias consecutivas: jugador ausente en sus últimos 4 registros
      const estadosPorJugador = new Map<string, string[]>()
      for (const divEv of divEventos) {
        for (const a of asists.filter(a2 => a2.evento_id === divEv.id)) {
          const arr = estadosPorJugador.get(a.jugador_id) ?? []
          arr.push(a.estado)
          estadosPorJugador.set(a.jugador_id, arr)
        }
      }

      let tieneAlertas = false
      for (const estados of estadosPorJugador.values()) {
        if (estados.length >= 4 && estados.every(e => e === 'ausente')) {
          tieneAlertas = true
          break
        }
      }

      result.push({
        divisionId:     divId,
        divisionNombre: divMap.get(divId) ?? divId,
        porcentaje,
        totalJugadores: total,
        presentes,
        tieneAlertas,
      })
    }

    result.sort((a, b) => a.divisionNombre.localeCompare(b.divisionNombre))
    setAsistencias(result)
  }

  async function fetchResultados() {
    const { data } = await supabase
      .from('resultados')
      .select('id, puntos_propios, puntos_rival, rival, equipos(nombre), eventos(id, fecha, division_id, divisiones(id, nombre, categoria))')
      .order('created_at', { ascending: false })
      .limit(10)

    type EquipoJoin  = { nombre: string } | null
    type DivJoin     = { id: string; nombre: string; categoria: string } | null
    type EventoJoin  = { id: string; fecha: string; division_id: string; divisiones: DivJoin } | null

    setResultados(
      (data ?? [])
        .map(r => {
          const ev  = r.eventos as EventoJoin
          const div = ev?.divisiones
          if (!ev || !div) return null
          return {
            id:             r.id,
            divisionId:     ev.division_id,
            divisionNombre: div.nombre,
            categoria:      div.categoria,
            equipoNombre:   (r.equipos as EquipoJoin)?.nombre ?? null,
            fecha:          ev.fecha,
            puntosPropios:  r.puntos_propios,
            puntosRival:    r.puntos_rival,
            rival:          r.rival,
          }
        })
        .filter((r): r is ResultadoResumen => r !== null)
        .filter(r => r.categoria !== 'infantil'),
    )
  }

  async function fetchFichajes() {
    const { data } = await supabase
      .from('jugadores')
      .select('division_id, divisiones(nombre)')
      .eq('activo', true)

    type DivJoin = { nombre: string } | null

    const map = new Map<string, { nombre: string; count: number }>()
    for (const j of data ?? []) {
      const divNombre = (j.divisiones as DivJoin)?.nombre ?? j.division_id
      const cur = map.get(j.division_id) ?? { nombre: divNombre, count: 0 }
      cur.count++
      map.set(j.division_id, cur)
    }

    const result: FichajesDivision[] = Array.from(map.entries()).map(([divId, { nombre, count }]) => ({
      divisionId:     divId,
      divisionNombre: nombre,
      total:          count,
    }))
    result.sort((a, b) => a.divisionNombre.localeCompare(b.divisionNombre))
    setFichajes(result)
  }

  async function fetchFinanciero() {
    const { data } = await supabase
      .from('eventos_financieros')
      .select('id, nombre, tipo, division_id, divisiones(nombre), cobranzas(estado, monto)')
      .eq('estado', 'activo')
      .order('fecha', { ascending: false, nullsFirst: false })

    type DivJoin      = { nombre: string } | null
    type CobranzaJoin = Array<{ estado: string; monto: number | null }>

    setFinanciero(
      (data ?? []).map(ef => {
        const cobrs   = (ef.cobranzas as CobranzaJoin) ?? []
        const pagados = cobrs.filter(c => c.estado === 'pagado')
        return {
          id:              ef.id,
          nombre:          ef.nombre,
          tipo:            ef.tipo,
          divisionId:      ef.division_id,
          divisionNombre:  (ef.divisiones as DivJoin)?.nombre ?? null,
          totalCobrado:    pagados.reduce((s, c) => s + (c.monto ?? 0), 0),
          countPagados:    pagados.length,
          countPendientes: cobrs.filter(c => c.estado === 'pendiente').length,
        }
      }),
    )
  }

  // ─── Filtrado por división ────────────────────────────────────────────────

  const asistenciasFiltradas = divisionFiltro
    ? asistencias.filter(a => a.divisionId === divisionFiltro)
    : asistencias

  const resultadosFiltrados = divisionFiltro
    ? resultados.filter(r => r.divisionId === divisionFiltro)
    : resultados

  const fichajesFiltrados = divisionFiltro
    ? fichajes.filter(f => f.divisionId === divisionFiltro)
    : fichajes

  // Eventos globales (division_id null) siempre visibles; los de división filtrada también
  const financieroFiltrado = divisionFiltro
    ? financiero.filter(ef => ef.divisionId === divisionFiltro || ef.divisionId === null)
    : financiero

  return {
    loading,
    divisiones,
    divisionFiltro,
    setDivisionFiltro,
    asistencias:  asistenciasFiltradas,
    resultados:   resultadosFiltrados,
    fichajes:     fichajesFiltrados,
    financiero:   financieroFiltrado,
  }
}
