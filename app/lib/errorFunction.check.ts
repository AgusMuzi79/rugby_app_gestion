// Verificación autocontenida de errorFunction.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/errorFunction.check.ts

import assert from 'node:assert/strict'
import { fallaRecupero, mensajeErrorAuth, mensajeErrorFunction, mensajeLogin, mensajeRecupero, statusErrorFunction } from './errorFunction'

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
    assert.equal(mensajeLogin({ status: 403 }), 'Tu cuenta está dada de baja. Consultá en Secretaría.')
    assert.match(mensajeLogin({ status: 500 }), /servidor/)
    assert.match(mensajeLogin({ sinRed: true }), /No hay conexión/)
    assert.match(mensajeLogin({ status: 400 }), /Completá/)
  })

  await caso('recupero de contraseña: cada falla dice algo distinto, sin revelar si la cuenta existe', () => {
    assert.match(mensajeRecupero({ motivo: 'vacio' }), /DNI o tu mail/)
    assert.equal(mensajeRecupero({ motivo: 'mail_invalido' }), 'Revisá el mail.')
    assert.match(mensajeRecupero({ motivo: 'servidor', status: 400 }), /DNI o tu mail/)
    assert.equal(mensajeRecupero({ motivo: 'servidor', status: 400, error: 'Revisá el mail.' }), 'Revisá el mail.')
    assert.match(mensajeRecupero({ motivo: 'servidor', status: 429 }), /Demasiados intentos/)
    assert.match(mensajeRecupero({ motivo: 'sin_red' }), /No hay conexión/)
    assert.match(mensajeRecupero({ motivo: 'servidor', status: 500 }), /No se pudo enviar/)
    assert.match(mensajeRecupero({ motivo: 'servidor' }), /No se pudo enviar/)
    assert.match(mensajeRecupero({ motivo: 'respuesta_invalida' }), /No se pudo enviar/)
    // Un texto cualquiera del servidor no se muestra tal cual.
    assert.match(mensajeRecupero({ motivo: 'servidor', status: 400, error: 'otra cosa' }), /DNI o tu mail/)
  })

  await caso('recupero: si tarda no es "sin conexión" (el pedido puede haber salido) (auth review)', () => {
    assert.equal(
      mensajeRecupero({ motivo: 'tardo' }),
      'Está tardando más de lo normal. Si te llega el mail, usá el link más nuevo; si no, probá en unos minutos.',
    )
    assert.doesNotMatch(mensajeRecupero({ motivo: 'tardo' }), /conexión/)
  })

  await caso('recupero: la falla sale del resultado del invoke, con motivos explícitos', () => {
    const fetchError = { name: 'FunctionsFetchError', message: 'Failed to send a request' }
    assert.deepEqual(fallaRecupero({ tardo: true, error: fetchError, data: null }), { motivo: 'tardo' })
    assert.deepEqual(fallaRecupero({ tardo: false, error: fetchError, data: null }), { motivo: 'sin_red' })
    assert.deepEqual(
      fallaRecupero({ tardo: false, error: httpError(400, { error: 'Revisá el mail.' }), data: null, cuerpo: { error: 'Revisá el mail.' } }),
      { motivo: 'servidor', status: 400, error: 'Revisá el mail.' },
    )
    assert.deepEqual(
      fallaRecupero({ tardo: false, error: httpError(500, {}), data: null, cuerpo: null }),
      { motivo: 'servidor', status: 500, error: undefined },
    )
    assert.deepEqual(fallaRecupero({ tardo: false, error: null, data: { algo: 1 } }), { motivo: 'respuesta_invalida' })
    assert.deepEqual(fallaRecupero({ tardo: false, error: null, data: null }), { motivo: 'respuesta_invalida' })
    assert.equal(fallaRecupero({ tardo: false, error: null, data: { ok: true } }), null)
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
