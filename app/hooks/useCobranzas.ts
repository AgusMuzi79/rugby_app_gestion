import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { montoInicialCobranza } from '@/lib/montoSugerido'
import { filasAGuardar, parseMontoCobranza, type OriginalCobranza } from '@/lib/cobranzasGuardado'
import { fechaLocal } from '@/lib/fecha'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import {
  SELECT_DIVISIONES_EVENTO,
  divisionesDeEvento,
  etiquetaDivisiones,
  type DivisionRef,
  type EventoDivisionesRow,
} from './useEventos'

export type FormaDePago  = 'efectivo' | 'transferencia' | 'otro'
export type EstadoPago   = 'pagado' | 'pendiente'
export type PasoCobranzas = 'eventos' | 'jugadores'

export interface EventoFinanciero {
  id:             string
  tipo:           string
  nombre:         string
  descripcion:    string | null
  fecha:          string | null
  // Divisiones del manager en las que cobra este evento: las del evento que
  // son suyas, o todas las suyas si el evento es de todo el club.
  divisionIds:    string[]
  // Estadísticas de cobranza calculadas al cargar la lista (sobre esos jugadores)
  pctCobrado:     number
  countPagados:   number
  countJugadores: number
  montoCobrado:   number
}

export interface CobranzaJugador {
  jugadorId:      string
  nombre:         string
  divisionNombre: string | null  // sólo si el evento abarca más de una división del manager
  estado:         EstadoPago
  monto:          string         // string para TextInput
  formaDePago:    FormaDePago | null
}

export interface Resumen {
  cobrado:    number
  pagados:    number
  pendientes: number
}

export function useCobranzas() {
  const { session } = useAuthStore()

  const [loading, setLoading]             = useState(true)
  // Todas las divisiones del manager (profiles.divisiones), no sólo la primera.
  const [misDivisiones, setMisDivisiones] = useState<DivisionRef[]>([])
  const [sinDivision, setSinDivision]     = useState(false)

  const [eventos, setEventos]                     = useState<EventoFinanciero[]>([])
  const [eventoSeleccionado, setEventoSeleccionado] = useState<EventoFinanciero | null>(null)
  const [paso, setPaso]                           = useState<PasoCobranzas>('eventos')

  const [cargandoJugadores, setCargandoJugadores] = useState(false)
  const [jugadores, setJugadores]                 = useState<CobranzaJugador[]>([])

  const [guardando, setGuardando]   = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  // La lectura de pagos del evento falló: no se puede guardar (se pisarían los
  // pagos registrados con PENDIENTE).
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  // Falló la lectura del perfil o de la lista de eventos: no es "sin división"
  // ni "sin eventos activos".
  const [errorLista, setErrorLista] = useState<string | null>(null)
  // Estado en la base al abrir el evento, para guardar sólo lo que cambió.
  const originales = useRef(new Map<string, OriginalCobranza>())

  const resumen: Resumen = {
    cobrado:    jugadores.filter(j => j.estado === 'pagado').reduce((s, j) => s + (parseMontoCobranza(j.monto) ?? 0), 0),
    pagados:    jugadores.filter(j => j.estado === 'pagado').length,
    pendientes: jugadores.filter(j => j.estado === 'pendiente').length,
  }

  // Clave estable para el efecto de foco (el array cambia de identidad en cada render).
  const misIdsKey = misDivisiones.map(d => d.id).join(',')

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  useFocusEffect(
    useCallback(() => {
      if (session && misIdsKey) cargarEventos(misIdsKey.split(','))
    }, [session, misIdsKey]),
  )

  // ─── Carga inicial ─────────────────────────────────────────────────────────

  async function fetchDatos() {
    if (!session) return
    setLoading(true)
    setErrorLista(null)

    const { data: profile, error: errorProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    // Un error al leer el perfil no es "sin división": se informa con reintento.
    if (errorProfile) {
      setErrorLista(mensajeErrorCarga('las divisiones asignadas',errorProfile))
      setLoading(false)
      return
    }

    const ids = (profile?.divisiones as string[] | null) ?? []
    if (ids.length === 0) { setSinDivision(true); setLoading(false); return }
    setSinDivision(false)

    const [divRes] = await Promise.all([
      supabase.from('divisiones').select('id, nombre').in('id', ids),
      cargarEventos(ids),
    ])
    if (divRes.error) {
      setErrorLista(mensajeErrorCarga('las divisiones asignadas',divRes.error))
    } else {
      setMisDivisiones(
        (divRes.data ?? [])
          .map(d => ({ id: d.id, nombre: d.nombre }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
      )
    }
    setLoading(false)
  }

  // Eventos activos de todo el club o que incluyen alguna división del manager.
  // La RLS ya acota la lista; acá además se descartan los que el manager creó
  // sólo para divisiones ajenas (no tiene jugadores a quienes cobrarles).
  // Un error de lectura se muestra como error, no como "Sin eventos activos".
  async function cargarEventos(misIds: string[]) {
    const { data: eventosData, error: errorEventos } = await supabase
      .from('eventos_financieros')
      .select(`id, tipo, nombre, descripcion, fecha, ${SELECT_DIVISIONES_EVENTO}`)
      .eq('estado', 'activo')
      .order('fecha', { ascending: false, nullsFirst: false })

    if (errorEventos) { setErrorLista(mensajeErrorCarga('los eventos', errorEventos)); return }

    type Fila = EventoDivisionesRow & {
      id: string; tipo: string; nombre: string; descripcion: string | null; fecha: string | null
    }

    const candidatos = ((eventosData ?? []) as unknown as Fila[])
      .map(e => {
        const divsEvento  = divisionesDeEvento(e).map(d => d.id)
        const divisionIds = divsEvento.length === 0
          ? misIds
          : divsEvento.filter(id => misIds.includes(id))
        return { e, divisionIds }
      })
      .filter(x => x.divisionIds.length > 0)

    if (candidatos.length === 0) {
      setEventos([])
      setErrorLista(null)
      return
    }

    const eventoIds = candidatos.map(x => x.e.id)

    const [cobranzasRes, jugadoresRes] = await Promise.all([
      supabase
        .from('cobranzas')
        .select('evento_financiero_id, jugador_id, estado, monto')
        .in('evento_financiero_id', eventoIds),
      supabase
        .from('jugadores')
        .select('id, division_id')
        .in('division_id', misIds)
        .eq('activo', true),
    ])

    const errorLectura = primerError(cobranzasRes.error, jugadoresRes.error)
    if (errorLectura) { setErrorLista(mensajeErrorCarga('los eventos', errorLectura)); return }
    setErrorLista(null)

    const divisionDeJugador = new Map((jugadoresRes.data ?? []).map(j => [j.id, j.division_id]))
    const cobranzas = cobranzasRes.data ?? []

    setEventos(
      candidatos.map(({ e, divisionIds }) => {
        // Mismo conjunto de jugadores que se muestra al abrir el evento.
        const enEvento = (jugadorId: string) => {
          const div = divisionDeJugador.get(jugadorId)
          return div !== undefined && divisionIds.includes(div)
        }
        const countJugadores = Array.from(divisionDeJugador.keys()).filter(enEvento).length
        const pagadas = cobranzas.filter(c =>
          c.evento_financiero_id === e.id && c.estado === 'pagado' && enEvento(c.jugador_id),
        )
        return {
          id:             e.id,
          tipo:           e.tipo,
          nombre:         e.nombre,
          descripcion:    e.descripcion,
          fecha:          e.fecha,
          divisionIds,
          pctCobrado:     countJugadores > 0
            ? Math.round((pagadas.length / countJugadores) * 100)
            : 0,
          countPagados:   pagadas.length,
          countJugadores,
          montoCobrado:   pagadas.reduce((s, c) => s + Number(c.monto ?? 0), 0),
        }
      }),
    )
  }

  // ─── Selección de evento ───────────────────────────────────────────────────

  async function seleccionarEvento(ev: EventoFinanciero) {
    if (ev.divisionIds.length === 0) return
    setEventoSeleccionado(ev)
    setGuardadoOk(false)
    setError(null)
    setErrorCarga(null)
    setCargandoJugadores(true)
    setPaso('jugadores')

    // Sólo jugadores de las divisiones del evento que son del manager
    // (la RLS de cobranzas rechaza a cualquier otro).
    const [jgsRes, cobranzasRes] = await Promise.all([
      supabase
        .from('jugadores')
        .select('id, nombre_completo, division_id')
        .in('division_id', ev.divisionIds)
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('cobranzas')
        .select('jugador_id, estado, monto, forma_de_pago, fecha_pago, registrado_por')
        .eq('evento_financiero_id', ev.id),
    ])

    if (jgsRes.error || cobranzasRes.error) {
      originales.current = new Map()
      setJugadores([])
      setErrorCarga('No se pudieron cargar los pagos de este evento. Revisá la conexión y reintentá.')
      setCargandoJugadores(false)
      return
    }

    const mapa             = new Map((cobranzasRes.data ?? []).map(c => [c.jugador_id, c]))
    const variasDivisiones = ev.divisionIds.length > 1
    const nombreDivision   = new Map(misDivisiones.map(d => [d.id, d.nombre]))

    const filas: CobranzaJugador[] = (jgsRes.data ?? []).map(j => {
      const c = mapa.get(j.id)
      return {
        jugadorId:      j.id,
        nombre:         j.nombre_completo,
        divisionNombre: variasDivisiones ? (nombreDivision.get(j.division_id) ?? null) : null,
        estado:         (c?.estado as EstadoPago) ?? 'pendiente',
        monto:          montoInicialCobranza(c?.monto, ev.descripcion),
        formaDePago:    (c?.forma_de_pago as FormaDePago | null) ?? null,
      }
    })
    originales.current = new Map(filas.map(f => {
      const c = mapa.get(f.jugadorId)
      return [f.jugadorId, {
        estado:        f.estado,
        monto:         f.monto,
        formaDePago:   f.formaDePago,
        fechaPago:     (c?.fecha_pago as string | null) ?? null,
        registradoPor: (c?.registrado_por as string | null) ?? null,
      }]
    }))
    setJugadores(filas)

    setCargandoJugadores(false)
  }

  function reintentarCarga() {
    if (eventoSeleccionado) seleccionarEvento(eventoSeleccionado)
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

  // Guarda sólo las filas que cambiaron desde que se abrió el evento (o sólo
  // un jugador, desde el modal). Devuelve true si quedó todo guardado.
  async function guardarCobranzas(soloJugadorId?: string): Promise<boolean> {
    if (!session || !eventoSeleccionado) return false
    if (errorCarga) { setError(errorCarga); return false }
    setGuardadoOk(false)
    setError(null)

    const { filas, errores } = filasAGuardar(jugadores, originales.current, {
      eventoId: eventoSeleccionado.id,
      userId:   session.user.id,
      hoy:      fechaLocal(),
      soloJugadorId,
    })
    if (errores.length > 0) { setError(errores.join('\n')); return false }
    if (filas.length === 0) { setGuardadoOk(true); return true }

    setGuardando(true)
    const { error: dbErr } = await supabase
      .from('cobranzas')
      .upsert(filas, { onConflict: 'evento_financiero_id,jugador_id' })

    if (dbErr) {
      setError('Error al guardar: ' + dbErr.message)
      setGuardando(false)
      return false
    }

    for (const f of filas) {
      originales.current.set(f.jugador_id, {
        estado:        f.estado,
        monto:         f.monto != null ? String(f.monto) : '',
        formaDePago:   f.forma_de_pago,
        fechaPago:     f.fecha_pago,
        registradoPor: f.registrado_por,
      })
    }
    setGuardadoOk(true)
    setGuardando(false)
    return true
  }

  return {
    loading,
    divisionNombre: etiquetaDivisiones(misDivisiones) ?? '',
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
    errorCarga,
    errorLista,
    recargar: fetchDatos,
    reintentarCarga,
    seleccionarEvento,
    volverAEventos,
    toggleEstado,
    actualizarMonto,
    actualizarFormaDePago,
    guardarCobranzas,
  }
}
