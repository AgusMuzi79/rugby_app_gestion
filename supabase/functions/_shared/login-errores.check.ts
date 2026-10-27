// Verificación autocontenida de login-errores.ts + el camino de baja de punta a punta
// (X10): baja en el padrón → cuenta baneada → login rechazado con mensaje claro →
// escaneo rechazado.
//   npx --yes tsx supabase/functions/_shared/login-errores.check.ts

import assert from 'node:assert/strict'
import { MENSAJE_CUENTA_BAJA, respuestaErrorLogin } from './login-errores.ts'
import { motivoRechazoPorEstado } from './estado-acceso.ts'
import { esBajaMasiva } from './bajas-import.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('cuenta baneada → 403 "dada de baja" (antes: "Credenciales incorrectas")', () => {
  assert.deepEqual(respuestaErrorLogin({ code: 'user_banned', status: 400, message: 'User is banned' }),
    { status: 403, mensaje: MENSAJE_CUENTA_BAJA })
  assert.deepEqual(respuestaErrorLogin({ status: 400, message: 'User is banned' }),
    { status: 403, mensaje: MENSAJE_CUENTA_BAJA })
  assert.equal(MENSAJE_CUENTA_BAJA, 'Tu cuenta está dada de baja. Consultá en Secretaría.')
})

caso('límite de GoTrue → 429', () => {
  assert.equal(respuestaErrorLogin({ status: 429, message: 'Request rate limit reached' })?.status, 429)
})

caso('contraseña mala → null (sigue con la variante siguiente o 401 genérico)', () => {
  assert.equal(respuestaErrorLogin({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }), null)
  assert.equal(respuestaErrorLogin(null), null)
})

caso('escenario: socio sacado del padrón → no entra a la app ni pasa la puerta', () => {
  // 1. importar-socios: el socio no está en el archivo → baja (estado inactivo + ban),
  //    una sola baja no dispara la guarda de baja masiva.
  assert.equal(esBajaMasiva(1, 1500), false)
  const estadoTrasImport = 'inactivo'
  // 2. login: GoTrue rechaza la cuenta baneada → login-dni lo dice claro.
  assert.equal(respuestaErrorLogin({ code: 'user_banned', status: 400 })?.mensaje, MENSAJE_CUENTA_BAJA)
  // 3. socios-qr: el estado inactivo no pasa en ningún lector.
  assert.equal(motivoRechazoPorEstado(estadoTrasImport), 'Socio dado de baja. Consultá en Secretaría.')
})

console.log(`\n${casos} casos ok`)
