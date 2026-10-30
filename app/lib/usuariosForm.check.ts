// Verificación autocontenida de usuariosForm.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/usuariosForm.check.ts

import assert from 'node:assert/strict'
import { divisionesCambiaron } from './usuariosForm'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('divisiones sin tocar no cuentan como cambio (null y [] son lo mismo)', () => {
  assert.equal(divisionesCambiaron(null, []), false)
  assert.equal(divisionesCambiaron([], []), false)
  assert.equal(divisionesCambiaron(['a', 'b'], ['a', 'b']), false)
})

caso('el orden no importa: destildar y volver a tildar no es un cambio', () => {
  assert.equal(divisionesCambiaron(['a', 'b'], ['b', 'a']), false)
})

caso('agregar o quitar una división es un cambio sin guardar', () => {
  assert.equal(divisionesCambiaron(null, ['a']), true)
  assert.equal(divisionesCambiaron(['a', 'b'], ['a']), true)
  assert.equal(divisionesCambiaron(['a'], ['b']), true)
})

console.log(`\n${casos} casos ok`)
