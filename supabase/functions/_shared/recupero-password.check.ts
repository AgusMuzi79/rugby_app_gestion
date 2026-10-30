// Verificación autocontenida de recupero-password.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/recupero-password.check.ts

import assert from 'node:assert/strict'
import {
  RESPUESTA_RECUPERO,
  REDIRECT_RECUPERO,
  emailParaRecupero,
  esMailSintetico,
  respuestaErrorRecupero,
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

caso('la respuesta es siempre la misma: no dice si el DNI existe ni si el mail es sintético', () => {
  assert.deepEqual(RESPUESTA_RECUPERO, { ok: true })
})

caso('el link vuelve a la app como hoy', () => {
  assert.equal(REDIRECT_RECUPERO, 'uncasrugby://reset-password')
})

caso('GoTrue limitando (pedidos o mails) → 429; cualquier otra falla → 500; sin error → null', () => {
  assert.deepEqual(respuestaErrorRecupero({ status: 429, code: 'over_email_send_rate_limit' }), { status: 429, mensaje: 'Demasiados intentos' })
  assert.deepEqual(respuestaErrorRecupero({ code: 'over_request_rate_limit' }), { status: 429, mensaje: 'Demasiados intentos' })
  assert.deepEqual(respuestaErrorRecupero({ status: 500, message: 'Error sending recovery email' }), { status: 500, mensaje: 'No se pudo enviar el mail' })
  assert.equal(respuestaErrorRecupero(null), null)
})

console.log(`\n${casos} casos ok`)
