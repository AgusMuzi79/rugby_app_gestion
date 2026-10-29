// Copia local del último plantel (y de las divisiones) del entrenador
// (auditoría entrenador T8).
//
// En la cancha sin señal la pantalla de Asistencia decía "Sin división
// asignada" o mostraba una lista vacía: el modo offline sólo servía si la
// lista ya estaba cargada. Ahora cada lectura buena deja una copia en el
// teléfono; si la próxima falla por red, se marca sobre la copia (con la nota
// "lista guardada al HH:MM") y la cola offline la manda después. Un error que
// no es de red (permisos) se muestra con REINTENTAR, sin copia.
// Lógica pura (plantelGuardado.check.ts); el AsyncStorage lo maneja el hook.

import { esErrorDeRed } from './offlineSync'

export interface Guardado<T> {
  guardadoEn: number // ms
  datos:      T[]
}

export type ResultadoCarga<T> =
  | { tipo: 'remoto'; datos: T[]; guardar: true }
  | { tipo: 'guardado'; datos: T[]; guardadoEn: number }
  | { tipo: 'error'; error: unknown }

export function clavePlantel(divisionId: string): string {
  return `plantel:${divisionId}`
}

export function claveDivisiones(userId: string): string {
  return `plantel:divisiones:${userId}`
}

export function resolverCarga<T>({
  error,
  remoto,
  guardado,
}: {
  error: unknown
  remoto: T[] | null
  guardado: Guardado<T> | null
}): ResultadoCarga<T> {
  if (!error && remoto) return { tipo: 'remoto', datos: remoto, guardar: true }
  if (esErrorDeRed(error) && guardado) return { tipo: 'guardado', datos: guardado.datos, guardadoEn: guardado.guardadoEn }
  return { tipo: 'error', error }
}

export function serializarGuardado<T>(datos: T[], ahora: number): string {
  return JSON.stringify({ guardadoEn: ahora, datos })
}

export function leerGuardado<T>(raw: string | null): Guardado<T> | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { guardadoEn?: unknown; datos?: unknown }
    if (typeof v.guardadoEn !== 'number' || !Array.isArray(v.datos)) return null
    return { guardadoEn: v.guardadoEn, datos: v.datos as T[] }
  } catch {
    return null
  }
}

export function horaGuardado(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
