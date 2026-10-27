// Utilidades puras para listas largas del panel (Socios: ~1.500 filas).
// Verificadas en listaPaginada.check.ts.

/** Filas que se renderizan por tanda; "VER MÁS" suma otra tanda. */
export const PAGINA_LISTA = 100

export function paginar<T>(items: T[], limite: number): { visibles: T[]; restantes: number } {
  return { visibles: items.slice(0, limite), restantes: Math.max(0, items.length - limite) }
}

/** Copia ordenada; no muta la lista original (que puede ser estado de React). */
export function ordenarCon<T>(items: T[], comparar: (a: T, b: T) => number, direccion: 'asc' | 'desc'): T[] {
  const signo = direccion === 'asc' ? 1 : -1
  return [...items].sort((a, b) => signo * comparar(a, b))
}

/**
 * Actualiza un solo elemento después de editarlo, sin volver a bajar la lista
 * entera. `nuevo` null = ya no existe (se saca). Si no estaba, se agrega al final.
 */
export function reemplazarPorId<T extends { id: string }>(lista: T[], id: string, nuevo: T | null): T[] {
  if (!lista.some(x => x.id === id)) return nuevo ? [...lista, nuevo] : lista
  return nuevo ? lista.map(x => (x.id === id ? nuevo : x)) : lista.filter(x => x.id !== id)
}
