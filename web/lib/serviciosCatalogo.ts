// Reglas del catálogo de servicios (Secretaría › Servicios).
//
// Borrar un servicio arrastraba todos sus vínculos `socio_servicios` (cascade):
// borrar "Gimnasio" dejaba a todos sin gimnasio y el lector los rechazaba.
// La migración 20261028000000 pone ON DELETE RESTRICT; esto explica por qué
// antes de intentarlo.
//
// Nombres que `importar-servicios` busca por nombre exacto
// (`supabase/functions/_shared/parse-padron-servicios.ts`, SERVICIOS_MAPEADOS);
// `socios-qr` además busca "%gimnasio%". Renombrarlos rompe el import y el lector.
export const NOMBRES_MAPEADOS: ReadonlySet<string> = new Set([
  'Gimnasio',
  'Rugby',
  'Hockey',
  'Carnet Tenis',
  'Rugby Inclusivo',
  'Hockey Inclusivo',
])

export function nombreBloqueado(nombre: string): boolean {
  return NOMBRES_MAPEADOS.has(nombre)
}

// null = se puede eliminar.
export function motivoNoEliminar(nombre: string, vinculos: number): string | null {
  if (vinculos > 0) {
    const quien = vinculos === 1 ? '1 socio' : `${vinculos} socios`
    return `No se puede eliminar "${nombre}": lo tienen ${quien}. Desactivalo en su lugar.`
  }
  if (nombreBloqueado(nombre)) {
    return `No se puede eliminar "${nombre}": lo usa el importador del padrón de servicios. Desactivalo en su lugar.`
  }
  return null
}
