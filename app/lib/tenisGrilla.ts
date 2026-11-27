// Cuentas de la grilla de tenis al estilo OnDepor (odd/tasks/tenis-paridad-ondepor.md,
// P3): ancho de columna para que entren todas las canchas sin scroll lateral,
// horario del día, línea de la hora actual, ventana de días, nivel de calor de
// la vista semanal y textos de los bloques. Lógica pura, sin React; verificada
// en tenisGrilla.check.ts.

import {
  esBloque, estiloItem, fechaArgentina, minutosDeHora,
  type Cancha, type ItemGrilla, type TenisConfig,
} from './tenis'

type Horario = { desde: string; hasta: string }
type ConfigFilas = Pick<TenisConfig, 'hora_desde' | 'hora_hasta' | 'modulo_min'>

// ─── Medidas ──────────────────────────────────────────────────────────────────

export const HORA_W    = 44 // columna de la hora
export const FILA_H    = 72 // alto de cada media hora (entran los nombres)
export const COL_MIN_W = 30 // por debajo de esto no se lee nada
// Pantalla completa acostada: filas más bajas para ver más horas (las
// columnas son anchas y los nombres entran en una línea).
export const FILA_H_COMPACTA = 30
export const BARRA_PANTALLA_COMPLETA_H = 44 // barra de arriba (día, flechas, ✕)

type Medidas = { width: number; height: number }
type Margenes = { top: number; right: number; bottom: number; left: number }

// Grilla "acostada" sin módulos nativos (la app está fija en vertical): una
// vista con ancho y alto intercambiados, centrada y girada 90° (horario). El
// borde izquierdo de la vista queda arriba de la pantalla y el de arriba, a la
// derecha; los márgenes seguros se reparten igual. `ancho`/`alto` = lo que
// queda para la grilla (alto ya sin la barra de arriba).
export function layoutPantallaCompleta(ventana: Medidas, seguro: Margenes, barraH: number = BARRA_PANTALLA_COMPLETA_H): {
  vista:   { width: number; height: number; top: number; left: number }
  relleno: Margenes
  ancho:   number
  alto:    number
} {
  const width = ventana.height
  const height = ventana.width
  const relleno = { top: seguro.right, right: seguro.bottom, bottom: seguro.left, left: seguro.top }
  return {
    vista:   { width, height, top: (ventana.height - height) / 2, left: (ventana.width - width) / 2 },
    relleno,
    ancho:   Math.max(0, width - relleno.left - relleno.right),
    alto:    Math.max(0, height - relleno.top - relleno.bottom - barraH),
  }
}

// Ancho de cada cancha para que todas entren en `ancho` (sin scroll lateral).
export function anchoColumna(ancho: number, canchas: number, horaW: number = HORA_W): number {
  if (canchas <= 0) return 0
  return Math.max(COL_MIN_W, Math.floor((ancho - horaW) / canchas))
}

// La config con el horario de ese día (tenis_horarios). Un horario inválido se
// ignora y queda el general.
export function configDelDia<T extends ConfigFilas>(config: T, horario: Horario | null): T {
  if (!horario) return config
  if (!(minutosDeHora(horario.hasta) > minutosDeHora(horario.desde))) return config
  return { ...config, hora_desde: horario.desde, hora_hasta: horario.hasta }
}

// Píxeles desde arriba de la grilla hasta la hora actual; null si `fecha` no es
// hoy o la hora está fuera del horario.
export function lineaAhora(fecha: string, ahoraMs: number, config: ConfigFilas, filaH: number = FILA_H): number | null {
  if (fechaArgentina(ahoraMs) !== fecha) return null
  const min = (ahoraMs - Date.parse(`${fecha}T00:00:00-03:00`)) / 60_000
  const desde = minutosDeHora(config.hora_desde)
  const hasta = minutosDeHora(config.hora_hasta)
  if (min < desde || min > hasta) return null
  return ((min - desde) / Math.max(5, config.modulo_min)) * filaH
}

// ─── Días ─────────────────────────────────────────────────────────────────────

export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Hoy … hoy + dias − 1 (fecha de Argentina); al menos hoy.
export function diasVista(ahoraMs: number, dias: number): string[] {
  const hoy = fechaArgentina(ahoraMs)
  return Array.from({ length: Math.max(1, dias) }, (_, i) => sumarDias(hoy, i))
}

// Se puede reservar de hoy a hoy + anticipación.
export function esDiaReservable(fecha: string, ahoraMs: number, anticipacion: number): boolean {
  const hoy = fechaArgentina(ahoraMs)
  return fecha >= hoy && fecha <= sumarDias(hoy, anticipacion)
}

const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// 'jueves 26 de noviembre'.
export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = DIAS_LARGO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''
  return `${dia} ${d} de ${MESES[m - 1] ?? ''}`
}

export function paginar<T>(lista: T[], porPagina: number): T[][] {
  const n = Math.max(1, Math.floor(porPagina) || 1)
  const r: T[][] = []
  for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n))
  return r
}

// ─── Bloques ──────────────────────────────────────────────────────────────────

// Lo que se lee dentro de un bloque: todos los jugadores ("APELLIDO, NOMBRE")
// o el título de un bloque. Sin nombres, el tipo (o "TU RESERVA").
export function nombresBloque(it: ItemGrilla): string[] {
  if (esBloque(it)) return [(it.titulo || estiloItem(it).etiqueta).toUpperCase()]
  const nombres = (it.jugadores ?? []).map(j => j.nombre.trim()).filter(Boolean)
  if (nombres.length > 0) return nombres.map(n => n.toUpperCase())
  if (it.mio) return ['TU RESERVA']
  return [(it.titulo || estiloItem(it).etiqueta).toUpperCase()]
}

// Reservas (no bloques) de cada cancha y del día, para el encabezado.
export function reservasPorCancha(
  items: Pick<ItemGrilla, 'cancha_id' | 'tipo'>[],
  canchas: Pick<Cancha, 'id'>[],
): { porCancha: Record<string, number>; total: number } {
  const porCancha: Record<string, number> = {}
  for (const c of canchas) porCancha[c.id] = 0
  let total = 0
  for (const it of items) {
    if (esBloque(it) || it.cancha_id === null || !(it.cancha_id in porCancha)) continue
    porCancha[it.cancha_id]++
    total++
  }
  return { porCancha, total }
}

// ─── Vista semanal ────────────────────────────────────────────────────────────

export type NivelCalor = 'alto' | 'medio' | 'bajo' | 'completo'

// La mitad o más libre: alto; un cuarto o más: medio; alguna: bajo.
export function nivelCalor(libres: number, total: number): NivelCalor {
  if (total <= 0 || libres <= 0) return 'completo'
  const r = libres / total
  if (r >= 0.5) return 'alto'
  if (r >= 0.25) return 'medio'
  return 'bajo'
}

export function textoDisponibles(libres: number): string {
  if (libres <= 0) return 'Completo'
  return libres === 1 ? '1 disponible' : `${libres} disponibles`
}

export interface SlotSemana {
  hora:   string // HH:MM
  libres: number
  total:  number
}

export interface DiaSemana {
  fecha:      string
  reservable: boolean
  // false: ese día las canchas no abren (horario.abierto); sin horario, true.
  abierto:    boolean
  slots:      SlotSemana[]
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

// tenis_disponibilidad_semana → [{fecha, reservable, horario, slots:[{hora, libres, total}]}].
export function parsearSemana(raw: unknown): DiaSemana[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((d): DiaSemana[] => {
    if (!d || typeof d !== 'object') return []
    const o = d as Record<string, unknown>
    if (typeof o.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.fecha)) return []
    const slots = Array.isArray(o.slots) ? o.slots.flatMap((s): SlotSemana[] => {
      if (!s || typeof s !== 'object') return []
      const x = s as Record<string, unknown>
      if (typeof x.hora !== 'string' || !/^\d{2}:\d{2}/.test(x.hora)) return []
      return [{ hora: x.hora.slice(0, 5), libres: num(x.libres), total: num(x.total) }]
    }) : []
    const h = o.horario && typeof o.horario === 'object' ? o.horario as Record<string, unknown> : null
    return [{ fecha: o.fecha, reservable: o.reservable === true, abierto: h?.abierto !== false, slots }]
  })
}
