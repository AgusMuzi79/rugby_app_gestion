// Verificación autocontenida de fecha.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/fecha.check.ts
// Corre con TZ=America/Argentina/Buenos_Aires para reproducir el bug real.

import assert from 'node:assert/strict'
import { fechaLocal, fechaLocalMasDias } from './fecha'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

process.env.TZ = 'America/Argentina/Buenos_Aires'

// 26/10 a las 22:30 en Argentina = 27/10 01:30 UTC.
const nocheArgentina = new Date('2026-10-27T01:30:00Z')

caso('a las 22:30 en Argentina "hoy" sigue siendo el 26 (toISOString daba el 27)', () => {
  assert.equal(nocheArgentina.toISOString().split('T')[0], '2026-10-27') // el bug
  assert.equal(fechaLocal(nocheArgentina), '2026-10-26')
})

caso('sumar y restar días en fecha local', () => {
  assert.equal(fechaLocalMasDias(7, nocheArgentina), '2026-11-02')
  assert.equal(fechaLocalMasDias(-30, nocheArgentina), '2026-09-26')
  assert.equal(fechaLocalMasDias(0, nocheArgentina), '2026-10-26')
})

caso('cruce de mes y de año con ceros a la izquierda', () => {
  assert.equal(fechaLocal(new Date(2026, 0, 5, 12)), '2026-01-05')
  assert.equal(fechaLocalMasDias(1, new Date(2026, 11, 31, 23)), '2027-01-01')
})

console.log(`\n${casos} casos ok`)
