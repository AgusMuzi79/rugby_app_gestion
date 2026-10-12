import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  balanceDesdeResumen,
  fechaHoyEgreso,
  validarEgreso,
  type BalanceEvento,
  type EgresoForm,
} from '@/lib/balanceEvento'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import {
  SELECT_DIVISIONES_EVENTO,
  TIPOS_MANAGER,
  divisionesDeEvento,
  etiquetaDivisiones,
  type EventoDivisionesRow,
  type TipoEvento,
} from './useEventos'

// Viajes / tercer tiempos que el Manager ve (la RLS aplica: los que creó o que
// incluyen alguna división suya).
export interface EventoEgresos {
  id:             string
  nombre:         string
  tipo:           TipoEvento
  estado:         string
  fecha:          string | null
  divisionNombre: string | null
}

export interface Egreso {
  id:       string
  concepto: string
  monto:    number
  fecha:    string
}

// Lo mínimo que necesita el detalle de egresos de un evento.
export interface EventoEgresosRef {
  id:     string
  estado: string
}

const BALANCE_VACIO: BalanceEvento = { totalCobrado: 0, totalEgresos: 0, neto: 0 }

const ERROR_CARGA_EVENTOS = 'No se pudieron cargar los eventos. Intentá de nuevo.'
const ERROR_CARGA_DETALLE = 'No se pudieron cargar los egresos. Intentá de nuevo.'

function formVacio(): EgresoForm {
  return { concepto: '', monto: '', fecha: fechaHoyEgreso() }
}

// ─── Egresos + resumen de UN evento (Manager y Subcomisión) ──────────────────
// La RLS de egresos_evento decide quién carga / borra: Manager en sus viajes /
// tercer tiempos activos, Subcomisión en sus recaudaciones activas. El resumen
// (Cobrado / Egresos / Neto) sale de la RPC resumen_egresos_evento.

export function useEgresosEvento(evento: EventoEgresosRef | null) {
  const [cargando, setCargando]     = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [egresos, setEgresos]       = useState<Egreso[]>([])
  const [balance, setBalance]       = useState<BalanceEvento>(BALANCE_VACIO)

  const [form, setForm]                   = useState<EgresoForm>(formVacio())
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [borrandoId, setBorrandoId]       = useState<string | null>(null)

  const eventoId = evento?.id ?? null
  const editable = evento?.estado === 'activo'

  // Evita pisar el detalle de otro evento con una respuesta vieja.
  const ultimoPedido = useRef<string | null>(null)

  useEffect(() => {
    setForm(formVacio())
    setErrorGuardado(null)
    if (eventoId) recargar()
    else {
      setEgresos([])
      setBalance(BALANCE_VACIO)
    }
  }, [eventoId])

  async function recargar() {
    const id = eventoId
    if (!id) return
    ultimoPedido.current = id
    setCargando(true)
    setErrorCarga(null)

    const [egresosRes, resumenRes] = await Promise.all([
      supabase
        .from('egresos_evento')
        .select('id, concepto, monto, fecha')
        .eq('evento_financiero_id', id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.rpc('resumen_egresos_evento', { p_evento_id: id }),
    ])
    if (ultimoPedido.current !== id) return

    if (egresosRes.error || resumenRes.error) {
      setErrorCarga(ERROR_CARGA_DETALLE)
      setEgresos([])
      setBalance(BALANCE_VACIO)
      setCargando(false)
      return
    }

    setEgresos((egresosRes.data ?? []).map(e => ({
      id:       e.id,
      concepto: e.concepto,
      monto:    Number(e.monto),
      fecha:    e.fecha,
    })))
    setBalance(balanceDesdeResumen(resumenRes.data?.[0]))
    setCargando(false)
  }

  async function agregarEgreso(): Promise<boolean> {
    if (!eventoId) return false
    if (!editable) {
      setErrorGuardado('El evento está cerrado: no se pueden cargar egresos.')
      return false
    }
    const r = validarEgreso(form)
    if (!r.ok) {
      setErrorGuardado(r.error)
      return false
    }

    setGuardando(true)
    setErrorGuardado(null)
    const { error } = await supabase.from('egresos_evento').insert({
      evento_financiero_id: eventoId,
      concepto:             r.valor.concepto,
      monto:                r.valor.monto,
      fecha:                r.valor.fecha,
    })
    setGuardando(false)

    if (error) {
      setErrorGuardado('No se pudo guardar el egreso: ' + error.message)
      return false
    }
    setForm(formVacio())
    await recargar()
    return true
  }

  // false si no se borró (error o 0 filas por RLS: evento cerrado o ajeno).
  async function borrarEgreso(id: string): Promise<boolean> {
    if (!eventoId || !editable) return false
    setBorrandoId(id)
    setErrorGuardado(null)
    const { data, error } = await supabase.from('egresos_evento').delete().eq('id', id).select('id')
    setBorrandoId(null)

    if (error || !data || data.length === 0) {
      setErrorGuardado(error ? 'No se pudo borrar el egreso: ' + error.message : 'No se pudo borrar el egreso.')
      await recargar()
      return false
    }
    await recargar()
    return true
  }

  return {
    cargando,
    errorCarga,
    recargar,
    editable,
    egresos,
    balance,
    form,
    setForm,
    guardando,
    errorGuardado,
    agregarEgreso,
    borrandoId,
    borrarEgreso,
  }
}

export type EgresosEventoState = ReturnType<typeof useEgresosEvento>

// ─── Manager: pestaña Egresos (elige entre sus viajes / tercer tiempos) ──────

export function useEgresos() {
  const { session } = useAuthStore()

  const [loading, setLoading]       = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [eventos, setEventos]       = useState<EventoEgresos[]>([])
  const [eventoId, setEventoId]     = useState<string | null>(null)

  const eventoSeleccionado = eventos.find(e => e.id === eventoId) ?? null
  const detalle            = useEgresosEvento(eventoSeleccionado)

  useEffect(() => {
    if (session) fetchEventos()
    else setLoading(false)
  }, [session])
  useRefreshOnFocus(() => { fetchEventos(true) })

  async function fetchEventos(refrescarDetalle = false) {
    if (!session) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErrorCarga(null)

    const { data, error } = await supabase
      .from('eventos_financieros')
      .select(`id, nombre, tipo, estado, fecha, ${SELECT_DIVISIONES_EVENTO}`)
      .in('tipo', TIPOS_MANAGER)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorCarga(ERROR_CARGA_EVENTOS)
      setLoading(false)
      return
    }

    type Fila = EventoDivisionesRow & {
      id: string; nombre: string; tipo: string; estado: string; fecha: string | null
    }
    const items: EventoEgresos[] = ((data ?? []) as unknown as Fila[]).map(e => ({
      id:             e.id,
      nombre:         e.nombre,
      tipo:           e.tipo as TipoEvento,
      estado:         e.estado,
      fecha:          e.fecha,
      divisionNombre: etiquetaDivisiones(divisionesDeEvento(e)),
    }))
    // Activos primero; dentro de cada grupo se mantiene el orden por creación.
    items.sort((a, b) => Number(b.estado === 'activo') - Number(a.estado === 'activo'))

    setEventos(items)
    setLoading(false)

    // Mantiene el evento elegido si sigue visible; si no, el primero.
    const siguiente = items.find(e => e.id === eventoId)?.id ?? items[0]?.id ?? null
    setEventoId(siguiente)
    // Mismo evento: el efecto de useEgresosEvento no se dispara, refrescar a mano.
    if (refrescarDetalle && siguiente && siguiente === eventoId) await detalle.recargar()
  }

  function seleccionarEvento(id: string) {
    setEventoId(id)
  }

  return {
    loading,
    errorCarga: errorCarga ?? detalle.errorCarga,
    recargar:   () => fetchEventos(true),
    eventos,
    eventoSeleccionado,
    seleccionarEvento,
    detalle,
  }
}
