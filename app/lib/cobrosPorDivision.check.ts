// Verificación autocontenida de cobrosPorDivision.ts (no hay runner de tests en app/).
//   npx tsx app/lib/cobrosPorDivision.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { cobrosPorDivision, type JugadorCobro } from './cobrosPorDivision'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const JUGADORES: JugadorCobro[] = [
  { id: 'j3', nombre: 'Zoe',   divisionId: 'd2', divisionNombre: 'M16' },
  { id: 'j1', nombre: 'Ana',   divisionId: 'd1', divisionNombre: 'M15' },
  { id: 'j2', nombre: 'Bruno', divisionId: 'd1', divisionNombre: 'M15' },
  { id: 'j4', nombre: 'Leo',   divisionId: 'd3', divisionNombre: 'M9' },
]

caso('sin jugadores: sin grupos y totales en 0', () => {
  const r = cobrosPorDivision([], [], null)
  assert.deepEqual(r.divisiones, [])
  assert.deepEqual(r.total, { pagados: 0, pendientes: 0, cobrado: 0 })
})

caso('agrupa por división ordenando con criterio numérico (M9 antes que M15)', () => {
  const r = cobrosPorDivision(JUGADORES, [], null)
  assert.deepEqual(r.divisiones.map(d => d.divisionNombre), ['M9', 'M15', 'M16'])
})

caso('jugadores ordenados por nombre dentro de la división', () => {
  const r = cobrosPorDivision(JUGADORES, [], null)
  assert.deepEqual(r.divisiones[1].jugadores.map(j => j.nombre), ['Ana', 'Bruno'])
})

caso('sin cobranza registrada = pendiente con monto sugerido precargado', () => {
  const r = cobrosPorDivision(JUGADORES, [], '2.500')
  const ana = r.divisiones[1].jugadores[0]
  assert.equal(ana.estado, 'pendiente')
  assert.equal(ana.monto, '2500')
  assert.equal(ana.montoPagado, 0)
  assert.equal(ana.formaDePago, null)
})

caso('cobranza pagada: monto registrado, forma de pago y totales por división', () => {
  const r = cobrosPorDivision(
    JUGADORES,
    [
      { jugador_id: 'j1', estado: 'pagado',    monto: 2000,     forma_de_pago: 'efectivo' },
      { jugador_id: 'j2', estado: 'pendiente', monto: null,     forma_de_pago: null },
      { jugador_id: 'j3', estado: 'pagado',    monto: '1500.5', forma_de_pago: 'transferencia' },
    ],
    '2500',
  )
  const m15 = r.divisiones.find(d => d.divisionId === 'd1')!
  assert.deepEqual({ p: m15.pagados, pn: m15.pendientes, c: m15.cobrado }, { p: 1, pn: 1, c: 2000 })
  assert.equal(m15.jugadores[0].monto, '2000')
  assert.equal(m15.jugadores[0].formaDePago, 'efectivo')
  assert.equal(m15.jugadores[1].monto, '2500')
  assert.deepEqual(r.total, { pagados: 2, pendientes: 2, cobrado: 3500.5 })
})

caso('cobranzas de jugadores fuera de la lista se ignoran', () => {
  const r = cobrosPorDivision(JUGADORES, [{ jugador_id: 'otro', estado: 'pagado', monto: 999, forma_de_pago: null }], null)
  assert.equal(r.total.cobrado, 0)
})

caso('jugador sin división queda en "Sin división" al final', () => {
  const r = cobrosPorDivision(
    [...JUGADORES, { id: 'j5', nombre: 'Sin', divisionId: null, divisionNombre: null }],
    [],
    null,
  )
  assert.equal(r.divisiones[r.divisiones.length - 1].divisionNombre, 'Sin división')
})

console.log(`\n${casos} casos OK`)
