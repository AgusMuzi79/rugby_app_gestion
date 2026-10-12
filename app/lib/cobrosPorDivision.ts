// Cobros de una recaudación de Subcomisión agrupados por división.
// Cada jugador del evento aparece una vez: con su cobranza si ya tiene una, o
// como pendiente con el monto sugerido del evento precargado (igual que la
// pantalla de Cobranzas del Manager). Funciones puras: las usa
// useCobrosSubcomision y las verifica cobrosPorDivision.check.ts.

import { montoInicialCobranza } from './montoSugerido'

export type EstadoCobro = 'pagado' | 'pendiente'
export type FormaDePago = 'efectivo' | 'transferencia' | 'otro'

export interface JugadorCobro {
  id:             string
  nombre:         string
  divisionId:     string | null
  divisionNombre: string | null
}

// Fila de cobranzas tal como llega de PostgREST (numeric puede venir como string).
export interface CobranzaRow {
  jugador_id:    string
  estado:        string
  monto:         number | string | null
  forma_de_pago: string | null
}

export interface CobroJugador {
  jugadorId:   string
  nombre:      string
  estado:      EstadoCobro
  monto:       string            // valor inicial del campo monto (TextInput)
  montoPagado: number            // lo efectivamente cobrado (0 si pendiente)
  formaDePago: FormaDePago | null
}

export interface ResumenCobros {
  pagados:    number
  pendientes: number
  cobrado:    number
}

export interface CobrosDivision extends ResumenCobros {
  divisionId:     string | null
  divisionNombre: string
  jugadores:      CobroJugador[]
}

export interface CobrosPorDivision {
  divisiones: CobrosDivision[]
  total:      ResumenCobros
}

const SIN_DIVISION = 'Sin división'

function aNumero(m: number | string | null): number | null {
  if (m == null) return null
  const n = typeof m === 'number' ? m : parseFloat(m)
  return Number.isFinite(n) ? n : null
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

export function cobrosPorDivision(
  jugadores: JugadorCobro[],
  cobranzas: CobranzaRow[],
  descripcionEvento: string | null,
): CobrosPorDivision {
  const porJugador = new Map(cobranzas.map(c => [c.jugador_id, c]))
  const grupos     = new Map<string, CobrosDivision>()

  for (const j of jugadores) {
    const key = j.divisionId ?? '_'
    let g = grupos.get(key)
    if (!g) {
      g = {
        divisionId:     j.divisionId,
        divisionNombre: j.divisionNombre ?? SIN_DIVISION,
        jugadores:      [],
        pagados:        0,
        pendientes:     0,
        cobrado:        0,
      }
      grupos.set(key, g)
    }

    const c          = porJugador.get(j.id)
    const pagado     = c?.estado === 'pagado'
    const montoReg   = aNumero(c?.monto ?? null)
    const montoPagado = pagado ? (montoReg ?? 0) : 0

    g.jugadores.push({
      jugadorId:   j.id,
      nombre:      j.nombre,
      estado:      pagado ? 'pagado' : 'pendiente',
      monto:       montoInicialCobranza(montoReg, descripcionEvento),
      montoPagado,
      formaDePago: (c?.forma_de_pago as FormaDePago | null) ?? null,
    })
    if (pagado) {
      g.pagados++
      g.cobrado = centavos(g.cobrado + montoPagado)
    } else {
      g.pendientes++
    }
  }

  const divisiones = Array.from(grupos.values())
  for (const g of divisiones) {
    g.jugadores.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
  divisiones.sort((a, b) => {
    if (a.divisionId === null) return 1
    if (b.divisionId === null) return -1
    return a.divisionNombre.localeCompare(b.divisionNombre, 'es', { numeric: true })
  })

  const total = divisiones.reduce<ResumenCobros>(
    (t, g) => ({
      pagados:    t.pagados + g.pagados,
      pendientes: t.pendientes + g.pendientes,
      cobrado:    centavos(t.cobrado + g.cobrado),
    }),
    { pagados: 0, pendientes: 0, cobrado: 0 },
  )

  return { divisiones, total }
}
