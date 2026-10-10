import { useState, useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  balanceEvento,
  fechaHoyEgreso,
  validarEgreso,
  type BalanceEvento,
  type CobranzaBalance,
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

// egresos_evento (migración 20261017000000) todavía no está en database.types.ts:
// se accede sin tipos generados hasta regenerarlos tras aplicar la migración.
const db = supabase as unknown as SupabaseClient

// Viajes / tercer tiempos que el Manager ve (la RLS aplica: los que creó o que
// incluyen alguna división suya). Egresos: sólo se cargan / borran con el
// evento activo (misma regla que la RLS de egresos_evento).
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

const BALANCE_VACIO: BalanceEvento = { totalCobrado: 0, totalEgresos: 0, neto: 0 }

const ERROR_CARGA_EVENTOS = 'No se pudieron cargar los eventos. Intentá de nuevo.'
const ERROR_CARGA_DETALLE = 'No se pudieron cargar los egresos. Intentá de nuevo.'

function formVacio(): EgresoForm {
  return { concepto: '', monto: '', fecha: fechaHoyEgreso() }
}

export function useEgresos() {
  const { session } = useAuthStore()

  const [loading, setLoading]       = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [eventos, setEventos]       = useState<EventoEgresos[]>([])
  const [eventoId, setEventoId]     = useState<string | null>(null)

  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [egresos, setEgresos]                 = useState<Egreso[]>([])
  const [balance, setBalance]                 = useState<BalanceEvento>(BALANCE_VACIO)

  const [form, setForm]                   = useState<EgresoForm>(formVacio())
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [borrandoId, setBorrandoId]       = useState<string | null>(null)

  const eventoSeleccionado = eventos.find(e => e.id === eventoId) ?? null
  const editable           = eventoSeleccionado?.estado === 'activo'

  useEffect(() => {
    if (session) fetchEventos()
    else setLoading(false)
  }, [session])
  useRefreshOnFocus(() => { fetchEventos() })

  // ─── Eventos ────────────────────────────────────────────────────────────────

  async function fetchEventos() {
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
    if (siguiente) await fetchDetalle(siguiente)
    else {
      setEgresos([])
      setBalance(BALANCE_VACIO)
    }
  }

  // ─── Detalle: egresos + cobranzas pagadas ───────────────────────────────────

  async function fetchDetalle(id: string) {
    setCargandoDetalle(true)
    setErrorCarga(null)

    const [egresosRes, cobranzasRes] = await Promise.all([
      db
        .from('egresos_evento')
        .select('id, concepto, monto, fecha')
        .eq('evento_financiero_id', id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('cobranzas')
        .select('estado, monto')
        .eq('evento_financiero_id', id)
        .eq('estado', 'pagado'),
    ])

    if (egresosRes.error || cobranzasRes.error) {
      setErrorCarga(ERROR_CARGA_DETALLE)
      setEgresos([])
      setBalance(BALANCE_VACIO)
      setCargandoDetalle(false)
      return
    }

    type EgresoRow = { id: string; concepto: string; monto: number | string; fecha: string }
    const lista: Egreso[] = ((egresosRes.data ?? []) as EgresoRow[]).map(e => ({
      id:       e.id,
      concepto: e.concepto,
      monto:    typeof e.monto === 'number' ? e.monto : parseFloat(e.monto),
      fecha:    e.fecha,
    }))

    setEgresos(lista)
    setBalance(balanceEvento((cobranzasRes.data ?? []) as CobranzaBalance[], lista))
    setCargandoDetalle(false)
  }

  function seleccionarEvento(id: string) {
    if (id === eventoId) return
    setEventoId(id)
    setForm(formVacio())
    setErrorGuardado(null)
    fetchDetalle(id)
  }

  // ─── Alta / baja ────────────────────────────────────────────────────────────

  async function agregarEgreso(): Promise<boolean> {
    if (!eventoSeleccionado) return false
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
    const { error } = await db.from('egresos_evento').insert({
      evento_financiero_id: eventoSeleccionado.id,
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
    await fetchDetalle(eventoSeleccionado.id)
    return true
  }

  async function borrarEgreso(id: string): Promise<boolean> {
    if (!eventoSeleccionado || !editable) return false
    setBorrandoId(id)
    setErrorGuardado(null)
    // .select() para distinguir "borrado" de "0 filas" (RLS: evento cerrado o ajeno).
    const { data, error } = await db.from('egresos_evento').delete().eq('id', id).select('id')
    setBorrandoId(null)

    if (error || !data || data.length === 0) {
      setErrorGuardado(error ? 'No se pudo borrar el egreso: ' + error.message : 'No se pudo borrar el egreso.')
      await fetchEventos()
      return false
    }
    await fetchDetalle(eventoSeleccionado.id)
    return true
  }

  return {
    loading,
    errorCarga,
    recargar: fetchEventos,
    eventos,
    eventoSeleccionado,
    seleccionarEvento,
    editable,
    cargandoDetalle,
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
