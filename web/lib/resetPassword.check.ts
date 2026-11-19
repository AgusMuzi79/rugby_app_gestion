// Verificación autocontenida de resetPassword.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/resetPassword.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { AVISO_LINK_VENCIDO, MIN_PASSWORD, parsearFragmentoRecupero, validarNuevaPassword } from './resetPassword'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('fragmento de recovery válido devuelve los tokens', () => {
  const r = parsearFragmentoRecupero('#access_token=at1&refresh_token=rt1&type=recovery&expires_in=3600')
  assert.deepEqual(r, { tipo: 'tokens', accessToken: 'at1', refreshToken: 'rt1' })
})

caso('el # inicial es opcional', () => {
  const r = parsearFragmentoRecupero('access_token=at1&refresh_token=rt1&type=recovery')
  assert.deepEqual(r, { tipo: 'tokens', accessToken: 'at1', refreshToken: 'rt1' })
})

caso('si hay parámetros de error, gana el error aunque vengan tokens', () => {
  const r = parsearFragmentoRecupero('#access_token=at1&refresh_token=rt1&type=recovery&error=access_denied')
  assert.deepEqual(r, { tipo: 'error', mensaje: AVISO_LINK_VENCIDO })
})

caso('otp_expired (link vencido o ya usado) es error', () => {
  const r = parsearFragmentoRecupero(
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  )
  assert.deepEqual(r, { tipo: 'error', mensaje: AVISO_LINK_VENCIDO })
})

caso('sólo error_description también cuenta como error', () => {
  assert.equal(parsearFragmentoRecupero('#error_description=algo').tipo, 'error')
})

caso('el aviso pide un link nuevo desde la app', () => {
  assert.equal(AVISO_LINK_VENCIDO, 'El link venció o ya se usó. Pedí uno nuevo desde la app.')
})

caso('sin refresh token es inválido', () => {
  assert.deepEqual(parsearFragmentoRecupero('#access_token=at1&type=recovery'), { tipo: 'invalido' })
})

caso('sin access token es inválido', () => {
  assert.deepEqual(parsearFragmentoRecupero('#refresh_token=rt1&type=recovery'), { tipo: 'invalido' })
})

caso('type distinto de recovery es inválido (no muestra el formulario)', () => {
  assert.deepEqual(parsearFragmentoRecupero('#access_token=at1&refresh_token=rt1&type=signup'), { tipo: 'invalido' })
  assert.deepEqual(parsearFragmentoRecupero('#access_token=at1&refresh_token=rt1'), { tipo: 'invalido' })
})

caso('hash vacío es inválido', () => {
  assert.deepEqual(parsearFragmentoRecupero(''), { tipo: 'invalido' })
  assert.deepEqual(parsearFragmentoRecupero('#'), { tipo: 'invalido' })
})

caso('el mínimo es 8 caracteres, como en la app', () => {
  assert.equal(MIN_PASSWORD, 8)
})

caso('contraseña vacía', () => {
  assert.deepEqual(validarNuevaPassword('', ''), {
    password: 'Ingresá una contraseña.',
    confirmacion: 'Repetí la contraseña.',
  })
})

caso('contraseña corta (7 caracteres) falla', () => {
  assert.deepEqual(validarNuevaPassword('1234567', '1234567'), { password: 'Tiene que tener al menos 8 caracteres.' })
})

caso('exactamente 8 caracteres y confirmación igual pasa', () => {
  assert.deepEqual(validarNuevaPassword('12345678', '12345678'), {})
})

caso('falta la confirmación', () => {
  assert.deepEqual(validarNuevaPassword('12345678', ''), { confirmacion: 'Repetí la contraseña.' })
})

caso('las contraseñas no coinciden', () => {
  assert.deepEqual(validarNuevaPassword('12345678', '12345679'), { confirmacion: 'Las contraseñas no coinciden.' })
})

console.log(`\n${casos} casos ok`)
