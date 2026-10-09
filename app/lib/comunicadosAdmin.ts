// Pure logic for the admin comunicados screen. No react-native / supabase
// imports so it can be checked in Node (see comunicadosAdmin.check.ts).

// Values allowed by noticias_audiencia_check (20260616000001_noticias_audiencia).
export type AudienciaComunicado = 'cuerpo_tecnico' | 'todos'

// What the list shows: an unexpected stored value is surfaced as such instead
// of being presented as a real audience.
export type AudienciaMostrada = AudienciaComunicado | 'desconocida'

export function normalizarAudiencia(valor: unknown): AudienciaMostrada {
  return valor === 'cuerpo_tecnico' || valor === 'todos' ? valor : 'desconocida'
}

export type ResultadoBorrado = 'ok' | 'sin_filas' | 'error'

// A DELETE blocked by RLS (or on an already removed row) returns no error and
// no rows; only a returned row confirms the deletion.
export function resultadoBorrado(error: unknown, filas: unknown[] | null | undefined): ResultadoBorrado {
  if (error) return 'error'
  return filas && filas.length > 0 ? 'ok' : 'sin_filas'
}
