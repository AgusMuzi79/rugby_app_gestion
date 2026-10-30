// Verificación autocontenida de recupero-password.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/recupero-password.check.ts

import assert from 'node:assert/strict'
import {
  RESPUESTA_RECUPERO,
  REDIRECT_RECUPERO,
  emailParaRecupero,
  cierreRecupero,
  esMailSintetico,
} from './recupero-password.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('el mail sintético del padrón se reconoce (sin importar mayúsculas)', () => {
  assert.equal(esMailSintetico('socio-1234@uncas.local'), true)
  assert.equal(esMailSintetico('Socio-1234@UNCAS.LOCAL'), true)
  assert.equal(esMailSintetico('ana@gmail.com'), false)
  assert.equal(esMailSintetico('ana@uncas.local.com'), false)
})

caso('sólo se manda el link a un mail real', () => {
  assert.equal(emailParaRecupero('ana@gmail.com'), 'ana@gmail.com')
  assert.equal(emailParaRecupero('socio-1234@uncas.local'), null)
  assert.equal(emailParaRecupero(''), null)
  assert.equal(emailParaRecupero(null), null)
  assert.equal(emailParaRecupero(undefined), null)
})

caso('la respuesta es siempre la misma: no dice si el DNI existe, si el mail es sintético ni si el envío falló', () => {
  assert.deepEqual(RESPUESTA_RECUPERO, { ok: true })
  // Sólo una cuenta real con mail real llega a pedirle el mail a GoTrue: si
  // su falla (429 u otra) llegara al cliente, dos pedidos seguidos (ok y
  // después 429) delatarían que la cuenta existe.
  const fallas = [
    null,
    undefined,
    { status: 429, code: 'over_email_send_rate_limit' },
    { code: 'over_request_rate_limit' },
    { status: 500, message: 'Error sending recovery email' },
    { status: 400, code: 'validation_failed' },
  ]
  for (const error of fallas) {
    assert.deepEqual(cierreRecupero(error).respuesta, { ok: true })
  }
})

caso('el link vuelve a la app como hoy', () => {
  assert.equal(REDIRECT_RECUPERO, 'uncasrugby://reset-password')
})

caso('una falla del envío queda en el log del servidor, con el código y sin el mail', () => {
  assert.equal(cierreRecupero(null).aviso, null)
  assert.equal(cierreRecupero(undefined).aviso, null)
  const limitado = cierreRecupero({ status: 429, code: 'over_email_send_rate_limit', message: 'ana@gmail.com: rate limit' }).aviso
  assert.ok(limitado?.includes('over_email_send_rate_limit'))
  assert.ok(limitado?.includes('429'))
  assert.ok(!limitado?.includes('ana@gmail.com'), 'el mensaje de GoTrue puede traer el mail: no se loguea')
  const otra = cierreRecupero({ status: 500, message: 'Error sending recovery email to ana@gmail.com' }).aviso
  assert.ok(otra?.includes('500'))
  assert.ok(!otra?.includes('ana@gmail.com'))
})

console.log(`\n${casos} casos ok`)
