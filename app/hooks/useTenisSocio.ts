import { useCallback, useEffect, useRef, useState } from 'react'
import {
  parsearDisponibilidad, parsearMisReservas, parsearResultadoReserva,
  type Disponibilidad, type JugadorBuscado, type JugadorEntrada, type MiReserva, type Modalidad, type ResultadoReserva,
} from '@/lib/tenis'
import { ERROR_CARGA_TENIS, rpcTenis, type ResultadoTenis } from './useTenisRpc'

// Reservas de tenis del socio (sección Tenis de la Agenda): la grilla del día
// elegido (`tenis_disponibilidad`, sin nombres de otros) y sus reservas
// (`tenis_mis_reservas`). Reservar, editar y cancelar recargan las dos.

export function useTenisSocio(fecha: string) {
  const [disp,     setDisp]     = useState<Disponibilidad | null>(null)
  const [reservas, setReservas] = useState<MiReserva[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Sólo vale la respuesta del último pedido: si el socio cambia de día
  // mientras carga, la respuesta tardía del día anterior se descarta.
  const pedido = useRef(0)

  const refetch = useCallback(async () => {
    const n = ++pedido.current
    setLoading(true)
    const [d, mis] = await Promise.all([
      rpcTenis('tenis_disponibilidad', { p_fecha: fecha }, ERROR_CARGA_TENIS),
      rpcTenis('tenis_mis_reservas', {}, ERROR_CARGA_TENIS),
    ])
    if (n !== pedido.current) return
    if (!d.ok) {
      setError(d.mensaje)
    } else {
      setDisp(parsearDisponibilidad(d.data))
      setReservas(mis.ok ? parsearMisReservas(mis.data) : [])
      setError(mis.ok ? null : mis.mensaje)
    }
    setLoading(false)
  }, [fecha])

  // Otro día: no se muestra la grilla del anterior mientras carga.
  useEffect(() => {
    setDisp(null)
    refetch()
  }, [refetch])

  const reservar = useCallback(async (args: {
    canchaId: string; inicio: string; modalidad: Modalidad; jugadores: JugadorEntrada[]
  }): Promise<ResultadoTenis<ResultadoReserva>> => {
    const r = await rpcTenis('tenis_reservar', {
      p_cancha_id: args.canchaId, p_inicio: args.inicio, p_modalidad: args.modalidad, p_jugadores: args.jugadores,
    }, 'No se pudo hacer la reserva. Probá de nuevo.')
    if (!r.ok) return r
    const res = parsearResultadoReserva(r.data)
    refetch()
    return res ? { ok: true, data: res } : { ok: false, mensaje: 'La reserva se hizo pero no se pudo leer el detalle. Mirala en Mis reservas.' }
  }, [refetch])

  // El titular cambia su reserva (`tenis_editar_reserva`): mismo turno nuevo,
  // jugadores y respuesta que reservar; la reserva conserva su id.
  const editar = useCallback(async (reservaId: string, args: {
    canchaId: string; inicio: string; modalidad: Modalidad; jugadores: JugadorEntrada[]
  }): Promise<ResultadoTenis<ResultadoReserva>> => {
    const r = await rpcTenis('tenis_editar_reserva', {
      p_reserva_id: reservaId, p_cancha_id: args.canchaId, p_inicio: args.inicio,
      p_modalidad: args.modalidad, p_jugadores: args.jugadores,
    }, 'No se pudo cambiar la reserva. Probá de nuevo.')
    if (!r.ok) return r
    const res = parsearResultadoReserva(r.data)
    refetch()
    return res ? { ok: true, data: res } : { ok: false, mensaje: 'La reserva se cambió pero no se pudo leer el detalle. Mirala en Mis reservas.' }
  }, [refetch])

  const cancelar = useCallback(async (reservaId: string, motivo: string | null): Promise<ResultadoTenis<null>> => {
    const r = await rpcTenis('tenis_cancelar', { p_reserva_id: reservaId, p_motivo: motivo }, 'No se pudo cancelar la reserva. Probá de nuevo.')
    if (!r.ok) return r
    await refetch()
    return { ok: true, data: null }
  }, [refetch])

  return { disp, reservas, loading, error, refetch, reservar, editar, cancelar }
}

// Búsqueda de jugadores del padrón (`tenis_buscar_jugadores`): socios
// activos no suspendidos, hasta 20, con nombre y número de socio.
export async function buscarJugadoresTenis(q: string): Promise<ResultadoTenis<JugadorBuscado[]>> {
  const r = await rpcTenis('tenis_buscar_jugadores', { p_q: q }, 'No se pudo buscar. Probá de nuevo.')
  if (!r.ok) return r
  const lista = Array.isArray(r.data) ? r.data : []
  return {
    ok: true,
    data: lista.flatMap(j => {
      if (!j || typeof j !== 'object') return []
      const o = j as Record<string, unknown>
      if (typeof o.socio_id !== 'string') return []
      return [{
        socio_id:     o.socio_id,
        nombre:       typeof o.nombre === 'string' ? o.nombre : '—',
        numero_socio: typeof o.numero_socio === 'string' || typeof o.numero_socio === 'number' ? o.numero_socio : null,
      }]
    }),
  }
}

// Mis reservas de tenis para la Agenda del socio (`tenis_mis_reservas`), sin
// la grilla. `activo` = FEATURES.tenis: apagado no pide nada.
export function useMisReservasTenis(activo: boolean) {
  const [reservas, setReservas] = useState<MiReserva[]>([])
  const [loading,  setLoading]  = useState(activo)
  const [error,    setError]    = useState<string | null>(null)
  const pedido = useRef(0)

  const refetch = useCallback(async () => {
    if (!activo) return
    const n = ++pedido.current
    setLoading(true)
    const r = await rpcTenis('tenis_mis_reservas', {}, 'No se pudieron cargar tus turnos de tenis.')
    if (n !== pedido.current) return
    if (r.ok) { setReservas(parsearMisReservas(r.data)); setError(null) } else setError(r.mensaje)
    setLoading(false)
  }, [activo])

  useEffect(() => { refetch() }, [refetch])

  const cancelar = useCallback(async (reservaId: string): Promise<ResultadoTenis<null>> => {
    const r = await rpcTenis('tenis_cancelar', { p_reserva_id: reservaId, p_motivo: null }, 'No se pudo cancelar la reserva. Probá de nuevo.')
    if (!r.ok) return r
    await refetch()
    return { ok: true, data: null }
  }, [refetch])

  return { reservas, loading, error, refetch, cancelar }
}
