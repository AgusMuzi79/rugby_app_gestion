// Verificación autocontenida de login-identificador.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/login-identificador.check.ts

import assert from 'node:assert/strict'
import { normalizarDni, normalizarIdentificador, variantesPassword } from './login-identificador.ts'

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

caso('contraseña tipeada como DNI con puntos: se prueba también sin puntos', () => {
  assert.deepEqual(variantesPassword('30.123.456'), ['30.123.456', '30123456'])
  assert.deepEqual(variantesPassword('30 123 456'), ['30 123 456', '30123456'])
})

caso('una contraseña normal se prueba una sola vez', () => {
  assert.deepEqual(variantesPassword('30123456'), ['30123456'])
  assert.deepEqual(variantesPassword('Clave.2026'), ['Clave.2026'])
})

caso('normalizarDni para el alta de staff', () => {
  assert.equal(normalizarDni('30.123.456'), '30123456')
  assert.equal(normalizarDni(undefined), '')
})

console.log(`\n${casos} casos ok`)
