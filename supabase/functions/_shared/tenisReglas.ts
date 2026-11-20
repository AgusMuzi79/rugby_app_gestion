// Reglas puras de las reservas de tenis (feature reservas-tenis, migración 20261112000000).
//
// TypeScript puro: sólo Web Crypto (global en Deno y en Node), sin base ni red, así que lo
// importan las Edge Functions tenis-* y el check con tsx (tenisReglas.check.ts).
//
// La base es la autoridad (tenis_cargo_jugador, tenis_reservar, tenis_invitado_*): estas reglas
// la espejan para validar antes de llamar y para armar mensajes. Si cambian, cambiar las dos.
//
// Zona horaria: Argentina, UTC-3 fijo (no hay horario de verano), igual que gimnasio_ahora().

export type Modalidad = 'singles' | 'dobles'
export type MotivoCargo = 'carnet_gratis' | 'turno_extra' | 'socio' | 'no_socio' | 'no_show'

export interface TenisConfig {
  hora_desde: string
  hora_hasta: string
  modulo_min: number
  margen_inicio_min: number
  singles_min: number
  dobles_min: number
  max_reservas_dia: number
  max_activas: number
  anticipacion_dias: number
  cancelacion_horas: number
  comprobante_horas_antes: number
  hold_min: number
  alias_pago: string
  precio_socio_single: number
  precio_socio_dobles: number
  precio_nosocio_single: number
  precio_nosocio_dobles: number
}

// Mismos defaults que la tabla tenis_config.
export const TENIS_CONFIG_DEFAULT: TenisConfig = {
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
}

/** Mezcla una fila de tenis_config (o null) con los defaults; ignora campos con tipo inesperado. */
export function configDesdeFila(fila: unknown): TenisConfig {
  const cfg: TenisConfig = { ...TENIS_CONFIG_DEFAULT }
  if (!fila || typeof fila !== 'object') return cfg
  const f = fila as Record<string, unknown>
  for (const k of Object.keys(cfg) as (keyof TenisConfig)[]) {
    const v = f[k]
    if (typeof cfg[k] === 'number' && typeof v === 'number') (cfg as unknown as Record<string, unknown>)[k] = v
    if (typeof cfg[k] === 'string' && typeof v === 'string') (cfg as unknown as Record<string, unknown>)[k] = v
  }
  return cfg
}

const MIN = 60 * 1000
const OFFSET_AR_MS = -3 * 60 * MIN
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Fechas y horas de Argentina ──────────────────────────────────────────────

/** 'AAAA-MM-DD' del día local de Argentina. */
export function fechaLocal(instante: Date): string {
  return new Date(instante.getTime() + OFFSET_AR_MS).toISOString().slice(0, 10)
}

/** 'HH:MM' local de Argentina. */
export function horaLocal(instante: Date): string {
  return new Date(instante.getTime() + OFFSET_AR_MS).toISOString().slice(11, 16)
}

/** Instante de una fecha + hora local ('HH:MM' o 'HH:MM:SS', como llega de Postgres). */
export function instanteLocal(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora.slice(0, 5)}:00-03:00`)
}

/** Minutos desde la medianoche local. */
function minutosDelDia(instante: Date): number {
  const [h, m] = horaLocal(instante).split(':').map(Number)
  return h * 60 + m
}

function minutosDeHora(hora: string): number {
  const [h, m] = hora.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Día de semana ISO: 1 = lunes … 7 = domingo. */
export function diaSemanaIso(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export function fechaValida(f: unknown): f is string {
  if (typeof f !== 'string' || !FECHA_RE.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

// ─── Turnos ───────────────────────────────────────────────────────────────────

export function esModalidad(x: unknown): x is Modalidad {
  return x === 'singles' || x === 'dobles'
}

export function duracionMin(modalidad: Modalidad, cfg: TenisConfig): number {
  return modalidad === 'singles' ? cfg.singles_min : cfg.dobles_min
}

/** Jugadores que se cargan además del titular: singles 1, dobles 3. */
export function jugadoresRequeridos(modalidad: Modalidad): number {
  return modalidad === 'singles' ? 1 : 3
}

export function finTurno(inicio: Date, modalidad: Modalidad, cfg: TenisConfig): Date {
  return new Date(inicio.getTime() + duracionMin(modalidad, cfg) * MIN)
}

/** Los turnos arrancan unos minutos después de la hora reservada (barrido de la cancha). */
export function inicioReal(inicio: Date, cfg: TenisConfig): Date {
  return new Date(inicio.getTime() + cfg.margen_inicio_min * MIN)
}

/** Lo que ve el jugador: "18:05". */
export function horaInicioReal(inicio: Date, cfg: TenisConfig): string {
  return horaLocal(inicioReal(inicio, cfg))
}

export function alineadoAModulo(inicio: Date, cfg: TenisConfig): boolean {
  return inicio.getTime() % MIN === 0 && minutosDelDia(inicio) % cfg.modulo_min === 0
}

/** El turno entero entra en el horario de las canchas (y no cruza la medianoche). */
export function dentroDeHorario(inicio: Date, modalidad: Modalidad, cfg: TenisConfig): boolean {
  const desde = minutosDelDia(inicio)
  const hasta = desde + duracionMin(modalidad, cfg)
  return desde >= minutosDeHora(cfg.hora_desde) && hasta <= minutosDeHora(cfg.hora_hasta)
}

/** Se reserva desde hoy hasta hoy + anticipacion_dias (día local). */
export function dentroDeAnticipacion(fecha: string, ahora: Date, cfg: TenisConfig): boolean {
  const hoy = fechaLocal(ahora)
  return fecha >= hoy && fecha <= sumarDias(hoy, cfg.anticipacion_dias)
}

export type CodigoTurno =
  | 'parametros'
  | 'modalidad_invalida'
  | 'no_alineado'
  | 'fuera_de_horario'
  | 'pasado'
  | 'fuera_de_anticipacion'

/** Validación previa de un turno pedido; null = pasa. La base vuelve a validar todo. */
export function validarTurno(inicio: Date, modalidad: unknown, ahora: Date, cfg: TenisConfig): CodigoTurno | null {
  if (Number.isNaN(inicio.getTime())) return 'parametros'
  if (!esModalidad(modalidad)) return 'modalidad_invalida'
  if (!alineadoAModulo(inicio, cfg)) return 'no_alineado'
  if (!dentroDeHorario(inicio, modalidad, cfg)) return 'fuera_de_horario'
  if (inicio.getTime() <= ahora.getTime()) return 'pasado'
  if (!dentroDeAnticipacion(fechaLocal(inicio), ahora, cfg)) return 'fuera_de_anticipacion'
  return null
}

// ─── Precios ──────────────────────────────────────────────────────────────────

export type JugadorPrecio =
  | { tipo: 'socio'; carnetTenis: boolean; otroTurnoEseDia: boolean }
  | { tipo: 'invitado' }

/** Espejo de tenis_cargo_jugador(): carnet = primer turno del día gratis, después precio socio. */
export function cargoJugador(j: JugadorPrecio, modalidad: Modalidad, cfg: TenisConfig): { cargo: number; motivo: MotivoCargo } {
  if (j.tipo === 'invitado') {
    return { cargo: modalidad === 'singles' ? cfg.precio_nosocio_single : cfg.precio_nosocio_dobles, motivo: 'no_socio' }
  }
  const precioSocio = modalidad === 'singles' ? cfg.precio_socio_single : cfg.precio_socio_dobles
  if (!j.carnetTenis) return { cargo: precioSocio, motivo: 'socio' }
  if (!j.otroTurnoEseDia) return { cargo: 0, motivo: 'carnet_gratis' }
  return { cargo: precioSocio, motivo: 'turno_extra' }
}

export function totalCargos(cargos: { cargo: number }[]): number {
  return cargos.reduce((s, c) => s + c.cargo, 0)
}

/** "$44.000" */
export function formatoPesos(n: number): string {
  const entero = Math.round(n).toString()
  return `$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

// ─── Plazos ───────────────────────────────────────────────────────────────────

export function puedeCancelar(inicio: Date, ahora: Date, cfg: TenisConfig): boolean {
  return ahora.getTime() <= inicio.getTime() - cfg.cancelacion_horas * 60 * MIN
}

/** Hasta cuándo un invitado puede subir el comprobante. */
export function venceComprobante(inicio: Date, cfg: TenisConfig): Date {
  return new Date(inicio.getTime() - cfg.comprobante_horas_antes * 60 * MIN)
}

/** Hasta cuándo se guarda el turno de un invitado que todavía no confirmó por mail. */
export function venceHold(ahora: Date, cfg: TenisConfig): Date {
  return new Date(ahora.getTime() + cfg.hold_min * MIN)
}

// ─── Datos del invitado ───────────────────────────────────────────────────────

/** DNI sin puntos ni espacios, 7 u 8 dígitos. */
export function normalizarDni(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const limpio = x.replace(/[.\s-]/g, '')
  return /^\d{7,8}$/.test(limpio) ? limpio : null
}

export function normalizarEmail(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const e = x.trim().toLowerCase()
  if (e.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** Nombre o apellido: 1..60 caracteres, sin símbolos que rompan un mail o una grilla. */
export function normalizarNombre(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const n = x.trim().replace(/\s+/g, ' ')
  if (!n || n.length > 60) return null
  return /^[\p{L}\p{M}' .-]+$/u.test(n) ? n : null
}

// ─── Comprobantes ─────────────────────────────────────────────────────────────

export const COMPROBANTE_BUCKET = 'tenis-comprobantes'
export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024
export type ExtensionComprobante = 'jpg' | 'png' | 'pdf'

/** Acepta extensión ('jpg', 'jpeg', 'png', 'pdf') o tipo MIME. */
export function extensionComprobante(x: unknown): ExtensionComprobante | null {
  if (typeof x !== 'string') return null
  const v = x.trim().toLowerCase().replace(/^\./, '')
  if (v === 'jpg' || v === 'jpeg' || v === 'image/jpeg' || v === 'image/jpg') return 'jpg'
  if (v === 'png' || v === 'image/png') return 'png'
  if (v === 'pdf' || v === 'application/pdf') return 'pdf'
  return null
}

export const CONTENT_TYPE_COMPROBANTE: Record<ExtensionComprobante, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const UUID_RE = new RegExp(`^${UUID}$`, 'i')

/** Path dentro del bucket: '<reserva_id>/<uuid>.<jpg|png|pdf>'. */
export function pathComprobanteValido(path: unknown, reservaId: string): path is string {
  if (typeof path !== 'string' || !UUID_RE.test(reservaId)) return false
  return new RegExp(`^${reservaId}/${UUID}\\.(jpg|png|pdf)$`, 'i').test(path)
}

// ─── Token del mail de confirmación ───────────────────────────────────────────

export const URL_CONFIRMAR = 'https://uncasapp.com/tenis/confirmar'

export function linkConfirmacion(token: string): string {
  return `${URL_CONFIRMAR}?t=${encodeURIComponent(token)}`
}

function base64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 bytes al azar en base64url (43 caracteres). Nunca se guarda ni se loguea: sólo su hash. */
export function generarToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function tokenConForma(x: unknown): x is string {
  return typeof x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(x)
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 en hex: lo que se guarda en tenis_reservas.confirmacion_token_hash. */
export async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
}

// ─── Límite de pedidos de invitados (tabla tenis_invitados_intentos) ──────────

type Limite = { ventanaSegundos: number; maximo: number }

// Una persona real reserva 1 o 2 veces por día; una familia o la red del club comparten IP.
export const LIMITES_INVITADOS: { dni: Limite; email: Limite; ip: Limite } = {
  dni: { ventanaSegundos: 3600, maximo: 5 },
  email: { ventanaSegundos: 3600, maximo: 5 },
  ip: { ventanaSegundos: 3600, maximo: 20 },
}

export type ClaveLimite = { clave: string; ventanaSegundos: number; maximo: number }

export async function hmacHex(claveHmac: string, texto: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(claveHmac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(texto)))
}

/** Claves HMAC (la tabla nunca guarda DNIs, mails ni IPs en claro). Sin IP confiable, no hay límite por IP. */
export async function clavesLimiteInvitado(
  datos: { dni: string; email: string; ip: string | null },
  claveHmac: string,
): Promise<ClaveLimite[]> {
  const claves: ClaveLimite[] = [
    { clave: `tenis:dni:${await hmacHex(claveHmac, `dni:${datos.dni}`)}`, ...LIMITES_INVITADOS.dni },
    { clave: `tenis:email:${await hmacHex(claveHmac, `email:${datos.email}`)}`, ...LIMITES_INVITADOS.email },
  ]
  if (datos.ip) claves.push({ clave: `tenis:ip:${await hmacHex(claveHmac, `ip:${datos.ip}`)}`, ...LIMITES_INVITADOS.ip })
  return claves
}

// ─── Errores de las RPC ───────────────────────────────────────────────────────

/**
 * Las RPC de tenis cortan con `raise exception using errcode = 'P0001', message = '<codigo>'`.
 * Devuelve ese código, o 'cancha_ocupada' si saltó el exclusion constraint (23P01). null = error real.
 */
export function codigoDeError(err: { code?: string; message?: string } | null | undefined): string | null {
  if (!err) return null
  if (err.code === '23P01') return 'cancha_ocupada'
  if (err.code === 'P0001' && typeof err.message === 'string' && /^[a-z0-9_]+$/.test(err.message)) return err.message
  return null
}

const MOTIVOS: Record<string, string> = {
  parametros: 'Faltan datos o hay datos inválidos.',
  modalidad_invalida: 'Elegí singles o dobles.',
  no_alineado: 'Los turnos arrancan en punto o y media.',
  fuera_de_horario: 'Ese horario está fuera del horario de las canchas.',
  pasado: 'Ese horario ya pasó.',
  fuera_de_anticipacion: 'Sólo se puede reservar hasta 2 días antes.',
  cancha_inexistente: 'Esa cancha no existe.',
  cancha_inactiva: 'Esa cancha no está disponible.',
  cancha_ocupada: 'Ese turno ya está ocupado. Elegí otro horario.',
  bloqueado: 'Ese horario no está disponible.',
  jugadores_invalidos: 'Revisá los jugadores: singles lleva 1 jugador más y dobles 3.',
  jugador_repetido: 'Un jugador está cargado dos veces.',
  jugador_suspendido: 'Uno de los jugadores está suspendido y no puede jugar.',
  suspendido: 'Estás suspendido y no podés reservar por ahora.',
  limite_dia: 'Ya tenés una reserva ese día.',
  limite_activas: 'Ya tenés 2 reservas activas.',
  moroso: 'Tenés la cuota pendiente: regularizala para reservar.',
  titular_es_socio: 'Sos socio del club: reservá desde la app.',
  socio_no_encontrado: 'No encontramos un socio con ese DNI.',
  token_invalido: 'El link no es válido o ya venció.',
  hold_vencido: 'Pasaron los 15 minutos y el turno se liberó. Volvé a reservar.',
  ya_confirmada: 'Esta reserva ya estaba confirmada.',
  estado_invalido: 'La reserva ya no admite este cambio.',
  comprobante_vencido: 'Ya pasó el plazo para subir el comprobante.',
  comprobante_invalido: 'El comprobante tiene que ser JPG, PNG o PDF de hasta 5 MB.',
  comprobante_no_subido: 'No encontramos el archivo. Subilo de nuevo.',
  fuera_de_plazo: 'Ya no se puede cancelar: faltan menos de 3 horas.',
  no_autorizado: 'No tenés permiso para hacer esto.',
  reserva_inexistente: 'No encontramos esa reserva.',
  motivo_requerido: 'Escribí el motivo del rechazo.',
  limitado: 'Hiciste muchos pedidos seguidos. Probá de nuevo en un rato.',
}

export function motivoTenis(codigo: string): string {
  return MOTIVOS[codigo] ?? 'No se pudo completar la operación. Probá de nuevo.'
}

// ─── Resumen de tenis_procesar() (cron) ───────────────────────────────────────

export interface Advertencia {
  socio_id: string | null
  invitado_id: string | null
  reserva_id: string | null
}

export interface ResumenProcesar {
  /** Holds sin confirmar que pasaron a 'vencida'. */
  vencidas: string[]
  /** 'pendiente_comprobante' canceladas por no subir el comprobante a tiempo. */
  canceladas: string[]
  /** 'confirmada' sin ningún check-in al terminar el turno. */
  no_shows: string[]
  /** Primera infracción de una persona: queda como advertencia. */
  advertencias: Advertencia[]
}

function uuidONull(x: unknown): string | null {
  return typeof x === 'string' && UUID_RE.test(x) ? x : null
}

function idsDeReservas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return []
  const ids: string[] = []
  for (const item of lista) {
    const id = typeof item === 'string'
      ? uuidONull(item)
      : item && typeof item === 'object'
      ? uuidONull((item as Record<string, unknown>).reserva_id ?? (item as Record<string, unknown>).id)
      : null
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Tolerante: acepta ids sueltos u objetos con reserva_id; lo que falte o no se entienda queda vacío. */
export function parsearResumenProcesar(json: unknown): ResumenProcesar {
  const r = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const advertencias: Advertencia[] = []
  if (Array.isArray(r.advertencias)) {
    for (const a of r.advertencias) {
      if (!a || typeof a !== 'object') continue
      const o = a as Record<string, unknown>
      const adv = { socio_id: uuidONull(o.socio_id), invitado_id: uuidONull(o.invitado_id), reserva_id: uuidONull(o.reserva_id) }
      if (adv.socio_id || adv.invitado_id) advertencias.push(adv)
    }
  }
  return {
    vencidas: idsDeReservas(r.vencidas),
    canceladas: idsDeReservas(r.canceladas ?? r.canceladas_sin_comprobante),
    no_shows: idsDeReservas(r.no_shows),
    advertencias,
  }
}

// ─── Textos ───────────────────────────────────────────────────────────────────

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** "sábado 21/11 18:05 · cancha 03" */
export function describirTurno(inicio: Date, cancha: string | null, cfg: TenisConfig): string {
  const fecha = fechaLocal(inicio)
  const [, mes, dia] = fecha.split('-')
  const base = `${DIAS[diaSemanaIso(fecha) - 1]} ${dia}/${mes} ${horaInicioReal(inicio, cfg)}`
  return cancha ? `${base} · cancha ${cancha}` : base
}

export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
