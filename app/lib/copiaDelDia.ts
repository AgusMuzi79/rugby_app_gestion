// Copia local de los entrenamientos y las marcas de hoy de una división
// (revisión de la auditoría entrenador).
//
// La copia del plantel (plantelGuardado.ts) sólo traía los jugadores: sin
// señal la pantalla arrancaba sin marcas y sin turno elegido. Entonces lo ya
// guardado hoy no se veía, el ítem encolado llevaba `estado_previo` null (la
// sync podía mandar otra vez la alerta de 4 faltas) y, con doble turno, iba sin
// `evento_id` (la sync lo ponía en el primer entrenamiento del día). Ahora cada
// lectura buena deja también los turnos de hoy y las marcas de cada uno, y cada
// guardado suma lo que mandó. Una copia de otro día no sirve para turnos ni
// marcas: sólo el plantel sale de la copia vieja.
// Lógica pura (copiaDelDia.check.ts); el AsyncStorage lo maneja el hook.

import { esErrorDeRed } from './offlineSync'
import { elegirEntrenamiento, type EntrenamientoHoy } from './entrenamientoHoy'
import type { MarcaGuardada } from './ausenciasConsecutivas'

export interface CopiaDia {
  fecha:          string // YYYY-MM-DD local
  guardadoEn:     number // ms
  entrenamientos: EntrenamientoHoy[]
  // evento → jugador → estado guardado (en la base o en la cola).
  marcas:         Record<string, Record<string, string>>
}

export function claveDia(divisionId: string): string {
  return `plantel:dia:${divisionId}`
}

function delDia(copia: CopiaDia | null, fecha: string): CopiaDia | null {
  return copia && copia.fecha === fecha ? copia : null
}

export type EntrenamientosResueltos =
  | { tipo: 'remoto'; lista: EntrenamientoHoy[]; eventoId: string | null }
  | { tipo: 'guardado'; lista: EntrenamientoHoy[]; eventoId: string | null; guardadoEn: number }
  // Sin señal y sin copia de hoy: sin turno (la sync usa el primero del día).
  | { tipo: 'sinDatos'; lista: []; eventoId: null }
  | { tipo: 'error'; error: unknown }

export function resolverEntrenamientos({
  error, remoto, copia, fecha, pedidoId, ahoraMin,
}: {
  error:    unknown
  remoto:   EntrenamientoHoy[] | null
  copia:    CopiaDia | null
  fecha:    string
  pedidoId: string | null
  ahoraMin: number
}): EntrenamientosResueltos {
  if (!error && remoto) return { tipo: 'remoto', lista: remoto, eventoId: elegirEntrenamiento(remoto, pedidoId, ahoraMin) }
  if (!esErrorDeRed(error)) return { tipo: 'error', error }
  const hoy = delDia(copia, fecha)
  if (!hoy) return { tipo: 'sinDatos', lista: [], eventoId: null }
  return {
    tipo: 'guardado',
    lista: hoy.entrenamientos,
    eventoId: elegirEntrenamiento(hoy.entrenamientos, pedidoId, ahoraMin),
    guardadoEn: hoy.guardadoEn,
  }
}

export type MarcasResueltas<E extends string> =
  | { tipo: 'ok'; marcas: Record<string, E>; deCopia: boolean }
  // Sin señal y sin copia de ese turno: no se sabe qué había guardado.
  | { tipo: 'desconocidas' }
  | { tipo: 'error'; error: unknown }

export function resolverMarcas<E extends string>({
  eventoId, error, remoto, copia, fecha,
}: {
  eventoId: string | null
  error:    unknown
  remoto:   Record<string, E> | null
  copia:    CopiaDia | null
  fecha:    string
}): MarcasResueltas<E> {
  if (!eventoId) return { tipo: 'ok', marcas: {}, deCopia: false }
  if (!error && remoto) return { tipo: 'ok', marcas: remoto, deCopia: false }
  if (!esErrorDeRed(error)) return { tipo: 'error', error }
  const guardadas = delDia(copia, fecha)?.marcas[eventoId]
  if (!guardadas) return { tipo: 'desconocidas' }
  return { tipo: 'ok', marcas: { ...guardadas } as Record<string, E>, deCopia: true }
}

export interface JugadorMarcado<E extends string> {
  id:              string
  nombre_completo: string
  estado:          E | null
  estadoGuardado:  E | null
}

// Lo guardado arranca como marcado y como guardado (no cuenta "sin guardar").
export function armarJugadores<E extends string>(
  plantel: { id: string; nombre_completo: string }[],
  marcas: Record<string, E>,
): JugadorMarcado<E>[] {
  return plantel.map(j => ({
    id: j.id,
    nombre_completo: j.nombre_completo,
    estado: marcas[j.id] ?? null,
    estadoGuardado: marcas[j.id] ?? null,
  }))
}

// Lo que se manda y lo que había antes en el evento (alerta de 4 faltas).
export function marcasParaGuardar<E extends string>(jugadores: JugadorMarcado<E>[]): MarcaGuardada[] {
  return jugadores
    .filter(j => j.estado !== null)
    .map(j => ({ jugador_id: j.id, estado: j.estado!, estadoPrevio: j.estadoGuardado }))
}

// Ítem de la cola offline (lib/offlineSync.ts). Con el turno elegido va su
// evento; sin evento hoy, la sync usa el primero del día o lo crea.
export function payloadCola({
  eventoId, divisionId, fecha, registradoPor, marcas,
}: {
  eventoId:      string | null
  divisionId:    string
  fecha:         string
  registradoPor: string
  marcas:        MarcaGuardada[]
}): Record<string, unknown> {
  return {
    ...(eventoId ? { evento_id: eventoId, entrenamiento: true } : {}),
    division_id: divisionId,
    fecha,
    registrado_por: registradoPor,
    jugadores: marcas.map(m => ({ jugador_id: m.jugador_id, estado: m.estado, estado_previo: m.estadoPrevio })),
  }
}

// `entrenamientos`: la lista leída de la base (poda marcas de turnos que ya no
// están). `marcas` de `eventoId`: las leídas reemplazan; con `mezclar` (un
// guardado) se suman a las que había.
export function actualizarCopiaDia(
  copia: CopiaDia | null,
  cambios: {
    fecha:           string
    ahora:           number
    entrenamientos?: EntrenamientoHoy[]
    eventoId?:       string
    marcas?:         Record<string, string>
    mezclar?:        boolean
  },
): CopiaDia {
  const base = delDia(copia, cambios.fecha)
  let entrenamientos = base?.entrenamientos ?? []
  let marcas = { ...(base?.marcas ?? {}) }
  if (cambios.entrenamientos) {
    entrenamientos = cambios.entrenamientos
    const ids = new Set(entrenamientos.map(e => e.id))
    marcas = Object.fromEntries(Object.entries(marcas).filter(([id]) => ids.has(id)))
  }
  const evId = cambios.eventoId
  if (evId && cambios.marcas) {
    if (!entrenamientos.some(e => e.id === evId)) entrenamientos = [...entrenamientos, { id: evId, hora: null }]
    marcas[evId] = cambios.mezclar ? { ...(marcas[evId] ?? {}), ...cambios.marcas } : { ...cambios.marcas }
  }
  return { fecha: cambios.fecha, guardadoEn: cambios.ahora, entrenamientos, marcas }
}

export function serializarCopiaDia(copia: CopiaDia): string {
  return JSON.stringify(copia)
}

export function leerCopiaDia(raw: string | null): CopiaDia | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<CopiaDia>
    if (typeof v.fecha !== 'string' || typeof v.guardadoEn !== 'number') return null
    if (!Array.isArray(v.entrenamientos) || !v.marcas || typeof v.marcas !== 'object') return null
    return { fecha: v.fecha, guardadoEn: v.guardadoEn, entrenamientos: v.entrenamientos, marcas: v.marcas }
  } catch {
    return null
  }
}
