import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export type TipoEvento = 'recaudacion' | 'viaje' | 'tercer_tiempo'

export interface DivisionRef {
  id:     string
  nombre: string
}

export interface EventoItem {
  id:              string
  nombre:          string
  tipo:            TipoEvento
  descripcion:     string | null  // repurposado como monto sugerido por jugador
  divisionId:      string | null  // división principal (compatibilidad); ver `divisiones`
  divisiones:      DivisionRef[]  // todas las divisiones del evento; vacío = todo el club
  divisionNombre:  string | null  // etiqueta "M15 · M16" (null = todo el club)
  estado:          string
  fecha:           string | null
  countPagados:    number
  countPendientes: number
  totalCobrado:    number
}

export interface CobranzaPorDivision {
  divisionNombre: string
  pagados:        number
  pendientes:     number
  cobrado:        number
}

export interface PedidoItem {
  id:                string
  managerNombre:     string
  estado:            string
  fechaConfirmacion: string | null
  items:             Array<{ concepto: string; cantidad: number }>
}

export interface EventoDetalle extends EventoItem {
  resumenTotal:  { pagados: number; pendientes: number; cobrado: number }
  resumenPorDiv: CobranzaPorDivision[]
  pedidos:       PedidoItem[]
}

// Recaudación de Subcomisión: para todo el club o para divisiones elegidas.
export type AlcanceRecaudacion = 'club' | 'divisiones'

export interface NuevoEventoForm {
  nombre:        string
  tipo:          TipoEvento
  alcance:       AlcanceRecaudacion
  divisionIds:   string[]
  montoSugerido: string
}

// Quién usa la pantalla de eventos:
// - 'subcomision': ve todos los eventos y sólo crea recaudaciones (todo el club
//   o divisiones elegidas de su disciplina).
// - 'manager': ve y crea viajes / tercer tiempos de una o más divisiones de su
//   disciplina; ve los que incluyen alguna división suya o que creó.
// La RLS (20261015000000 + 20261016000000) aplica la misma regla.
export type ModoEventos = 'subcomision' | 'manager'

export const TIPOS_MANAGER: TipoEvento[] = ['viaje', 'tercer_tiempo']

const ERROR_CARGA_DIVISION = 'No se pudo cargar tu división. Intentá de nuevo.'
const ERROR_CARGA_EVENTOS  = 'No se pudieron cargar los eventos. Intentá de nuevo.'

// ─── Divisiones de un evento financiero (compartido con otros hooks) ─────────
// Fuente de verdad: eventos_financieros_divisiones. division_id queda como
// respaldo para filas sin la tabla nueva (no debería pasar tras el backfill).

export const SELECT_DIVISIONES_EVENTO =
  'division_id, divisiones(nombre), eventos_financieros_divisiones(division_id, divisiones(nombre))'

export interface EventoDivisionesRow {
  division_id:  string | null
  divisiones?:  { nombre: string } | null
  eventos_financieros_divisiones?: Array<{ division_id: string; divisiones: { nombre: string } | null }> | null
}

function compararNombre(a: DivisionRef, b: DivisionRef): number {
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
}

export function divisionesDeEvento(row: EventoDivisionesRow): DivisionRef[] {
  const filas = row.eventos_financieros_divisiones ?? []
  if (filas.length > 0) {
    return filas
      .map(f => ({ id: f.division_id, nombre: f.divisiones?.nombre ?? '' }))
      .sort(compararNombre)
  }
  if (row.division_id) return [{ id: row.division_id, nombre: row.divisiones?.nombre ?? '' }]
  return []
}

// "M15 · M16"; null cuando el evento es de todo el club.
export function etiquetaDivisiones(divs: DivisionRef[]): string | null {
  const nombres = divs.map(d => d.nombre).filter(Boolean)
  return nombres.length > 0 ? nombres.join(' · ') : null
}

function formVacio(modo: ModoEventos, preseleccion: string[]): NuevoEventoForm {
  return modo === 'manager'
    ? { nombre: '', tipo: 'viaje',       alcance: 'divisiones', divisionIds: preseleccion, montoSugerido: '' }
    : { nombre: '', tipo: 'recaudacion', alcance: 'club',       divisionIds: [],           montoSugerido: '' }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEventos(modo: ModoEventos = 'subcomision') {
  const { session } = useAuthStore()

  const [loading, setLoading]           = useState(true)
  // Sólo modo manager: todas las divisiones asignadas (profiles.divisiones)
  const [misDivisiones, setMisDivisiones] = useState<DivisionRef[]>([])
  const [sinDivision, setSinDivision]   = useState(false)
  // Divisiones elegibles en el formulario: manager = activas de su disciplina;
  // subcomisión = activas visibles (la RLS de divisiones ya filtra su disciplina).
  const [divisionesElegibles, setDivisionesElegibles] = useState<DivisionRef[]>([])
  // Error al cargar división o eventos (distinto de "sin división"); se limpia al recargar bien.
  const [errorCarga, setErrorCarga]     = useState<string | null>(null)
  const [eventosActivos, setEventosActivos]     = useState<EventoItem[]>([])
  const [eventosHistorial, setEventosHistorial] = useState<EventoItem[]>([])

  // Detalle
  const [paso, setPaso]                       = useState<'lista' | 'detalle'>('lista')
  const [eventoDetalle, setEventoDetalle]     = useState<EventoDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [cerrando, setCerrando]               = useState(false)

  // Modal nuevo evento
  const [modalVisible, setModalVisible]   = useState(false)
  const [form, setForm]                   = useState<NuevoEventoForm>(formVacio(modo, []))
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  useEffect(() => {
    if (session) fetchTodo()
    else setLoading(false)
  }, [session])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErrorCarga(null)
    try {
      if (modo === 'manager') {
        const mias = await fetchDivisionesManager()
        if (mias) await fetchEventos(mias.map(d => d.id))
      } else {
        await Promise.all([fetchDivisionesSubcomision(), fetchEventos([])])
      }
    } catch {
      setErrorCarga(ERROR_CARGA_EVENTOS)
    } finally {
      setLoading(false)
    }
  }

  // Un error de red / RLS al leer el perfil NO significa "sin división":
  // se informa como error de carga (con reintento) y sinDivision no se toca.
  async function fetchDivisionesManager(): Promise<DivisionRef[] | null> {
    if (!session) return null
    const { data: profile, error: errorProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    if (errorProfile) {
      setErrorCarga(ERROR_CARGA_DIVISION)
      return null
    }

    const ids = (profile?.divisiones as string[] | null) ?? []
    if (ids.length === 0) {
      setSinDivision(true)
      setMisDivisiones([])
      return null
    }

    const { data: divs, error: errorDiv } = await supabase
      .from('divisiones')
      .select('id, nombre, deporte, activa')

    if (errorDiv) {
      setErrorCarga(ERROR_CARGA_DIVISION)
      return null
    }

    const todas   = divs ?? []
    const mias    = todas.filter(d => ids.includes(d.id))
    const deportes = new Set(mias.map(d => d.deporte))
    const res     = mias.map(d => ({ id: d.id, nombre: d.nombre })).sort(compararNombre)

    setSinDivision(false)
    setMisDivisiones(res)
    setDivisionesElegibles(
      todas
        .filter(d => d.activa && deportes.has(d.deporte))
        .map(d => ({ id: d.id, nombre: d.nombre }))
        .sort(compararNombre),
    )
    return res
  }

  async function fetchDivisionesSubcomision() {
    const { data, error } = await supabase
      .from('divisiones')
      .select('id, nombre')
      .eq('activa', true)
    if (error) throw error
    setDivisionesElegibles((data ?? []).map(d => ({ id: d.id, nombre: d.nombre })).sort(compararNombre))
  }

  async function fetchEventos(misIds: string[]) {
    let query = supabase
      .from('eventos_financieros')
      .select(`id, nombre, tipo, descripcion, estado, fecha, creado_por, ${SELECT_DIVISIONES_EVENTO}, cobranzas(estado, monto)`)
      .order('created_at', { ascending: false })

    if (modo === 'manager') {
      if (misIds.length === 0) return
      query = query.in('tipo', TIPOS_MANAGER)
    }

    const { data, error } = await query
    if (error) {
      setErrorCarga(ERROR_CARGA_EVENTOS)
      return
    }
    setErrorCarga(null)

    type CobranzaJoin = Array<{ estado: string; monto: number | null }>
    type Fila = EventoDivisionesRow & {
      id: string; nombre: string; tipo: string; descripcion: string | null
      estado: string; fecha: string | null; creado_por: string; cobranzas: CobranzaJoin | null
    }

    const items: EventoItem[] = []
    for (const e of (data ?? []) as unknown as Fila[]) {
      const divs = divisionesDeEvento(e)
      // Manager: eventos que incluyen alguna división suya o que creó.
      if (modo === 'manager'
        && e.creado_por !== session?.user.id
        && !divs.some(d => misIds.includes(d.id))) continue

      const cobrs   = e.cobranzas ?? []
      const pagados = cobrs.filter(c => c.estado === 'pagado')
      items.push({
        id:              e.id,
        nombre:          e.nombre,
        tipo:            e.tipo as TipoEvento,
        descripcion:     e.descripcion,
        divisionId:      e.division_id,
        divisiones:      divs,
        divisionNombre:  etiquetaDivisiones(divs),
        estado:          e.estado,
        fecha:           e.fecha,
        countPagados:    pagados.length,
        countPendientes: cobrs.filter(c => c.estado === 'pendiente').length,
        totalCobrado:    pagados.reduce((s, c) => s + (c.monto ?? 0), 0),
      })
    }

    setEventosActivos(items.filter(e => e.estado === 'activo'))
    setEventosHistorial(items.filter(e => e.estado !== 'activo'))
  }

  // ─── Detalle ─────────────────────────────────────────────────────────────────

  async function abrirDetalle(ev: EventoItem) {
    setPaso('detalle')
    setCargandoDetalle(true)
    setEventoDetalle({
      ...ev,
      resumenTotal:  { pagados: 0, pendientes: 0, cobrado: 0 },
      resumenPorDiv: [],
      pedidos:       [],
    })

    const [cobranzasRes, pedidosRes] = await Promise.all([
      supabase
        .from('cobranzas')
        .select('estado, monto, jugadores(division_id, divisiones(nombre))')
        .eq('evento_financiero_id', ev.id),
      supabase
        .from('pedidos')
        .select('id, estado, fecha_confirmacion, manager_id, profiles(nombre), items_pedido(concepto, cantidad)')
        .eq('evento_financiero_id', ev.id)
        .order('created_at', { ascending: false }),
    ])

    // Procesar cobranzas con desglose por división
    type DivJoin2    = { nombre: string } | null
    type JugJoin2    = { division_id: string; divisiones: DivJoin2 } | null
    type CobranzaRow = { estado: string; monto: number | null; jugadores: JugJoin2 }

    const cobrs  = (cobranzasRes.data ?? []) as CobranzaRow[]
    const divMap = new Map<string, CobranzaPorDivision>()
    let totPagados = 0; let totPendientes = 0; let totCobrado = 0

    for (const c of cobrs) {
      const jug  = c.jugadores
      const key  = jug?.division_id ?? '_'
      const dNom = jug?.divisiones?.nombre ?? 'Sin división'
      let d = divMap.get(key) ?? { divisionNombre: dNom, pagados: 0, pendientes: 0, cobrado: 0 }
      if (c.estado === 'pagado') {
        d.pagados++; d.cobrado += c.monto ?? 0; totPagados++; totCobrado += c.monto ?? 0
      } else {
        d.pendientes++; totPendientes++
      }
      divMap.set(key, d)
    }

    // Procesar pedidos
    type ProfileJoin = { nombre: string } | null
    type ItemJoin    = Array<{ concepto: string; cantidad: number }>
    type PedidoRow   = {
      id:                 string
      estado:             string
      fecha_confirmacion: string | null
      manager_id:         string
      profiles:           ProfileJoin
      items_pedido:       ItemJoin
    }

    const pedidos: PedidoItem[] = ((pedidosRes.data ?? []) as PedidoRow[]).map(p => ({
      id:                p.id,
      managerNombre:     p.profiles?.nombre ?? 'Manager',
      estado:            p.estado,
      fechaConfirmacion: p.fecha_confirmacion,
      items:             p.items_pedido ?? [],
    }))

    setEventoDetalle({
      ...ev,
      resumenTotal:  { pagados: totPagados, pendientes: totPendientes, cobrado: totCobrado },
      resumenPorDiv: Array.from(divMap.values()).sort((a, b) => a.divisionNombre.localeCompare(b.divisionNombre)),
      pedidos,
    })
    setCargandoDetalle(false)
  }

  function volverALista() {
    setPaso('lista')
    setEventoDetalle(null)
  }

  // ─── Cerrar evento ────────────────────────────────────────────────────────────

  async function cerrarEvento() {
    if (!eventoDetalle) return
    setCerrando(true)
    const { error } = await supabase
      .from('eventos_financieros')
      .update({ estado: 'cerrado' })
      .eq('id', eventoDetalle.id)
    setCerrando(false)
    if (!error) {
      await fetchEventos(misDivisiones.map(d => d.id))
      volverALista()
    }
  }

  // ─── Modal nuevo evento ───────────────────────────────────────────────────────

  function abrirModal() {
    // Manager: sus propias divisiones (las elegibles) vienen preseleccionadas.
    const elegibles = new Set(divisionesElegibles.map(d => d.id))
    setForm(formVacio(modo, misDivisiones.map(d => d.id).filter(id => elegibles.has(id))))
    setErrorGuardado(null)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
    setErrorGuardado(null)
  }

  function toggleDivisionForm(id: string) {
    setForm(f => ({
      ...f,
      divisionIds: f.divisionIds.includes(id)
        ? f.divisionIds.filter(x => x !== id)
        : [...f.divisionIds, id],
    }))
  }

  async function crearEvento(): Promise<boolean> {
    if (!session) return false

    const nombreTrim = form.nombre.trim()
    if (!nombreTrim) { setErrorGuardado('Ingresá un nombre para el evento.'); return false }

    // Subcomisión: recaudación (todo el club o divisiones elegidas).
    // Manager: viaje / tercer tiempo de una o más divisiones de su disciplina.
    let tipo: TipoEvento
    let divisionIds: string[]
    if (modo === 'manager') {
      if (misDivisiones.length === 0) { setErrorGuardado('No tenés una división asignada.'); return false }
      if (!TIPOS_MANAGER.includes(form.tipo)) {
        setErrorGuardado('Elegí viaje o tercer tiempo.'); return false
      }
      tipo        = form.tipo
      divisionIds = form.divisionIds
      if (divisionIds.length === 0) { setErrorGuardado('Elegí al menos una división.'); return false }
    } else {
      tipo        = 'recaudacion'
      divisionIds = form.alcance === 'club' ? [] : form.divisionIds
      if (form.alcance === 'divisiones' && divisionIds.length === 0) {
        setErrorGuardado('Elegí al menos una división o marcá "Todo el club".'); return false
      }
    }

    setGuardando(true)
    setErrorGuardado(null)

    const { error } = await supabase.rpc('crear_evento_financiero', {
      p_nombre:       nombreTrim,
      p_tipo:         tipo,
      p_descripcion:  form.montoSugerido.trim() || null,
      p_division_ids: divisionIds,
    })

    if (error) {
      setErrorGuardado('Error al crear el evento: ' + error.message)
      setGuardando(false)
      return false
    }

    await fetchEventos(misDivisiones.map(d => d.id))
    setGuardando(false)
    return true
  }

  return {
    loading,
    recargar:        fetchTodo,
    misDivisiones,
    divisionesLabel: etiquetaDivisiones(misDivisiones) ?? '',
    divisionesElegibles,
    sinDivision,
    errorCarga,
    eventosActivos,
    eventosHistorial,
    paso,
    eventoDetalle,
    cargandoDetalle,
    abrirDetalle,
    volverALista,
    cerrando,
    cerrarEvento,
    modalVisible,
    abrirModal,
    cerrarModal,
    form,
    setForm,
    toggleDivisionForm,
    guardando,
    errorGuardado,
    crearEvento,
  }
}
