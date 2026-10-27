// Decisión del gate de términos y condiciones (hooks/useTerminos.ts).
//
// Antes, si la lectura de la versión activa fallaba (red), el hook ponía
// `pendiente: false` y la persona entraba sin aceptar la versión vigente
// (exposición legal, Ley 25.326). Un error de lectura ahora deja el gate
// cerrado con un mensaje y REINTENTAR. Lógica pura (terminos.check.ts).

export interface VersionTerminos { id: string; version: string; titulo: string; pdf_path: string }

export const ERROR_LECTURA_TERMINOS = 'No pudimos verificar los términos y condiciones. Revisá la conexión y reintentá.'

// `aceptadaEnTelefono`: esta cuenta ya aceptó alguna versión en este teléfono.
// Sólo cuenta cuando no se pudo leer la base (sin red): así una sesión
// restaurada sin señal abre igual (el carnet tiene que funcionar offline) y
// una versión nueva se exige apenas vuelve la conexión.
export function estadoTerminos(r: {
  activa: VersionTerminos | null
  errorActiva: unknown
  aceptacion: { id: string } | null
  errorAceptacion: unknown
  aceptadaEnTelefono?: boolean
}): { pendiente: boolean; error: string | null } {
  const sinLectura = !!r.errorActiva || (!!r.activa && !!r.errorAceptacion)
  if (sinLectura) {
    return r.aceptadaEnTelefono
      ? { pendiente: false, error: null }
      : { pendiente: true, error: ERROR_LECTURA_TERMINOS }
  }
  if (!r.activa) return { pendiente: false, error: null }
  return { pendiente: !r.aceptacion, error: null }
}

// Ya aceptada en otro dispositivo o por un doble toque: la fila existe (23505).
export function aceptacionRegistrada(error: { code?: string; message?: string } | null): boolean {
  return !error || error.code === '23505'
}
