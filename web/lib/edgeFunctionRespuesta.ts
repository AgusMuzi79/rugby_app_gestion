// Parte pura del cliente de Edge Functions del panel (edgeFunction.ts):
// convierte cualquier respuesta (JSON, HTML del gateway, vacío) en un objeto
// con `error` legible. Separada para chequearla con tsx (edgeFunction.check.ts).

// Respuesta común de las Edge Functions de gestión: fallas de validación llegan como
// 200 { ok:false, motivo }; errores reales como { error }.
export type EdgeResponse<T = Record<string, unknown>> = T & {
  ok?: boolean
  motivo?: string
  error?: string
  status: number
}

export function interpretarRespuesta<T = Record<string, unknown>>(status: number, texto: string): EdgeResponse<T> {
  let body: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(texto)
    body = parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    body = null
  }
  const ok = status >= 200 && status < 300
  if (!body) {
    // El gateway (sesión vencida, timeout, archivo muy grande) a veces responde
    // HTML o nada: nunca mostrarle eso a Secretaría.
    return { error: ok ? 'El servidor respondió algo inesperado. Probá de nuevo.' : `El servidor no respondió bien (error ${status}). Probá de nuevo.`, status } as EdgeResponse<T>
  }
  const mensaje = body.error ?? body.msg ?? body.message
  if (!ok && !(typeof mensaje === 'string' && mensaje)) {
    return { ...body, error: `Error ${status} al llamar al servidor. Probá de nuevo.`, status } as EdgeResponse<T>
  }
  if (!ok) return { ...body, error: mensaje as string, status } as EdgeResponse<T>
  return { ...body, status } as EdgeResponse<T>
}

// `vencido` = se cortó por el límite de tiempo (la operación pudo haberse
// aplicado igual: por eso se pide revisar el historial).
export function mensajeFalloRed(vencido: boolean): string {
  return vencido
    ? 'La operación tardó demasiado y se cortó. Puede haberse aplicado igual: revisá el historial antes de reintentar.'
    : 'No hay conexión con el servidor. Revisá internet y probá de nuevo.'
}
