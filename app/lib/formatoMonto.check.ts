// Verificación autocontenida de formatoMonto.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/formatoMonto.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { formatMonto } from './formatoMonto'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('formato argentino con punto de miles, sin "k" (antes "$12.5k")', () => {
  assert.equal(formatMonto(12500), '$ 12.500')
  assert.equal(formatMonto(1250), '$ 1.250')      // antes "$1.3k"
  assert.equal(formatMonto(1500000), '$ 1.500.000')
  assert.equal(formatMonto(999), '$ 999')
})

caso('decimales con coma, siempre dos si hay centavos', () => {
  assert.equal(formatMonto(1500.5), '$ 1.500,50')
  assert.equal(formatMonto(0.25), '$ 0,25')
  assert.equal(formatMonto(1234.567), '$ 1.234,57')   // redondea a centavos
})

caso('cero', () => {
  assert.equal(formatMonto(0), '$ 0')
  assert.equal(formatMonto(-0), '$ 0')
})

caso('negativos con signo menos adelante (neto)', () => {
  assert.equal(formatMonto(-200), '− $ 200')
  assert.equal(formatMonto(-12500.5), '− $ 12.500,50')
})

caso('un número inválido no rompe la pantalla', () => {
  assert.equal(formatMonto(Number.NaN), '$ 0')
})

console.log(`\n${casos} casos ok`)
