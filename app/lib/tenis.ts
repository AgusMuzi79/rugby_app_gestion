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
  // Días que se ven en la grilla (hoy + dias_vista − 1); se reserva sólo
  // hasta anticipacion_dias.
  dias_vista:              number
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
  dias_vista: 7,
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
  // Lo que se cobró de verdad (null = no cobrado o servidor anterior) y, si se
  // editó la reserva después de cobrar, cargo − cobrado (> 0 falta, < 0 devolver).
  monto_cobrado: number | null
  diferencia:    number
  check_in_at:  string | null
  socio_id:     string | null
  invitado_id:  string | null
  // Sólo staff (tenis_reserva_resumen(id, true)).
  numero_socio: string | null
  dni:          string | null
}

// Un ítem de la grilla: una reserva o un bloque. `tipo` de una reserva:
// 'reserva_web' | 'reserva_telefonica' | 'reserva_invitado' | 'extension';
// de un bloque: 'clase' | 'entrenamiento' | 'torneo' | 'no_disponible' |
// 'en_suspenso'. La base ya expande los bloques de todas las canchas (uno por
// cancha); cancha_id null se acepta igual. Los campos opcionales sólo llegan
// en `tenis_grilla` (gestor / canchero).
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
  // El bloque es de todas las canchas (bloque_cancha_id null en tenis_grilla).
  bloque_todas?:  boolean
}

export interface Disponibilidad {
  config:  TenisConfig
  canchas: Cancha[]
  items:   ItemGrilla[]
  // Horario de ese día (tenis_horarios); null si el servidor no lo manda.
  horario:    { desde: string; hasta: string } | null
  // false si el día se ve pero está fuera de la anticipación.
  reservable: boolean
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

// Lo que se manda en `p_jugadores` / `p_titular` (tenis_resolver_persona):
// socio del padrón, socio o invitado ya cargado por DNI, o invitado nuevo.
// { invitado_id } sólo en tenis_editar_reserva, para un invitado que ya juega
// en esa reserva (el socio no ve su DNI).
// { a_designar: true }: lugar reservado para un socio que se elige después
// (se cobra precio socio). { invitado: { nombre, apellido } }: invitado del
// socio o del staff sin DNI (una fila nueva por reserva).
export type JugadorEntrada =
  | { socio_id: string } | { dni: string } | { invitado: InvitadoEntrada } | { invitado_id: string }
  | { a_designar: true } | { invitado: InvitadoSinDni }

export interface InvitadoSinDni {
  nombre:   string
  apellido: string
}

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

// tenis_mis_reservas(): resumen de la reserva + lo del socio logueado.
// puede_cancelar lo decide el servidor (titular, confirmada y en plazo).
// personas: quién juega (con ids), para precargar la edición.
export interface PersonaReserva {
  socio_id:    string | null
  invitado_id: string | null
  nombre:      string
  es_titular:  boolean
  a_designar?: boolean
}

export interface MiReserva {
  id:               string
  cancha:           string
  cancha_id:        string | null
  origen:           string | null
  inicio:           string
  fin:              string
  modalidad:        Modalidad
  estado:           string
  es_titular:       boolean
  jugadores:        CargoJugador[]
  personas:         PersonaReserva[]
  // socio del logueado (para "con quién juego"); null si el servidor no lo manda.
  mi_socio_id:      string | null
  total:            number | null
  mi_cargo:         number | null
  mi_motivo:        string | null
  cancelable_hasta: string | null
  puede_cancelar:   boolean
  comentario?:      string | null
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
    'precio_socio_dobles', 'precio_nosocio_single', 'precio_nosocio_dobles', 'dias_vista',
  ] as const
  for (const k of numericos) c[k] = numero(raw[k], c[k])
  if (typeof raw.alias_pago === 'string') c.alias_pago = raw.alias_pago
  if (typeof raw.bloquear_morosos === 'boolean') c.bloquear_morosos = raw.bloquear_morosos
  return c
}

function parsearJugadorGrilla(raw: unknown): JugadorGrilla | null {
  if (!esObjeto(raw)) return null
  return {
    id:           texto(raw.jugador_id) ?? texto(raw.id) ?? '',
    nombre:       texto(raw.nombre) ?? '—',
    es_titular:   raw.es_titular === true,
    cargo:        numero(raw.cargo),
    motivo:       texto(raw.motivo ?? raw.motivo_cargo),
    cobrado:      raw.cobrado === true,
    monto_cobrado: raw.monto_cobrado === null || raw.monto_cobrado === undefined ? null : numero(raw.monto_cobrado),
    diferencia:    numero(raw.diferencia),
    check_in_at:  texto(raw.check_in_at),
    socio_id:     texto(raw.socio_id),
    invitado_id:  texto(raw.invitado_id),
    numero_socio: texto(raw.numero_socio),
    dni:          texto(raw.dni),
  }
}

// Un jugador que ya está en la reserva, como entrada de
// tenis_jugadores_corregir: socio por socio_id, invitado por DNI (la base no
// acepta invitado_id). null si no hay con qué identificarlo.
export function entradaJugadorExistente(j: Pick<JugadorGrilla, 'socio_id' | 'dni'>): JugadorEntrada | null {
  if (j.socio_id) return { socio_id: j.socio_id }
  if (j.dni) return { dni: j.dni }
  return null
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
    bloque_todas:  'bloque_cancha_id' in raw ? raw.bloque_cancha_id === null : raw.cancha_id === null,
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
  const h = esObjeto(r.horario) ? r.horario : null
  const desde = h ? hhmm(h.desde, '') : ''
  const hasta = h ? hhmm(h.hasta, '') : ''
  return {
    config: parsearConfig(r.config), canchas, items,
    horario: desde && hasta ? { desde, hasta } : null,
    reservable: r.reservable !== false,
  }
}

function parsearCargos(raw: unknown): CargoJugador[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(esObjeto).map(j => ({
    nombre: texto(j.nombre) ?? '—',
    cargo:  numero(j.cargo),
    motivo: texto(j.motivo ?? j.motivo_cargo),
  }))
}

function parsearPersonas(raw: unknown): PersonaReserva[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(esObjeto).map(j => ({
    socio_id:    texto(j.socio_id),
    invitado_id: texto(j.invitado_id),
    nombre:      texto(j.nombre) ?? '—',
    es_titular:  j.es_titular === true,
    ...(j.a_designar === true ? { a_designar: true } : {}),
  }))
}

export function parsearResultadoReserva(raw: unknown): ResultadoReserva | null {
  if (!esObjeto(raw)) return null
  const id = texto(raw.reserva_id)
  if (!id) return null
  return { reserva_id: id, jugadores: parsearCargos(raw.jugadores), total: numero(raw.total) }
}

export function parsearMisReservas(raw: unknown): MiReserva[] {
  const lista = Array.isArray(raw) ? raw : []
  return lista.filter(esObjeto).flatMap(r => {
    const id = texto(r.reserva_id)
    const inicio = texto(r.inicio)
    const fin = texto(r.fin)
    if (!id || !inicio || !fin) return []
    return [{
      id,
      cancha:           texto(r.cancha_nombre) ?? '',
      cancha_id:        texto(r.cancha_id),
      origen:           texto(r.origen),
      inicio,
      fin,
      modalidad:        r.modalidad === 'dobles' ? 'dobles' : 'singles',
      estado:           texto(r.estado) ?? 'confirmada',
      es_titular:       r.es_titular === true,
      jugadores:        parsearCargos(r.jugadores),
      personas:         parsearPersonas(r.jugadores),
      mi_socio_id:      texto(r.mi_socio_id),
      total:            r.total === undefined || r.total === null ? null : numero(r.total),
      mi_cargo:         r.mi_cargo === undefined || r.mi_cargo === null ? null : numero(r.mi_cargo),
      mi_motivo:        texto(r.mi_motivo),
      cancelable_hasta: texto(r.cancelable_hasta),
      puede_cancelar:   r.puede_cancelar === true,
      comentario:       texto(r.comentario),
    } satisfies MiReserva]
  })
}

// tenis_comprobantes_pendientes(): resumen staff + comprobante_path y el
// titular invitado {invitado_id, nombre, dni, email}.
export interface ComprobantePendiente {
  reserva_id: string
  cancha:     string
  inicio:     string
  fin:        string
  modalidad:  Modalidad
  titular:    string
  dni:        string | null
  email:      string | null
  total:      number
  vence_at:   string | null
}

export function parsearComprobantes(raw: unknown): ComprobantePendiente[] {
  const lista = Array.isArray(raw) ? raw : []
  return lista.filter(esObjeto).flatMap(o => {
    const id = texto(o.reserva_id)
    const inicio = texto(o.inicio)
    if (!id || !inicio) return []
    const t = esObjeto(o.titular) ? o.titular : {}
    return [{
      reserva_id: id,
      cancha:     texto(o.cancha_nombre) ?? '',
      inicio,
      fin:        texto(o.fin) ?? inicio,
      modalidad:  o.modalidad === 'dobles' ? 'dobles' : 'singles',
      titular:    texto(t.nombre) || '—',
      dni:        texto(t.dni),
      email:      texto(t.email),
      total:      numero(o.total),
      vence_at:   texto(o.comprobante_vence_at),
    } satisfies ComprobantePendiente]
  })
}

// tenis_checkin(): persona, reserva (resumen staff) y la fila del jugador.
export interface Checkin {
  persona:    { tipo: 'socio' | 'invitado'; nombre: string; semaforo: string | null } | null
  reserva:    { id: string; cancha_id: string | null; cancha: string; inicio: string; fin: string; modalidad: Modalidad } | null
  // Saldo (contrato 14): lo cobrado, cargo − cobrado (> 0 falta, < 0 a favor),
  // el cargo por no-show y lo que falta cobrar en total.
  jugador:    {
    id: string | null; cargo: number; cobrado: boolean
    monto_cobrado: number | null; diferencia: number
    cargo_no_show: number; cargo_no_show_cobrado: boolean; pendiente: number
  } | null
  suspendido: boolean
  resultado:  string
}

export function parsearCheckin(raw: unknown): Checkin {
  const o = esObjeto(raw) ? raw : {}
  const p = esObjeto(o.persona) ? o.persona : null
  const r = esObjeto(o.reserva) ? o.reserva : null
  const j = esObjeto(o.jugador) ? o.jugador : null
  const reservaId = r ? texto(r.reserva_id) : null
  return {
    persona: p ? { tipo: p.tipo === 'invitado' ? 'invitado' : 'socio', nombre: texto(p.nombre) ?? '—', semaforo: texto(p.semaforo) } : null,
    reserva: r && reservaId ? {
      id:        reservaId,
      cancha_id: texto(r.cancha_id),
      cancha:    texto(r.cancha_nombre) ?? '',
      inicio:    texto(r.inicio) ?? '',
      fin:       texto(r.fin) ?? '',
      modalidad: r.modalidad === 'dobles' ? 'dobles' : 'singles',
    } : null,
    jugador:    j ? {
      id:                    texto(j.jugador_id),
      cargo:                 numero(j.cargo),
      cobrado:               j.cobrado === true,
      monto_cobrado:         j.monto_cobrado === undefined || j.monto_cobrado === null ? null : numero(j.monto_cobrado),
      diferencia:            numero(j.diferencia),
      cargo_no_show:         numero(j.cargo_no_show),
      cargo_no_show_cobrado: j.cargo_no_show_cobrado === true,
      // Servidor anterior sin `pendiente`: lo que falta del turno.
      pendiente:             j.pendiente === undefined || j.pendiente === null
        ? (j.cobrado === true ? 0 : numero(j.cargo))
        : numero(j.pendiente),
    } : null,
    suspendido: o.suspendido === true,
    resultado:  texto(o.resultado) ?? 'sin_reserva',
  }
}

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

// tenis_infracciones_listar(): {infracciones, suspensiones} (una lista suelta
// se toma como infracciones). Automática = la creó el sistema (creado_por null).
export function parsearSanciones(raw: unknown): { infracciones: Infraccion[]; suspensiones: Suspension[] } {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const inf = Array.isArray(raw) ? raw : Array.isArray(o.infracciones) ? o.infracciones : []
  const sus = Array.isArray(o.suspensiones) ? o.suspensiones : []
  return {
    infracciones: inf.flatMap(x => {
      if (!x || typeof x !== 'object') return []
      const i = x as Record<string, unknown>
      const id = texto(i.id)
      if (!id) return []
      return [{
        id,
        socio_id:    texto(i.socio_id),
        invitado_id: texto(i.invitado_id),
        nombre:      texto(i.nombre) ?? '—',
        tipo:        texto(i.tipo) ?? 'otra',
        nota:        texto(i.nota),
        perdonada:   i.perdonada === true,
        automatica:  i.creado_por === null || i.automatica === true,
        created_at:  texto(i.created_at) ?? '',
      } satisfies Infraccion]
    }),
    suspensiones: sus.flatMap(x => {
      if (!x || typeof x !== 'object') return []
      const i = x as Record<string, unknown>
      const id = texto(i.id)
      if (!id) return []
      return [{
        id,
        socio_id:    texto(i.socio_id),
        invitado_id: texto(i.invitado_id),
        nombre:      texto(i.nombre) ?? '—',
        desde:       texto(i.desde) ?? '',
        hasta:       texto(i.hasta) ?? '',
        motivo:      texto(i.motivo),
      } satisfies Suspension]
    }),
  }
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

// Optimizador (F9, regla de la subcomisión de tenis): una reserva no puede
// dejar un hueco inutilizable en su cancha. El tiempo libre entre el turno
// nuevo y lo ocupado inmediatamente antes y después (reservas activas y
// bloques, incluidos los de todas las canchas) — o la apertura / el cierre —
// tiene que ser 0 o de al menos `singles_min`. Es una regla fija (sin config):
// no se aplica si el turno es del mismo día en Argentina. El servidor aplica la
// misma regla (`hueco_invalido`, `dejaHuecoValido`); las reservas telefónicas
// del staff no la usan. `items` = lo que devuelve la disponibilidad.
export function pasaOptimizador(
  items: Pick<ItemGrilla, 'cancha_id' | 'inicio' | 'fin'>[],
  canchaId: string,
  inicioMs: number,
  finMs: number,
  config: Pick<TenisConfig, 'hora_desde' | 'hora_hasta' | 'singles_min'>,
  ahoraMs: number,
): boolean {
  const fecha = fechaArgentina(inicioMs)
  if (fecha === fechaArgentina(ahoraMs)) return true
  const base = inicioDelDia(fecha)
  let anterior  = base + minutosDeHora(config.hora_desde) * MIN_MS
  let siguiente = base + minutosDeHora(config.hora_hasta) * MIN_MS
  for (const i of items) {
    if (i.cancha_id !== null && i.cancha_id !== canchaId) continue
    const a = Date.parse(i.inicio)
    const b = Date.parse(i.fin)
    if (b <= inicioMs && b > anterior) anterior = b
    if (a >= finMs && a < siguiente) siguiente = a
  }
  const minimo = config.singles_min * MIN_MS
  const valido = (hueco: number) => hueco <= 0 || hueco >= minimo
  return valido(inicioMs - anterior) && valido(siguiente - finMs)
}

// Horarios en los que entra un turno de esa modalidad en esa cancha, sin pisar
// reservas ni bloques, dentro del horario y que todavía no empezaron. Con
// `optimizador` (reserva del socio) sólo los que pasan `pasaOptimizador`; el
// staff (reserva telefónica) ve todos.
export function iniciosLibres(
  items: Pick<ItemGrilla, 'cancha_id' | 'inicio' | 'fin'>[],
  canchaId: string,
  fecha: string,
  modalidad: Modalidad,
  config: TenisConfig,
  ahoraMs: number,
  opciones: { optimizador?: boolean } = {},
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
    if (opciones.optimizador && !pasaOptimizador(items, canchaId, ini, fin, config, ahoraMs)) continue
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

// Claves = `tipo` de tenis_disponibilidad / tenis_grilla.
const ESTILOS: Record<string, EstiloItem> = {
  reserva_web:        { ...tenis.web,        etiqueta: 'Reserva web' },
  reserva_invitado:   { ...tenis.web,        etiqueta: 'Invitado' },
  extension:          { ...tenis.web,        etiqueta: 'Extensión' },
  reserva_telefonica: { ...tenis.telefonica, etiqueta: 'Reserva telefónica' },
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
  ESTILOS.reserva_web, ESTILOS.reserva_telefonica, ESTILOS.torneo, ESTILOS.clase,
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

// "EDITAR RESERVA": sólo el titular de una reserva suya (origen 'socio',
// confirmada) y con el mismo plazo que cancelar. El servidor lo vuelve a validar
// (tenis_editar_reserva: reserva_no_editable / fuera_de_plazo).
export function puedeEditar(
  r: Pick<MiReserva, 'es_titular' | 'estado' | 'origen' | 'inicio'>,
  ahoraMs: number,
  horas: number = CONFIG_DEFECTO.cancelacion_horas,
): boolean {
  return r.es_titular && r.estado === 'confirmada' && r.origen === 'socio' && puedeCancelar(r.inicio, ahoraMs, horas)
}

// Los otros jugadores de la reserva como elegidos del formulario (sin el
// titular): socio por socio_id, invitado por invitado_id. La clave es la misma
// que usa el buscador para un socio (socio_id); el invitado usa 'inv:<id>'.
export interface JugadorPrecargado {
  clave:   string
  nombre:  string
  entrada: JugadorEntrada
}

export function jugadoresParaEditar(r: Pick<MiReserva, 'personas'>): JugadorPrecargado[] {
  return r.personas.flatMap((p, i): JugadorPrecargado[] => {
    if (p.es_titular) return []
    if (p.socio_id) return [{ clave: p.socio_id, nombre: p.nombre, entrada: { socio_id: p.socio_id } }]
    if (p.invitado_id) return [{ clave: `inv:${p.invitado_id}`, nombre: p.nombre, entrada: { invitado_id: p.invitado_id } }]
    if (p.a_designar) return [{ clave: `designar:${i}`, nombre: 'Socio a designar', entrada: { a_designar: true } }]
    return []
  })
}

// La grilla sin la reserva que se está editando: su propio turno queda libre.
export function itemsSinReserva<T extends Pick<ItemGrilla, 'reserva_id'>>(items: T[], reservaId: string | null | undefined): T[] {
  return reservaId ? items.filter(i => i.reserva_id !== reservaId) : items
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

// Jugador cobrado cuyo cargo cambió al editar la reserva: "Pagó $ 9.000 · falta
// cobrar $ 1.000" o "… · hay que devolver $ 1.000". null si no hay diferencia.
export function textoDiferenciaCobro(j: Pick<JugadorGrilla, 'cobrado' | 'monto_cobrado' | 'diferencia'>): string | null {
  if (!j.cobrado || j.diferencia === 0) return null
  const pago = `Pagó ${formatMonto(j.monto_cobrado ?? 0)}`
  return j.diferencia > 0
    ? `${pago} · falta cobrar ${formatMonto(j.diferencia)}`
    : `${pago} · hay que devolver ${formatMonto(-j.diferencia)}`
}

// tenis_cobros_ajustes_pendientes(): plata a devolver (monto > 0) o a cobrar
// (monto < 0) fuera de la reserva: alguien que pagó y salió al editarla o
// corregirla ('jugador_quitado') o un cobrado cuyo cargo cambió ('cambio_turno').
export interface AjusteCobro {
  id:           string
  reserva_id:   string
  nombre:       string
  numero_socio: string | null
  dni:          string | null
  monto:        number
  motivo:       'jugador_quitado' | 'cambio_turno'
  cancha:       string
  inicio:       string
}

export function parsearAjustesCobro(raw: unknown): AjusteCobro[] {
  const lista = Array.isArray(raw) ? raw : []
  return lista.filter(esObjeto).flatMap(o => {
    const id = texto(o.id)
    const reserva = texto(o.reserva_id)
    const inicio = texto(o.inicio)
    const monto = numero(o.monto)
    if (!id || !reserva || !inicio || monto === 0) return []
    return [{
      id,
      reserva_id:   reserva,
      nombre:       texto(o.nombre) || '—',
      numero_socio: texto(o.numero_socio),
      dni:          texto(o.dni),
      monto,
      motivo:       o.motivo === 'cambio_turno' ? 'cambio_turno' : 'jugador_quitado',
      cancha:       texto(o.cancha_nombre) ?? '',
      inicio,
    } satisfies AjusteCobro]
  })
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
  if (err.code === 'P0001' && typeof err.message === 'string' && /^[a-z0-9_]+$/.test(err.message)) return err.message
  return null
}

// Códigos de la migración 20261112000000 (ver su header) y, al final, los que
// agregan sólo las Edge Functions (tenis-gestion / tenis-invitados).
const MENSAJES: Record<string, string> = {
  no_autorizado:           SIN_PERMISO,
  sin_socio:               'Tu cuenta no está vinculada a un socio. Consultá en Secretaría.',
  no_es_socio:             'Esa persona no es socia activa del club.',
  parametros:              'Faltan datos o hay datos inválidos.',
  modalidad_invalida:      'Elegí singles o dobles.',
  origen_invalido:         'Tipo de reserva inválido.',
  cancha_inexistente:      'Esa cancha no existe.',
  cancha_inactiva:         'La cancha no está disponible.',
  horario_invalido:        'Los turnos arrancan en punto o y media.',
  fuera_de_horario:        'Ese horario está fuera del horario de las canchas.',
  pasado:                  'Ese horario ya pasó.',
  anticipacion:            'Sólo se puede reservar hasta 2 días antes.',
  bloqueado:               'La cancha no está disponible en ese horario.',
  turno_ocupado:           'Ese horario ya está ocupado. Elegí otro.',
  limite_dia:              'Ya tenés una reserva ese día.',
  limite_activas:          'Ya tenés 2 reservas activas. Esperá a jugar una para reservar otra.',
  cantidad_jugadores:      'Faltan o sobran jugadores para esa modalidad.',
  jugadores_duplicados:    'Un jugador está cargado dos veces.',
  jugador_ocupado:         'Uno de los jugadores ya tiene otro turno a esa hora.',
  socio_no_encontrado:     'No encontramos a nadie con ese DNI. Si no es socio, cargalo como invitado.',
  dni_invalido:            'Revisá el DNI.',
  invitado_incompleto:     'Completá nombre y apellido del invitado.',
  email_invalido:          'Revisá el mail.',
  titular_suspendido:      'Estás suspendido para reservar canchas.',
  titular_moroso:          'Tenés la cuota atrasada: regularizala para reservar.',
  jugador_no_habilitado:   'Uno de los jugadores no está habilitado para jugar.',
  titular_es_socio:        'El titular es socio: tiene que reservar desde la app.',
  plazo_invitado:          'Ese turno está muy cerca para una reserva de invitado.',
  reserva_inexistente:     'No se encontró la reserva.',
  estado_invalido:         'La reserva ya no se puede modificar.',
  reserva_finalizada:      'Ese turno ya terminó.',
  fuera_de_plazo:          'Ya no se puede cancelar ni cambiar: faltan menos de 3 horas.',
  reserva_no_editable:     'Esta reserva no se puede cambiar desde la app. Consultá en el club.',
  reintentar:              'La reserva cambió mientras la editabas. Probá de nuevo.',
  token_invalido:          'El link no es válido o ya venció.',
  hold_vencido:            'Pasaron los 15 minutos y el turno se liberó.',
  reserva_cancelada:       'La reserva fue cancelada.',
  comprobante_vencido:     'Ya pasó el plazo para subir el comprobante.',
  path_invalido:           'El comprobante no es válido.',
  motivo_requerido:        'Escribí el motivo.',
  bloque_invalido:         'Revisá el bloque: tipo, título y horario.',
  bloque_inexistente:      'Ese bloque ya no existe.',
  config_invalida:         'Revisá los valores de las reglas.',
  dias_invalidos:          'Ingresá entre 1 y 365 días.',
  persona_requerida:       'Elegí a la persona.',
  jugador_inexistente:     'Ese jugador ya no está en la reserva.',
  infraccion_inexistente:  'Esa infracción ya no existe.',
  suspension_inexistente:  'Esa suspensión ya no está vigente.',
  extension_invalida:      'Revisá el horario de la extensión: tiene que terminar después del turno.',
  hueco_invalido:          'Ese horario dejaría media hora libre que nadie puede usar. Elegí uno pegado a otra reserva.',
  // Sólo Edge Functions.
  limitado:                'Hubo muchos pedidos seguidos. Probá de nuevo en un rato.',
  jugador_sin_nombre:      'Ese DNI no es de un socio: completá nombre y apellido.',
  comprobante_invalido:    'El comprobante tiene que ser JPG, PNG o PDF de hasta 5 MB.',
  comprobante_no_subido:   'Todavía no hay comprobante subido.',
}

export const CODIGOS_TENIS: readonly string[] = Object.keys(MENSAJES)

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

// Aviso antes de confirmar una reserva de socio (la telefónica del staff no
// lo muestra). Mismo texto que web/lib/tenis.ts.
export const AVISO_SANCIONES = {
  titulo: 'Antes de confirmar',
  texto:  'Si no cumplís con la reserva (no te presentás o los jugadores no están bien cargados), se aplican sanciones: la primera vez es un aviso y después podés quedar suspendido para reservar. Si no se presentan, el titular paga el turno de todos.',
} as const
