// Verificación autocontenida de montoSugerido.ts (no hay runner de tests en app/).
//   npx tsx app/lib/montoSugerido.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { montoInicialCobranza, montoSugeridoDe } from './montoSugerido'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('montoSugeridoDe: sin descripción → null', () => {
  assert.equal(montoSugeridoDe(null), null)
  assert.equal(montoSugeridoDe(''), null)
  assert.equal(montoSugeridoDe('   '), null)
})

caso('montoSugeridoDe: número entero y decimal con coma', () => {
  assert.equal(montoSugeridoDe('2500'), 2500)
  assert.equal(montoSugeridoDe('2500,50'), 2500.5)
})

caso('montoSugeridoDe: punto como separador de miles', () => {
  assert.equal(montoSugeridoDe('2.500'), 2500)
  assert.equal(montoSugeridoDe('1.250.000'), 1250000)
  assert.equal(montoSugeridoDe('2.500,50'), 2500.5)
  assert.equal(montoSugeridoDe('$ 2.500'), 2500)
})

caso('montoSugeridoDe: punto decimal sin miles se respeta', () => {
  assert.equal(montoSugeridoDe('2500.5'), 2500.5)
  assert.equal(montoSugeridoDe('12.75'), 12.75)
})

caso('montoSugeridoDe: cero, negativo o texto → null', () => {
  assert.equal(montoSugeridoDe('0'), null)
  assert.equal(montoSugeridoDe('-100'), null)
  assert.equal(montoSugeridoDe('a definir'), null)
})

caso('montoInicialCobranza: respeta el monto ya registrado', () => {
  assert.equal(montoInicialCobranza(1800, '2500'), '1800')
  assert.equal(montoInicialCobranza(0, '2500'), '0')
})

caso('montoInicialCobranza: sin monto registrado usa el sugerido del evento', () => {
  assert.equal(montoInicialCobranza(null, '2500'), '2500')
  assert.equal(montoInicialCobranza(undefined, '2500,50'), '2500.5')
})

caso('montoInicialCobranza: sin monto registrado ni sugerido → vacío', () => {
  assert.equal(montoInicialCobranza(null, null), '')
  assert.equal(montoInicialCobranza(null, 'a definir'), '')
})

console.log(`\n${casos} casos OK`)
