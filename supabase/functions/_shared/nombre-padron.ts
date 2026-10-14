// Nombre del padrón NUVIX (auditoría UX socio, T12). Vive en
// socios.nombre_padron y es el que muestran el carnet y el escaneo; el
// socio edita aparte profiles.nombre en Mi perfil y el importador ya no lo
// pisa.

// Valor a escribir en socios.nombre_padron, o null si no hay que tocarlo.
// Una fila sin nombre nunca borra el que ya está.
export function nombrePadronACambiar(nombreFila: string, actual: string | null): string | null {
  const nuevo = nombreFila.trim()
  if (!nuevo) return null
  return nuevo === (actual ?? '').trim() ? null : nuevo
}

// Nombre a mostrar: el del padrón y, si no hay, el del perfil.
export function nombreVisible(
  nombrePadron: string | null | undefined,
  nombrePerfil: string | null | undefined,
): string {
  const padron = (nombrePadron ?? '').trim()
  if (padron) return padron
  const perfil = (nombrePerfil ?? '').trim()
  return perfil || '—'
}
