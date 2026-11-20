// Verificación autocontenida de resetPassword.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/resetPassword.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  AVISO_LINK_VENCIDO, MIN_PASSWORD, destinoTrasVerificar, errorAlGuardar, esFallaTransitoria,
  parsearFragmentoRecupero, validarNuevaPassword,
} from './resetPassword'

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

caso('falla de red de supabase-js es transitoria (el link sigue sirviendo)', () => {
  assert.equal(esFallaTransitoria({ name: 'AuthRetryableFetchError', status: 0 }), true)
})

caso('error 5xx del servidor es transitorio', () => {
  assert.equal(esFallaTransitoria({ name: 'AuthApiError', status: 503 }), true)
})

caso('fetch que tira TypeError (sin conexión) es transitorio', () => {
  assert.equal(esFallaTransitoria(new TypeError('Failed to fetch')), true)
})

caso('token inválido o vencido (4xx) no es transitorio', () => {
  assert.equal(esFallaTransitoria({ name: 'AuthApiError', status: 403, code: 'bad_jwt' }), false)
  assert.equal(esFallaTransitoria({ name: 'AuthSessionMissingError', status: 400 }), false)
})

caso('rate limit (429) es transitorio: el link sigue sirviendo', () => {
  assert.equal(esFallaTransitoria({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' }), true)
})

caso('tras verificar: sesión abierta lleva al formulario', () => {
  assert.equal(destinoTrasVerificar({ session: true, error: null }), 'formulario')
})

caso('tras verificar: falla de red ofrece reintentar', () => {
  assert.equal(destinoTrasVerificar({ session: false, error: new TypeError('Failed to fetch') }), 'falla')
  assert.equal(destinoTrasVerificar({ session: false, error: { name: 'AuthApiError', status: 429 } }), 'falla')
})

caso('tras verificar: token rechazado o sin sesión es link inválido', () => {
  assert.equal(destinoTrasVerificar({ session: false, error: { name: 'AuthApiError', status: 403 } }), 'invalido')
  assert.equal(destinoTrasVerificar({ session: false, error: null }), 'invalido')
})

caso('al guardar: misma contraseña se muestra en el formulario', () => {
  assert.deepEqual(errorAlGuardar({ code: 'same_password', status: 422 }), {
    tipo: 'formulario', mensaje: 'La contraseña nueva tiene que ser distinta de la anterior.',
  })
})

caso('al guardar: contraseña débil se muestra en el formulario', () => {
  assert.deepEqual(errorAlGuardar({ code: 'weak_password', status: 422 }), {
    tipo: 'formulario', mensaje: 'Esa contraseña es muy débil. Probá con otra.',
  })
})

caso('al guardar: sin sesión o sesión vencida manda a link vencido', () => {
  const vencido = { tipo: 'vencido', mensaje: AVISO_LINK_VENCIDO }
  assert.deepEqual(errorAlGuardar({ name: 'AuthSessionMissingError', status: 400 }), vencido)
  assert.deepEqual(errorAlGuardar({ code: 'session_not_found', status: 403 }), vencido)
  assert.deepEqual(errorAlGuardar({ code: 'session_expired', status: 403 }), vencido)
})

caso('al guardar: cualquier otro error deja reintentar desde el formulario', () => {
  const generico = { tipo: 'formulario', mensaje: 'No se pudo actualizar la contraseña. Intentá de nuevo.' }
  assert.deepEqual(errorAlGuardar({ name: 'AuthRetryableFetchError', status: 0 }), generico)
  assert.deepEqual(errorAlGuardar(new TypeError('Failed to fetch')), generico)
  assert.deepEqual(errorAlGuardar(null), generico)
})

caso('valores raros no son transitorios', () => {
  assert.equal(esFallaTransitoria(null), false)
  assert.equal(esFallaTransitoria('boom'), false)
})

console.log(`\n${casos} casos ok`)
