// Decisión del gate de términos y condiciones (hooks/useTerminos.ts).
//
// Antes, si la lectura de la versión activa fallaba (red), el hook ponía
// `pendiente: false` y la persona entraba sin aceptar la versión vigente
// (exposición legal, Ley 25.326). Un error de lectura ahora deja el gate
// cerrado con un mensaje y REINTENTAR. Lógica pura (terminos.check.ts).

export interface VersionTerminos { id: string; version: string; titulo: string; pdf_path: string }

export const ERROR_LECTURA_TERMINOS = 'No pudimos verificar los términos y condiciones. Revisá la conexión y reintentá.'

export function estadoTerminos(r: {
  activa: VersionTerminos | null
  errorActiva: unknown
  aceptacion: { id: string } | null
  errorAceptacion: unknown
}): { pendiente: boolean; error: string | null } {
  if (r.errorActiva) return { pendiente: true, error: ERROR_LECTURA_TERMINOS }
  if (!r.activa) return { pendiente: false, error: null }
  if (r.errorAceptacion) return { pendiente: true, error: ERROR_LECTURA_TERMINOS }
  return { pendiente: !r.aceptacion, error: null }
}

// Ya aceptada en otro dispositivo o por un doble toque: la fila existe (23505).
export function aceptacionRegistrada(error: { code?: string; message?: string } | null): boolean {
  return !error || error.code === '23505'
}
