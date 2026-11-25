// Pure helpers for the public tennis booking pages (web/app/tenis/).
// No React, no fetch: checked with `npx --yes tsx web/lib/tenis.check.ts`.
// Argentina has no DST, so local time is always UTC-3 (same as tenis_ahora()).

import { interpretarRespuesta, type EdgeResponse } from './edgeFunctionRespuesta'

export type Modalidad = 'singles' | 'dobles'

export type TenisConfig = {
  hora_desde: string
  hora_hasta: string
  modulo_min: number
  margen_inicio_min: number
  singles_min: number
  dobles_min: number
  anticipacion_dias: number
  hold_min: number
  comprobante_horas_antes: number
  alias_pago: string
  precio_nosocio_single: number
  precio_nosocio_dobles: number
}

// Defaults of tenis_config (shared contract). The function's `config` wins.
export const CONFIG_DEFAULT: TenisConfig = {
  hora_desde: '08:00',
  hora_hasta: '22:00',
  modulo_min: 30,
  margen_inicio_min: 5,
  singles_min: 60,
  dobles_min: 90,
  anticipacion_dias: 2,
  hold_min: 15,
  comprobante_horas_antes: 3,
  alias_pago: 'uncas.tenis.macro',
  precio_nosocio_single: 16000,
  precio_nosocio_dobles: 18000,
}

// Each server value replaces the default only when it has the right type
// (numbers may come as numeric strings); anything else keeps the default.
export function configDesde(parcial: Partial<TenisConfig> | null | undefined): TenisConfig {
  const c = { ...CONFIG_DEFAULT }
  if (!parcial) return c
  const destino = c as Record<string, unknown>
  for (const k of Object.keys(c) as (keyof TenisConfig)[]) {
    const v: unknown = parcial[k]
    if (v === undefined || v === null) continue
    if (typeof CONFIG_DEFAULT[k] === 'number') {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
      if (typeof n === 'number' && Number.isFinite(n)) destino[k] = n
    } else if (typeof v === 'string') {
      destino[k] = v
    }
  }
  // Postgres `time` comes as "08:00:00".
  c.hora_desde = c.hora_desde.slice(0, 5)
  c.hora_hasta = c.hora_hasta.slice(0, 5)
  return c
}

// ---------- validation ----------

// Same rule as tenis-invitados (normalizarDni in _shared/tenisReglas.ts): 7 or 8 digits.
export function normalizarDni(valor: string): string | null {
  const limpio = valor.replace(/[.\s-]/g, '')
  return /^\d{7,8}$/.test(limpio) ? limpio : null
}

export function validarEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
}

export type Titular = { dni: string; nombre: string; apellido: string; email: string }
export type Errores<K extends string> = Partial<Record<K, string>>

function nombreValido(v: string) {
  const t = v.trim()
  return t.length >= 2 && t.length <= 60
}

export function validarTitular(t: Titular): Errores<keyof Titular> {
  const e: Errores<keyof Titular> = {}
  if (!normalizarDni(t.dni)) e.dni = 'El DNI tiene que tener 7 u 8 números.'
  if (!nombreValido(t.nombre)) e.nombre = 'Escribí tu nombre (al menos 2 letras).'
  if (!nombreValido(t.apellido)) e.apellido = 'Escribí tu apellido (al menos 2 letras).'
  if (!validarEmail(t.email)) e.email = 'Revisá el email: tiene que ser como nombre@mail.com.'
  return e
}

export type JugadorForm = { tipo: 'socio' | 'invitado'; dni: string; nombre: string; apellido: string }

export function jugadoresRequeridos(m: Modalidad): number {
  return m === 'singles' ? 1 : 3
}

export function jugadorVacio(): JugadorForm {
  return { tipo: 'invitado', dni: '', nombre: '', apellido: '' }
}

export function validarJugadores(jugadores: JugadorForm[], dniTitular: string): Errores<'dni' | 'nombre' | 'apellido'>[] {
  const vistos = new Set<string>()
  const titular = normalizarDni(dniTitular)
  if (titular) vistos.add(titular)
  return jugadores.map(j => {
    const e: Errores<'dni' | 'nombre' | 'apellido'> = {}
    const dni = normalizarDni(j.dni)
    if (!dni) e.dni = 'El DNI tiene que tener 7 u 8 números.'
    else if (vistos.has(dni)) e.dni = 'Este DNI ya está en la reserva: cada jugador lleva el suyo.'
    else vistos.add(dni)
    if (j.tipo === 'invitado') {
      if (!nombreValido(j.nombre)) e.nombre = 'Escribí el nombre (al menos 2 letras).'
      if (!nombreValido(j.apellido)) e.apellido = 'Escribí el apellido (al menos 2 letras).'
    }
    return e
  })
}

export function sinErrores(e: object | object[]): boolean {
  return Array.isArray(e) ? e.every(x => Object.keys(x).length === 0) : Object.keys(e).length === 0
}

// Body of the `reservar` action's players: `{ dni, nombre?, apellido? }`. A DNI
// alone is a member (or a guest the club already has); with name and surname
// the DB still resolves it to a member when the DNI belongs to one.
export function jugadoresPayload(jugadores: JugadorForm[]): { dni: string; nombre?: string; apellido?: string }[] {
  return jugadores.map(j => j.tipo === 'socio'
    ? { dni: normalizarDni(j.dni) ?? j.dni }
    : { dni: normalizarDni(j.dni) ?? j.dni, nombre: j.nombre.trim(), apellido: j.apellido.trim() })
}

// ---------- prices ----------

export function formatearPrecio(n: number): string {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export type LineaPrecio = { etiqueta: string; precio: number | null }

// The web titular is a non-member. Members' prices depend on their carnet, so
// they stay as "precio según socio" until the function answers.
export function resumenPrecios(m: Modalidad, jugadores: JugadorForm[], cfg: TenisConfig) {
  const precio = m === 'singles' ? cfg.precio_nosocio_single : cfg.precio_nosocio_dobles
  const lineas: LineaPrecio[] = [{ etiqueta: 'Vos (no socio)', precio }]
  jugadores.forEach((j, i) => {
    const nombre = j.tipo === 'invitado' && j.nombre.trim() ? `${j.nombre.trim()} ${j.apellido.trim()}`.trim() : `Jugador ${i + 2}`
    lineas.push(j.tipo === 'socio'
      ? { etiqueta: `${nombre} (socio)`, precio: null }
      : { etiqueta: `${nombre} (no socio)`, precio })
  })
  const total = lineas.reduce((s, l) => s + (l.precio ?? 0), 0)
  return { lineas, total, hayPendientes: lineas.some(l => l.precio === null) }
}

// ---------- dates and times (Argentina, UTC-3) ----------

const OFFSET_MS = 3 * 60 * 60 * 1000

function local(d: Date) {
  return new Date(d.getTime() - OFFSET_MS)
}

export function hoyArgentina(ahora: Date = new Date()): string {
  return local(ahora).toISOString().slice(0, 10)
}

// Today (Argentina) and the next `dias` days. `dias` is the server
// `anticipacion_dias`; a missing or invalid value uses the default.
export function fechasReservables(ahora: Date = new Date(), dias = CONFIG_DEFAULT.anticipacion_dias): string[] {
  const base = new Date(hoyArgentina(ahora) + 'T00:00:00Z')
  const n = Number.isFinite(dias) ? Math.max(0, Math.floor(dias)) : CONFIG_DEFAULT.anticipacion_dias
  return Array.from({ length: n + 1 }, (_, i) =>
    new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10))
}

export function horaArgentina(iso: string): string {
  return local(new Date(iso)).toISOString().slice(11, 16)
}

export function inicioIso(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00-03:00`
}

export type Cancha = { id: string; nombre: string }
// `hora` = booked module (sent as `inicio`); `empieza` = real start after court sweeping.
export type Turno = { hora: string; empieza: string; inicio: string }
// One entry of `disponibilidad.libres.singles|dobles` (computed by tenis-invitados).
export type Libre = { cancha_id: string; inicio: string; hora: string; hora_real: string }

// Groups the function's free starts per court, in the order of `canchas`.
export function turnosDesdeLibres(canchas: Cancha[], libres: unknown): { cancha: Cancha; turnos: Turno[] }[] {
  const lista = Array.isArray(libres) ? libres : []
  const porCancha = new Map<string, Turno[]>(canchas.map(c => [c.id, []]))
  for (const x of lista) {
    if (!x || typeof x !== 'object') continue
    const l = x as Partial<Libre>
    if (typeof l.cancha_id !== 'string' || typeof l.inicio !== 'string' || typeof l.hora !== 'string') continue
    porCancha.get(l.cancha_id)?.push({ hora: l.hora, empieza: typeof l.hora_real === 'string' ? l.hora_real : l.hora, inicio: l.inicio })
  }
  return canchas.map(cancha => ({
    cancha,
    turnos: (porCancha.get(cancha.id) ?? []).sort((a, b) => a.inicio.localeCompare(b.inicio)),
  }))
}

// ---------- time-first picker ----------

export type Franja = 'manana' | 'tarde' | 'noche'
// One start time free in at least one court. `hora` = booked module (`inicio`
// is what the booking sends); `horaReal` = real start after court sweeping.
export type Horario = { hora: string; horaReal: string; inicio: string; franja: Franja; canchas: Cancha[] }

const FRANJAS: { franja: Franja; titulo: string }[] = [
  { franja: 'manana', titulo: 'Mañana' },
  { franja: 'tarde', titulo: 'Tarde' },
  { franja: 'noche', titulo: 'Noche' },
]

// Morning before 12, afternoon 12 to 18, night from 18 ("HH:MM", Argentina).
export function franjaDeHora(hora: string): Franja {
  const h = Number(hora.slice(0, 2))
  return h < 12 ? 'manana' : h < 18 ? 'tarde' : 'noche'
}

// The function's free starts (`disponibilidad.libres`) for one match type,
// deduplicated by start: each time lists the courts free then, in `canchas`
// order. The server already applied every rule (incl. the no-gap optimizer).
export function horariosDisponibles(canchas: Cancha[], libres: unknown, modalidad: Modalidad): Horario[] {
  const porModalidad = libres && typeof libres === 'object' ? (libres as Record<string, unknown>)[modalidad] : undefined
  const orden = new Map(canchas.map((c, i) => [c.id, i]))
  const porInicio = new Map<string, Horario>()
  for (const { cancha, turnos } of turnosDesdeLibres(canchas, porModalidad)) {
    for (const t of turnos) {
      let h = porInicio.get(t.inicio)
      if (!h) {
        h = { hora: t.hora, horaReal: t.empieza, inicio: t.inicio, franja: franjaDeHora(t.hora), canchas: [] }
        porInicio.set(t.inicio, h)
      }
      h.canchas.push(cancha)
    }
  }
  return [...porInicio.values()]
    .map(h => ({ ...h, canchas: h.canchas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0)) }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

// Times grouped by band, in day order; bands without times are left out.
export function horariosPorFranja(horarios: Horario[]): { franja: Franja; titulo: string; horarios: Horario[] }[] {
  return FRANJAS
    .map(f => ({ ...f, horarios: horarios.filter(h => h.franja === f.franja) }))
    .filter(f => f.horarios.length > 0)
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// "mié 25"
export function diaCorto(fecha: string): string {
  return `${DIAS_CORTOS[new Date(fecha + 'T12:00:00Z').getUTCDay()]} ${fecha.slice(8, 10)}`
}

// Day chip: "Hoy · mié 25", "Mañana · jue 26", then "vie 27". `hoy` is the Argentina date.
export function etiquetaDia(fecha: string, hoy: string): string {
  const dias = Math.round((Date.parse(fecha + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 86_400_000)
  if (dias === 0) return `Hoy · ${diaCorto(fecha)}`
  if (dias === 1) return `Mañana · ${diaCorto(fecha)}`
  return diaCorto(fecha)
}

// 60 → "1 h", 90 → "1 h 30", 45 → "45 min".
export function duracionTexto(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m}`
}

export type PasoFaltante = 'horario' | 'cancha' | 'titular' | 'jugadores'

// First thing still missing before the booking can be sent, in page order
// (null when everything is ready). Shown in the sticky booking bar.
export function faltaParaReservar(p: {
  hayHorario: boolean
  hayCancha: boolean
  modalidad: Modalidad
  erroresTitular: object
  erroresJugadores: object[]
}): { paso: PasoFaltante; mensaje: string } | null {
  if (!p.hayHorario) return { paso: 'horario', mensaje: 'Elegí un horario' }
  if (!p.hayCancha) return { paso: 'cancha', mensaje: 'Elegí una cancha' }
  if (!sinErrores(p.erroresTitular)) return { paso: 'titular', mensaje: 'Completá tus datos' }
  if (!sinErrores(p.erroresJugadores)) {
    return {
      paso: 'jugadores',
      mensaje: p.modalidad === 'singles' ? 'Completá los datos de tu rival' : 'Completá los datos de los otros jugadores',
    }
  }
  return null
}

export function vencimientoComprobante(inicio: string, horasAntes = CONFIG_DEFAULT.comprobante_horas_antes): string {
  return new Date(new Date(inicio).getTime() - horasAntes * 3_600_000).toISOString()
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function formatearFecha(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00Z')
  return `${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

export function formatearFechaHora(iso: string): string {
  const l = local(new Date(iso)).toISOString()
  return `${formatearFecha(l.slice(0, 10))} ${l.slice(11, 16)}`
}

// ---------- receipt ----------

export const COMPROBANTE_TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}
export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024

export function validarComprobante(f: { type: string; size: number }): string | null {
  if (!COMPROBANTE_TIPOS[f.type]) return 'El comprobante tiene que ser una foto (JPG o PNG) o un PDF.'
  if (f.size > COMPROBANTE_MAX_BYTES) return 'El archivo pesa más de 5 MB.'
  return null
}

// ---------- error copy ----------

// Codes of tenis-invitados: the DB ones it passes through (migration
// 20261112000000 header) and its own (limitado, jugador_sin_nombre,
// comprobante_invalido, comprobante_no_subido).
const MENSAJES: Record<string, string> = {
  parametros: 'Faltan datos o hay datos inválidos. Revisá el formulario.',
  modalidad_invalida: 'Elegí singles o dobles.',
  cancha_inexistente: 'Esa cancha no existe. Elegí otra.',
  cancha_inactiva: 'Esa cancha no está disponible. Elegí otra.',
  horario_invalido: 'Los turnos arrancan en punto o y media.',
  fuera_de_horario: 'Ese turno está fuera del horario de reservas.',
  pasado: 'Ese horario ya pasó. Elegí otro.',
  anticipacion: 'Sólo se puede reservar hasta 2 días antes.',
  bloqueado: 'Ese horario no está disponible. Elegí otro.',
  turno_ocupado: 'Ese turno ya no está disponible. Elegí otro.',
  hueco_invalido: 'Ese horario dejaría media hora libre que nadie puede usar. Elegí uno pegado a otra reserva.',
  limite_dia: 'Ya tenés una reserva ese día.',
  limite_activas: 'Ya tenés 2 reservas activas.',
  cantidad_jugadores: 'Singles lleva 1 jugador además de vos y dobles 3.',
  jugadores_duplicados: 'Hay un DNI repetido en la reserva.',
  jugador_ocupado: 'Uno de los jugadores ya tiene otro turno a esa hora.',
  socio_no_encontrado: 'No encontramos un socio activo con ese DNI. Cargalo como no socio.',
  dni_invalido: 'Revisá los DNI: sólo números, 7 u 8 dígitos.',
  invitado_incompleto: 'Completá nombre y apellido de los no socios.',
  email_invalido: 'Revisá tu email.',
  titular_suspendido: 'Estás suspendido y no podés reservar por ahora.',
  jugador_no_habilitado: 'Uno de los jugadores no está habilitado para jugar. Consultá en el club.',
  titular_es_socio: 'Tu DNI es de un socio del club: reservá desde la app de UNCAS.',
  plazo_invitado: 'Ese turno está muy cerca: no da el tiempo para confirmar y pagar. Elegí uno más adelante.',
  estado_invalido: 'Esta reserva ya no admite cambios.',
  token_invalido: 'El enlace no es válido. Revisá que lo hayas abierto completo desde el mail.',
  hold_vencido: 'Pasaron los 15 minutos y la reserva se liberó. Podés volver a reservar.',
  reserva_cancelada: 'Esta reserva fue cancelada.',
  comprobante_vencido: 'Venció el plazo para subir el comprobante y la reserva se canceló.',
  path_invalido: 'No pudimos registrar el archivo. Subilo de nuevo.',
  limitado: 'Hiciste demasiados intentos. Esperá un rato y probá de nuevo.',
  jugador_sin_nombre: 'Uno de los DNI no es de un socio: marcalo como no socio y completá nombre y apellido.',
  comprobante_invalido: 'El comprobante tiene que ser una foto (JPG o PNG) o un PDF de hasta 5 MB.',
  comprobante_no_subido: 'No encontramos el archivo subido. Probá de nuevo.',
}

export const CODIGOS_TENIS: readonly string[] = Object.keys(MENSAJES)

export function mensajeTenis(codigo: string | undefined | null): string {
  if (!codigo) return 'Algo salió mal. Probá de nuevo.'
  if (MENSAJES[codigo]) return MENSAJES[codigo]
  // An unknown stable code (snake_case) is not user copy.
  if (/^[a-z0-9_]+$/.test(codigo)) return 'Algo salió mal. Probá de nuevo.'
  return codigo
}

// tenis-invitados answers business errors as 200 { ok:false, codigo, motivo }
// (motivo = the function's Spanish copy) and real errors as { error }.
export function mensajeRespuesta(r: { ok?: unknown; codigo?: unknown; motivo?: unknown; error?: unknown }): { codigo?: string; mensaje: string } {
  const codigo = typeof r.codigo === 'string' ? r.codigo : undefined
  if (codigo && MENSAJES[codigo]) return { codigo, mensaje: MENSAJES[codigo] }
  const texto = typeof r.motivo === 'string' && r.motivo ? r.motivo : typeof r.error === 'string' ? r.error : undefined
  return { codigo, mensaje: texto ? mensajeTenis(texto) : mensajeTenis(codigo) }
}

// Result of a `tenis-invitados` call. On a failure `data` keeps the raw body
// (e.g. `dni` of jugador_sin_nombre).
export type ResultadoInvitados<T> =
  | { ok: true; data: EdgeResponse<T> }
  | { ok: false; error: string; codigo?: string; data?: Record<string, unknown> }

// Maps the HTTP status + body text of `tenis-invitados` to a result.
// Business failures: 200 { ok:false, codigo, motivo }; real errors: { error }.
export function resultadoInvitados<T = Record<string, unknown>>(status: number, texto: string): ResultadoInvitados<T> {
  const r = interpretarRespuesta<T>(status, texto)
  if (r.error || r.ok === false) {
    const { codigo, mensaje } = mensajeRespuesta(r as { codigo?: unknown; motivo?: unknown; error?: unknown })
    return { ok: false, error: mensaje, codigo, data: r as unknown as Record<string, unknown> }
  }
  return { ok: true, data: r }
}

// The request never got an answer: timed out (`abortado`) or no network.
export function mensajeFalloInvitados(abortado: boolean): string {
  return abortado
    ? 'El servidor tardó demasiado. Probá de nuevo en un momento.'
    : 'No hay conexión. Revisá internet y probá de nuevo.'
}

// Screen of the confirm page for a failed `confirmar`.
export function pantallaConfirmar(codigo: string | undefined): 'invalido' | 'vencido' | 'error' {
  if (codigo === 'token_invalido') return 'invalido'
  if (codigo === 'hold_vencido' || codigo === 'reserva_cancelada' || codigo === 'comprobante_vencido' || codigo === 'estado_invalido') {
    return 'vencido'
  }
  return 'error'
}

// Notice shown before a guest booking is sent. Same copy as app/lib/tenis.ts.
export const AVISO_SANCIONES = {
  titulo: 'Antes de confirmar',
  texto:  'Si no cumplís con la reserva (no te presentás o los jugadores no están bien cargados), se aplican sanciones: la primera vez es un aviso y después podés quedar suspendido para reservar. Si no se presentan, el titular paga el turno de todos.',
} as const
