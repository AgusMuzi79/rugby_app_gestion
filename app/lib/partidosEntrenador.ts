// Partidos del entrenador (auditoría entrenador T7).
//
// Partido listaba sólo `fecha >= hoy` de la primera división: el resultado del
// sábado no se podía cargar el lunes, y la tarea "RESULTADO" del Inicio
// llevaba a una pantalla donde ese partido ya no estaba. Ahora la ventana es
// de 7 días atrás a 14 adelante, los pasados sin resultado van primero, la
// tarea abre ese partido directo en el paso de resultado y el entrenador con
// varias divisiones elige la división. Lógica pura (partidosEntrenador.check.ts).

import { fechaLocal, fechaLocalMasDias } from './fecha'

export const DIAS_ATRAS_PARTIDOS = 7
export const DIAS_ADELANTE_PARTIDOS = 14

export function ventanaPartidos(base: Date = new Date()): { hoy: string; desde: string; hasta: string } {
  return {
    hoy: fechaLocal(base),
    desde: fechaLocalMasDias(-DIAS_ATRAS_PARTIDOS, base),
    hasta: fechaLocalMasDias(DIAS_ADELANTE_PARTIDOS, base),
  }
}

export type ClaveSeccion = 'sin_resultado' | 'proximos' | 'jugados'

export interface SeccionPartidos<T> {
  clave: ClaveSeccion
  titulo: string
  partidos: T[]
}

/**
 * SIN RESULTADO (pasados sin resultado, el más reciente primero), PRÓXIMOS
 * (hoy en adelante) y JUGADOS (el resto de los pasados). Las divisiones
 * infantiles no cargan resultado: sus pasados van a JUGADOS. Sin secciones vacías.
 */
export function seccionarPartidos<T extends { fecha: string; conResultado: boolean }>(
  partidos: T[],
  hoy: string,
  registraResultado: boolean,
): SeccionPartidos<T>[] {
  const asc = (a: T, b: T) => a.fecha.localeCompare(b.fecha)
  const desc = (a: T, b: T) => b.fecha.localeCompare(a.fecha)
  const pasados = partidos.filter(p => p.fecha < hoy)
  const sinResultado = registraResultado ? pasados.filter(p => !p.conResultado) : []
  const secciones: SeccionPartidos<T>[] = [
    { clave: 'sin_resultado', titulo: 'SIN RESULTADO', partidos: [...sinResultado].sort(desc) },
    { clave: 'proximos', titulo: 'PRÓXIMOS', partidos: partidos.filter(p => p.fecha >= hoy).sort(asc) },
    { clave: 'jugados', titulo: 'JUGADOS', partidos: pasados.filter(p => !sinResultado.includes(p)).sort(desc) },
  ]
  return secciones.filter(s => s.partidos.length > 0)
}

// ─── Deep link Inicio → Partido ──────────────────────────────────────────────

export interface PedidoPartido {
  eventoId?: string
  divisionId?: string
  paso?: 'resultado'
  /** Cambia en cada toque: el mismo partido pedido dos veces se vuelve a aplicar. */
  marca?: string
}

export function paramsPedidoPartido(
  p: { eventoId: string; divisionId: string; paso?: 'resultado' },
  marca: string,
): Record<string, string> {
  return {
    eventoId: p.eventoId,
    divisionId: p.divisionId,
    ...(p.paso ? { paso: p.paso } : {}),
    pedido: marca,
  }
}

type Params = Record<string, string | string[] | undefined>

function primero(v: string | string[] | undefined): string | undefined {
  const x = Array.isArray(v) ? v[0] : v
  return x ? x : undefined
}

export function leerPedidoPartido(params: Params): PedidoPartido {
  const pedido: PedidoPartido = {}
  const eventoId = primero(params.eventoId)
  const divisionId = primero(params.divisionId)
  const marca = primero(params.pedido)
  if (eventoId) pedido.eventoId = eventoId
  if (divisionId) pedido.divisionId = divisionId
  if (primero(params.paso) === 'resultado') pedido.paso = 'resultado'
  if (marca) pedido.marca = marca
  return pedido
}

// ─── Inicio: tarea RESULTADO ─────────────────────────────────────────────────

/** Partidos pasados sin resultado (no infantiles), el más reciente primero. */
export function partidosSinResultado<T extends { id: string; fecha: string; division_id: string }>(
  partidos: T[],
  conResultado: Set<string>,
  divisionesInfantiles: Set<string>,
): T[] {
  return partidos
    .filter(p => !conResultado.has(p.id) && !divisionesInfantiles.has(p.division_id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// ─── División elegida ────────────────────────────────────────────────────────

/** La pedida (si es del entrenador); si no, la actual (si sigue); si no, la primera. */
export function elegirDivision(
  divisiones: { id: string }[],
  pedida: string | null | undefined,
  actual: string | null | undefined,
): string | null {
  if (pedida && divisiones.some(d => d.id === pedida)) return pedida
  if (actual && divisiones.some(d => d.id === actual)) return actual
  return divisiones[0]?.id ?? null
}
