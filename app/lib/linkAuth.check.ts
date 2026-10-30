// Verificación autocontenida de linkAuth.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/linkAuth.check.ts

import assert from 'node:assert/strict'
import { AVISO_LINK_SIN_RED, AVISO_LINK_VENCIDO, avisoFallaLink, parsearLinkAuth, textoAvisoLink } from './linkAuth'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('link vencido con el error en el fragmento (lo que manda GoTrue)', () => {
  const url = 'uncasrugby://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  assert.deepEqual(parsearLinkAuth(url), { tipo: 'error', codigoError: 'otp_expired' })
})

caso('error en la query', () => {
  assert.deepEqual(
    parsearLinkAuth('uncasrugby://reset-password?error=access_denied&error_code=otp_expired'),
    { tipo: 'error', codigoError: 'otp_expired' },
  )
})

caso('error en la query y en el fragmento: gana el fragmento; sólo `error` sin código también es error', () => {
  assert.deepEqual(
    parsearLinkAuth('uncasrugby://reset-password?error=server_error#error=access_denied&error_code=otp_expired'),
    { tipo: 'error', codigoError: 'otp_expired' },
  )
  assert.deepEqual(parsearLinkAuth('uncasrugby://reset-password#error=access_denied'), { tipo: 'error', codigoError: 'access_denied' })
})

caso('un error gana aunque vengan tokens', () => {
  const url = 'uncasrugby://reset-password#access_token=a&refresh_token=r&type=recovery&error_code=otp_expired'
  assert.equal(parsearLinkAuth(url).tipo, 'error')
})

caso('sin parámetros de auth → nada', () => {
  assert.deepEqual(parsearLinkAuth('uncasrugby://reset-password'), { tipo: 'nada' })
  assert.deepEqual(parsearLinkAuth('uncasrugby://noticias?id=3'), { tipo: 'nada' })
  assert.deepEqual(parsearLinkAuth('uncasrugby://algo#'), { tipo: 'nada' })
})

caso('tokens de recovery en el fragmento (flujo implícito)', () => {
  assert.deepEqual(
    parsearLinkAuth('uncasrugby://reset-password#access_token=a.b.c&refresh_token=r1&expires_in=3600&type=recovery'),
    { tipo: 'tokens', accessToken: 'a.b.c', refreshToken: 'r1', flujo: 'recovery' },
  )
})

caso('tokens de invitación o alta → usuario nuevo; sin type → sin flujo', () => {
  for (const t of ['invite', 'signup', 'magiclink']) {
    assert.deepEqual(
      parsearLinkAuth(`uncasrugby://registro#access_token=a&refresh_token=r&type=${t}`),
      { tipo: 'tokens', accessToken: 'a', refreshToken: 'r', flujo: 'nuevo' },
    )
  }
  assert.deepEqual(
    parsearLinkAuth('uncasrugby://x#access_token=a&refresh_token=r'),
    { tipo: 'tokens', accessToken: 'a', refreshToken: 'r', flujo: null },
  )
})

caso('un solo token no alcanza', () => {
  assert.deepEqual(parsearLinkAuth('uncasrugby://x#access_token=a&type=recovery'), { tipo: 'nada' })
})

caso('code (PKCE) en la query, decodificado, con su flujo', () => {
  assert.deepEqual(
    parsearLinkAuth('uncasrugby://reset-password?code=ab%2Dcd&type=recovery'),
    { tipo: 'codigo', code: 'ab-cd', flujo: 'recovery' },
  )
  assert.deepEqual(
    parsearLinkAuth('uncasrugby://registro?code=xyz&type=invite'),
    { tipo: 'codigo', code: 'xyz', flujo: 'nuevo' },
  )
  assert.deepEqual(parsearLinkAuth('uncasrugby://x?code=xyz'), { tipo: 'codigo', code: 'xyz', flujo: null })
})

caso('aviso: sin red no es "venció" (códigos fijos, no texto)', () => {
  assert.equal(AVISO_LINK_VENCIDO, 'El link venció o ya se usó. Pedí uno nuevo.')
  assert.equal(avisoFallaLink(false), 'vencido')
  assert.equal(avisoFallaLink(true), 'sin_red')
  assert.equal(textoAvisoLink('vencido'), AVISO_LINK_VENCIDO)
  assert.equal(textoAvisoLink('sin_red'), AVISO_LINK_SIN_RED)
  assert.match(AVISO_LINK_SIN_RED, /conexión/)
})

caso('el aviso nunca muestra texto de afuera: códigos desconocidos se ignoran (auth review)', () => {
  // Un link armado (uncasrugby://forgot-password?aviso=...) no puede poner
  // texto propio en el banner.
  assert.equal(textoAvisoLink('Tu cuenta fue bloqueada. Escribí al +54 9 11 5555-5555'), null)
  assert.equal(textoAvisoLink(''), null)
  assert.equal(textoAvisoLink(null), null)
  assert.equal(textoAvisoLink(undefined), null)
  assert.equal(textoAvisoLink(['vencido']), null)
  assert.equal(textoAvisoLink('toString'), null)
  assert.equal(textoAvisoLink('__proto__'), null)
})

console.log(`\n${casos} casos ok`)
