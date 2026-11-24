// Pure helpers for the public tennis booking pages (web/app/tenis/).
// No React, no fetch: checked with `npx --yes tsx web/lib/tenis.check.ts`.
// Argentina has no DST, so local time is always UTC-3 (same as tenis_ahora()).

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

export function configDesde(parcial: Partial<TenisConfig> | null | undefined): TenisConfig {
  const c = { ...CONFIG_DEFAULT }
  if (!parcial) return c
  for (const k of Object.keys(c) as (keyof TenisConfig)[]) {
    const v = parcial[k]
    if (v !== undefined && v !== null) (c as Record<string, unknown>)[k] = v
  }
  // Postgres `time` comes as "08:00:00".
  c.hora_desde = c.hora_desde.slice(0, 5)
  c.hora_hasta = c.hora_hasta.slice(0, 5)
  return c
}

// ---------- validation ----------

export function normalizarDni(valor: string): string | null {
  const limpio = valor.replace(/[.\s]/g, '')
  return /^\d{6,9}$/.test(limpio) ? limpio : null
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
  if (!normalizarDni(t.dni)) e.dni = 'Ingresá un DNI válido (sólo números).'
  if (!nombreValido(t.nombre)) e.nombre = 'Ingresá tu nombre.'
  if (!nombreValido(t.apellido)) e.apellido = 'Ingresá tu apellido.'
  if (!validarEmail(t.email)) e.email = 'Ingresá un email válido.'
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
    if (!dni) e.dni = 'Ingresá un DNI válido (sólo números).'
    else if (vistos.has(dni)) e.dni = 'Este DNI ya está en la reserva.'
    else vistos.add(dni)
    if (j.tipo === 'invitado') {
      if (!nombreValido(j.nombre)) e.nombre = 'Ingresá el nombre.'
      if (!nombreValido(j.apellido)) e.apellido = 'Ingresá el apellido.'
    }
    return e
  })
}

export function sinErrores(e: object | object[]): boolean {
  return Array.isArray(e) ? e.every(x => Object.keys(x).length === 0) : Object.keys(e).length === 0
}

// Body of the `reservar` action's players (members by DNI: the function resolves the socio).
export function jugadoresPayload(jugadores: JugadorForm[]) {
  return jugadores.map(j => j.tipo === 'socio'
    ? { tipo: 'socio' as const, dni: normalizarDni(j.dni) ?? j.dni }
    : { tipo: 'invitado' as const, dni: normalizarDni(j.dni) ?? j.dni, nombre: j.nombre.trim(), apellido: j.apellido.trim() })
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

export function fechasReservables(ahora: Date = new Date(), dias = CONFIG_DEFAULT.anticipacion_dias): string[] {
  const base = new Date(hoyArgentina(ahora) + 'T00:00:00Z')
  return Array.from({ length: dias + 1 }, (_, i) =>
    new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10))
}

export function horaArgentina(iso: string): string {
  return local(new Date(iso)).toISOString().slice(11, 16)
}

export function inicioIso(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00-03:00`
}

function minutos(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export type Ocupado = { cancha_id: string | null; inicio: string; fin: string }
export type Cancha = { id: string; nombre: string }
// `hora` = booked module (sent as `inicio`); `empieza` = real start after court sweeping.
export type Turno = { hora: string; empieza: string; inicio: string }

export function turnosLibres(p: {
  fecha: string; modalidad: Modalidad; config: TenisConfig; canchas: Cancha[]; items: Ocupado[]; ahora?: Date
}): { cancha: Cancha; turnos: Turno[] }[] {
  const { fecha, modalidad, config, canchas, items } = p
  const ahora = (p.ahora ?? new Date()).getTime()
  const dur = modalidad === 'singles' ? config.singles_min : config.dobles_min
  const desde = minutos(config.hora_desde)
  const hasta = minutos(config.hora_hasta)
  const rangos = items.map(i => ({ cancha: i.cancha_id, a: new Date(i.inicio).getTime(), b: new Date(i.fin).getTime() }))
  return canchas.map(cancha => {
    const turnos: Turno[] = []
    for (let m = desde; m + dur <= hasta; m += config.modulo_min) {
      const inicio = inicioIso(fecha, hhmm(m))
      const a = new Date(inicio).getTime()
      const b = a + dur * 60_000
      if (a <= ahora) continue
      const choca = rangos.some(r => (r.cancha === null || r.cancha === cancha.id) && r.a < b && a < r.b)
      if (!choca) turnos.push({ hora: hhmm(m), empieza: hhmm(m + config.margen_inicio_min), inicio })
    }
    return { cancha, turnos }
  })
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

const MENSAJES: Record<string, string> = {
  turno_ocupado: 'Ese turno ya no está disponible. Elegí otro.',
  fuera_de_horario: 'Ese turno está fuera del horario de reservas.',
  fuera_de_anticipacion: 'Sólo se puede reservar hasta 2 días antes.',
  limite_diario: 'Ya tenés una reserva ese día.',
  limite_activas: 'Ya tenés 2 reservas activas.',
  suspendido: 'Uno de los jugadores está suspendido y no puede reservar.',
  socio_no_encontrado: 'No encontramos un socio activo con ese DNI. Cargalo como invitado.',
  jugadores_invalidos: 'Revisá los jugadores de la reserva.',
  demasiados_intentos: 'Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.',
  token_invalido: 'El enlace no es válido. Revisá que lo hayas abierto completo desde el mail.',
  hold_vencido: 'Pasaron los 15 minutos y la reserva se liberó. Podés volver a reservar.',
  vencida: 'Pasaron los 15 minutos y la reserva se liberó. Podés volver a reservar.',
  cancelada: 'Esta reserva fue cancelada.',
  comprobante_vencido: 'Venció el plazo para subir el comprobante y la reserva se canceló.',
  archivo_invalido: 'El comprobante tiene que ser una foto (JPG o PNG) o un PDF de hasta 5 MB.',
}

export function mensajeTenis(codigo: string | undefined | null): string {
  if (!codigo) return 'Algo salió mal. Probá de nuevo.'
  if (MENSAJES[codigo]) return MENSAJES[codigo]
  // An unknown stable code (snake_case) is not user copy.
  if (/^[a-z0-9_]+$/.test(codigo)) return 'Algo salió mal. Probá de nuevo.'
  return codigo
}
