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

/**
 * Optimizador (espejo de tenis_validar_hueco en la base, regla fija sin config): el hueco libre
 * que deja el turno en su cancha hasta lo anterior y lo siguiente que la ocupa ese día (reservas
 * vivas y bloques, `ocupados` de ESA cancha) o hasta la apertura/cierre tiene que ser 0 o de al
 * menos singles_min minutos. Si el turno es de hoy (día local de Argentina) siempre pasa. La
 * reserva telefónica del gestor no la aplica. false = la base contestaría 'hueco_invalido'.
 */
export function dejaHuecoValido(
  inicio: Date,
  modalidad: Modalidad,
  ocupados: { inicio: Date | string; fin: Date | string }[],
  ahora: Date,
  cfg: TenisConfig,
): boolean {
  const fecha = fechaLocal(inicio)
  if (fecha === fechaLocal(ahora)) return true
  const ini = inicio.getTime()
  const fin = finTurno(inicio, modalidad, cfg).getTime()
  const desdeDia = instanteLocal(fecha, '00:00').getTime()
  const hastaDia = instanteLocal(sumarDias(fecha, 1), '00:00').getTime()
  let prev = instanteLocal(fecha, cfg.hora_desde).getTime()
  let next = instanteLocal(fecha, cfg.hora_hasta).getTime()
  for (const o of ocupados) {
    const oIni = new Date(o.inicio).getTime()
    const oFin = new Date(o.fin).getTime()
    if (Number.isNaN(oIni) || Number.isNaN(oFin)) continue
    if (oFin <= ini && oFin > desdeDia) prev = Math.max(prev, oFin)
    if (oIni >= fin && oIni < hastaDia) next = Math.min(next, oIni)
  }
  const antes = (ini - prev) / MIN
  const despues = (next - fin) / MIN
  const corto = (h: number) => h > 0 && h < cfg.singles_min
  return !corto(antes) && !corto(despues)
}

// Mismos códigos que la base (tenis_crear_reserva / tenis_validar_turno).
export type CodigoTurno =
  | 'parametros'
  | 'modalidad_invalida'
  | 'horario_invalido'
  | 'fuera_de_horario'
  | 'pasado'
  | 'anticipacion'

/** Validación previa de un turno pedido; null = pasa. La base vuelve a validar todo. */
export function validarTurno(inicio: Date, modalidad: unknown, ahora: Date, cfg: TenisConfig): CodigoTurno | null {
  if (Number.isNaN(inicio.getTime())) return 'parametros'
  if (!esModalidad(modalidad)) return 'modalidad_invalida'
  if (!alineadoAModulo(inicio, cfg)) return 'horario_invalido'
  if (!dentroDeHorario(inicio, modalidad, cfg)) return 'fuera_de_horario'
  if (inicio.getTime() <= ahora.getTime()) return 'pasado'
  if (!dentroDeAnticipacion(fechaLocal(inicio), ahora, cfg)) return 'anticipacion'
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
 * Las RPC de tenis cortan con `raise exception using errcode = 'P0001', message = '<codigo>'`
 * (lista en el header de la migración 20261112000000). Devuelve ese código, o 'turno_ocupado' si
 * saltó el exclusion constraint (23P01). null = error real.
 */
export function codigoDeError(err: { code?: string; message?: string } | null | undefined): string | null {
  if (!err) return null
  if (err.code === '23P01') return 'turno_ocupado'
  if (err.code === 'P0001' && typeof err.message === 'string' && /^[a-z0-9_]+$/.test(err.message)) return err.message
  return null
}

// Códigos de la base y, al final, los que agregan sólo las Edge Functions.
const MOTIVOS: Record<string, string> = {
  no_autorizado: 'No tenés permiso para hacer esto.',
  sin_socio: 'Tu cuenta no está vinculada a un socio.',
  no_es_socio: 'Esa persona no es socia activa del club.',
  parametros: 'Faltan datos o hay datos inválidos.',
  modalidad_invalida: 'Elegí singles o dobles.',
  origen_invalido: 'Tipo de reserva inválido.',
  cancha_inexistente: 'Esa cancha no existe.',
  cancha_inactiva: 'Esa cancha no está disponible.',
  horario_invalido: 'Los turnos arrancan en punto o y media.',
  fuera_de_horario: 'Ese horario está fuera del horario de las canchas.',
  pasado: 'Ese horario ya pasó.',
  anticipacion: 'Sólo se puede reservar hasta 2 días antes.',
  bloqueado: 'Ese horario no está disponible.',
  turno_ocupado: 'Ese turno ya está ocupado. Elegí otro horario.',
  limite_dia: 'Ya tenés una reserva ese día.',
  limite_activas: 'Ya tenés 2 reservas activas.',
  cantidad_jugadores: 'Revisá los jugadores: singles lleva 1 jugador más y dobles 3.',
  jugadores_duplicados: 'Un jugador está cargado dos veces.',
  jugador_ocupado: 'Uno de los jugadores ya tiene otro turno a esa hora.',
  socio_no_encontrado: 'No encontramos un socio con ese DNI.',
  dni_invalido: 'Revisá el DNI.',
  invitado_incompleto: 'Completá nombre y apellido de los invitados.',
  email_invalido: 'Revisá el mail.',
  titular_suspendido: 'Estás suspendido y no podés reservar por ahora.',
  titular_moroso: 'Tenés la cuota pendiente: regularizala para reservar.',
  jugador_no_habilitado: 'Uno de los jugadores no está habilitado para jugar.',
  titular_es_socio: 'Sos socio del club: reservá desde la app.',
  plazo_invitado: 'Ese turno está muy cerca: no da el tiempo para confirmar y pagar. Elegí uno más adelante.',
  reserva_inexistente: 'No encontramos esa reserva.',
  estado_invalido: 'La reserva ya no admite este cambio.',
  reserva_finalizada: 'Ese turno ya terminó.',
  fuera_de_plazo: 'Ya no se puede cancelar: faltan menos de 3 horas.',
  token_invalido: 'El link no es válido o ya venció.',
  hold_vencido: 'Pasaron los 15 minutos y el turno se liberó. Volvé a reservar.',
  reserva_cancelada: 'Esta reserva fue cancelada.',
  comprobante_vencido: 'Ya pasó el plazo para subir el comprobante.',
  path_invalido: 'El comprobante no es válido. Subilo de nuevo.',
  motivo_requerido: 'Escribí el motivo del rechazo.',
  bloque_invalido: 'Revisá el bloque: tipo, título y horario.',
  bloque_inexistente: 'Ese bloque ya no existe.',
  config_invalida: 'Revisá los valores de las reglas.',
  dias_invalidos: 'La suspensión tiene que ser de 1 a 365 días.',
  persona_requerida: 'Elegí a la persona.',
  jugador_inexistente: 'Ese jugador ya no está en la reserva.',
  infraccion_inexistente: 'Esa infracción ya no existe.',
  suspension_inexistente: 'Esa suspensión ya no está vigente.',
  extension_invalida: 'Revisá el horario de la extensión.',
  hueco_invalido: 'Ese horario dejaría un hueco de menos de una hora en la cancha. Elegí uno pegado a otro turno o con al menos una hora libre.',
  // Sólo Edge Functions.
  limitado: 'Hiciste muchos pedidos seguidos. Probá de nuevo en un rato.',
  jugador_sin_nombre: 'Ese DNI no es de un socio: completá nombre y apellido.',
  comprobante_invalido: 'El comprobante tiene que ser JPG, PNG o PDF de hasta 5 MB.',
  comprobante_no_subido: 'No encontramos el archivo. Subilo de nuevo.',
  comentario_largo: 'El comentario puede tener hasta 280 caracteres.',
  motivo_cancelacion: 'Escribí el motivo de la cancelación.',
  novedad_inexistente: 'Esa novedad ya no existe.',
  novedad_ya_enviada: 'Esa novedad ya se mandó.',
  novedad_en_curso: 'Esa novedad se está mandando. Si en 15 minutos no terminó, probá de nuevo.',
}

export function motivoTenis(codigo: string): string {
  return MOTIVOS[codigo] ?? 'No se pudo completar la operación. Probá de nuevo.'
}

// ─── Resumen de tenis_procesar() (cron) ───────────────────────────────────────
// Cada aviso es tenis_aviso(reserva) de la base: datos del turno + el titular con lo necesario
// para avisarle (socio → push por socio_id; invitado → mail).

export interface TitularAviso {
  socio_id: string | null
  profile_id: string | null
  invitado_id: string | null
  nombre: string | null
  email: string | null
}

export interface AvisoReserva {
  reserva_id: string
  cancha_nombre: string | null
  inicio: string | null
  fin: string | null
  modalidad: string | null
  origen: string | null
  estado: string | null
  motivo: string | null
  titular: TitularAviso
}

export interface AvisoNoShow extends AvisoReserva {
  /** Lo que se le cargó al titular (todos los jugadores que no pagaron). */
  cargo_titular: number
  infraccion_id: string | null
  /** Primera infracción de la persona: queda como advertencia. */
  advertencia: boolean
}

export interface ResumenProcesar {
  ahora: string | null
  /** Holds de invitados sin confirmar que pasaron a 'vencida'. */
  holds_vencidos: AvisoReserva[]
  /** 'pendiente_comprobante' canceladas por no subir el comprobante a tiempo. */
  comprobantes_vencidos: AvisoReserva[]
  /** 'confirmada' con check-in que pasaron a 'jugada' (sólo ids). */
  jugadas: string[]
  /** 'confirmada' sin ningún check-in al terminar el turno. */
  no_shows: AvisoNoShow[]
  /**
   * Invitados con el comprobante todavía en revisión al terminar el turno: 'jugada' si hubo
   * check-in, si no 'no_show' SIN cargo ni infracción. El comprobante sigue para revisar.
   */
  comprobantes_sin_revisar: AvisoSinRevisar[]
}

export interface AvisoSinRevisar extends AvisoReserva {
  resultado: 'jugada' | 'no_show' | null
}

function uuidONull(x: unknown): string | null {
  return typeof x === 'string' && UUID_RE.test(x) ? x : null
}

function textoONull(x: unknown): string | null {
  return typeof x === 'string' && x !== '' ? x : null
}

function parsearAviso(x: unknown): AvisoReserva | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = uuidONull(o.reserva_id)
  if (!id) return null
  const t = (o.titular && typeof o.titular === 'object' ? o.titular : {}) as Record<string, unknown>
  return {
    reserva_id: id,
    cancha_nombre: textoONull(o.cancha_nombre),
    inicio: textoONull(o.inicio),
    fin: textoONull(o.fin),
    modalidad: textoONull(o.modalidad),
    origen: textoONull(o.origen),
    estado: textoONull(o.estado),
    motivo: textoONull(o.motivo),
    titular: {
      socio_id: uuidONull(t.socio_id),
      profile_id: uuidONull(t.profile_id),
      invitado_id: uuidONull(t.invitado_id),
      nombre: textoONull(t.nombre),
      email: textoONull(t.email),
    },
  }
}

function listaAvisos(lista: unknown): AvisoReserva[] {
  return Array.isArray(lista) ? lista.map(parsearAviso).filter((a): a is AvisoReserva => a !== null) : []
}

/** Tolerante: lo que falte o no se entienda queda vacío. */
export function parsearResumenProcesar(json: unknown): ResumenProcesar {
  const r = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const noShows: AvisoNoShow[] = []
  for (const x of Array.isArray(r.no_shows) ? r.no_shows : []) {
    const a = parsearAviso(x)
    if (!a) continue
    const o = x as Record<string, unknown>
    const cargo = Number(o.cargo_titular)
    noShows.push({
      ...a,
      cargo_titular: Number.isFinite(cargo) ? cargo : 0,
      infraccion_id: uuidONull(o.infraccion_id),
      advertencia: o.advertencia === true,
    })
  }
  const sinRevisar: AvisoSinRevisar[] = []
  for (const x of Array.isArray(r.comprobantes_sin_revisar) ? r.comprobantes_sin_revisar : []) {
    const a = parsearAviso(x)
    if (!a) continue
    const res = (x as Record<string, unknown>).resultado
    sinRevisar.push({ ...a, resultado: res === 'jugada' || res === 'no_show' ? res : null })
  }
  return {
    ahora: textoONull(r.ahora),
    holds_vencidos: listaAvisos(r.holds_vencidos),
    comprobantes_vencidos: listaAvisos(r.comprobantes_vencidos),
    jugadas: Array.isArray(r.jugadas) ? r.jugadas.map(uuidONull).filter((x): x is string => x !== null) : [],
    no_shows: noShows,
    comprobantes_sin_revisar: sinRevisar,
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

// ─── Avisos a los jugadores: "te sumaron" y "cambió tu turno" ──────────────────
// Outbox tenis_avisos_jugadores (migraciones 20261125000000 y 20261127000000): tenis-cron la
// reclama con tenis_avisos_jugadores_reclamar() y marca cada aviso con
// tenis_avisos_jugadores_marcar(). motivo 'agregado': otro lo sumó a una reserva; 'cambio': la
// reserva en la que sigue cambió de día/horario, cancha o modalidad.

export type MotivoAvisoJugador = 'agregado' | 'cambio'

export interface AvisoJugador {
  /** id de la fila de la outbox (lo que se marca). */
  id: string
  reserva_id: string
  socio_id: string
  motivo: MotivoAvisoJugador
  /** Quien reservó (socio o invitado), el que "te agregó" o "lo cambió". */
  titular_nombre: string | null
  cancha: string | null
  inicio: Date
  modalidad: string | null
}

export interface ReclamoAvisosJugadores {
  /** Pendientes que se descartaron sin mandar (reserva cancelada o terminada, jugador quitado). */
  descartados: number
  avisos: AvisoJugador[]
}

/** Tolerante: una fila sin id, socio o inicio válidos se ignora (vuelve a reclamarse a los 10 min). */
export function parsearAvisosJugadores(json: unknown): ReclamoAvisosJugadores {
  const r = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const avisos: AvisoJugador[] = []
  for (const x of Array.isArray(r.avisos) ? r.avisos : []) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = uuidONull(o.id)
    const reservaId = uuidONull(o.reserva_id)
    const socioId = uuidONull(o.socio_id)
    const inicio = typeof o.inicio === 'string' ? new Date(o.inicio) : null
    if (!id || !reservaId || !socioId || !inicio || Number.isNaN(inicio.getTime())) continue
    avisos.push({
      id,
      reserva_id: reservaId,
      socio_id: socioId,
      // Sin motivo (migración anterior) o desconocido: "te sumaron".
      motivo: o.motivo === 'cambio' ? 'cambio' : 'agregado',
      titular_nombre: textoONull(o.titular_nombre),
      cancha: textoONull(o.cancha),
      inicio,
      modalidad: textoONull(o.modalidad),
    })
  }
  const d = Number(r.descartados)
  return { descartados: Number.isFinite(d) ? d : 0, avisos }
}

type TurnoAviso = Pick<AvisoJugador, 'titular_nombre' | 'inicio' | 'cancha' | 'modalidad'>

/** "jueves 26/11, 18:05 · Cancha 03 · Dobles" (hora real, día local). */
function turnoAviso(a: TurnoAviso, cfg: TenisConfig): string {
  const fecha = fechaLocal(a.inicio)
  const [, mes, dia] = fecha.split('-')
  const partes = [`${DIAS[diaSemanaIso(fecha) - 1]} ${dia}/${mes}, ${horaInicioReal(a.inicio, cfg)}`]
  if (a.cancha) partes.push(`Cancha ${a.cancha}`)
  if (esModalidad(a.modalidad)) partes.push(a.modalidad === 'singles' ? 'Singles' : 'Dobles')
  return partes.join(' · ')
}

/** "Juan Pérez te agregó: jueves 26/11, 18:05 · Cancha 03 · Dobles." */
export function textoJugadorAgregado(a: TurnoAviso, cfg: TenisConfig): { title: string; body: string } {
  const nombre = a.titular_nombre?.trim()
  const quien = nombre ? `${nombre} te agregó` : 'Te agregaron'
  return { title: 'Te sumaron a un turno de tenis', body: `${quien}: ${turnoAviso(a, cfg)}.` }
}

/** "Juan Pérez lo cambió: jueves 26/11, 18:05 · Cancha 03 · Dobles." (el turno nuevo). */
export function textoJugadorCambio(a: TurnoAviso, cfg: TenisConfig): { title: string; body: string } {
  const nombre = a.titular_nombre?.trim()
  const quien = nombre ? `${nombre} lo cambió` : 'Lo cambiaron'
  return { title: 'Cambió tu turno de tenis', body: `${quien}: ${turnoAviso(a, cfg)}.` }
}

/** Texto del aviso según su motivo. */
export function textoAvisoJugador(
  a: TurnoAviso & Pick<AvisoJugador, 'motivo'>,
  cfg: TenisConfig,
): { title: string; body: string } {
  return a.motivo === 'cambio' ? textoJugadorCambio(a, cfg) : textoJugadorAgregado(a, cfg)
}

// ─── Resultado de cada push para marcar la outbox ─────────────────────────────

/** Estado de un aviso push: llegó a algún teléfono, nadie tiene teléfono, o Expo no lo entregó. */
export type EstadoPush = 'entregado' | 'sin_dispositivo' | 'error'

/** Clave de un aviso (clave + socio) en el resultado del envío (pushASociosDetalle). */
export function clavePush(a: { clave: string; socioId: string }): string {
  return `${a.clave}#${a.socioId}`
}

export interface ResultadoAvisoJugador {
  id: string
  resultado: EstadoPush
  error: string | null
}

/**
 * Lo que se le pasa a tenis_avisos_jugadores_marcar() por cada aviso reclamado, más los conteos.
 * `estados`: resultado del envío por clavePush({ clave: id, socioId }); un aviso sin estado cuenta
 * como error ('expo: no entregado'). `error`: el envío entero falló (enviarPush tiró): todos
 * quedan con error y ese motivo, y se reintentan en la corrida siguiente.
 */
export function clasificarAvisosJugadores(
  avisos: { id: string; socio_id: string }[],
  envio: { estados: Map<string, EstadoPush> } | { error: string },
): { resultados: ResultadoAvisoJugador[]; entregados: number; sin_dispositivo: number; con_error: number } {
  const out = { resultados: [] as ResultadoAvisoJugador[], entregados: 0, sin_dispositivo: 0, con_error: 0 }
  for (const a of avisos) {
    const resultado: EstadoPush = 'estados' in envio
      ? envio.estados.get(clavePush({ clave: a.id, socioId: a.socio_id })) ?? 'error'
      : 'error'
    if (resultado === 'entregado') out.entregados++
    else if (resultado === 'sin_dispositivo') out.sin_dispositivo++
    else out.con_error++
    const motivo = 'error' in envio ? envio.error : 'expo: no entregado'
    out.resultados.push({ id: a.id, resultado, error: resultado === 'error' ? motivo : null })
  }
  return out
}

export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Horario por día de semana (tenis_horarios, migración 20261128000000) ──────
// Lunes a viernes 08–22, sábado 09–22, domingo 10–17 (seed). Un día sin fila usa el horario de
// tenis_config; un día con activo = false está cerrado. La base valida igual (tenis_validar_turno).

export interface HorarioSemana {
  /** ISO: 1 = lunes … 7 = domingo. */
  dia_semana: number
  hora_desde: string
  hora_hasta: string
  activo: boolean
}

export interface HorarioDia {
  desde: string
  hasta: string
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$|^24:00(:00)?$/

/** Filas de tenis_horarios (las horas llegan como 'HH:MM:SS'); descarta las que no se entienden. */
export function parsearHorarios(json: unknown): HorarioSemana[] {
  if (!Array.isArray(json)) return []
  const out: HorarioSemana[] = []
  for (const x of json) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const dia = Number(o.dia_semana)
    if (!Number.isInteger(dia) || dia < 1 || dia > 7) continue
    if (typeof o.hora_desde !== 'string' || typeof o.hora_hasta !== 'string') continue
    if (!HORA_RE.test(o.hora_desde) || !HORA_RE.test(o.hora_hasta)) continue
    const desde = o.hora_desde.slice(0, 5)
    const hasta = o.hora_hasta.slice(0, 5)
    if (minutosDeHora(desde) >= minutosDeHora(hasta)) continue
    out.push({ dia_semana: dia, hora_desde: desde, hora_hasta: hasta, activo: o.activo !== false })
  }
  return out
}

/** Horario de las canchas para una fecha local; null = ese día está cerrado. */
export function horarioDelDia(fecha: string, horarios: HorarioSemana[], cfg: TenisConfig): HorarioDia | null {
  const fila = horarios.find((h) => h.dia_semana === diaSemanaIso(fecha))
  if (!fila) return { desde: cfg.hora_desde.slice(0, 5), hasta: cfg.hora_hasta.slice(0, 5) }
  return fila.activo ? { desde: fila.hora_desde, hasta: fila.hora_hasta } : null
}

/**
 * La config con la apertura y el cierre de ese día, para usar con validarTurno, dejaHuecoValido y
 * dentroDeHorario. Día cerrado (null): 00:00–00:00, ningún turno entra.
 */
export function configDelDia(cfg: TenisConfig, horario: HorarioDia | null): TenisConfig {
  return horario
    ? { ...cfg, hora_desde: horario.desde, hora_hasta: horario.hasta }
    : { ...cfg, hora_desde: '00:00', hora_hasta: '00:00' }
}

// ─── Comentario de la reserva ─────────────────────────────────────────────────

export const COMENTARIO_MAX = 280

/** Recortado; vacío o ausente = null. ok:false si no es texto o pasa de COMENTARIO_MAX. */
export function normalizarComentario(x: unknown): { ok: true; comentario: string | null } | { ok: false } {
  if (x === undefined || x === null) return { ok: true, comentario: null }
  if (typeof x !== 'string') return { ok: false }
  const t = x.trim()
  if (t.length > COMENTARIO_MAX) return { ok: false }
  return { ok: true, comentario: t || null }
}

// ─── Cancelar varias (tenis_cancelar_varias) ──────────────────────────────────

export const CANCELAR_VARIAS_MAX = 100

/** Ids de reserva del body: uuid, sin repetir, de 1 a CANCELAR_VARIAS_MAX. null = inválido. */
export function parsearIdsReserva(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length === 0) return null
  if (!x.every((id) => typeof id === 'string' && UUID_RE.test(id))) return null
  const unicos = [...new Set(x as string[])]
  return unicos.length <= CANCELAR_VARIAS_MAX ? unicos : null
}

/**
 * Respuesta de tenis_cancelar_varias: { canceladas: [tenis_aviso], omitidas: [{reserva_id, codigo}] }.
 * Tolerante: una cancelada puede venir como aviso o como uuid suelto; una omitida sin código queda
 * como 'estado_invalido'.
 */
export function parsearCancelarVarias(json: unknown): { canceladas: string[]; omitidas: { reserva_id: string; codigo: string }[] } {
  const r = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const canceladas = new Set<string>()
  for (const x of Array.isArray(r.canceladas) ? r.canceladas : []) {
    const id = typeof x === 'string' ? uuidONull(x) : x && typeof x === 'object' ? uuidONull((x as Record<string, unknown>).reserva_id) : null
    if (id) canceladas.add(id)
  }
  const omitidas: { reserva_id: string; codigo: string }[] = []
  for (const x of Array.isArray(r.omitidas) ? r.omitidas : []) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = uuidONull(o.reserva_id)
    if (!id) continue
    omitidas.push({ reserva_id: id, codigo: typeof o.codigo === 'string' && /^[a-z0-9_]+$/.test(o.codigo) ? o.codigo : 'estado_invalido' })
  }
  return { canceladas: [...canceladas], omitidas }
}

// ─── Cartelera de novedades (tenis_novedades) ─────────────────────────────────

export interface ReclamoNovedad {
  estado:        'reclamada' | 'en_curso' | 'ya_enviada' | 'inexistente'
  titulo:        string
  texto:         string
  enviada_at:    string | null
  // Reintento de un envío cortado: el push ya salió (no se repite).
  push_hecho:    boolean
  push_enviados: number
}

/** tenis_novedad_reclamar(). Un estado desconocido cuenta como en curso (no se manda nada). */
export function parsearReclamoNovedad(json: unknown): ReclamoNovedad {
  const o = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : {}
  const estados = ['reclamada', 'en_curso', 'ya_enviada', 'inexistente'] as const
  const estado = estados.find((e) => e === o.estado) ?? 'en_curso'
  const n = typeof o.push_enviados === 'number' && Number.isFinite(o.push_enviados) ? Math.max(0, o.push_enviados) : 0
  return {
    estado,
    titulo: typeof o.titulo === 'string' ? o.titulo : '',
    texto: typeof o.texto === 'string' ? o.texto : '',
    enviada_at: typeof o.enviada_at === 'string' ? o.enviada_at : null,
    push_hecho: o.push_hecho === true,
    push_enviados: o.push_hecho === true ? n : 0,
  }
}

/** socio ids de tenis_audiencia_novedades(): setof uuid (strings) o filas con socio_id. */
export function parsearSocioIds(json: unknown): string[] {
  const lista = Array.isArray(json) ? json : [json]
  const out = new Set<string>()
  for (const x of lista) {
    if (typeof x === 'string') {
      const id = uuidONull(x)
      if (id) out.add(id)
    } else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      const id = uuidONull(o.socio_id) ?? uuidONull(o.tenis_audiencia_novedades)
      if (id) out.add(id)
    }
  }
  return [...out]
}

const PUSH_BODY_MAX = 178

/** Push de una novedad: "Tenis: <título>" y el texto recortado a lo que muestra el teléfono. */
export function textoPushNovedad(n: { titulo: string; texto: string }): { title: string; body: string } {
  const texto = n.texto.replace(/\s+/g, ' ').trim()
  if (!texto) return { title: `Tenis: ${n.titulo.trim()}`, body: 'Hay una novedad en la cartelera de tenis.' }
  const body = texto.length <= PUSH_BODY_MAX ? texto : `${texto.slice(0, PUSH_BODY_MAX - 1).trimEnd()}…`
  return { title: `Tenis: ${n.titulo.trim()}`, body }
}

/** Cuerpo del mail de una novedad (va dentro de emailTemplate). */
export function htmlNovedad(n: { titulo: string; texto: string }): string {
  const parrafo = escapeHtml(n.texto.trim()).replace(/\r?\n/g, '<br>')
  return `
    <p style="font-size:13px;color:#555;letter-spacing:1px;margin:0 0 8px">CARTELERA DE TENIS</p>
    <h2 style="font-size:20px;margin:0 0 16px">${escapeHtml(n.titulo.trim())}</h2>
    <p style="font-size:16px;line-height:1.6">${parrafo}</p>
    <p style="font-size:14px;color:#555">También la ves en la app de UNCAS, en las reservas de tenis.</p>
  `
}

// ─── Mails ────────────────────────────────────────────────────────────────────

/** Dirección a la que vale la pena mandar: no vacía y no sintética del padrón (@uncas.local). */
export function mailDestino(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const t = x.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null
  return t.endsWith('@uncas.local') ? null : t
}
