// Ratio de contraste WCAG 2.x entre dos colores hex (#RGB o #RRGGBB),
// con luminancia relativa sRGB. Copia de app/lib/contraste.ts; lo usa
// contraste.check.ts para fijar que los tokens de app/globals.css cumplen AA.

export const CONTRASTE_TEXTO_AA = 4.5
// Componentes de interfaz (bordes de inputs) y texto grande: WCAG 1.4.11 / 1.4.3.
export const CONTRASTE_UI = 3

function canal(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function luminancia(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Color inválido: ${hex}`)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la]
  return (claro + 0.05) / (oscuro + 0.05)
}
