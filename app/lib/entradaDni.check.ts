// Verificación autocontenida de entradaDni.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/entradaDni.check.ts

import assert from 'node:assert/strict'
import * as entradaDni from './entradaDni'
import { normalizarDni, volverAlFormularioDni } from './entradaDni'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('normaliza puntos, espacios y guiones a sólo dígitos', () => {
  assert.equal(normalizarDni('12.345.678'), '12345678')
  assert.equal(normalizarDni(' 12 345-678 '), '12345678')
  assert.equal(normalizarDni('abc'), '')
})

caso('nunca pasa de 9 dígitos (lo máximo que acepta el server)', () => {
  assert.equal(normalizarDni('1234567890123'), '123456789')
})

caso('un DNI de 9 dígitos se puede tipear entero (no se corta en 8)', () => {
  assert.equal(normalizarDni('123456789'), '123456789')
})

caso('no hay envío automático por largo: un DNI a medio tipear puede ser de otro socio', () => {
  assert.equal('accionDni' in entradaDni, false)
})

caso('sólo un error de red vuelve al formulario con el DNI cargado', () => {
  assert.equal(volverAlFormularioDni({ valido: false, errorRed: true }), true)
  assert.equal(volverAlFormularioDni({ valido: true }), false)
  assert.equal(volverAlFormularioDni({ valido: false, motivo: 'Socio no encontrado' }), false)
})

console.log(`\n${casos} casos ok`)
