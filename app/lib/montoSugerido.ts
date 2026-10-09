// Monto sugerido por jugador de un evento financiero.
// Se guarda en eventos_financieros.descripcion (texto) al crear el evento.

// Acepta formato local: punto de miles y coma decimal ("2.500", "2.500,50").
// Un punto sólo es decimal si no hay coma y no forma grupos de miles ("12.75").
export function montoSugeridoDe(descripcion: string | null): number | null {
  if (!descripcion?.trim()) return null
  let limpio = descripcion.replace(/[^\d.,-]/g, '')
  if (limpio.includes(',')) {
    limpio = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) {
    limpio = limpio.replace(/\./g, '')
  }
  const n = parseFloat(limpio)
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
