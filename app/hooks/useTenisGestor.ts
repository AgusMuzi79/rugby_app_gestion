import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { FEATURES } from '@/constants/features'
import {
  esGestorTenis, parsearAjustesCobro, parsearCheckin, parsearComprobantes, parsearDisponibilidad, parsearResultadoReserva, parsearSanciones,
  type AjusteCobro, type Checkin, type ComprobantePendiente, type Disponibilidad, type Infraccion, type JugadorEntrada, type Modalidad, type Suspension,
  type ResultadoReserva, type TenisConfig, type TipoBloque,
} from '@/lib/tenis'

export type { AjusteCobro, Checkin, ComprobantePendiente, Infraccion, Suspension } from '@/lib/tenis'
import type { BloqueEditable } from '@/lib/tenisGestion'
import { ERROR_CARGA_TENIS, gestionTenis, rpcTenis, type ResultadoTenis } from './useTenisRpc'

// Gestión de canchas de tenis (pestaña Canchas de Subcomisión) y lo que
// comparte con el Canchero: la grilla con jugadores (`tenis_grilla`), cobros,
// corrección de jugadores y extensiones. Cada RPC chequea el rol en la base
// (`es_gestor_tenis()` / `es_canchero()`); acá sólo se decide qué mostrar.

// ─── ¿Es gestor? ──────────────────────────────────────────────────────────────

// null mientras carga. Con FEATURES.tenis apagado no consulta y da false.
export function useEsGestorTenis(): boolean | null {
  const userId = useAuthStore(s => s.session?.user.id)
  const roles  = useAuthStore(s => s.roles)
  const [deporte, setDeporte] = useState<string | null | undefined>(undefined)

  // Otra cuenta (cerrar sesión y entrar con otra): el deporte de la anterior
  // no vale, se vuelve a "cargando" hasta leer el de la nueva.
  useEffect(() => {
    setDeporte(undefined)
    if (!FEATURES.tenis || !userId) return
    let vigente = true
    supabase.from('profiles').select('deporte').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (vigente) setDeporte(data?.deporte ?? null) }, () => { if (vigente) setDeporte(null) })
    return () => { vigente = false }
  }, [userId])

  if (!FEATURES.tenis) return false
  if (roles.includes('admin')) return true
  if (deporte === undefined) return null
  return esGestorTenis({ roles, deporte })
}

// ─── Grilla del día ───────────────────────────────────────────────────────────

export function useTenisGrilla(fecha: string) {
  const [grilla,  setGrilla]  = useState<Disponibilidad | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Sólo vale la respuesta del último pedido (cambio de día mientras carga).
  const pedido = useRef(0)

  const refetch = useCallback(async () => {
    const n = ++pedido.current
    setLoading(true)
    const r = await rpcTenis('tenis_grilla', { p_fecha: fecha }, ERROR_CARGA_TENIS)
    if (n !== pedido.current) return
    if (r.ok) { setGrilla(parsearDisponibilidad(r.data)); setError(null) } else setError(r.mensaje)
    setLoading(false)
  }, [fecha])

  useEffect(() => {
    setGrilla(null)
    refetch()
  }, [refetch])

  return { grilla, loading, error, refetch }
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

const ok = <T,>(data: T): ResultadoTenis<T> => ({ ok: true, data })

async function sinDatos(p: Promise<ResultadoTenis<unknown>>): Promise<ResultadoTenis<null>> {
  const r = await p
  return r.ok ? ok(null) : r
}

export type { BloqueEditable } from '@/lib/tenisGestion'

export const accionesTenis = {
  reservarStaff: async (a: {
    canchaId: string; inicio: string; modalidad: Modalidad; jugadores: JugadorEntrada[]; titular: JugadorEntrada
    comentario?: string | null
  }): Promise<ResultadoTenis<ResultadoReserva>> => {
    const r = await rpcTenis('tenis_reservar_staff', {
      p_cancha_id: a.canchaId, p_inicio: a.inicio, p_modalidad: a.modalidad,
      p_jugadores: a.jugadores, p_titular: a.titular, p_origen: 'telefonica', p_comentario: a.comentario ?? null,
    }, 'No se pudo hacer la reserva. Probá de nuevo.')
    if (!r.ok) return r
    const res = parsearResultadoReserva(r.data)
    return res ? ok(res) : { ok: false, mensaje: 'La reserva se hizo pero no se pudo leer el detalle. Recargá la grilla.' }
  },

  // Bloque fijo semanal (academia, profes), con fecha de fin opcional.
  bloqueGuardar: (b: BloqueEditable) =>
    sinDatos(rpcTenis('tenis_bloque_guardar', { p: { ...b, fecha: null } }, 'No se pudo guardar el bloque. Probá de nuevo.')),

  bloqueBorrar: (id: string) =>
    sinDatos(rpcTenis('tenis_bloque_borrar', { p_id: id }, 'No se pudo borrar el bloque. Probá de nuevo.')),

  // Bloqueo puntual (lluvia, mantenimiento, torneo): crea uno o, con `id`, edita
  // ese bloque puntual. Cancela las reservas que pisa y les avisa (push / mail),
  // por eso va por la Edge Function.
  bloqueoPuntual: async (a: {
    id?: string; canchaId: string | null; desde: string; hasta: string; tipo: TipoBloque; titulo: string
  }): Promise<ResultadoTenis<{ canceladas: number }>> => {
    const r = await gestionTenis({
      action: 'bloqueo-puntual', ...(a.id ? { id: a.id } : {}),
      cancha_id: a.canchaId, desde: a.desde, hasta: a.hasta, tipo: a.tipo, titulo: a.titulo,
    }, a.id ? 'No se pudo guardar el bloque. Probá de nuevo.' : 'No se pudo bloquear. Probá de nuevo.')
    if (!r.ok) return r
    const canceladas = Array.isArray(r.data.reservas_canceladas) ? r.data.reservas_canceladas.length : 0
    return ok({ canceladas })
  },

  configGuardar: (c: TenisConfig) =>
    sinDatos(rpcTenis('tenis_config_guardar', { p: c }, 'No se pudieron guardar las reglas. Probá de nuevo.')),

  verComprobante: async (reservaId: string): Promise<ResultadoTenis<{ url: string; esPdf: boolean }>> => {
    const r = await gestionTenis({ action: 'ver-comprobante', reserva_id: reservaId }, 'No se pudo abrir el comprobante.')
    if (!r.ok) return r
    const url = typeof r.data.url === 'string' ? r.data.url : null
    if (!url) return { ok: false, mensaje: 'No se pudo abrir el comprobante.' }
    return ok({ url, esPdf: r.data.tipo === 'pdf' || /\.pdf(\?|$)/i.test(url) })
  },

  // Rechazar manda un mail al invitado con el motivo.
  resolverComprobante: (reservaId: string, aprobado: boolean, motivo: string | null) =>
    sinDatos(gestionTenis(
      { action: 'resolver-comprobante', reserva_id: reservaId, aprobado, motivo },
      'No se pudo resolver el comprobante. Probá de nuevo.',
    )),

  infraccionCrear: (a: { socioId: string | null; invitadoId: string | null; reservaId: string | null; tipo: string; nota: string }) =>
    sinDatos(rpcTenis('tenis_infraccion_crear', {
      p_socio_id: a.socioId, p_invitado_id: a.invitadoId, p_reserva_id: a.reservaId, p_tipo: a.tipo, p_nota: a.nota,
    }, 'No se pudo registrar la infracción.')),

  infraccionPerdonar: (id: string) =>
    sinDatos(rpcTenis('tenis_infraccion_perdonar', { p_id: id }, 'No se pudo perdonar la infracción.')),

  suspender: (a: { socioId: string | null; invitadoId: string | null; dias: number; motivo: string }) =>
    sinDatos(rpcTenis('tenis_suspender', {
      p_socio_id: a.socioId, p_invitado_id: a.invitadoId, p_dias: a.dias, p_motivo: a.motivo,
    }, 'No se pudo suspender.')),

  suspensionLevantar: (id: string) =>
    sinDatos(rpcTenis('tenis_suspension_levantar', { p_id: id }, 'No se pudo levantar la suspensión.')),

  // Canchero y gestor.
  cobroMarcar: (jugadorId: string, cobrado: boolean) =>
    sinDatos(rpcTenis('tenis_cobro_marcar', { p_jugador_id: jugadorId, p_cobrado: cobrado }, 'No se pudo marcar el cobro.')),

  // `p_jugadores`: todos los jugadores menos el titular, como en tenis_reservar
  // (lib/tenis entradaJugadorExistente: un invitado que ya estaba va como
  // `{ dni }` o, sin DNI, `{ invitado_id }`; un lugar a designar, `{ a_designar: true }`).
  jugadoresCorregir: (reservaId: string, jugadores: JugadorCorregido[], infraccion: boolean, nota: string | null = null) =>
    sinDatos(rpcTenis('tenis_jugadores_corregir', {
      p_reserva_id: reservaId, p_jugadores: jugadores, p_registrar_infraccion: infraccion, p_nota: nota,
    }, 'No se pudieron corregir los jugadores.')),

  // Ajuste de cobro (devolución o diferencia) ya resuelto en el club.
  ajusteResolver: (id: string) =>
    sinDatos(rpcTenis('tenis_cobro_ajuste_resolver', { p_id: id }, 'No se pudo marcar el ajuste.')),

  extension: (canchaId: string, hasta: string, reservaOrigen: string) =>
    sinDatos(rpcTenis('tenis_extension', {
      p_cancha_id: canchaId, p_hasta: hasta, p_reserva_origen: reservaOrigen,
    }, 'No se pudo registrar la extensión.')),
}

export type JugadorCorregido = JugadorEntrada

// ─── Comprobantes pendientes ──────────────────────────────────────────────────

export function useComprobantesPendientes() {
  const [lista,   setLista]   = useState<ComprobantePendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const r = await rpcTenis('tenis_comprobantes_pendientes', {}, ERROR_CARGA_TENIS)
    if (r.ok) { setLista(parsearComprobantes(r.data)); setError(null) } else setError(r.mensaje)
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])
  return { lista, loading, error, refetch }
}

// ─── Ajustes de cobro pendientes ──────────────────────────────────────────────

export function useAjustesCobro() {
  const [lista,   setLista]   = useState<AjusteCobro[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const r = await rpcTenis('tenis_cobros_ajustes_pendientes', {}, ERROR_CARGA_TENIS)
    if (r.ok) { setLista(parsearAjustesCobro(r.data)); setError(null) } else setError(r.mensaje)
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])
  return { lista, loading, error, refetch }
}

// ─── Infracciones y suspensiones ──────────────────────────────────────────────

export function useSancionesTenis() {
  const [datos,   setDatos]   = useState<{ infracciones: Infraccion[]; suspensiones: Suspension[] }>({ infracciones: [], suspensiones: [] })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const r = await rpcTenis('tenis_infracciones_listar', {}, ERROR_CARGA_TENIS)
    if (r.ok) { setDatos(parsearSanciones(r.data)); setError(null) } else setError(r.mensaje)
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])
  return { ...datos, loading, error, refetch }
}

// ─── Check-in del canchero ────────────────────────────────────────────────────

// Por DNI tipeado o por el número de socio del QR del carnet (exactamente uno).
export async function checkinTenis(q: { dni: string } | { numeroSocio: string }): Promise<ResultadoTenis<Checkin>> {
  const args = 'dni' in q ? { p_dni: q.dni } : { p_numero_socio: q.numeroSocio }
  const r = await rpcTenis('tenis_checkin', args, 'No se pudo consultar. Probá de nuevo.')
  return r.ok ? ok(parsearCheckin(r.data)) : r
}
