// Tokens y formatos compartidos por las pantallas de eventos financieros
// (Cobranzas / Egresos del Manager, recaudaciones de Subcomisión).
import { colors } from '@/constants/theme'

export const FONDO   = '#15110A'
export const CARD    = '#1C1710'
export const TEXTO   = '#F3EFE4'
export const MUTED   = '#8E8574'
export const DIVIDER = '#2C2418'
export const ORO     = colors.oro
export const ROJO    = colors.rojoUrgente
export const VERDE   = '#4A7C59'

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
