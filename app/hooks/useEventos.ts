import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export type TipoEvento = 'recaudacion' | 'viaje' | 'tercer_tiempo'

export interface EventoItem {
  id:              string
  nombre:          string
  tipo:            TipoEvento
  descripcion:     string | null  // repurposado como monto sugerido por jugador
  divisionId:      string | null
  divisionNombre:  string | null
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

export interface NuevoEventoForm {
  nombre:        string
  tipo:          TipoEvento
  divisionId:    string | null
  montoSugerido: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEventos() {
  const { session } = useAuthStore()

  const [loading, setLoading]           = useState(true)
  const [divisiones, setDivisiones]     = useState<Array<{ id: string; nombre: string }>>([])
  const [eventosActivos, setEventosActivos]     = useState<EventoItem[]>([])
  const [eventosHistorial, setEventosHistorial] = useState<EventoItem[]>([])

  // Detalle
  const [paso, setPaso]                       = useState<'lista' | 'detalle'>('lista')
  const [eventoDetalle, setEventoDetalle]     = useState<EventoDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [cerrando, setCerrando]               = useState(false)

  // Modal nuevo evento
  const [modalVisible, setModalVisible]   = useState(false)
  const [form, setForm]                   = useState<NuevoEventoForm>({
    nombre: '', tipo: 'recaudacion', divisionId: null, montoSugerido: '',
  })
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  useEffect(() => {
    if (session) fetchTodo()
  }, [session])

  async function fetchTodo() {
    setLoading(true)
    await Promise.all([fetchDivisiones(), fetchEventos()])
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

  async function fetchEventos() {
    const { data } = await supabase
      .from('eventos_financieros')
      .select('id, nombre, tipo, descripcion, division_id, estado, fecha, divisiones(nombre), cobranzas(estado, monto)')
      .order('created_at', { ascending: false })

    type DivJoin      = { nombre: string } | null
    type CobranzaJoin = Array<{ estado: string; monto: number | null }>

    const items: EventoItem[] = (data ?? []).map(e => {
      const cobrs   = (e.cobranzas as CobranzaJoin) ?? []
      const pagados = cobrs.filter(c => c.estado === 'pagado')
      return {
        id:              e.id,
        nombre:          e.nombre,
        tipo:            e.tipo as TipoEvento,
        descripcion:     e.descripcion,
        divisionId:      e.division_id,
        divisionNombre:  (e.divisiones as DivJoin)?.nombre ?? null,
        estado:          e.estado,
        fecha:           e.fecha,
        countPagados:    pagados.length,
        countPendientes: cobrs.filter(c => c.estado === 'pendiente').length,
        totalCobrado:    pagados.reduce((s, c) => s + (c.monto ?? 0), 0),
      }
    })

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
      await fetchEventos()
      volverALista()
    }
  }

  // ─── Modal nuevo evento ───────────────────────────────────────────────────────

  function abrirModal() {
    setForm({ nombre: '', tipo: 'recaudacion', divisionId: null, montoSugerido: '' })
    setErrorGuardado(null)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
    setErrorGuardado(null)
  }

  async function crearEvento(): Promise<boolean> {
    if (!session) return false

    const nombreTrim = form.nombre.trim()
    if (!nombreTrim) { setErrorGuardado('Ingresá un nombre para el evento.'); return false }
    if (form.tipo !== 'recaudacion' && !form.divisionId) {
      setErrorGuardado('Seleccioná una división.'); return false
    }

    setGuardando(true)
    setErrorGuardado(null)

    const { error } = await supabase.from('eventos_financieros').insert({
      nombre:      nombreTrim,
      tipo:        form.tipo,
      division_id: form.tipo !== 'recaudacion' ? form.divisionId : null,
      descripcion: form.montoSugerido.trim() || null,
      creado_por:  session.user.id,
    })

    if (error) {
      setErrorGuardado('Error al crear el evento: ' + error.message)
      setGuardando(false)
      return false
    }

    await fetchEventos()
    setGuardando(false)
    return true
  }

  return {
    loading,
    recargar:        fetchTodo,
    divisiones,
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
    guardando,
    errorGuardado,
    crearEvento,
  }
}
