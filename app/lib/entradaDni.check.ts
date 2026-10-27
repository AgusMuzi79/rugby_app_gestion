// Verificación autocontenida de entradaDni.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/entradaDni.check.ts

import assert from 'node:assert/strict'
import { accionDni, normalizarDni, volverAlFormularioDni } from './entradaDni'

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

caso('8 dígitos → se envía solo (el teclado numérico de iOS no tiene Enter)', () => {
  assert.equal(accionDni('12345678'), 'enviar')
})

caso('7 dígitos → espera una pausa: puede ser un DNI de 8 a medio tipear', () => {
  assert.equal(accionDni('1234567'), 'esperar')
})

caso('menos de 7 o 9 dígitos → nada automático, queda el botón', () => {
  assert.equal(accionDni(''), 'nada')
  assert.equal(accionDni('123456'), 'nada')
  assert.equal(accionDni('123456789'), 'nada')
})

caso('sólo un error de red vuelve al formulario con el DNI cargado', () => {
  assert.equal(volverAlFormularioDni({ valido: false, errorRed: true }), true)
  assert.equal(volverAlFormularioDni({ valido: true }), false)
  assert.equal(volverAlFormularioDni({ valido: false, motivo: 'Socio no encontrado' }), false)
})

console.log(`\n${casos} casos ok`)
