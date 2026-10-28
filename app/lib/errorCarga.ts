// Mensajes de error al leer datos de Supabase en las pantallas de Secretaría
// (auditoría UX secretaría, T12). Un error de lectura no es "no hay datos": la
// pantalla muestra el mensaje con REINTENTAR en vez de una lista vacía o un 0.
// Lógica pura, verificada en errorCarga.check.ts.

import { SIN_CONEXION } from './errorFunction'
import { esErrorDeRed } from './offlineSync'

/** `que` lleva el artículo ("los socios", "el resumen") para concordar el verbo. */
export function mensajeErrorCarga(que: string, err: unknown): string {
  if (esErrorDeRed(err)) return SIN_CONEXION
  const plural = /^(los|las)\s/i.test(que)
  return `No se ${plural ? 'pudieron' : 'pudo'} cargar ${que}. Probá de nuevo.`
}

/** El primer error no nulo de varias respuestas de Supabase. */
export function primerError<E>(...errores: (E | null | undefined)[]): E | null {
  for (const e of errores) if (e) return e
  return null
}
