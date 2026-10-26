// Verificación autocontenida de errorFunction.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/errorFunction.check.ts

import assert from 'node:assert/strict'
import { mensajeErrorAuth, mensajeErrorFunction, mensajeLogin, statusErrorFunction } from './errorFunction'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void> | void) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Formas de los errores de @supabase/functions-js (por name + context).
function httpError(status: number, body: unknown) {
  return { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(body), { status }) }
}
const fetchError = { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Network request failed') }

async function main() {
  await caso('el mensaje del body de un non-2xx llega a la pantalla (antes "non-2xx status code")', async () => {
    assert.equal(await mensajeErrorFunction(httpError(409, { error: 'Ya existe un usuario con ese email' })), 'Ya existe un usuario con ese email')
  })

  await caso('sin red → "No hay conexión"', async () => {
    assert.match(await mensajeErrorFunction(fetchError), /No hay conexión/)
  })

  await caso('body sin JSON o sin error → mensaje genérico en castellano, nunca el inglés crudo', async () => {
    const roto = { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response('<html>', { status: 502 }) }
    const m = await mensajeErrorFunction(roto, 'No se pudo guardar.')
    assert.equal(m, 'No se pudo guardar.')
  })

  await caso('un 200 con { error } también se muestra', async () => {
    assert.equal(await mensajeErrorFunction(null, 'x', { error: 'El socio ya tiene ese rol asignado' }), 'El socio ya tiene ese rol asignado')
  })

  await caso('status del error', () => {
    assert.equal(statusErrorFunction(httpError(429, {})), 429)
    assert.equal(statusErrorFunction(fetchError), undefined)
  })

  await caso('login: cada falla dice algo distinto', () => {
    assert.match(mensajeLogin({ status: 401 }), /DNI o mail, o la contraseña, no son correctos/)
    assert.match(mensajeLogin({ status: 429 }), /Demasiados intentos/)
    assert.match(mensajeLogin({ status: 500 }), /servidor/)
    assert.match(mensajeLogin({ sinRed: true }), /No hay conexión/)
    assert.match(mensajeLogin({ status: 400 }), /Completá/)
  })

  await caso('errores de GoTrue en castellano (antes el inglés crudo en registro)', () => {
    assert.match(mensajeErrorAuth({ message: 'New password should be different from the old password.' }), /distinta/)
    assert.match(mensajeErrorAuth({ message: 'Password should be at least 8 characters.', code: 'weak_password' }), /débil|caracteres/)
    assert.match(mensajeErrorAuth({ message: 'TypeError: Network request failed' }), /No hay conexión/)
    assert.equal(mensajeErrorAuth({ message: 'Something odd' }, 'No se pudo guardar la contraseña.'), 'No se pudo guardar la contraseña.')
  })

  console.log(`\n${casos} casos ok`)
}

main().catch((e) => { console.error(e); process.exit(1) })
