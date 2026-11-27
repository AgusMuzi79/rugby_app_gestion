import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Share } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { fechaArgentina, parsearDisponibilidad, type Cancha, type TenisConfig } from '@/lib/tenis'
import {
  TOPE_EXPORTAR, parsearCanceladas, parsearHistorial, parsearListado, parsearNovedades, parsearReporte,
  type CanceladoPor, type FilaReporte, type HistorialReserva, type HorarioDia, type NovedadTenis,
  type ReservaCancelada, type ReservaListada, type TipoReporte,
} from '@/lib/tenisGestion'
import { ERROR_CARGA_TENIS, gestionTenis, rpcTenis, type ResultadoTenis } from './useTenisRpc'

// Pantallas de la gestora de tenis (odd/tasks/tenis-paridad.md,
// contrato 8–13): listado, historial, canceladas, reportes, cartelera, horarios
// por día y cobro del no-show. Los RPC chequean el rol en la base.

const ok = <T,>(data: T): ResultadoTenis<T> => ({ ok: true, data })

async function sinDatos(p: Promise<ResultadoTenis<unknown>>): Promise<ResultadoTenis<null>> {
  const r = await p
  return r.ok ? ok(null) : r
}

// Carga genérica: sólo vale la respuesta del último pedido.
function useCarga<T>(inicial: T, cargar: () => Promise<ResultadoTenis<T>>, activo = true) {
  const [datos, setDatos] = useState<T>(inicial)
  const [loading, setLoading] = useState(activo)
  const [error, setError] = useState<string | null>(null)
  const pedido = useRef(0)

  const refetch = useCallback(async () => {
    if (!activo) return
    const n = ++pedido.current
    setLoading(true)
    const r = await cargar()
    if (n !== pedido.current) return
    if (r.ok) { setDatos(r.data); setError(null) } else setError(r.mensaje)
    setLoading(false)
  }, [cargar, activo])

  useEffect(() => { refetch() }, [refetch])
  return { datos, loading, error, refetch }
}

// ─── Listado de reservas ──────────────────────────────────────────────────────

export interface FiltrosReservas {
  desde:    string
  hasta:    string
  q:        string
  canchaId: string | null
  origen:   string | null
  estado:   string | null
}

export const LIMITE_PAGINA = 50

function argsReservas(f: FiltrosReservas, limit: number, offset: number) {
  return {
    p_desde: f.desde, p_hasta: f.hasta, p_q: f.q.trim() || null, p_cancha_id: f.canchaId,
    p_origen: f.origen, p_estado: f.estado, p_limit: limit, p_offset: offset,
  }
}

export function useReservasListado(f: FiltrosReservas, pagina: number) {
  const { desde, hasta, q, canchaId, origen, estado } = f
  const cargar = useCallback(async () => {
    const r = await rpcTenis('tenis_reservas_listar',
      argsReservas({ desde, hasta, q, canchaId, origen, estado }, LIMITE_PAGINA, pagina * LIMITE_PAGINA), ERROR_CARGA_TENIS)
    return r.ok ? ok(parsearListado(r.data)) : r
  }, [desde, hasta, q, canchaId, origen, estado, pagina])
  return useCarga<{ total: number; items: ReservaListada[] }>({ total: 0, items: [] }, cargar)
}

// Exportación: todas las páginas (los RPC devuelven hasta 500 por pedido),
// hasta TOPE_EXPORTAR filas. `total` = cuántas hay con esos filtros, para
// avisar si no entraron todas (avisoExportacion).
const POR_PEDIDO = 500

async function exportarPaginas<T>(
  pedir: (limit: number, offset: number) => Promise<ResultadoTenis<{ total: number; items: T[] }>>,
): Promise<ResultadoTenis<{ items: T[]; total: number }>> {
  const items: T[] = []
  let total = 0
  for (let offset = 0; offset < TOPE_EXPORTAR; offset += POR_PEDIDO) {
    const r = await pedir(Math.min(POR_PEDIDO, TOPE_EXPORTAR - offset), offset)
    if (!r.ok) return r
    total = Math.max(r.data.total, items.length + r.data.items.length)
    items.push(...r.data.items)
    if (r.data.items.length < POR_PEDIDO || items.length >= r.data.total) break
  }
  return ok({ items, total })
}

export function reservasParaExportar(f: FiltrosReservas) {
  return exportarPaginas(async (limit, offset) => {
    const r = await rpcTenis('tenis_reservas_listar', argsReservas(f, limit, offset), 'No se pudo exportar. Probá de nuevo.')
    return r.ok ? ok(parsearListado(r.data)) : r
  })
}

// ─── Historial de una reserva ─────────────────────────────────────────────────

export function useHistorialReserva(reservaId: string) {
  const cargar = useCallback(async (): Promise<ResultadoTenis<HistorialReserva | null>> => {
    const r = await rpcTenis('tenis_reserva_historial', { p_reserva_id: reservaId }, 'No se pudo cargar el historial.')
    return r.ok ? ok(parsearHistorial(r.data)) : r
  }, [reservaId])
  return useCarga<HistorialReserva | null>(null, cargar)
}

// ─── Canceladas ───────────────────────────────────────────────────────────────

export interface FiltrosCanceladas {
  desde:        string
  hasta:        string
  q:            string
  motivo:       string
  canceladoPor: CanceladoPor | null
}

function argsCanceladas(f: FiltrosCanceladas, limit: number, offset: number) {
  return {
    p_desde: f.desde, p_hasta: f.hasta, p_q: f.q.trim() || null, p_motivo: f.motivo.trim() || null,
    p_cancelado_por: f.canceladoPor, p_limit: limit, p_offset: offset,
  }
}

export function useCanceladas(f: FiltrosCanceladas, pagina: number) {
  const { desde, hasta, q, motivo, canceladoPor } = f
  const cargar = useCallback(async () => {
    const r = await rpcTenis('tenis_canceladas_listar',
      argsCanceladas({ desde, hasta, q, motivo, canceladoPor }, LIMITE_PAGINA, pagina * LIMITE_PAGINA), ERROR_CARGA_TENIS)
    return r.ok ? ok(parsearCanceladas(r.data)) : r
  }, [desde, hasta, q, motivo, canceladoPor, pagina])
  return useCarga<{ total: number; items: ReservaCancelada[] }>({ total: 0, items: [] }, cargar)
}

export function canceladasParaExportar(f: FiltrosCanceladas) {
  return exportarPaginas(async (limit, offset) => {
    const r = await rpcTenis('tenis_canceladas_listar', argsCanceladas(f, limit, offset), 'No se pudo exportar. Probá de nuevo.')
    return r.ok ? ok(parsearCanceladas(r.data)) : r
  })
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

export function useReporte(tipo: TipoReporte, desde: string, hasta: string, activo: boolean) {
  const cargar = useCallback(async (): Promise<ResultadoTenis<FilaReporte[]>> => {
    const r = await rpcTenis('tenis_reporte', { p_tipo: tipo, p_desde: desde, p_hasta: hasta }, 'No se pudo armar el reporte.')
    return r.ok ? ok(parsearReporte(r.data).filas) : r
  }, [tipo, desde, hasta])
  return useCarga<FilaReporte[]>([], cargar, activo)
}

// ─── Cartelera ────────────────────────────────────────────────────────────────

export function useNovedadesGestion() {
  const cargar = useCallback(async () => {
    const r = await rpcTenis('tenis_novedades_listar', { p_limit: 50 }, ERROR_CARGA_TENIS)
    return r.ok ? ok(parsearNovedades(r.data)) : r
  }, [])
  return useCarga<NovedadTenis[]>([], cargar)
}

// ─── Canchas ──────────────────────────────────────────────────────────────────

// Canchas activas (filtro del listado), de la grilla de hoy.
export function useCanchasTenis() {
  const cargar = useCallback(async (): Promise<ResultadoTenis<Cancha[]>> => {
    const r = await rpcTenis('tenis_grilla', { p_fecha: fechaArgentina(Date.now()) }, ERROR_CARGA_TENIS)
    return r.ok ? ok(parsearDisponibilidad(r.data).canchas) : r
  }, [])
  return useCarga<Cancha[]>([], cargar).datos
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

export const accionesGestion = {
  // Gestor o canchero: cancelar una reserva (motivo opcional).
  cancelar: (reservaId: string, motivo: string | null) =>
    sinDatos(rpcTenis('tenis_cancelar', { p_reserva_id: reservaId, p_motivo: motivo }, 'No se pudo cancelar la reserva. Probá de nuevo.')),

  // Cancela varias y avisa a los jugadores (Edge Function).
  cancelarVarias: async (ids: string[], motivo: string): Promise<ResultadoTenis<{ canceladas: number; omitidas: number }>> => {
    const r = await gestionTenis({ action: 'cancelar-varias', reserva_ids: ids, motivo }, 'No se pudieron cancelar las reservas. Probá de nuevo.')
    if (!r.ok) return r
    const cuenta = (v: unknown) => Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0
    return ok({ canceladas: cuenta(r.data.canceladas), omitidas: cuenta(r.data.omitidas) })
  },

  // Cobro por concepto: 'turno' (su cargo) o 'no_show' (el cargo extra del no-show).
  cobroConcepto: (jugadorId: string, cobrado: boolean, concepto: 'turno' | 'no_show') =>
    sinDatos(rpcTenis('tenis_cobro_marcar', { p_jugador_id: jugadorId, p_cobrado: cobrado, p_concepto: concepto }, 'No se pudo marcar el cobro.')),

  horariosGuardar: (h: HorarioDia[]) =>
    sinDatos(rpcTenis('tenis_horarios_guardar', { p: h }, 'No se pudieron guardar los horarios. Probá de nuevo.')),

  configGuardar: (c: TenisConfig, diasVista: number) =>
    sinDatos(rpcTenis('tenis_config_guardar', { p: { ...c, dias_vista: diasVista } }, 'No se pudieron guardar las reglas. Probá de nuevo.')),

  novedadGuardar: async (n: { id?: string; titulo: string; texto: string; destacada: boolean }): Promise<ResultadoTenis<string | null>> => {
    const r = await rpcTenis('tenis_novedad_guardar', { p: n }, 'No se pudo guardar la novedad. Probá de nuevo.')
    return r.ok ? ok(typeof r.data === 'string' ? r.data : n.id ?? null) : r
  },

  novedadBorrar: (id: string) =>
    sinDatos(rpcTenis('tenis_novedad_borrar', { p_id: id }, 'No se pudo borrar la novedad. Probá de nuevo.')),

  publicarNovedad: async (id: string): Promise<ResultadoTenis<{ push: number; mails: number }>> => {
    const r = await gestionTenis({ action: 'publicar-novedad', novedad_id: id }, 'No se pudo publicar la novedad. Probá de nuevo.')
    if (!r.ok) return r
    const n = (v: unknown) => typeof v === 'number' ? v : 0
    return ok({ push: n(r.data.push_enviados ?? r.data.push), mails: n(r.data.mails_enviados ?? r.data.mails) })
  },
}

// ─── Exportar ─────────────────────────────────────────────────────────────────

// Sin módulos nativos nuevos: en iOS se comparte el archivo .csv (cache); en
// Android `Share` sólo manda texto, así que va el CSV como mensaje.
export async function compartirCsv(nombre: string, csv: string): Promise<ResultadoTenis<null>> {
  try {
    if (Platform.OS === 'ios' && FileSystem.cacheDirectory) {
      const uri = `${FileSystem.cacheDirectory}${nombre.replace(/[^\w.-]/g, '_')}.csv`
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 })
      await Share.share({ url: uri, title: nombre })
    } else {
      await Share.share({ message: csv, title: nombre })
    }
    return ok(null)
  } catch {
    return { ok: false, mensaje: 'No se pudo compartir el archivo. Probá de nuevo.' }
  }
}
