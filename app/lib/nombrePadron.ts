// Nombre que muestra el carnet (auditoría UX socio, T12). El socio puede
// editar su nombre en Mi perfil (profiles.nombre), pero el carnet muestra el
// del padrón del club (socios.nombre_padron, lo escribe importar-socios). Si
// todavía no hay nombre del padrón (alta manual, sin importación) se usa el
// del perfil.

export function nombreCarnet(
  nombrePadron: string | null | undefined,
  nombrePerfil: string | null | undefined,
): string {
  const padron = (nombrePadron ?? '').trim()
  if (padron) return padron
  const perfil = (nombrePerfil ?? '').trim()
  return perfil || '—'
}

// 42703 = undefined_column de Postgres (PostgREST lo devuelve tal cual). Pasa
// si la app (OTA) llega antes que la migración que agrega nombre_padron: en
// ese caso se repite la consulta sin la columna en vez de romper el carnet.
export function esColumnaInexistente(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703'
}
