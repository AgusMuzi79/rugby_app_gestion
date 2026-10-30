// Verificación autocontenida de recupero-intentos.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/recupero-intentos.check.ts

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  LIMITES_RECUPERO,
  clavesRecupero,
  decisionRecupero,
  ipCliente,
} from './recupero-intentos.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

// tsx compila a CJS: sin await de primer nivel.
async function main() {

await caso('la IP del cliente es la primera entrada de x-forwarded-for', () => {
  assert.equal(ipCliente('203.0.113.7, 10.0.0.1, 10.0.0.2'), '203.0.113.7')
  assert.equal(ipCliente('  203.0.113.7  '), '203.0.113.7')
  assert.equal(ipCliente('2001:db8::1'), '2001:db8::1')
  assert.equal(ipCliente(''), null)
  assert.equal(ipCliente(' , 10.0.0.1'), null)
  assert.equal(ipCliente(null), null)
  assert.equal(ipCliente(undefined), null)
})

await caso('límites: 1 por identificador cada 60 s, 3 por identificador por hora, 20 por IP por hora', () => {
  assert.deepEqual(LIMITES_RECUPERO, {
    identificador: [
      { ventanaSegundos: 60, maximo: 1 },
      { ventanaSegundos: 3600, maximo: 3 },
    ],
    ip: { ventanaSegundos: 3600, maximo: 20 },
  })
})

await caso('las claves usan el hash del identificador normalizado, nunca el DNI ni el mail', async () => {
  const claves = await clavesRecupero({ tipo: 'dni', dni: '30123456' }, '203.0.113.7')
  const h = sha('dni:30123456')
  assert.deepEqual(claves, [
    { clave: `id:60:${h}`, ventana: '60 seconds', maximo: 1 },
    { clave: `id:3600:${h}`, ventana: '3600 seconds', maximo: 3 },
    { clave: `ip:3600:${sha('203.0.113.7')}`, ventana: '3600 seconds', maximo: 20 },
  ])
  for (const { clave } of claves) {
    assert.ok(!clave.includes('30123456'))
    assert.ok(!clave.includes('203.0.113.7'))
    assert.match(clave, /^(id|ip):\d+:[0-9a-f]{64}$/)
  }
  const mail = await clavesRecupero({ tipo: 'email', email: 'ana@gmail.com' }, null)
  assert.equal(mail.length, 2, 'sin IP, sólo las claves del identificador')
  assert.equal(mail[0].clave, `id:60:${sha('email:ana@gmail.com')}`)
  assert.ok(!mail.some((c) => c.clave.includes('ana@gmail.com')))
})

await caso('un DNI y un mail con el mismo texto no comparten clave', async () => {
  const [dni] = await clavesRecupero({ tipo: 'dni', dni: '123' }, null)
  const [mail] = await clavesRecupero({ tipo: 'email', email: '123' }, null)
  assert.notEqual(dni.clave, mail.clave)
})

await caso('decisión: todas permitidas → enviar; alguna pasada → limitado; alguna falla de la base → error', () => {
  assert.equal(decisionRecupero([true, true, true]), 'enviar')
  assert.equal(decisionRecupero([true, false, true]), 'limitado')
  assert.equal(decisionRecupero([false, false]), 'limitado')
  assert.equal(decisionRecupero([true, 'error', false]), 'error')
  assert.equal(decisionRecupero([]), 'enviar')
})

console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
