// Calendar event types (table `eventos`). Not to be confused with the
// eventos_financieros `TipoEvento` in hooks/useEventos.ts.
//
// 'actividad' (nutrition talk, gym test, Sevens…) carries a required `titulo`
// and never takes attendance, so it must not count in attendance stats.
// The notifications Edge Function inlines the same label logic (Deno can't import app/).

export type TipoEventoCalendario = 'entrenamiento' | 'partido' | 'actividad'

export function etiquetaEvento(ev: { tipo: string; titulo?: string | null }): string {
  switch (ev.tipo) {
    case 'partido':       return 'Partido'
    case 'entrenamiento': return 'Entrenamiento'
    case 'actividad':     return ev.titulo?.trim() || 'Actividad'
    default:              return 'Evento'
  }
}

// Title of the automatic noticia and push. An activity title can be of either
// grammatical gender, so it goes after "Cancelado:" instead of before "cancelado".
export function tituloCancelacion(ev: { tipo: string; titulo?: string | null }, divisionNombre: string): string {
  const etiqueta = etiquetaEvento(ev)
  return ev.tipo === 'actividad'
    ? `Cancelado: ${etiqueta} — ${divisionNombre}`
    : `${etiqueta} cancelado — ${divisionNombre}`
}

export function letraEvento(tipo: string): string {
  if (tipo === 'partido') return 'P'
  if (tipo === 'actividad') return 'A'
  return 'E'
}

// Entrenamientos and partidos keep their attendance flow; activities have none.
export function admiteAsistencia(tipo: string): boolean {
  return tipo !== 'actividad'
}

export function tituloActividadValido(titulo: string): boolean {
  return titulo.trim().length > 0
}
