// "% cobrado" y pendientes de un evento financiero, con una sola fuente: el RPC
// resumen_cobranzas_eventos (20261101000000). El denominador son los jugadores
// activos del evento que ve quien consulta, no las filas de `cobranzas` (en una
// recaudación de Subcomisión sólo existen las de quienes pagaron, y los
// pendientes se graban con monto null).

export interface ResumenCobranza {
  jugadores: number  // jugadores activos del evento visibles para el rol
  pagados:   number  // de esos, con cobranza en estado 'pagado'
  cobrado:   number  // suma de los montos pagados
}

export const RESUMEN_VACIO: ResumenCobranza = { jugadores: 0, pagados: 0, cobrado: 0 }

// Fila tal como la devuelve el RPC (numeric puede llegar como string).
export interface FilaResumenCobranza {
  evento_id: string
  jugadores: number | string | null
  pagados:   number | string | null
  cobrado:   number | string | null
}

function numero(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

// null cuando el evento no tiene jugadores: no hay porcentaje que mostrar.
export function pctCobrado(r: ResumenCobranza): number | null {
  if (r.jugadores <= 0) return null
  return Math.round((Math.min(r.pagados, r.jugadores) / r.jugadores) * 100)
}

export function pendientesDe(r: ResumenCobranza): number {
  return Math.max(0, r.jugadores - r.pagados)
}

export function resumenesPorEvento(filas: FilaResumenCobranza[] | null | undefined): Map<string, ResumenCobranza> {
  const mapa = new Map<string, ResumenCobranza>()
  for (const f of filas ?? []) {
    mapa.set(f.evento_id, {
      jugadores: numero(f.jugadores),
      pagados:   numero(f.pagados),
      cobrado:   numero(f.cobrado),
    })
  }
  return mapa
}

// Un evento sin fila (no visible para el rol) cuenta como vacío.
export function resumenDe(mapa: Map<string, ResumenCobranza>, eventoId: string): ResumenCobranza {
  return mapa.get(eventoId) ?? RESUMEN_VACIO
}
