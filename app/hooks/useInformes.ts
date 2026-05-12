import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface JugadorAsistencia {
  jugadorId:            string
  nombre:               string
  divisionId:           string
  divisionNombre:       string
  totalEventos:         number
  presentes:            number
  porcentaje:           number | null
  ausenciasConsecutivas: boolean
}

export interface ResultadoInforme {
  id:             string
  divisionId:     string
  divisionNombre: string
  fecha:          string
  rival:          string | null
  puntosPropios:  number
  puntosRival:    number
  resultado:      'W' | 'L' | 'D'
}

export interface DivisionFichajesResumen {
  divisionId:     string
  divisionNombre: string
  total:          number
}

export interface FichajeReciente {
  id:             string
  jugadorId:      string
  nombre:         string
  divisionId:     string
  divisionNombre: string
  fechaFichaje:   string
}

export interface EventoFinancieroInforme {
  id:                string
  nombre:            string
  tipo:              string
  divisionId:        string | null
  divisionNombre:    string | null
  totalCobrado:      number
  totalPendiente:    number
  countPagados:      number
  countPendientes:   number
  porcentajeCobrado: number
  formasDePago:      Record<string, number>
}

export interface DivisionOpcionInformes {
  id:     string
  nombre: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInformes() {
  const { session } = useAuthStore()

  const [loading, setLoading]           = useState(true)
  const [divisiones, setDivisiones]     = useState<DivisionOpcionInformes[]>([])
  const [divisionFiltro, setDivisionFiltro] = useState<string | null>(null)

  const [asistencias, setAsistencias]             = useState<JugadorAsistencia[]>([])
  const [resultados, setResultados]               = useState<ResultadoInforme[]>([])
  const [fichajesPorDiv, setFichajesPorDiv]       = useState<DivisionFichajesResumen[]>([])
  const [fichajesRecientes, setFichajesRecientes] = useState<FichajeReciente[]>([])
  const [financiero, setFinanciero]               = useState<EventoFinancieroInforme[]>([])

  useEffect(() => {
    if (session) fetchTodo()
  }, [session])

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
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')
    setDivisiones(data ?? [])
  }

  async function fetchAsistencias() {
    const hace60    = new Date()
    hace60.setDate(hace60.getDate() - 60)
    const hace60Str = hace60.toISOString().split('T')[0]

    const [eventosRes, jugadoresRes, divsRes] = await Promise.all([
      supabase
        .from('eventos')
        .select('id, division_id, fecha')
        .eq('tipo', 'entrenamiento')
        .eq('cancelado', false)
        .gte('fecha', hace60Str)
        .order('fecha', { ascending: false }),
      supabase
        .from('jugadores')
        .select('id, nombre_completo, division_id')
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('divisiones')
        .select('id, nombre')
        .eq('activa', true),
    ])

    const eventos   = eventosRes.data   ?? []
    const jugadores = jugadoresRes.data ?? []
    const divMap    = new Map((divsRes.data ?? []).map(d => [d.id, d.nombre]))

    if (eventos.length === 0) {
      setAsistencias(
        jugadores.map(j => ({
          jugadorId:             j.id,
          nombre:                j.nombre_completo,
          divisionId:            j.division_id,
          divisionNombre:        divMap.get(j.division_id) ?? j.division_id,
          totalEventos:          0,
          presentes:             0,
          porcentaje:            null,
          ausenciasConsecutivas: false,
        })),
      )
      return
    }

    // Eventos por división, orden descendente (ya viene así de la query)
    const eventosPorDiv = new Map<string, Array<{ id: string }>>()
    for (const ev of eventos) {
      let arr = eventosPorDiv.get(ev.division_id)
      if (!arr) { arr = []; eventosPorDiv.set(ev.division_id, arr) }
      arr.push(ev)
    }

    const { data: asistRows } = await supabase
      .from('asistencias')
      .select('evento_id, jugador_id, estado')
      .in('evento_id', eventos.map(e => e.id))

    // Índice: jugador_id → (evento_id → estado)
    const asistIdx = new Map<string, Map<string, string>>()
    for (const a of asistRows ?? []) {
      let m = asistIdx.get(a.jugador_id)
      if (!m) { m = new Map<string, string>(); asistIdx.set(a.jugador_id, m) }
      m.set(a.evento_id, a.estado)
    }

    setAsistencias(
      jugadores.map(j => {
        const evs          = eventosPorDiv.get(j.division_id) ?? []
        const jm           = asistIdx.get(j.id) ?? new Map<string, string>()
        const totalEventos = evs.length
        const presentes    = evs.filter(ev => jm.get(ev.id) === 'presente').length
        const porcentaje   = totalEventos > 0 ? Math.round((presentes / totalEventos) * 100) : null
        const ultimos4     = evs.slice(0, 4)
        const ausenciasConsecutivas =
          ultimos4.length >= 4 && ultimos4.every(ev => jm.get(ev.id) === 'ausente')
        return {
          jugadorId:             j.id,
          nombre:                j.nombre_completo,
          divisionId:            j.division_id,
          divisionNombre:        divMap.get(j.division_id) ?? j.division_id,
          totalEventos,
          presentes,
          porcentaje,
          ausenciasConsecutivas,
        }
      }),
    )
  }

  async function fetchResultados() {
    const { data } = await supabase
      .from('resultados')
      .select('id, puntos_propios, puntos_rival, rival, eventos(id, fecha, division_id, divisiones(id, nombre, categoria))')
      .order('created_at', { ascending: false })
      .limit(100)

    type DivJoin    = { id: string; nombre: string; categoria: string } | null
    type EventoJoin = { id: string; fecha: string; division_id: string; divisiones: DivJoin } | null

    setResultados(
      (data ?? [])
        .map(r => {
          const ev  = r.eventos as EventoJoin
          const div = ev?.divisiones
          if (!ev || !div || div.categoria === 'infantil') return null
          const res: 'W' | 'L' | 'D' =
            r.puntos_propios > r.puntos_rival ? 'W' :
            r.puntos_propios < r.puntos_rival ? 'L' : 'D'
          return {
            id:             r.id,
            divisionId:     ev.division_id,
            divisionNombre: div.nombre,
            fecha:          ev.fecha,
            rival:          r.rival,
            puntosPropios:  r.puntos_propios,
            puntosRival:    r.puntos_rival,
            resultado:      res,
          }
        })
        .filter((r): r is ResultadoInforme => r !== null),
    )
  }

  async function fetchFichajes() {
    const [jugsRes, fichajesRes] = await Promise.all([
      supabase
        .from('jugadores')
        .select('division_id, divisiones(nombre)')
        .eq('activo', true),
      supabase
        .from('fichajes')
        .select('id, fecha_fichaje, jugadores(id, nombre_completo, division_id, divisiones(nombre))')
        .order('fecha_fichaje', { ascending: false })
        .limit(20),
    ])

    type DivJoin = { nombre: string } | null
    const cntMap = new Map<string, { nombre: string; count: number }>()
    for (const j of jugsRes.data ?? []) {
      const nombre = (j.divisiones as DivJoin)?.nombre ?? j.division_id
      let cur = cntMap.get(j.division_id)
      if (!cur) { cur = { nombre, count: 0 }; cntMap.set(j.division_id, cur) }
      cur.count++
    }

    setFichajesPorDiv(
      Array.from(cntMap.entries())
        .map(([id, { nombre, count }]) => ({ divisionId: id, divisionNombre: nombre, total: count }))
        .sort((a, b) => a.divisionNombre.localeCompare(b.divisionNombre)),
    )

    type JugJoin = {
      id:              string
      nombre_completo: string
      division_id:     string
      divisiones:      { nombre: string } | null
    } | null

    setFichajesRecientes(
      (fichajesRes.data ?? [])
        .map(f => {
          const jug = f.jugadores as JugJoin
          if (!jug) return null
          return {
            id:             f.id,
            jugadorId:      jug.id,
            nombre:         jug.nombre_completo,
            divisionId:     jug.division_id,
            divisionNombre: jug.divisiones?.nombre ?? jug.division_id,
            fechaFichaje:   f.fecha_fichaje,
          }
        })
        .filter((f): f is FichajeReciente => f !== null),
    )
  }

  async function fetchFinanciero() {
    const { data } = await supabase
      .from('eventos_financieros')
      .select('id, nombre, tipo, division_id, divisiones(nombre), cobranzas(estado, monto, forma_de_pago)')
      .eq('estado', 'activo')
      .order('fecha', { ascending: false, nullsFirst: false })

    type DivJoin      = { nombre: string } | null
    type CobranzaJoin = Array<{ estado: string; monto: number | null; forma_de_pago: string | null }>

    setFinanciero(
      (data ?? []).map(ef => {
        const cobrs      = (ef.cobranzas as CobranzaJoin) ?? []
        const pagados    = cobrs.filter(c => c.estado === 'pagado')
        const pendientes = cobrs.filter(c => c.estado === 'pendiente')
        const totalCobrado   = pagados.reduce((s, c) => s + (c.monto ?? 0), 0)
        const totalPendiente = pendientes.reduce((s, c) => s + (c.monto ?? 0), 0)
        const total          = totalCobrado + totalPendiente
        const formasDePago: Record<string, number> = {}
        for (const p of pagados) {
          const k = p.forma_de_pago ?? 'sin especificar'
          formasDePago[k] = (formasDePago[k] ?? 0) + (p.monto ?? 0)
        }
        return {
          id:                ef.id,
          nombre:            ef.nombre,
          tipo:              ef.tipo,
          divisionId:        ef.division_id,
          divisionNombre:    (ef.divisiones as DivJoin)?.nombre ?? null,
          totalCobrado,
          totalPendiente,
          countPagados:      pagados.length,
          countPendientes:   pendientes.length,
          porcentajeCobrado: total > 0 ? Math.round((totalCobrado / total) * 100) : 0,
          formasDePago,
        }
      }),
    )
  }

  // ─── Filtrado client-side ────────────────────────────────────────────────────

  const asistenciasFiltradas = divisionFiltro
    ? asistencias.filter(a => a.divisionId === divisionFiltro)
    : asistencias

  const resultadosFiltrados = divisionFiltro
    ? resultados.filter(r => r.divisionId === divisionFiltro)
    : resultados

  const fichajesDivFiltradas = divisionFiltro
    ? fichajesPorDiv.filter(f => f.divisionId === divisionFiltro)
    : fichajesPorDiv

  const fichajesRecientesFiltrados = divisionFiltro
    ? fichajesRecientes.filter(f => f.divisionId === divisionFiltro)
    : fichajesRecientes

  const financieroFiltrado = divisionFiltro
    ? financiero.filter(ef => ef.divisionId === divisionFiltro || ef.divisionId === null)
    : financiero

  return {
    loading,
    divisiones,
    divisionFiltro,
    setDivisionFiltro,
    asistencias:       asistenciasFiltradas,
    resultados:        resultadosFiltrados,
    fichajesPorDiv:    fichajesDivFiltradas,
    fichajesRecientes: fichajesRecientesFiltrados,
    financiero:        financieroFiltrado,
    recargar:          fetchTodo,
  }
}
