// Gestión de tenis (odd/tasks/tenis-paridad.md, contrato
// 8–13): listado de reservas, historial, canceladas, reportes, cartelera y
// horarios por día. Lógica pura, sin React; verificada en tenisGestion.check.ts.
// Los RPC son de la migración 20261128000000: se parsean de forma tolerante.

import {
  TIPOS_BLOQUE, diaSemanaIso, esFechaValida, esHoraValida, etiquetaDiaCorta, fechaArgentina, horaArgentina, minutosDeHora,
  type HorarioDia, type ItemGrilla, type TipoBloque,
} from './tenis'

// ─── Parseo ───────────────────────────────────────────────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null
}
function numero(v: unknown, def = 0): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : def
}
function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = numero(v, NaN)
  return Number.isNaN(n) ? null : n
}
function lista(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (esObjeto(raw) && Array.isArray(raw.items)) return raw.items
  return []
}

// ─── CSV (Excel en español: separador ";" y BOM UTF-8) ────────────────────────

export type CeldaCsv = string | number | null | undefined

function celdaCsv(v: CeldaCsv): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  // Un texto que empieza con = + - @ lo abre Excel como fórmula.
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[";\r\n,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function armarCsv(encabezados: string[], filas: CeldaCsv[][]): string {
  return '﻿' + [encabezados, ...filas].map(f => f.map(celdaCsv).join(';')).join('\r\n')
}

// ─── Fechas ───────────────────────────────────────────────────────────────────

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

// Hoy (Argentina) a hoy + dias; con dias negativo, de hoy − |dias| a hoy.
export function rangoPorDefecto(ahoraMs: number, dias = 7): { desde: string; hasta: string } {
  const hoy = fechaArgentina(ahoraMs)
  const otro = sumarDias(hoy, dias)
  return dias >= 0 ? { desde: hoy, hasta: otro } : { desde: otro, hasta: hoy }
}

export function validarRango(desde: string, hasta: string): string | null {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return 'Revisá las fechas (AAAA-MM-DD).'
  if (hasta < desde) return 'La fecha "desde" tiene que ser antes que "hasta".'
  if (sumarDias(desde, 366) < hasta) return 'Elegí un rango de hasta un año.'
  return null
}

export function paginas(total: number, limite: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limite)))
}

// 'HH:MM[:SS]' o un timestamptz → 'HH:MM' de Argentina.
export function horaSnapshot(v: string | null): string {
  if (!v) return '—'
  if (v.includes('T')) return horaArgentina(v)
  return v.slice(0, 5)
}

// ─── Reservas (tenis_reservas_listar) ─────────────────────────────────────────

export interface JugadorListado {
  nombre:       string
  es_titular:   boolean
  numero_socio: string | null
  dni:          string | null
}

export interface ReservaListada {
  reserva_id:    string
  cancha_id:     string | null
  cancha_nombre: string
  inicio:        string
  fin:           string
  modalidad:     string | null
  origen:        string | null
  estado:        string | null
  comentario:    string | null
  total:         number
  jugadores:     JugadorListado[]
}

function parsearReserva(raw: unknown): ReservaListada | null {
  if (!esObjeto(raw)) return null
  const id = texto(raw.reserva_id) ?? texto(raw.id)
  const inicio = texto(raw.inicio)
  const fin = texto(raw.fin)
  if (!id || !inicio || !fin) return null
  return {
    reserva_id:    id,
    cancha_id:     texto(raw.cancha_id),
    cancha_nombre: texto(raw.cancha_nombre) ?? texto(raw.cancha) ?? '',
    inicio,
    fin,
    modalidad:     texto(raw.modalidad),
    origen:        texto(raw.origen),
    estado:        texto(raw.estado),
    comentario:    texto(raw.comentario),
    total:         numero(raw.total),
    jugadores:     (Array.isArray(raw.jugadores) ? raw.jugadores : []).filter(esObjeto).map(j => ({
      nombre:       texto(j.nombre) ?? '—',
      es_titular:   j.es_titular === true,
      numero_socio: texto(j.numero_socio),
      dni:          texto(j.dni),
    })),
  }
}

export function parsearListado(raw: unknown): { total: number; items: ReservaListada[] } {
  const items = lista(raw).map(parsearReserva).filter((r): r is ReservaListada => r !== null)
  return { total: esObjeto(raw) ? numero(raw.total, items.length) : items.length, items }
}

export function nombreCancha(nombre: string): string {
  return `Cancha ${/^\d$/.test(nombre) ? nombre.padStart(2, '0') : nombre}`
}

// "Cancha 02 · JUE 26/11 · 14:00–15:30 · PÉREZ, JUAN, GÓMEZ, ANA"
export function lineaReserva(r: Pick<ReservaListada, 'cancha_nombre' | 'inicio' | 'fin' | 'jugadores'>): string {
  const partes = [
    nombreCancha(r.cancha_nombre),
    etiquetaDiaCorta(fechaArgentina(r.inicio)),
    `${horaArgentina(r.inicio)}–${horaArgentina(r.fin)}`,
  ]
  const nombres = r.jugadores.map(j => j.nombre).join(', ')
  if (nombres) partes.push(nombres)
  return partes.join(' · ')
}

export const ORIGENES: Record<string, string> = {
  socio:      'Web socio',
  telefonica: 'Telefónica',
  invitado:   'Invitado',
  extension:  'Extensión',
}

export const TIPOS_RESERVA: Record<string, string> = {
  reserva_web:        'Web socio',
  reserva_telefonica: 'Telefónica',
  reserva_invitado:   'Invitado',
  extension:          'Extensión',
  ...ORIGENES,
}

export function csvReservas(items: ReservaListada[]): string {
  return armarCsv(
    ['Fecha', 'Desde', 'Hasta', 'Cancha', 'Modalidad', 'Origen', 'Estado', 'Jugadores', 'Socio / DNI', 'Total', 'Comentario'],
    items.map(r => [
      fechaArgentina(r.inicio), horaArgentina(r.inicio), horaArgentina(r.fin), r.cancha_nombre,
      r.modalidad === 'dobles' ? 'Dobles' : r.modalidad === 'singles' ? 'Singles' : r.modalidad,
      (r.origen && ORIGENES[r.origen]) || r.origen, r.estado,
      r.jugadores.map(j => j.nombre).join(' / '),
      r.jugadores.map(j => j.numero_socio ?? j.dni ?? '').join(' / '),
      r.total, r.comentario,
    ]),
  )
}

// ─── Canceladas (tenis_canceladas_listar) ─────────────────────────────────────

export type CanceladoPor = 'titular' | 'staff' | 'sistema'

export const CANCELADO_POR: Record<CanceladoPor, string> = {
  titular: 'El titular',
  staff:   'La gestora / canchero',
  sistema: 'El sistema',
}

export interface ReservaCancelada extends ReservaListada {
  motivo:              string | null
  cancelado_por:       string | null
  cancelado_por_tipo:  CanceladoPor | null
  anticipacion_min:    number | null
}

export function parsearCanceladas(raw: unknown): { total: number; items: ReservaCancelada[] } {
  const items: ReservaCancelada[] = []
  for (const x of lista(raw)) {
    const r = parsearReserva(x)
    if (!r || !esObjeto(x)) continue
    const tipo = texto(x.cancelado_por_tipo)
    items.push({
      ...r,
      motivo:             texto(x.cancelacion_motivo),
      cancelado_por:      texto(x.cancelado_por_nombre),
      cancelado_por_tipo: tipo === 'titular' || tipo === 'staff' || tipo === 'sistema' ? tipo : null,
      anticipacion_min:   numeroONull(x.cancelacion_anticipacion_min),
    })
  }
  return { total: esObjeto(raw) ? numero(raw.total, items.length) : items.length, items }
}

// Cuánto antes del inicio se canceló: "45 min antes", "3 h antes", "2 días
// antes" o "Después del inicio".
export function etiquetaAnticipacion(min: number | null): string {
  if (min === null) return '—'
  if (min < 0) return 'Después del inicio'
  if (min === 0) return 'Al inicio'
  if (min < 60) return `${min} min antes`
  if (min < 1440) return `${Math.floor(min / 60)} h antes`
  const d = Math.floor(min / 1440)
  return d === 1 ? '1 día antes' : `${d} días antes`
}

export function csvCanceladas(items: ReservaCancelada[]): string {
  return armarCsv(
    ['Fecha', 'Desde', 'Hasta', 'Cancha', 'Jugadores', 'Motivo', 'Canceló', 'Quién', 'Anticipación'],
    items.map(r => [
      fechaArgentina(r.inicio), horaArgentina(r.inicio), horaArgentina(r.fin), r.cancha_nombre,
      r.jugadores.map(j => j.nombre).join(' / '), r.motivo,
      r.cancelado_por_tipo ? CANCELADO_POR[r.cancelado_por_tipo] : null, r.cancelado_por,
      etiquetaAnticipacion(r.anticipacion_min),
    ]),
  )
}

// ─── Historial (tenis_reserva_historial) ──────────────────────────────────────

export interface SnapshotReserva {
  fecha:      string | null
  inicio:     string | null
  fin:        string | null
  cancha:     string | null
  modalidad:  string | null
  estado:     string | null
  comentario: string | null
  jugadores:  { nombre: string; cobrado: boolean }[]
}

export interface VersionReserva {
  version:   number
  accion:    string
  snapshot:  SnapshotReserva | null
  hecho_por: string | null
  hecho_at:  string | null
}

export interface HistorialReserva {
  tipo:       string | null
  creada_at:  string | null
  creada_por: string | null
  versiones:  VersionReserva[]
}

export const ACCIONES_HISTORIAL: Record<string, string> = {
  creada:    'Creada',
  editada:   'Editada',
  jugadores: 'Cambio de jugadores',
  cancelada: 'Cancelada',
  estado:    'Cambio de estado',
  cobro:     'Cobro',
}

function parsearSnapshot(raw: unknown): SnapshotReserva | null {
  if (!esObjeto(raw)) return null
  return {
    fecha:      texto(raw.fecha),
    inicio:     texto(raw.inicio),
    fin:        texto(raw.fin),
    cancha:     texto(raw.cancha) ?? texto(raw.cancha_nombre),
    modalidad:  texto(raw.modalidad),
    estado:     texto(raw.estado),
    comentario: texto(raw.comentario),
    jugadores:  (Array.isArray(raw.jugadores) ? raw.jugadores : []).filter(esObjeto)
      .map(j => ({ nombre: texto(j.nombre) ?? '—', cobrado: j.cobrado === true })),
  }
}

export function parsearHistorial(raw: unknown): HistorialReserva | null {
  if (!esObjeto(raw)) return null
  const r = esObjeto(raw.reserva) ? raw.reserva : {}
  const versiones = (Array.isArray(raw.versiones) ? raw.versiones : []).filter(esObjeto).map(v => ({
    version:   numero(v.version),
    accion:    texto(v.accion) ?? '',
    snapshot:  parsearSnapshot(v.snapshot),
    hecho_por: texto(v.hecho_por_nombre),
    hecho_at:  texto(v.hecho_at),
  }))
  return { tipo: texto(r.tipo), creada_at: texto(r.creada_at), creada_por: texto(r.creada_por_nombre), versiones }
}

// ─── Reportes (tenis_reporte) ─────────────────────────────────────────────────

export type TipoReporte =
  | 'uso_mensual' | 'uso_diario' | 'uso_hora' | 'uso_general' | 'uso_tipo' | 'ranking_reservas' | 'ranking_cancelaciones'

export const REPORTES: { tipo: TipoReporte; label: string }[] = [
  { tipo: 'uso_mensual', label: 'Uso por mes' },
  { tipo: 'uso_diario', label: 'Uso por día de la semana' },
  { tipo: 'uso_hora', label: 'Uso por hora' },
  { tipo: 'uso_general', label: 'Uso general' },
  { tipo: 'uso_tipo', label: 'Por tipo de reserva' },
  { tipo: 'ranking_reservas', label: 'Ranking de reservas' },
  { tipo: 'ranking_cancelaciones', label: 'Ranking de cancelaciones' },
]

export type FilaReporte = Record<string, string | number | null>

export function parsearReporte(raw: unknown): { tipo: string; filas: FilaReporte[] } {
  if (!esObjeto(raw)) return { tipo: '', filas: [] }
  const filas = (Array.isArray(raw.filas) ? raw.filas : []).filter(esObjeto).map(f => {
    const fila: FilaReporte = {}
    for (const [k, v] of Object.entries(f)) {
      fila[k] = typeof v === 'number' || typeof v === 'string' || v === null ? v : v === undefined ? null : JSON.stringify(v)
    }
    return fila
  })
  return { tipo: texto(raw.tipo) ?? '', filas }
}

const ORDEN_COLUMNAS = [
  'mes', 'dia_semana', 'dia', 'hora', 'tipo', 'nombre', 'numero_socio',
  'reservas', 'cancelaciones', 'no_shows', 'total', 'cumplimiento',
  'minutos', 'minutos_reservados', 'minutos_disponibles', 'porcentaje',
]

export function columnasReporte(filas: FilaReporte[]): string[] {
  const todas: string[] = []
  for (const f of filas) for (const k of Object.keys(f)) if (!todas.includes(k)) todas.push(k)
  const conocidas = ORDEN_COLUMNAS.filter(k => todas.includes(k))
  return [...conocidas, ...todas.filter(k => !ORDEN_COLUMNAS.includes(k))]
}

const ETIQUETAS_COLUMNA: Record<string, string> = {
  mes: 'Mes', dia_semana: 'Día', dia: 'Día', hora: 'Hora', tipo: 'Tipo', nombre: 'Nombre', numero_socio: 'Nº socio',
  reservas: 'Reservas', cancelaciones: 'Cancelaciones', no_shows: 'No se presentó', total: 'Total',
  cumplimiento: '% cumplimiento', minutos: 'Minutos', minutos_reservados: 'Min. reservados',
  minutos_disponibles: 'Min. disponibles', porcentaje: '% uso',
}

export function etiquetaColumna(k: string): string {
  if (ETIQUETAS_COLUMNA[k]) return ETIQUETAS_COLUMNA[k]
  const t = k.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Columna numérica que se dibuja como barra, o null si no hay.
export function metricaReporte(tipo: string, filas: FilaReporte[]): string | null {
  const candidatas = tipo === 'uso_tipo' ? ['minutos', 'porcentaje']
    : tipo === 'ranking_reservas' ? ['reservas', 'total']
      : tipo === 'ranking_cancelaciones' ? ['cancelaciones']
        : ['porcentaje', 'uso']
  return candidatas.find(k => filas.some(f => typeof f[k] === 'number')) ?? null
}

export function csvReporte(filas: FilaReporte[]): string {
  const cols = columnasReporte(filas)
  return armarCsv(cols.map(etiquetaColumna), filas.map(f => cols.map(c => f[c])))
}

// ─── Cartelera (tenis_novedades) ──────────────────────────────────────────────

export interface NovedadTenis {
  id:             string
  titulo:         string
  texto:          string
  destacada:      boolean
  created_at:     string | null
  enviada_at:     string | null
  push_enviados:  number
  mails_enviados: number
  // false: el envío empezó y no terminó (la función se cortó); se puede reintentar.
  envio_completo: boolean
}

export function parsearNovedades(raw: unknown): NovedadTenis[] {
  const out: NovedadTenis[] = []
  for (const n of lista(raw)) {
    if (!esObjeto(n)) continue
    const id = texto(n.id)
    if (!id) continue
    out.push({
      id,
      titulo:         texto(n.titulo) ?? '',
      texto:          texto(n.texto) ?? '',
      destacada:      n.destacada === true,
      created_at:     texto(n.created_at),
      enviada_at:     texto(n.enviada_at),
      push_enviados:  numero(n.push_enviados),
      mails_enviados: numero(n.mails_enviados),
      // Servidor sin el campo: lo enviado se da por completo.
      envio_completo: n.envio_completo === undefined ? !!texto(n.enviada_at) : n.envio_completo === true,
    })
  }
  return out
}

// ─── Horarios por día (tenis_horarios) ────────────────────────────────────────

// La fila vive en lib/tenis.ts (config.horarios); se reexporta acá.
export type { HorarioDia }

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Siempre 7 filas (lunes a domingo); un día que falta toma el horario general.
export function parsearHorarios(raw: unknown, desdeDef: string, hastaDef: string): HorarioDia[] {
  const filas = Array.isArray(raw) ? raw.filter(esObjeto) : []
  return DIAS_SEMANA.map((_, i) => {
    const f = filas.find(x => numero(x.dia_semana) === i + 1)
    const desde = f ? texto(f.hora_desde) : null
    const hasta = f ? texto(f.hora_hasta) : null
    return {
      dia_semana: i + 1,
      hora_desde: desde ? desde.slice(0, 5) : desdeDef,
      hora_hasta: hasta ? hasta.slice(0, 5) : hastaDef,
      activo:     f ? f.activo !== false : true,
    }
  })
}

export function validarHorarios(h: HorarioDia[]): string | null {
  for (const d of h) {
    if (!d.activo) continue
    const nombre = DIAS_SEMANA[d.dia_semana - 1] ?? `Día ${d.dia_semana}`
    if (!esHoraValida(d.hora_desde) || !esHoraValida(d.hora_hasta) || minutosDeHora(d.hora_hasta) <= minutosDeHora(d.hora_desde)) {
      return `Revisá el horario del ${nombre.toLowerCase()} (HH:MM, cierre después de la apertura).`
    }
  }
  return null
}

// Cuánto espera tenis-gestion antes de dejar reintentar un envío sin terminar.
export const REINTENTO_NOVEDAD_MIN = 15

export type EstadoNovedad = 'sin_enviar' | 'enviada' | 'enviando' | 'incompleta'

export function estadoNovedad(n: Pick<NovedadTenis, 'enviada_at' | 'envio_completo'>, ahoraMs: number): EstadoNovedad {
  if (!n.enviada_at) return 'sin_enviar'
  if (n.envio_completo) return 'enviada'
  const desde = Date.parse(n.enviada_at)
  return Number.isFinite(desde) && ahoraMs - desde < REINTENTO_NOVEDAD_MIN * 60_000 ? 'enviando' : 'incompleta'
}

// ─── Exportar ─────────────────────────────────────────────────────────────────

// Tope de filas de una exportación (cada RPC devuelve hasta 500 por pedido).
export const TOPE_EXPORTAR = 2000

// Aviso cuando la exportación no trae todo lo que hay con esos filtros.
export function avisoExportacion(exportadas: number, total: number, cosa: string): string | null {
  if (total <= exportadas) return null
  return `Se exportaron las primeras ${exportadas} de ${total} ${cosa}. Achicá el rango de fechas para exportar el resto.`
}

// ─── Bloques en varias canchas ────────────────────────────────────────────────

// ─── Bloques del gestor ───────────────────────────────────────────────────────

// Fijo: todas las semanas (dia_semana + vigencia). Puntual: un rato de un día (fecha).
export type ModoBloque = 'fijo' | 'puntual'

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
  // Sólo el puntual: el día del bloque (YYYY-MM-DD).
  fecha?:        string | null
}

export function modoBloqueItem(item: Pick<ItemGrilla, 'recurrente'>): ModoBloque {
  return item.recurrente ? 'fijo' : 'puntual'
}

// Valores iniciales para editar un bloque (fijo o puntual) tocado en la grilla.
export function bloqueDesdeItem(item: ItemGrilla, fecha: string): BloqueEditable {
  const modo = modoBloqueItem(item)
  return {
    id:            item.bloque_id ?? undefined,
    // La grilla repite un bloque de todas las canchas en cada una: se edita el bloque entero.
    cancha_id:     item.bloque_todas ? null : item.cancha_id,
    tipo:          (TIPOS_BLOQUE as readonly string[]).includes(item.tipo)
                     ? item.tipo as TipoBloque
                     : modo === 'fijo' ? 'clase' : 'no_disponible',
    titulo:        item.titulo ?? '',
    dia_semana:    item.dia_semana ?? diaSemanaIso(fecha),
    fecha:         modo === 'puntual' ? fechaArgentina(item.inicio) : null,
    hora_desde:    horaArgentina(item.inicio),
    hora_hasta:    horaArgentina(item.fin),
    vigente_desde: item.vigente_desde ?? fecha,
    vigente_hasta: item.vigente_hasta ?? null,
  }
}

// Canchas donde se crea un bloque: [null] (= todas, una sola fila) si no se
// eligió ninguna o se eligieron todas; si no, una por cancha, en el orden de la grilla.
export function canchasDestino(elegidas: readonly string[], canchas: readonly { id: string }[]): (string | null)[] {
  const set = new Set(elegidas)
  const enOrden = canchas.filter(c => set.has(c.id)).map(c => c.id)
  if (enOrden.length === 0 || enOrden.length === canchas.length) return [null]
  return enOrden
}

export interface ResultadoBloque { cancha: string; ok: boolean; mensaje?: string }

// Resumen de crear un bloque en varias canchas: null si salió todo bien.
export function resumenBloques(r: readonly ResultadoBloque[]): { titulo: string; texto: string; ninguno: boolean } | null {
  const fallas = r.filter(x => !x.ok)
  if (fallas.length === 0) return null
  const hechas = r.filter(x => x.ok).map(x => x.cancha)
  const detalle = fallas.map(x => `Cancha ${x.cancha}: ${x.mensaje ?? 'no se pudo guardar'}`).join('\n')
  if (hechas.length === 0) return { titulo: 'No se guardó el bloque', texto: detalle, ninguno: true }
  return {
    titulo: 'Bloque guardado en parte',
    texto: `Se guardó en ${hechas.length === 1 ? 'la cancha' : 'las canchas'} ${hechas.join(', ')}.\nNo se pudo en:\n${detalle}`,
    ninguno: false,
  }
}
