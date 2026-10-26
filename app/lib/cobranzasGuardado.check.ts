// Verificación autocontenida de cobranzasGuardado.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/cobranzasGuardado.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { filasAGuardar, parseMontoCobranza, type EstadoCobranza, type OriginalCobranza } from './cobranzasGuardado'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const CTX = { eventoId: 'ev-1', userId: 'manager-2', hoy: '2026-10-26' }

function j(parcial: Partial<EstadoCobranza> & { jugadorId: string }): EstadoCobranza {
  return { nombre: 'Juan Pérez', estado: 'pendiente', monto: '', formaDePago: null, ...parcial }
}
function o(parcial: Partial<OriginalCobranza>): OriginalCobranza {
  return { estado: 'pendiente', monto: '', formaDePago: null, fechaPago: null, registradoPor: null, ...parcial }
}

caso('"15.000" se guarda como 15000 (antes parseFloat daba 15)', () => {
  assert.equal(parseMontoCobranza('15.000'), 15000)
  assert.equal(parseMontoCobranza('1.500,50'), 1500.5)
  assert.equal(parseMontoCobranza('2500'), 2500)
  assert.equal(parseMontoCobranza(''), null)
  assert.equal(parseMontoCobranza('abc'), null)
})

caso('sólo se guardan las filas que cambiaron', () => {
  const originales = new Map([
    ['a', o({ estado: 'pagado', monto: '15000', formaDePago: 'efectivo', fechaPago: '2026-10-01', registradoPor: 'subco-1' })],
    ['b', o({})],
  ])
  const jugadores = [
    j({ jugadorId: 'a', estado: 'pagado', monto: '15000', formaDePago: 'efectivo' }), // sin cambios
    j({ jugadorId: 'b', estado: 'pagado', monto: '15.000', formaDePago: 'transferencia' }),
  ]
  const r = filasAGuardar(jugadores, originales, CTX)
  assert.deepEqual(r.errores, [])
  assert.equal(r.filas.length, 1)
  assert.deepEqual(r.filas[0], {
    evento_financiero_id: 'ev-1', jugador_id: 'b', estado: 'pagado', monto: 15000,
    forma_de_pago: 'transferencia', fecha_pago: '2026-10-26', registrado_por: 'manager-2',
  })
})

caso('editar el monto de un pago viejo conserva su fecha y quién lo registró', () => {
  const originales = new Map([
    ['a', o({ estado: 'pagado', monto: '15000', formaDePago: 'efectivo', fechaPago: '2026-10-01', registradoPor: 'subco-1' })],
  ])
  const r = filasAGuardar([j({ jugadorId: 'a', estado: 'pagado', monto: '16.000', formaDePago: 'efectivo' })], originales, CTX)
  assert.equal(r.filas[0].fecha_pago, '2026-10-01')
  assert.equal(r.filas[0].registrado_por, 'subco-1')
  assert.equal(r.filas[0].monto, 16000)
})

caso('pagado sin monto (o monto inválido) no se guarda y nombra al jugador', () => {
  const originales = new Map([['a', o({})], ['b', o({})]])
  const r = filasAGuardar([
    j({ jugadorId: 'a', nombre: 'Ana Gómez', estado: 'pagado', monto: '' }),
    j({ jugadorId: 'b', nombre: 'Bruno Díaz', estado: 'pagado', monto: 'cero' }),
  ], originales, CTX)
  assert.deepEqual(r.errores, ['Falta el monto de Ana Gómez', 'Falta el monto de Bruno Díaz'])
  assert.equal(r.filas.length, 0)
})

caso('pasar a pendiente limpia monto, forma y fecha', () => {
  const originales = new Map([
    ['a', o({ estado: 'pagado', monto: '15000', formaDePago: 'efectivo', fechaPago: '2026-10-01', registradoPor: 'subco-1' })],
  ])
  const r = filasAGuardar([j({ jugadorId: 'a', estado: 'pendiente', monto: '15000', formaDePago: 'efectivo' })], originales, CTX)
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].estado, 'pendiente')
  assert.equal(r.filas[0].monto, null)
  assert.equal(r.filas[0].forma_de_pago, null)
  assert.equal(r.filas[0].fecha_pago, null)
})

caso('un pendiente que sólo cambió el monto escrito no se guarda (no hay pago)', () => {
  const originales = new Map([['a', o({ monto: '15000' })]])
  const r = filasAGuardar([j({ jugadorId: 'a', estado: 'pendiente', monto: '14000' })], originales, CTX)
  assert.equal(r.filas.length, 0)
})

caso('"15.000" y "15000" son el mismo monto (no ensucia la fila)', () => {
  const originales = new Map([
    ['a', o({ estado: 'pagado', monto: '15000', formaDePago: null, fechaPago: '2026-10-01', registradoPor: 'x' })],
  ])
  const r = filasAGuardar([j({ jugadorId: 'a', estado: 'pagado', monto: '15.000' })], originales, CTX)
  assert.equal(r.filas.length, 0)
})

caso('se puede guardar un solo jugador (modal)', () => {
  const originales = new Map([['a', o({})], ['b', o({})]])
  const r = filasAGuardar([
    j({ jugadorId: 'a', estado: 'pagado', monto: '100' }),
    j({ jugadorId: 'b', estado: 'pagado', monto: '' }),
  ], originales, { ...CTX, soloJugadorId: 'a' })
  assert.deepEqual(r.errores, [])
  assert.deepEqual(r.filas.map(f => f.jugador_id), ['a'])
})

console.log(`\n${casos} casos ok`)
