// Verificación autocontenida de recupero-password.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/recupero-password.check.ts

import assert from 'node:assert/strict'
import {
  RESPUESTA_RECUPERO,
  REDIRECT_RECUPERO,
  cierreRecupero,
  cuentaDeUsuarioAuth,
  emailParaRecupero,
  esMailSintetico,
  manejarRecupero,
  type DepsRecupero,
} from './recupero-password.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const OK = { status: 200, body: { ok: true } }
// El cliente decide por `codigo` (app/lib/errorFunction.ts); el texto es para mostrar.
const MAIL_INVALIDO = { status: 400, body: { error: 'Revisá el mail.', codigo: 'mail_invalido' } }

// Deps falsas: registran a quién se le mandó el mail y qué se logueó.
function deps(sobre: Partial<DepsRecupero> = {}) {
  const enviados: string[] = []
  const logs: string[] = []
  const d: DepsRecupero = {
    limite: async () => 'enviar',
    emailDeDni: async (dni) => (dni === '30123456' ? { email: 'ana@gmail.com', fallo: false } : { email: null, fallo: false }),
    enviar: async (email) => { enviados.push(email); return { error: null } },
    log: (m) => { logs.push(m) },
    ...sobre,
  }
  return { d, enviados, logs }
}

async function main() {
  await caso('el mail sintético del padrón se reconoce (sin importar mayúsculas)', () => {
    assert.equal(esMailSintetico('socio-1234@uncas.local'), true)
    assert.equal(esMailSintetico('Socio-1234@UNCAS.LOCAL'), true)
    assert.equal(esMailSintetico('ana@gmail.com'), false)
    assert.equal(esMailSintetico('ana@uncas.local.com'), false)
  })

  await caso('sólo se manda el link a un mail real', () => {
    assert.equal(emailParaRecupero('ana@gmail.com'), 'ana@gmail.com')
    assert.equal(emailParaRecupero('socio-1234@uncas.local'), null)
    assert.equal(emailParaRecupero(''), null)
    assert.equal(emailParaRecupero(null), null)
    assert.equal(emailParaRecupero(undefined), null)
  })

  await caso('la respuesta es siempre la misma: no dice si el DNI existe, si el mail es sintético ni si el envío falló', async () => {
    assert.deepEqual(RESPUESTA_RECUPERO, { ok: true })
    // Sólo una cuenta real con mail real llega a pedirle el mail a GoTrue: si
    // su falla (429 u otra) llegara al cliente, dos pedidos seguidos (ok y
    // después 429) delatarían que la cuenta existe.
    const fallas = [
      null,
      { status: 429, code: 'over_email_send_rate_limit' },
      { code: 'over_request_rate_limit' },
      { status: 500, message: 'Error sending recovery email' },
      { status: 400, code: 'validation_failed' },
    ]
    for (const error of fallas) {
      const { d } = deps({ enviar: async () => ({ error }) })
      assert.deepEqual(await manejarRecupero('30123456', d), OK)
    }
  })

  await caso('el link vuelve a la app como hoy', () => {
    assert.equal(REDIRECT_RECUPERO, 'uncasrugby://reset-password')
  })

  await caso('una falla del envío queda en el log del servidor, con el código y sin el mail', () => {
    // Sólo devuelve el aviso: la respuesta al cliente la arma manejarRecupero.
    assert.equal(cierreRecupero(null), null)
    assert.equal(cierreRecupero(undefined), null)
    const limitado = cierreRecupero({ status: 429, code: 'over_email_send_rate_limit', message: 'ana@gmail.com: rate limit' })
    assert.ok(limitado?.includes('over_email_send_rate_limit'))
    assert.ok(limitado?.includes('429'))
    assert.ok(!limitado?.includes('ana@gmail.com'), 'el mensaje de GoTrue puede traer el mail: no se loguea')
    const otra = cierreRecupero({ status: 500, message: 'Error sending recovery email to ana@gmail.com' })
    assert.ok(otra?.includes('500'))
    assert.ok(!otra?.includes('ana@gmail.com'))
  })

  // ─── Handler completo (deps inyectadas) ─────────────────────────────────────

  await caso('DNI con cuenta y mail real: manda el link y responde ok', async () => {
    const { d, enviados } = deps()
    assert.deepEqual(await manejarRecupero('30.123.456', d), OK)
    assert.deepEqual(enviados, ['ana@gmail.com'])
  })

  await caso('DNI sin cuenta o con mail sintético: misma respuesta, sin mandar nada', async () => {
    const sinCuenta = deps()
    assert.deepEqual(await manejarRecupero('99999999', sinCuenta.d), OK)
    assert.deepEqual(sinCuenta.enviados, [])
    const sintetico = deps({ emailDeDni: async () => ({ email: 'socio-1@uncas.local', fallo: false }) })
    assert.deepEqual(await manejarRecupero('30123456', sintetico.d), OK)
    assert.deepEqual(sintetico.enviados, [])
  })

  await caso('falla de la búsqueda (nuestra, antes de decidir): 500', async () => {
    const { d, enviados } = deps({ emailDeDni: async () => ({ email: null, fallo: true }) })
    assert.deepEqual(await manejarRecupero('30123456', d), { status: 500, body: { error: 'No se pudo verificar el usuario' } })
    assert.deepEqual(enviados, [])
  })

  await caso('falla del envío (429 u otra): respuesta genérica y log sin el mail', async () => {
    for (const error of [{ status: 429, code: 'over_email_send_rate_limit' }, { status: 500, message: 'ana@gmail.com' }]) {
      const { d, logs } = deps({ enviar: async () => ({ error }) })
      assert.deepEqual(await manejarRecupero('30123456', d), OK)
      assert.equal(logs.length, 1)
      assert.ok(!logs[0].includes('ana@gmail.com'))
    }
    // Aunque el envío tire, tampoco se nota afuera.
    const tira = deps({ enviar: async () => { throw new Error('ana@gmail.com: socket') } })
    assert.deepEqual(await manejarRecupero('30123456', tira.d), OK)
    assert.ok(!tira.logs.some((l) => l.includes('ana@gmail.com')))
  })

  await caso('pasado el límite: respuesta genérica, sin buscar ni mandar', async () => {
    let busco = false
    const { d, enviados } = deps({
      limite: async () => 'limitado',
      emailDeDni: async () => { busco = true; return { email: 'ana@gmail.com', fallo: false } },
    })
    assert.deepEqual(await manejarRecupero('30123456', d), OK)
    assert.equal(busco, false)
    assert.deepEqual(enviados, [])
  })

  await caso('el límite no responde: 500, sin buscar ni mandar', async () => {
    const { d, enviados } = deps({ limite: async () => 'error' })
    assert.deepEqual(await manejarRecupero('30123456', d), { status: 500, body: { error: 'No se pudo verificar el usuario' } })
    assert.deepEqual(enviados, [])
  })

  await caso('mail mal escrito: 400 "Revisá el mail." antes de buscar nada (no se toma como DNI)', async () => {
    for (const raw of ['ana1@gmail', 'ana @gmail.com', '30123456@', '@gmail.com']) {
      let paso = false
      const { d } = deps({
        limite: async () => { paso = true; return 'enviar' },
        emailDeDni: async () => { paso = true; return { email: 'ana@gmail.com', fallo: false } },
      })
      assert.deepEqual(await manejarRecupero(raw, d), MAIL_INVALIDO, raw)
      assert.equal(paso, false, raw)
    }
  })

  await caso('mail tipeado que GoTrue rechaza por formato: 400 "Revisá el mail." (no depende de la cuenta)', async () => {
    for (const error of [{ status: 400, code: 'validation_failed' }, { status: 400, code: 'email_address_invalid' }]) {
      const { d } = deps({ enviar: async () => ({ error }) })
      assert.deepEqual(await manejarRecupero('ana@gmail.con', d), MAIL_INVALIDO)
    }
    // El mail de una cuenta buscada por DNI viene de la base: su falla no se dice.
    const porDni = deps({ enviar: async () => ({ error: { status: 400, code: 'validation_failed' } }) })
    assert.deepEqual(await manejarRecupero('30123456', porDni.d), OK)
  })

  await caso('vacío o sin dígitos: 400 "Faltan datos"', async () => {
    const { d } = deps()
    assert.deepEqual(await manejarRecupero('   ', d), { status: 400, body: { error: 'Faltan datos' } })
    assert.deepEqual(await manejarRecupero('abc', d), { status: 400, body: { error: 'Faltan datos' } })
  })

  await caso('perfil sin usuario de Auth = no hay cuenta; otra falla de Auth = falla', () => {
    assert.deepEqual(cuentaDeUsuarioAuth({ status: 404, code: 'user_not_found' }, null), { email: null, fallo: false })
    assert.deepEqual(cuentaDeUsuarioAuth({ status: 404 }, null), { email: null, fallo: false })
    assert.deepEqual(cuentaDeUsuarioAuth({ status: 500, message: 'db down' }, null), { email: null, fallo: true })
    assert.deepEqual(cuentaDeUsuarioAuth(null, { email: 'ana@gmail.com' }), { email: 'ana@gmail.com', fallo: false })
    assert.deepEqual(cuentaDeUsuarioAuth(null, { email: undefined }), { email: null, fallo: false })
    assert.deepEqual(cuentaDeUsuarioAuth(null, null), { email: null, fallo: false })
  })

  console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
