// Verificación autocontenida de login-identificador.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/login-identificador.check.ts

import assert from 'node:assert/strict'
import { normalizarDni, normalizarIdentificador, passwordAProbar } from './login-identificador.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('DNI con puntos o espacios se busca sin ellos (profiles.dni guarda sólo dígitos)', () => {
  assert.deepEqual(normalizarIdentificador('30.123.456'), { tipo: 'dni', dni: '30123456' })
  assert.deepEqual(normalizarIdentificador(' 30 123 456 '), { tipo: 'dni', dni: '30123456' })
  assert.deepEqual(normalizarIdentificador('30123456'), { tipo: 'dni', dni: '30123456' })
})

caso('un mail se usa como mail, en minúsculas', () => {
  assert.deepEqual(normalizarIdentificador(' Ana@Mail.com '), { tipo: 'email', email: 'ana@mail.com' })
})

caso('vacío o sin dígitos → null', () => {
  assert.equal(normalizarIdentificador('   '), null)
  assert.equal(normalizarIdentificador('abc'), null)
})

caso('el DNI de la cuenta tipeado con puntos como contraseña: se prueba sin puntos (un solo intento)', () => {
  assert.equal(passwordAProbar('30.123.456', '30123456'), '30123456')
  assert.equal(passwordAProbar('30 123 456', '30123456'), '30123456')
})

caso('cualquier otra contraseña se prueba tal cual (un solo intento a GoTrue)', () => {
  assert.equal(passwordAProbar('30123456', '30123456'), '30123456')
  assert.equal(passwordAProbar('Clave.2026', '30123456'), 'Clave.2026')
  // Un DNI ajeno con puntos no se convierte: no duplica intentos de adivinar.
  assert.equal(passwordAProbar('11.222.333', '30123456'), '11.222.333')
  // Login por mail: no se conoce el DNI de la cuenta.
  assert.equal(passwordAProbar('30.123.456', null), '30.123.456')
})

caso('normalizarDni para el alta de staff', () => {
  assert.equal(normalizarDni('30.123.456'), '30123456')
  assert.equal(normalizarDni(undefined), '')
})

console.log(`\n${casos} casos ok`)
