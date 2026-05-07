import { useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export type FormaDePago  = 'efectivo' | 'transferencia' | 'otro'
export type EstadoPago   = 'pagado' | 'pendiente'
export type PasoCobranzas = 'eventos' | 'jugadores'

export interface EventoFinanciero {
  id:          string
  tipo:        string
  nombre:      string
  descripcion: string | null
  fecha:       string | null
}

export interface CobranzaJugador {
  jugadorId:   string
  nombre:      string
  estado:      EstadoPago
  monto:       string         // string para TextInput
  formaDePago: FormaDePago | null
}

export interface Resumen {
  cobrado:    number
  pagados:    number
  pendientes: number
}

function fechaHoy(): string {
  return new Date().toISOString().split('T')[0]
}

function parseMonto(str: string): number | null {
  if (!str.trim()) return null
  const n = parseFloat(str.replace(',', '.'))
  return isNaN(n) ? null : n
}

export function useCobranzas() {
  const { session } = useAuthStore()

  const [loading, setLoading]             = useState(true)
  const [divisionId, setDivisionId]       = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
  const [sinDivision, setSinDivision]     = useState(false)

  const [eventos, setEventos]                     = useState<EventoFinanciero[]>([])
  const [eventoSeleccionado, setEventoSeleccionado] = useState<EventoFinanciero | null>(null)
  const [paso, setPaso]                           = useState<PasoCobranzas>('eventos')

  const [cargandoJugadores, setCargandoJugadores] = useState(false)
  const [jugadores, setJugadores]                 = useState<CobranzaJugador[]>([])

  const [guardando, setGuardando]   = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const resumen: Resumen = {
    cobrado:    jugadores.filter(j => j.estado === 'pagado').reduce((s, j) => s + (parseMonto(j.monto) ?? 0), 0),
    pagados:    jugadores.filter(j => j.estado === 'pagado').length,
    pendientes: jugadores.filter(j => j.estado === 'pendiente').length,
  }

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  useFocusEffect(
    useCallback(() => {
      if (session && divisionId) cargarEventos(divisionId)
    }, [session, divisionId]),
  )

  // ─── Carga inicial ─────────────────────────────────────────────────────────

  async function fetchDatos() {
    if (!session) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divId = (profile?.divisiones as string[] | null)?.[0] ?? null
    if (!divId) { setSinDivision(true); setLoading(false); return }
    setDivisionId(divId)

    const [divRes] = await Promise.all([
      supabase.from('divisiones').select('nombre').eq('id', divId).single(),
      cargarEventos(divId),
    ])
    setDivisionNombre(divRes.data?.nombre ?? '')
    setLoading(false)
  }

  async function cargarEventos(divId: string) {
    const { data } = await supabase
      .from('eventos_financieros')
      .select('id, tipo, nombre, descripcion, fecha')
      .eq('estado', 'activo')
      .or(`division_id.eq.${divId},division_id.is.null`)
      .order('fecha', { ascending: false, nullsFirst: false })

    setEventos(
      (data ?? []).map(e => ({
        id:          e.id,
        tipo:        e.tipo,
        nombre:      e.nombre,
        descripcion: e.descripcion,
        fecha:       e.fecha,
      })),
    )
  }

  // ─── Selección de evento ───────────────────────────────────────────────────

  async function seleccionarEvento(ev: EventoFinanciero) {
    if (!divisionId) return
    setEventoSeleccionado(ev)
    setGuardadoOk(false)
    setError(null)
    setCargandoJugadores(true)
    setPaso('jugadores')

    const [jgsRes, cobranzasRes] = await Promise.all([
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', divisionId)
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('cobranzas')
        .select('jugador_id, estado, monto, forma_de_pago')
        .eq('evento_financiero_id', ev.id),
    ])

    const mapa = new Map((cobranzasRes.data ?? []).map(c => [c.jugador_id, c]))

    setJugadores(
      (jgsRes.data ?? []).map(j => {
        const c = mapa.get(j.id)
        return {
          jugadorId:   j.id,
          nombre:      j.nombre_completo,
          estado:      (c?.estado as EstadoPago) ?? 'pendiente',
          monto:       c?.monto != null ? String(c.monto) : '',
          formaDePago: (c?.forma_de_pago as FormaDePago | null) ?? null,
        }
      }),
    )

    setCargandoJugadores(false)
  }

  function volverAEventos() {
    setPaso('eventos')
    setGuardadoOk(false)
    setError(null)
  }

  // ─── Edición inline ────────────────────────────────────────────────────────

  function toggleEstado(jugadorId: string) {
    setGuardadoOk(false)
    setJugadores(prev =>
      prev.map(j =>
        j.jugadorId !== jugadorId ? j
          : { ...j, estado: j.estado === 'pagado' ? 'pendiente' : 'pagado' },
      ),
    )
  }

  function actualizarMonto(jugadorId: string, monto: string) {
    setGuardadoOk(false)
    setJugadores(prev => prev.map(j => j.jugadorId === jugadorId ? { ...j, monto } : j))
  }

  function actualizarFormaDePago(jugadorId: string, forma: FormaDePago) {
    setGuardadoOk(false)
    setJugadores(prev =>
      prev.map(j =>
        j.jugadorId !== jugadorId ? j
          : { ...j, formaDePago: j.formaDePago === forma ? null : forma },
      ),
    )
  }

  // ─── Guardar ───────────────────────────────────────────────────────────────

  async function guardarCobranzas() {
    if (!session || !eventoSeleccionado) return
    setGuardando(true)
    setError(null)

    const rows = jugadores.map(j => ({
      evento_financiero_id: eventoSeleccionado.id,
      jugador_id:           j.jugadorId,
      estado:               j.estado,
      monto:                j.estado === 'pagado' ? parseMonto(j.monto) : null,
      forma_de_pago:        j.estado === 'pagado' ? j.formaDePago : null,
      fecha_pago:           j.estado === 'pagado' ? fechaHoy() : null,
      registrado_por:       session.user.id,
    }))

    const { error: dbErr } = await supabase
      .from('cobranzas')
      .upsert(rows, { onConflict: 'evento_financiero_id,jugador_id' })

    if (dbErr) {
      setError('Error al guardar: ' + dbErr.message)
      setGuardando(false)
      return
    }

    setGuardadoOk(true)
    setGuardando(false)
  }

  return {
    loading,
    divisionNombre,
    sinDivision,
    eventos,
    eventoSeleccionado,
    paso,
    cargandoJugadores,
    jugadores,
    resumen,
    guardando,
    guardadoOk,
    error,
    seleccionarEvento,
    volverAEventos,
    toggleEstado,
    actualizarMonto,
    actualizarFormaDePago,
    guardarCobranzas,
  }
}
