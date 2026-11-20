import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { FEATURES } from '@/constants/features'
import {
  esGestorTenis, parsearDisponibilidad, parsearResultadoReserva,
  type Disponibilidad, type JugadorEntrada, type Modalidad, type ResultadoReserva, type TenisConfig, type TipoBloque,
} from '@/lib/tenis'
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

  useEffect(() => {
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

  const refetch = useCallback(async () => {
    setLoading(true)
    const r = await rpcTenis('tenis_grilla', { p_fecha: fecha }, ERROR_CARGA_TENIS)
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

export interface BloqueEditable {
  id?:           string
  cancha_id:     string | null
  tipo:          TipoBloque
  titulo:        string
  dia_semana:    number        // ISO 1 = lunes … 7 = domingo
  hora_desde:    string        // HH:MM
  hora_hasta:    string
  vigente_desde: string        // YYYY-MM-DD
  vigente_hasta: string | null
}

export const accionesTenis = {
  reservarStaff: async (a: {
    canchaId: string; inicio: string; modalidad: Modalidad; jugadores: JugadorEntrada[]; titular: JugadorEntrada
  }): Promise<ResultadoTenis<ResultadoReserva>> => {
    const r = await rpcTenis('tenis_reservar_staff', {
      p_cancha_id: a.canchaId, p_inicio: a.inicio, p_modalidad: a.modalidad,
      p_jugadores: a.jugadores, p_titular: a.titular, p_origen: 'telefonica',
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

  // Bloqueo puntual (lluvia, mantenimiento): cancela las reservas que pisa y
  // les avisa (push / mail), por eso va por la Edge Function.
  bloqueoPuntual: async (a: {
    canchaId: string | null; desde: string; hasta: string; tipo: TipoBloque; titulo: string
  }): Promise<ResultadoTenis<{ canceladas: number }>> => {
    const r = await gestionTenis({
      action: 'bloqueo-puntual', cancha_id: a.canchaId, desde: a.desde, hasta: a.hasta, tipo: a.tipo, titulo: a.titulo,
    }, 'No se pudo bloquear. Probá de nuevo.')
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
    return ok({ url, esPdf: /\.pdf(\?|$)/i.test(url) })
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
  // (un invitado que ya estaba va como `{ invitado_id }`).
  jugadoresCorregir: (reservaId: string, jugadores: JugadorCorregido[], infraccion: boolean) =>
    sinDatos(rpcTenis('tenis_jugadores_corregir', {
      p_reserva_id: reservaId, p_jugadores: jugadores, p_infraccion: infraccion,
    }, 'No se pudieron corregir los jugadores.')),

  extension: (canchaId: string, hasta: string, reservaOrigen: string) =>
    sinDatos(rpcTenis('tenis_extension', {
      p_cancha_id: canchaId, p_hasta: hasta, p_reserva_origen: reservaOrigen,
    }, 'No se pudo registrar la extensión.')),
}

export type JugadorCorregido = JugadorEntrada | { invitado_id: string }

// ─── Comprobantes pendientes ──────────────────────────────────────────────────

export interface ComprobantePendiente {
  reserva_id:     string
  cancha:         string
  inicio:         string
  fin:            string
  modalidad:      Modalidad
  titular:        string
  email:          string | null
  total:          number
  vence_at:       string | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null
}

function parsearComprobantes(raw: unknown): ComprobantePendiente[] {
  const lista = Array.isArray(raw) ? raw : []
  return lista.flatMap(x => {
    if (!x || typeof x !== 'object') return []
    const o = x as Record<string, unknown>
    const id = str(o.reserva_id) ?? str(o.id)
    const inicio = str(o.inicio)
    if (!id || !inicio) return []
    return [{
      reserva_id: id,
      cancha:     str(o.cancha) ?? str(o.cancha_nombre) ?? '',
      inicio,
      fin:        str(o.fin) ?? inicio,
      modalidad:  o.modalidad === 'dobles' ? 'dobles' : 'singles',
      titular:    str(o.titular) ?? str(o.titular_nombre) ?? '—',
      email:      str(o.email) ?? str(o.titular_email),
      total:      Number(o.total) || 0,
      vence_at:   str(o.comprobante_vence_at) ?? str(o.vence_at),
    } satisfies ComprobantePendiente]
  })
}

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

// ─── Infracciones y suspensiones ──────────────────────────────────────────────

export interface Infraccion {
  id:          string
  socio_id:    string | null
  invitado_id: string | null
  nombre:      string
  tipo:        string
  nota:        string | null
  perdonada:   boolean
  automatica:  boolean
  created_at:  string
}

export interface Suspension {
  id:          string
  socio_id:    string | null
  invitado_id: string | null
  nombre:      string
  desde:       string
  hasta:       string
  motivo:      string | null
}

function parsearSanciones(raw: unknown): { infracciones: Infraccion[]; suspensiones: Suspension[] } {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const inf = Array.isArray(raw) ? raw : Array.isArray(o.infracciones) ? o.infracciones : []
  const sus = Array.isArray(o.suspensiones) ? o.suspensiones : []
  return {
    infracciones: inf.flatMap(x => {
      if (!x || typeof x !== 'object') return []
      const i = x as Record<string, unknown>
      const id = str(i.id)
      if (!id) return []
      return [{
        id,
        socio_id:    str(i.socio_id),
        invitado_id: str(i.invitado_id),
        nombre:      str(i.nombre) ?? '—',
        tipo:        str(i.tipo) ?? 'otra',
        nota:        str(i.nota),
        perdonada:   i.perdonada === true,
        automatica:  i.creado_por === null || i.automatica === true,
        created_at:  str(i.created_at) ?? '',
      } satisfies Infraccion]
    }),
    suspensiones: sus.flatMap(x => {
      if (!x || typeof x !== 'object') return []
      const i = x as Record<string, unknown>
      const id = str(i.id)
      if (!id) return []
      return [{
        id,
        socio_id:    str(i.socio_id),
        invitado_id: str(i.invitado_id),
        nombre:      str(i.nombre) ?? '—',
        desde:       str(i.desde) ?? '',
        hasta:       str(i.hasta) ?? '',
        motivo:      str(i.motivo),
      } satisfies Suspension]
    }),
  }
}

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

export interface Checkin {
  persona:     { tipo: 'socio' | 'invitado'; nombre: string; semaforo: string | null } | null
  reserva:     { id: string; cancha_id: string | null; cancha: string; inicio: string; fin: string; modalidad: Modalidad } | null
  jugador:     { id: string | null; cargo: number; cobrado: boolean } | null
  suspendido:  boolean
  resultado:   string
}

export function parsearCheckin(raw: unknown): Checkin {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const p = o.persona && typeof o.persona === 'object' ? o.persona as Record<string, unknown> : null
  const r = o.reserva && typeof o.reserva === 'object' ? o.reserva as Record<string, unknown> : null
  const j = o.jugador && typeof o.jugador === 'object' ? o.jugador as Record<string, unknown> : null
  return {
    persona: p ? { tipo: p.tipo === 'invitado' ? 'invitado' : 'socio', nombre: str(p.nombre) ?? '—', semaforo: str(p.semaforo) } : null,
    reserva: r && (str(r.id) ?? str(r.reserva_id)) ? {
      id:        (str(r.id) ?? str(r.reserva_id)) as string,
      cancha_id: str(r.cancha_id),
      cancha:    str(r.cancha) ?? str(r.cancha_nombre) ?? '',
      inicio:    str(r.inicio) ?? '',
      fin:       str(r.fin) ?? '',
      modalidad: r.modalidad === 'dobles' ? 'dobles' : 'singles',
    } : null,
    jugador:    j ? { id: str(j.id) ?? str(j.jugador_id), cargo: Number(j.cargo) || 0, cobrado: j.cobrado === true } : null,
    suspendido: o.suspendido === true,
    resultado:  str(o.resultado) ?? 'sin_reserva',
  }
}

export async function checkinTenis(dni: string): Promise<ResultadoTenis<Checkin>> {
  const r = await rpcTenis('tenis_checkin', { p_dni: dni }, 'No se pudo consultar el DNI. Probá de nuevo.')
  return r.ok ? ok(parsearCheckin(r.data)) : r
}
