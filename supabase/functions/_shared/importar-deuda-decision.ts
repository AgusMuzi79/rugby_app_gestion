// Reglas puras de importar-deuda (sin Deno ni Supabase, se chequean con
// importar-deuda-decision.check.ts):
//   • un reporte con fecha de corte más vieja que la última importada se
//     rechaza (409) salvo que el pedido traiga `forzar`: el RPC recalcula el
//     semáforo de todos los socios con lo último que entra, así que subir el
//     archivo de ayer después del de hoy volvía el semáforo atrás en silencio.
//   • el desbalance de la reconciliación se explica en castellano, no en JSON.

import type { Desbalance } from './parse-deuda-nuvix.ts'

export type DecisionFechaCorte =
  | { ok: true }
  | { ok: false; mensaje: string; ultimaFechaCorte: string }

// Fechas ISO 'YYYY-MM-DD': se comparan como texto.
export function decidirFechaCorte(p: {
  fechaCorte: string
  ultimaFechaCorte: string | null
  forzar: boolean
}): DecisionFechaCorte {
  if (!p.ultimaFechaCorte || p.forzar || p.fechaCorte >= p.ultimaFechaCorte) return { ok: true }
  const mismoAnio = p.fechaCorte.slice(0, 4) === p.ultimaFechaCorte.slice(0, 4)
  return {
    ok: false,
    mensaje:
      `Este reporte es del ${fechaCorta(p.fechaCorte, mismoAnio)}, más viejo que el último importado ` +
      `(${fechaCorta(p.ultimaFechaCorte, mismoAnio)}). Importarlo recalcula el semáforo de todos los socios con datos viejos.`,
    ultimaFechaCorte: p.ultimaFechaCorte,
  }
}

// Campo `forzar` del FormData: sólo "1" o "true".
export function leerForzar(valor: unknown): boolean {
  if (typeof valor !== 'string') return false
  const v = valor.trim().toLowerCase()
  return v === '1' || v === 'true'
}

const NOMBRE_CAMPO: Record<Desbalance['campo'], string> = {
  vencido: 'Vencido',
  a_vencer: 'A vencer',
  total: 'Total',
}

export function mensajeDesbalance(desbalance: Desbalance[]): string {
  const encabezado = 'El archivo está incompleto o dañado: la suma de las cuentas no da el Total General. No se importó nada.'
  const detalle = desbalance.length === 0
    ? ['No se encontró el Total General al final del reporte.']
    : desbalance.map(d =>
      `${NOMBRE_CAMPO[d.campo]}: suma de las cuentas ${pesos(d.sumaSubtotales)} contra Total General ${pesos(d.totalGeneral)} (diferencia ${pesos(d.diferencia)})`)
  return [encabezado, ...detalle, 'Volvé a exportar el reporte RPT_Vencimientos completo desde NUVIX.'].join('\n')
}

function fechaCorta(iso: string, sinAnio: boolean): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return sinAnio ? `${d}/${m}` : `${d}/${m}/${y}`
}

// Formato es-AR armado a mano (1.234,50) para no depender del ICU del runtime.
function pesos(n: number): string {
  const signo = n < 0 ? '-' : ''
  const [entero, dec] = Math.abs(n).toFixed(2).split('.')
  return `${signo}$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}
