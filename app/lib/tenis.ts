// Reservas de canchas de tenis (odd/tasks/reservas-tenis.md, "Shared contract").
// Lógica pura, sin React: grilla de 30 minutos por cancha, colores por tipo,
// hora real de inicio, precios, plazos y mensajes de error. Verificada en
// tenis.check.ts. Las reglas que deciden (límites, precios, plazos) las aplica
// el servidor; acá sólo se muestran.
//
// Horario: Argentina es UTC-3 todo el año (sin horario de verano), así que la
// fecha y la hora de un timestamptz se calculan con ese desfase fijo, igual
// que `tenis_ahora()` en la base. No depende de la zona del teléfono.

import { tenis } from '../constants/theme'
import { SIN_CONEXION } from './errorFunction'
import { SIN_PERMISO, mensajeError } from './mensajeError'
import { formatMonto } from './formatoMonto'
import { esErrorDeRed } from './offlineSync'
import { normalizarDni } from './entradaDni'

// ─── Tipos del contrato ───────────────────────────────────────────────────────

export type Modalidad = 'singles' | 'dobles'

export interface TenisConfig {
  hora_desde:              string // HH:MM
  hora_hasta:              string // HH:MM
  modulo_min:              number
  margen_inicio_min:       number
  singles_min:             number
  dobles_min:              number
  max_reservas_dia:        number
  max_activas:             number
  anticipacion_dias:       number
  cancelacion_horas:       number
  comprobante_horas_antes: number
  hold_min:                number
  alias_pago:              string
  precio_socio_single:     number
  precio_socio_dobles:     number
  precio_nosocio_single:   number
  precio_nosocio_dobles:   number
  bloquear_morosos:        boolean
}

export const CONFIG_DEFECTO: TenisConfig = {
  hora_desde: '08:00',
  hora_hasta: '22:00',
  modulo_min: 30,
  margen_inicio_min: 5,
  singles_min: 60,
  dobles_min: 90,
  max_reservas_dia: 1,
  max_activas: 2,
  anticipacion_dias: 2,
  cancelacion_horas: 3,
  comprobante_horas_antes: 3,
  hold_min: 15,
  alias_pago: 'uncas.tenis.macro',
  precio_socio_single: 9000,
  precio_socio_dobles: 10000,
  precio_nosocio_single: 16000,
  precio_nosocio_dobles: 18000,
  bloquear_morosos: true,
}

export interface Cancha {
  id:     string
  nombre: string
}

export interface JugadorGrilla {
  id:           string           // fila de tenis_reserva_jugadores
  nombre:       string
  es_titular:   boolean
  cargo:        number
  motivo:       string | null
  cobrado:      boolean
  check_in_at:  string | null
  socio_id:     string | null
  invitado_id:  string | null
}

// Un ítem de la grilla: una reserva o un bloque. `tipo` es el origen de la
// reserva ('socio' | 'invitado' | 'telefonica' | 'extension') o el tipo del
// bloque ('clase' | 'entrenamiento' | 'torneo' | 'no_disponible' |
// 'en_suspenso'). cancha_id null = bloque de todas las canchas. Los campos
// opcionales sólo llegan en `tenis_grilla` (gestor / canchero).
export interface ItemGrilla {
  cancha_id:   string | null
  inicio:      string
  fin:         string
  tipo:        string
  titulo:      string | null
  recurrente:  boolean
  mio:         boolean
  reserva_id?:  string | null
  bloque_id?:   string | null
  estado?:      string | null
  modalidad?:   Modalidad | null
  comprobante_estado?: string | null
  jugadores?:   JugadorGrilla[]
  // Bloques fijos (gestor), para editarlos desde la grilla.
  dia_semana?:    number | null
  vigente_desde?: string | null
  vigente_hasta?: string | null
}

export interface Disponibilidad {
  config:  TenisConfig
  canchas: Cancha[]
  items:   ItemGrilla[]
}

export interface JugadorBuscado {
  socio_id:     string
  nombre:       string
  numero_socio: string | number | null
}

export interface InvitadoEntrada {
  dni:      string
  nombre:   string
  apellido: string
}

// Lo que se manda en `p_jugadores` / `p_titular`.
export type JugadorEntrada = { socio_id: string } | { invitado: InvitadoEntrada }

export interface CargoJugador {
  nombre: string
  cargo:  number
  motivo: string | null
}

export interface ResultadoReserva {
  reserva_id: string
  jugadores:  CargoJugador[]
  total:      number
}

export interface MiReserva {
  id:         string
  cancha:     string
  inicio:     string
  fin:        string
  modalidad:  Modalidad
  estado:     string
  es_titular: boolean
  jugadores:  CargoJugador[]
  total:      number | null
}

// ─── Parseo tolerante de las respuestas jsonb ─────────────────────────────────

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
// 'HH:MM:SS' (time de Postgres) → 'HH:MM'.
function hhmm(v: unknown, def: string): string {
  const t = texto(v)
  return t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : def
}

export function parsearConfig(raw: unknown): TenisConfig {
  if (!esObjeto(raw)) return { ...CONFIG_DEFECTO }
  const c: TenisConfig = { ...CONFIG_DEFECTO }
  c.hora_desde = hhmm(raw.hora_desde, c.hora_desde)
  c.hora_hasta = hhmm(raw.hora_hasta, c.hora_hasta)
  const numericos = [
    'modulo_min', 'margen_inicio_min', 'singles_min', 'dobles_min', 'max_reservas_dia', 'max_activas',
    'anticipacion_dias', 'cancelacion_horas', 'comprobante_horas_antes', 'hold_min', 'precio_socio_single',
    'precio_socio_dobles', 'precio_nosocio_single', 'precio_nosocio_dobles',
  ] as const
  for (const k of numericos) c[k] = numero(raw[k], c[k])
  if (typeof raw.alias_pago === 'string') c.alias_pago = raw.alias_pago
  if (typeof raw.bloquear_morosos === 'boolean') c.bloquear_morosos = raw.bloquear_morosos
  return c
}

function parsearJugadorGrilla(raw: unknown): JugadorGrilla | null {
  if (!esObjeto(raw)) return null
  return {
    id:          texto(raw.id) ?? texto(raw.jugador_id) ?? '',
    nombre:      texto(raw.nombre) ?? '—',
    es_titular:  raw.es_titular === true,
    cargo:       numero(raw.cargo),
    motivo:      texto(raw.motivo ?? raw.motivo_cargo),
    cobrado:     raw.cobrado === true,
    check_in_at: texto(raw.check_in_at),
    socio_id:    texto(raw.socio_id),
    invitado_id: texto(raw.invitado_id),
  }
}

export function parsearItem(raw: unknown): ItemGrilla | null {
  if (!esObjeto(raw)) return null
  const inicio = texto(raw.inicio)
  const fin    = texto(raw.fin)
  if (!inicio || !fin) return null
  const modalidad = raw.modalidad === 'singles' || raw.modalidad === 'dobles' ? raw.modalidad : null
  return {
    cancha_id:  texto(raw.cancha_id),
    inicio,
    fin,
    tipo:       texto(raw.tipo) ?? texto(raw.origen) ?? 'no_disponible',
    titulo:     texto(raw.titulo),
    recurrente: raw.recurrente === true,
    mio:        raw.mio === true,
    reserva_id: texto(raw.reserva_id),
    bloque_id:  texto(raw.bloque_id),
    estado:     texto(raw.estado),
    modalidad,
    comprobante_estado: texto(raw.comprobante_estado),
    dia_semana:    typeof raw.dia_semana === 'number' ? raw.dia_semana : null,
    vigente_desde: texto(raw.vigente_desde),
    vigente_hasta: texto(raw.vigente_hasta),
    jugadores:  Array.isArray(raw.jugadores)
      ? raw.jugadores.map(parsearJugadorGrilla).filter((j): j is JugadorGrilla => j !== null)
      : undefined,
  }
}

export function parsearDisponibilidad(raw: unknown): Disponibilidad {
  const r = esObjeto(raw) ? raw : {}
  const canchas = Array.isArray(r.canchas)
    ? r.canchas.filter(esObjeto).map(c => ({ id: texto(c.id) ?? '', nombre: texto(c.nombre) ?? '' })).filter(c => c.id)
    : []
  const items = Array.isArray(r.items)
    ? r.items.map(parsearItem).filter((i): i is ItemGrilla => i !== null)
    : []
  return { config: parsearConfig(r.config), canchas, items }
}

function parsearCargos(raw: unknown): CargoJugador[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(esObjeto).map(j => ({
    nombre: texto(j.nombre) ?? '—',
    cargo:  numero(j.cargo),
    motivo: texto(j.motivo ?? j.motivo_cargo),
  }))
}

export function parsearResultadoReserva(raw: unknown): ResultadoReserva | null {
  if (!esObjeto(raw)) return null
  const id = texto(raw.reserva_id)
  if (!id) return null
  return { reserva_id: id, jugadores: parsearCargos(raw.jugadores), total: numero(raw.total) }
}

export function parsearMisReservas(raw: unknown): MiReserva[] {
  const lista = Array.isArray(raw) ? raw : esObjeto(raw) && Array.isArray(raw.reservas) ? raw.reservas : []
  return lista.filter(esObjeto).flatMap(r => {
    const id = texto(r.id) ?? texto(r.reserva_id)
    const inicio = texto(r.inicio)
    const fin = texto(r.fin)
    if (!id || !inicio || !fin) return []
    return [{
      id,
      cancha:     texto(r.cancha) ?? texto(r.cancha_nombre) ?? '',
      inicio,
      fin,
      modalidad:  r.modalidad === 'dobles' ? 'dobles' : 'singles',
      estado:     texto(r.estado) ?? 'confirmada',
      es_titular: r.es_titular !== false,
      jugadores:  parsearCargos(r.jugadores),
      total:      r.total === undefined || r.total === null ? null : numero(r.total),
    } satisfies MiReserva]
  })
}

// ─── Horario de Argentina ─────────────────────────────────────────────────────

const OFFSET_AR_MS = -3 * 60 * 60 * 1000
const MIN_MS = 60 * 1000

// El instante como si fuera UTC en Argentina (para leer día y hora en UTC).
function relojAr(ms: number): Date {
  return new Date(ms + OFFSET_AR_MS)
}

export function fechaArgentina(isoOMs: string | number): string {
  const ms = typeof isoOMs === 'number' ? isoOMs : Date.parse(isoOMs)
  return relojAr(ms).toISOString().slice(0, 10)
}

export function horaArgentina(iso: string): string {
  return relojAr(Date.parse(iso)).toISOString().slice(11, 16)
}

// 'YYYY-MM-DD' + 'HH:MM' de Argentina → timestamptz para el RPC.
export function isoArgentina(fecha: string, hora: string): string {
  return `${fecha}T${hora.slice(0, 5)}:00-03:00`
}

export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function horaDeMinutos(min: number): string {
  const h = Math.floor(min / 60)
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function inicioDelDia(fecha: string): number {
  return Date.parse(`${fecha}T00:00:00-03:00`)
}

// El turno arranca unos minutos después de lo reservado (se barre la cancha):
// la app muestra la hora real, '18:00' → '18:05'. Acepta un timestamptz o 'HH:MM'.
export function inicioReal(inicio: string, margenMin: number = CONFIG_DEFECTO.margen_inicio_min): string {
  const hora = inicio.length <= 8 ? inicio.slice(0, 5) : horaArgentina(inicio)
  return horaDeMinutos(minutosDeHora(hora) + margenMin)
}

// ─── Grilla ───────────────────────────────────────────────────────────────────

// Hora de inicio de cada fila: 08:00, 08:30 … 21:30.
export function filasGrilla(config: Pick<TenisConfig, 'hora_desde' | 'hora_hasta' | 'modulo_min'>): string[] {
  const desde = minutosDeHora(config.hora_desde)
  const hasta = minutosDeHora(config.hora_hasta)
  const paso = Math.max(5, config.modulo_min)
  const filas: string[] = []
  for (let t = desde; t < hasta; t += paso) filas.push(horaDeMinutos(t))
  return filas
}

export interface PosicionBloque {
  fila:  number // primera fila que ocupa (0 = hora_desde)
  filas: number // cuántas filas ocupa
}

// Dónde va un ítem en la grilla de `fecha`, recortado al horario; null si no
// cae ese día dentro del horario.
export function posicionBloque(
  item: Pick<ItemGrilla, 'inicio' | 'fin'>,
  fecha: string,
  config: Pick<TenisConfig, 'hora_desde' | 'hora_hasta' | 'modulo_min'>,
): PosicionBloque | null {
  const base  = inicioDelDia(fecha)
  const desde = minutosDeHora(config.hora_desde)
  const hasta = minutosDeHora(config.hora_hasta)
  const paso  = Math.max(5, config.modulo_min)
  const ini = Math.max(desde, (Date.parse(item.inicio) - base) / MIN_MS)
  const fin = Math.min(hasta, (Date.parse(item.fin) - base) / MIN_MS)
  if (!(fin > ini)) return null
  const fila = Math.floor((ini - desde) / paso)
  return { fila, filas: Math.max(1, Math.ceil((fin - desde) / paso) - fila) }
}

export type ItemPosicionado<T extends ItemGrilla = ItemGrilla> = T & PosicionBloque

// Ítems de cada cancha con su posición. Un bloque sin cancha va a todas.
export function bloquesPorCancha<T extends ItemGrilla>(
  items: T[],
  canchas: Pick<Cancha, 'id'>[],
  fecha: string,
  config: Pick<TenisConfig, 'hora_desde' | 'hora_hasta' | 'modulo_min'>,
): Record<string, ItemPosicionado<T>[]> {
  const r: Record<string, ItemPosicionado<T>[]> = {}
  for (const c of canchas) r[c.id] = []
  for (const it of items) {
    const pos = posicionBloque(it, fecha, config)
    if (!pos) continue
    const destino = it.cancha_id === null ? canchas.map(c => c.id) : [it.cancha_id]
    for (const id of destino) r[id]?.push({ ...it, ...pos })
  }
  for (const id of Object.keys(r)) r[id].sort((a, b) => a.fila - b.fila)
  return r
}

export function duracionModalidad(modalidad: Modalidad, config: Pick<TenisConfig, 'singles_min' | 'dobles_min'>): number {
  return modalidad === 'dobles' ? config.dobles_min : config.singles_min
}

// 60 → '1 h', 90 → '1 h 30', 45 → '45 min'.
export function duracionTexto(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m}`
}

// Horarios en los que entra un turno de esa modalidad en esa cancha, sin pisar
// reservas ni bloques, dentro del horario y que todavía no empezaron.
export function iniciosLibres(
  items: Pick<ItemGrilla, 'cancha_id' | 'inicio' | 'fin'>[],
  canchaId: string,
  fecha: string,
  modalidad: Modalidad,
  config: TenisConfig,
  ahoraMs: number,
): string[] {
  const base = inicioDelDia(fecha)
  const dur  = duracionModalidad(modalidad, config)
  const ocupados = items
    .filter(i => i.cancha_id === null || i.cancha_id === canchaId)
    .map(i => [Date.parse(i.inicio), Date.parse(i.fin)] as const)
  const libres: string[] = []
  for (const hora of filasGrilla(config)) {
    const t = minutosDeHora(hora)
    if (t + dur > minutosDeHora(config.hora_hasta)) break
    const ini = base + t * MIN_MS
    const fin = ini + dur * MIN_MS
    if (ini <= ahoraMs) continue
    if (ocupados.some(([a, b]) => ini < b && a < fin)) continue
    libres.push(hora)
  }
  return libres
}

// ─── Colores y etiquetas ──────────────────────────────────────────────────────

export interface EstiloItem {
  fondo:    string
  texto:    string
  etiqueta: string
}

const ESTILOS: Record<string, EstiloItem> = {
  socio:         { ...tenis.web,           etiqueta: 'Reserva web' },
  web:           { ...tenis.web,           etiqueta: 'Reserva web' },
  invitado:      { ...tenis.web,           etiqueta: 'Invitado' },
  extension:     { ...tenis.web,           etiqueta: 'Extensión' },
  telefonica:    { ...tenis.telefonica,    etiqueta: 'Reserva telefónica' },
  torneo:        { ...tenis.torneo,        etiqueta: 'Torneo' },
  clase:         { ...tenis.clase,         etiqueta: 'Clase / Escuelita' },
  entrenamiento: { ...tenis.entrenamiento, etiqueta: 'Entrenamiento' },
  no_disponible: { ...tenis.noDisponible,  etiqueta: 'No disponible' },
  en_suspenso:   { ...tenis.enSuspenso,    etiqueta: 'En suspenso' },
}

export function estiloItem(item: Pick<ItemGrilla, 'tipo'>): EstiloItem {
  return ESTILOS[item.tipo] ?? ESTILOS.no_disponible
}

// Leyenda de la grilla, en el orden de OnDepor.
export const LEYENDA_TENIS: EstiloItem[] = [
  ESTILOS.web, ESTILOS.telefonica, ESTILOS.torneo, ESTILOS.clase,
  ESTILOS.entrenamiento, ESTILOS.no_disponible, ESTILOS.en_suspenso,
]

export const TIPOS_BLOQUE = ['clase', 'entrenamiento', 'torneo', 'no_disponible', 'en_suspenso'] as const
export type TipoBloque = (typeof TIPOS_BLOQUE)[number]

export function esBloque(item: Pick<ItemGrilla, 'tipo'>): boolean {
  return (TIPOS_BLOQUE as readonly string[]).includes(item.tipo)
}

// ─── Reglas visibles ──────────────────────────────────────────────────────────

// Jugadores además del titular: singles 1, dobles 3.
export function jugadoresRequeridos(modalidad: Modalidad): number {
  return modalidad === 'dobles' ? 3 : 1
}

export function puedeCancelar(inicio: string, ahoraMs: number, horas: number = CONFIG_DEFECTO.cancelacion_horas): boolean {
  return Date.parse(inicio) - ahoraMs >= horas * 60 * MIN_MS
}

const DIAS_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

export interface DiaReserva {
  fecha:    string
  etiqueta: string
}

// 'DOM 22/11' para una fecha 'YYYY-MM-DD'.
export function etiquetaDiaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = DIAS_CORTO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

// Hoy y los días siguientes que se pueden reservar, en fecha de Argentina.
export function diasReservables(ahoraMs: number, anticipacion: number = CONFIG_DEFECTO.anticipacion_dias): DiaReserva[] {
  const hoy = fechaArgentina(ahoraMs)
  const [y, m, d] = hoy.split('-').map(Number)
  const dias: DiaReserva[] = []
  for (let i = 0; i <= Math.max(0, anticipacion); i++) {
    const fecha = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
    dias.push({ fecha, etiqueta: i === 0 ? 'HOY' : i === 1 ? 'MAÑANA' : etiquetaDiaCorta(fecha) })
  }
  return dias
}

// Día ISO de una fecha: 1 = lunes … 7 = domingo (como tenis_bloques.dia_semana).
export function diaSemanaIso(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
}

export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const [y, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}

export function esHoraValida(hora: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora)
}

// Error del rango de un bloque, o null si está bien.
export function validarRangoHorario(desde: string, hasta: string): string | null {
  if (!esHoraValida(desde) || !esHoraValida(hasta)) return 'Usá horas con formato HH:MM (por ejemplo 18:30).'
  if (minutosDeHora(hasta) <= minutosDeHora(desde)) return 'La hora de fin tiene que ser posterior a la de inicio.'
  return null
}

export function validarInvitado(inv: InvitadoEntrada): string | null {
  const dni = normalizarDni(inv.dni)
  if (dni.length < 6) return 'Revisá el DNI del invitado.'
  if (!inv.nombre.trim() || !inv.apellido.trim()) return 'Completá nombre y apellido del invitado.'
  return null
}

const MOTIVOS: Record<string, string> = {
  carnet_gratis: 'Primer turno del día con Carnet Tenis',
  turno_extra:   'Turno extra del día (precio socio)',
  socio:         'Socio',
  no_socio:      'No socio',
  no_show:       'No se presentó: se cobra al titular',
}

export function etiquetaMotivo(motivo: string | null): string {
  return (motivo && MOTIVOS[motivo]) || ''
}

export function montoCargo(cargo: number): string {
  return cargo === 0 ? 'Sin cargo' : formatMonto(cargo)
}

export interface ResumenPrecio {
  lineas: { nombre: string; monto: string; detalle: string }[]
  total:  string
}

export function resumenPrecio(r: { jugadores: CargoJugador[]; total: number }): ResumenPrecio {
  return {
    lineas: r.jugadores.map(j => ({ nombre: j.nombre, monto: montoCargo(j.cargo), detalle: etiquetaMotivo(j.motivo) })),
    total:  formatMonto(r.total),
  }
}

export const ESTADOS_RESERVA: Record<string, string> = {
  pendiente_confirmacion: 'Esperando confirmación por mail',
  pendiente_comprobante:  'Esperando comprobante',
  confirmada:             'Confirmada',
  jugada:                 'Jugada',
  no_show:                'No se presentó',
  cancelada:              'Cancelada',
  vencida:                'Vencida',
}

// ─── Errores ──────────────────────────────────────────────────────────────────

// Los RPC de tenis levantan `raise exception using errcode = 'P0001',
// message = '<codigo>'`. Las Edge Functions devuelven `{ codigo }` en el body.
export function codigoErrorTenis(err: unknown): string | null {
  if (!esObjeto(err)) return null
  if (typeof err.codigo === 'string') return err.codigo
  if (err.code === 'P0001' && typeof err.message === 'string' && /^[a-z_]+$/.test(err.message)) return err.message
  return null
}

const MENSAJES: Record<string, string> = {
  sin_permiso:             SIN_PERMISO,
  no_autorizado:           SIN_PERMISO,
  socio_inactivo:          'Tu cuenta de socio no está activa. Consultá en Secretaría.',
  moroso:                  'Tenés la cuota atrasada: regularizala para reservar.',
  suspendido:              'Estás suspendido para reservar canchas.',
  jugador_suspendido:      'Uno de los jugadores está suspendido y no puede jugar.',
  limite_dia:              'Ya tenés una reserva ese día.',
  limite_activas:          'Ya tenés 2 reservas activas. Esperá a jugar una para reservar otra.',
  anticipacion:            'Sólo se puede reservar hasta 2 días antes.',
  fuera_de_horario:        'Ese horario está fuera del horario de las canchas.',
  horario_invalido:        'Ese horario no es válido.',
  pasado:                  'Ese horario ya pasó.',
  superpuesta:             'Ese horario ya está ocupado. Elegí otro.',
  ocupado:                 'Ese horario ya está ocupado. Elegí otro.',
  bloqueado:               'La cancha no está disponible en ese horario.',
  cancha_inactiva:         'La cancha no está disponible.',
  cantidad_jugadores:      'Faltan o sobran jugadores para esa modalidad.',
  jugador_repetido:        'Un jugador está cargado dos veces.',
  jugador_invalido:        'Revisá los jugadores.',
  dni_invalido:            'Revisá el DNI.',
  dni_es_socio:            'Ese DNI es de un socio: buscalo en el padrón.',
  modalidad_invalida:      'Elegí singles o dobles.',
  fuera_de_plazo:          'Ya no se puede cancelar: faltan menos de 3 horas.',
  cancelacion_fuera_plazo: 'Ya no se puede cancelar: faltan menos de 3 horas.',
  no_encontrada:           'No se encontró la reserva.',
  no_es_titular:           'Sólo quien hizo la reserva puede cancelarla.',
  estado_invalido:         'La reserva ya no se puede modificar.',
  ya_cancelada:            'La reserva ya estaba cancelada.',
  sin_reserva:             'No tiene una reserva ahora.',
  cancha_ocupada:          'La cancha está ocupada en ese horario.',
  ya_suspendido:           'Ya tiene una suspensión vigente.',
  dias_invalidos:          'Ingresá una cantidad de días válida.',
  motivo_requerido:        'Escribí el motivo.',
}

export function mensajeErrorTenis(err: unknown, porDefecto: string): string {
  if (!err) return porDefecto
  if (esErrorDeRed(err)) return SIN_CONEXION
  const codigo = codigoErrorTenis(err)
  if (codigo) return MENSAJES[codigo] ?? porDefecto
  return mensajeError(err, porDefecto)
}

// ─── Visibilidad por rol ──────────────────────────────────────────────────────

// Con tenis encendido, todo socio activo ve la pestaña Agenda (tiene la
// sección Tenis); si no, sigue la regla de siempre (división o gimnasio).
export function verTabAgenda(tenisActivo: boolean, verPorAgenda: boolean): boolean {
  return tenisActivo || verPorAgenda
}

// Gestor de canchas: admin, o subcomisión de tenis (`profiles.deporte`).
// Mismo criterio que `es_gestor_tenis()` en la base, que es quien decide.
export function esGestorTenis(p: { roles: readonly string[]; deporte: string | null }): boolean {
  if (p.roles.includes('admin')) return true
  return p.roles.includes('subcomision') && p.deporte === 'tenis'
}

// ─── Check-in del canchero ────────────────────────────────────────────────────

export type ResultadoCheckin = 'ok' | 'sin_reserva' | 'suspendido' | 'comprobante_pendiente'

export const RESULTADO_CHECKIN: Record<ResultadoCheckin, { titulo: string; nivel: 'ok' | 'aviso' | 'error' }> = {
  ok:                    { titulo: 'TIENE RESERVA · PUEDE PASAR', nivel: 'ok' },
  sin_reserva:           { titulo: 'SIN RESERVA AHORA', nivel: 'error' },
  suspendido:            { titulo: 'SUSPENDIDO · NO PUEDE JUGAR', nivel: 'error' },
  comprobante_pendiente: { titulo: 'COMPROBANTE PENDIENTE', nivel: 'aviso' },
}

export function resultadoCheckin(v: unknown): ResultadoCheckin {
  return v === 'ok' || v === 'suspendido' || v === 'comprobante_pendiente' ? v : 'sin_reserva'
}
