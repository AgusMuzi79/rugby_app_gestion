// Qué filas de `cobranzas` escribe el Manager al guardar un evento.
//
// Antes "GUARDAR TODOS" hacía upsert de todos los jugadores con el estado
// local: si la lectura había fallado (todos PENDIENTE) borraba los pagos, y en
// cada guardado re-sellaba fecha_pago / registrado_por de los ya pagados.
// Además `parseFloat("15.000")` guardaba $15. Lógica pura (chequeada con
// cobranzasGuardado.check.ts).

import { montoSugeridoDe } from './montoSugerido'

export type EstadoPagoCobranza = 'pagado' | 'pendiente'
export type FormaPagoCobranza = 'efectivo' | 'transferencia' | 'otro'

// Lo que el manager ve y edita.
export interface EstadoCobranza {
  jugadorId:   string
  nombre:      string
  estado:      EstadoPagoCobranza
  monto:       string
  formaDePago: FormaPagoCobranza | null
}

// Lo que había en la base al abrir el evento.
export interface OriginalCobranza {
  estado:        EstadoPagoCobranza
  monto:         string
  formaDePago:   FormaPagoCobranza | null
  fechaPago:     string | null
  registradoPor: string | null
}

export interface FilaCobranza {
  evento_financiero_id: string
  jugador_id:           string
  estado:               EstadoPagoCobranza
  monto:                number | null
  forma_de_pago:        FormaPagoCobranza | null
  fecha_pago:           string | null
  registrado_por:       string
}

// Formato local: "15.000" = 15000, "1.500,50" = 1500.5. Cero o texto → null.
export function parseMontoCobranza(texto: string): number | null {
  return montoSugeridoDe(texto)
}

function cambio(j: EstadoCobranza, o: OriginalCobranza): boolean {
  if (j.estado !== o.estado) return true
  if (j.estado === 'pendiente') return false
  return parseMontoCobranza(j.monto) !== parseMontoCobranza(o.monto) || j.formaDePago !== o.formaDePago
}

export function filasAGuardar(
  jugadores: EstadoCobranza[],
  originales: Map<string, OriginalCobranza>,
  ctx: { eventoId: string; userId: string; hoy: string; soloJugadorId?: string },
): { filas: FilaCobranza[]; errores: string[] } {
  const filas: FilaCobranza[] = []
  const errores: string[] = []

  for (const j of jugadores) {
    if (ctx.soloJugadorId && j.jugadorId !== ctx.soloJugadorId) continue
    const o = originales.get(j.jugadorId)
      ?? { estado: 'pendiente', monto: '', formaDePago: null, fechaPago: null, registradoPor: null }
    if (!cambio(j, o)) continue

    if (j.estado === 'pendiente') {
      filas.push({
        evento_financiero_id: ctx.eventoId, jugador_id: j.jugadorId, estado: 'pendiente',
        monto: null, forma_de_pago: null, fecha_pago: null, registrado_por: ctx.userId,
      })
      continue
    }

    const monto = parseMontoCobranza(j.monto)
    if (monto === null) { errores.push(`Falta el monto de ${j.nombre}`); continue }

    // Un pago que ya estaba registrado conserva cuándo y quién lo cargó.
    const yaPagado = o.estado === 'pagado'
    filas.push({
      evento_financiero_id: ctx.eventoId,
      jugador_id:           j.jugadorId,
      estado:               'pagado',
      monto,
      forma_de_pago:        j.formaDePago,
      fecha_pago:           yaPagado && o.fechaPago ? o.fechaPago : ctx.hoy,
      registrado_por:       yaPagado && o.registradoPor ? o.registradoPor : ctx.userId,
    })
  }

  return { filas, errores }
}
