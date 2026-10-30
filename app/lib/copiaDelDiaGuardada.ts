// Escritura de la copia del día (copiaDelDia.ts) en el teléfono, de a una por
// clave (revisión de la auditoría entrenador).
//
// La carga de la lista, el guardado (online o en la cola) y el cambio de turno
// leen, mezclan y escriben la misma clave `plantel:dia:<división>`. Sin
// candado, la carga leía la copia antes de ir a la red y la escribía después
// con esa base vieja: lo guardado en el medio se perdía de la copia y, sin
// señal, volvía como desconocido o con un `estado_previo` viejo (otra vez la
// alerta de 4 faltas). Ahora cada actualización lee, aplica el cambio puro y
// escribe dentro del candado de su clave, como la cola offline
// (offlineQueue.ts). Claves distintas no se esperan entre sí.
// Verificación: copiaDelDiaGuardada.check.ts.

import { leerCopiaDia, serializarCopiaDia, type CopiaDia } from './copiaDelDia'

// Lo que se usa de AsyncStorage (en la verificación, uno en memoria).
export interface AlmacenTexto {
  getItem(clave: string): Promise<string | null>
  setItem(clave: string, valor: string): Promise<void>
}

const cadenas = new Map<string, Promise<unknown>>()

export function conCandadoPorClave<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const previa = cadenas.get(clave) ?? Promise.resolve()
  const resultado = previa.then(fn, fn)
  const siguiente = resultado.catch(() => undefined)
  cadenas.set(clave, siguiente)
  // Sin nada más esperando, la clave sale del mapa (no crece con cada división).
  void siguiente.then(() => { if (cadenas.get(clave) === siguiente) cadenas.delete(clave) })
  return resultado
}

// `cambiar` recibe la copia leída dentro del candado (null si no hay o no se
// pudo leer) y devuelve la nueva, o null para no escribir. Nunca rechaza: si
// AsyncStorage falla se sigue sin copia, la asistencia no se frena.
export function actualizarCopiaGuardada(
  almacen: AlmacenTexto,
  clave: string,
  cambiar: (actual: CopiaDia | null) => CopiaDia | null,
): Promise<CopiaDia | null> {
  return conCandadoPorClave(clave, async () => {
    let raw: string | null = null
    try { raw = await almacen.getItem(clave) } catch { /* sin copia */ }
    let nueva: CopiaDia | null = null
    try { nueva = cambiar(leerCopiaDia(raw)) } catch { return null }
    if (!nueva) return null
    try { await almacen.setItem(clave, serializarCopiaDia(nueva)) } catch { /* sin copia */ }
    return nueva
  })
}
