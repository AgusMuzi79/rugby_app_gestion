// Monto sugerido por jugador de un evento financiero.
// Se guarda en eventos_financieros.descripcion (texto) al crear el evento.

export function montoSugeridoDe(descripcion: string | null): number | null {
  if (!descripcion?.trim()) return null
  const n = parseFloat(descripcion.replace(',', '.'))
  return isNaN(n) || n <= 0 ? null : n
}

// Valor inicial del campo monto en Cobranzas: el monto ya registrado si existe,
// si no el sugerido del evento. El manager puede editarlo igual.
export function montoInicialCobranza(
  montoRegistrado: number | null | undefined,
  descripcionEvento: string | null,
): string {
  if (montoRegistrado != null) return String(montoRegistrado)
  const sugerido = montoSugeridoDe(descripcionEvento)
  return sugerido != null ? String(sugerido) : ''
}
