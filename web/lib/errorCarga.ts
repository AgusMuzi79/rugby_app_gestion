// Mensajes de error de carga para las pantallas del panel. Lógica pura,
// verificada en errorCarga.check.ts. Regla del repo: mirar el error antes de
// mostrar un valor como vacío; si la consulta falló, se dice y se ofrece REINTENTAR.

/** Texto técnico de un error de Supabase/PostgREST, de un Error o de un string. */
export function detalleError(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return ''
}

/** "No se pudo/pudieron cargar <qué>. Revisá la conexión…" + detalle técnico entre paréntesis. */
export function mensajeErrorCarga(que: string, err: unknown): string {
  const plural = /^(los|las)\s/i.test(que)
  const detalle = detalleError(err)
  return `No se ${plural ? 'pudieron' : 'pudo'} cargar ${que}. Revisá la conexión y probá de nuevo.${detalle ? ` (${detalle})` : ''}`
}

/** El primer error no nulo de varias respuestas de Supabase. */
export function primerError<E>(...errores: (E | null | undefined)[]): E | null {
  for (const e of errores) if (e) return e
  return null
}
