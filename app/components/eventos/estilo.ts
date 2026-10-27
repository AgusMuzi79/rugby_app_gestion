// Tokens y formatos compartidos por las pantallas de eventos financieros
// (Cobranzas / Egresos del Manager, recaudaciones de Subcomisión).
import { colors } from '@/constants/theme'

export const FONDO   = colors.fondo
export const CARD    = colors.card
export const TEXTO   = colors.texto
export const MUTED   = colors.muted
export const DIVIDER = colors.borde
export const ORO     = colors.oro
// Rojo de superficie / borde / ícono. Para texto rojo usar ROJO_TEXTO
// (rojoUrgente da 3.69–3.90:1 sobre card / fondo).
export const ROJO    = colors.rojoUrgente
export const ROJO_TEXTO = colors.rojoTexto
// Verde de superficie (badge PAGADO con texto blanco, 4.86:1). Para texto verde
// sobre fondo / card usar VERDE_TEXTO.
export const VERDE   = '#4A7C59'
export const VERDE_TEXTO = colors.estadoActivo
// Texto sobre ORO (botones primarios, chips y selectores activos), 10.24:1.
export const SOBRE_ORO = colors.sobreOro

export function formatFechaLarga(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// "$ 1.500" / "− $ 200" (neto negativo).
export function formatMonto(n: number) {
  const abs = '$ ' + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return n < 0 ? '− ' + abs : abs
}
