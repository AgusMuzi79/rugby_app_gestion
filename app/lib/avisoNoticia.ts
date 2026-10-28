// Textos del aviso push al publicar una noticia de Secretaría (app).
// Misma lógica que web/lib/avisoNoticia.ts (la app no puede importar web/).
// El aviso sale una sola vez por noticia: lo garantiza la Edge Function
// `notifications` con noticias.notificada_at (migración 20261030000000).

export type Audiencia = 'todos' | 'cuerpo_tecnico'

export function confirmacionPublicar(n: { audiencia?: Audiencia | null; notificadaAt: string | null }): string {
  if (n.notificadaAt) {
    return 'Ya se avisó por notificación cuando se publicó por primera vez: no se vuelve a mandar. ¿Publicar?'
  }
  return n.audiencia === 'cuerpo_tecnico'
    ? 'Se avisa por notificación a todo el cuerpo técnico. ¿Publicar?'
    : 'Se avisa por notificación a todos los socios. ¿Publicar?'
}

// Resultado de supabase.functions.invoke('notifications'). `omitido` (ya se
// había avisado) no es un error: la confirmación ya lo dijo.
export function mensajeResultadoAviso(r: { error: unknown; data: unknown }): string | null {
  return r.error ? 'La noticia quedó publicada, pero no se pudo mandar el aviso push.' : null
}
