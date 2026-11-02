// Verificación autocontenida de recupero-intentos.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/recupero-intentos.check.ts

import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import {
  LIMITES_RECUPERO,
  claveHmacRecupero,
  clavesRecupero,
  decisionRecupero,
  ipCliente,
  parametrosLimite,
} from './recupero-intentos.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const CLAVE = 'clave-de-prueba'
const hmac = (s: string, k = CLAVE) => createHmac('sha256', k).update(s).digest('hex')
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

// Headers de un pedido, como los lee login-dni (req.headers.get).
const headers = (h: Record<string, string>) => (nombre: string) => h[nombre] ?? null

// tsx compila a CJS: sin await de primer nivel.
async function main() {

await caso('IP del cliente: sólo cf-connecting-ip (lo pone Cloudflare); x-forwarded-for no se usa (auth review)', () => {
  assert.equal(ipCliente(headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' })), '203.0.113.7')
  assert.equal(ipCliente(headers({ 'cf-connecting-ip': '  2001:db8::1  ' })), '2001:db8::1')
  // Sin el header confiable no hay IP: la primera entrada de x-forwarded-for la
  // escribe el cliente y la última puede ser un proxy interno compartido por
  // todos (un único cupo para el club entero). Quedan los límites por DNI/mail.
  assert.equal(ipCliente(headers({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 203.0.113.7' })), null)
  assert.equal(ipCliente(headers({ 'cf-connecting-ip': '  ', 'x-forwarded-for': '203.0.113.7' })), null)
  assert.equal(ipCliente(headers({})), null)
})

await caso('lo que el cliente pone en x-forwarded-for no cambia la clave (auth review)', async () => {
  const real = await clavesRecupero({ tipo: 'dni', dni: '1' }, ipCliente(headers({ 'cf-connecting-ip': '203.0.113.7' })), CLAVE)
  for (const falso of ['198.51.100.1', '198.51.100.1, 198.51.100.2', 'basura']) {
    const ip = ipCliente(headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': `${falso}, 203.0.113.7` }))
    assert.deepEqual(await clavesRecupero({ tipo: 'dni', dni: '1' }, ip, CLAVE), real, falso)
  }
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

await caso('las claves son HMAC-SHA-256 del identificador normalizado con la clave del servidor, en orden 60 s → hora → IP (auth review)', async () => {
  const claves = await clavesRecupero({ tipo: 'dni', dni: '30123456' }, '203.0.113.7', CLAVE)
  const h = hmac('dni:30123456')
  assert.deepEqual(claves, [
    { clave: `id:60:${h}`, ventana: '60 seconds', maximo: 1 },
    { clave: `id:3600:${h}`, ventana: '3600 seconds', maximo: 3 },
    { clave: `ip:3600:${hmac('ip:203.0.113.7')}`, ventana: '3600 seconds', maximo: 20 },
  ])
  for (const { clave } of claves) {
    assert.ok(!clave.includes('30123456'))
    assert.ok(!clave.includes('203.0.113.7'))
    assert.match(clave, /^(id|ip):\d+:[0-9a-f]{64}$/)
  }
  // Un sha-256 sin clave se recupera probando los DNIs posibles: no es lo que se guarda.
  assert.ok(!claves.some((c) => c.clave.endsWith(sha('dni:30123456'))))
  assert.ok(!claves.some((c) => c.clave.endsWith(sha('203.0.113.7'))))
  const mail = await clavesRecupero({ tipo: 'email', email: 'ana@gmail.com' }, null, CLAVE)
  assert.equal(mail.length, 2, 'sin IP, sólo las claves del identificador')
  assert.equal(mail[0].clave, `id:60:${hmac('email:ana@gmail.com')}`)
  assert.ok(!mail.some((c) => c.clave.includes('ana@gmail.com')))
})

await caso('otra clave del servidor da otras claves (rotarla reinicia los conteos)', async () => {
  const [a] = await clavesRecupero({ tipo: 'dni', dni: '30123456' }, null, CLAVE)
  const [b] = await clavesRecupero({ tipo: 'dni', dni: '30123456' }, null, 'otra-clave')
  assert.notEqual(a.clave, b.clave)
  assert.equal(b.clave, `id:60:${hmac('dni:30123456', 'otra-clave')}`)
})

await caso('un DNI y un mail con el mismo texto no comparten clave', async () => {
  const [dni] = await clavesRecupero({ tipo: 'dni', dni: '123' }, null, CLAVE)
  const [mail] = await clavesRecupero({ tipo: 'email', email: '123' }, null, CLAVE)
  assert.notEqual(dni.clave, mail.clave)
})

await caso('clave HMAC: RECUPERO_HMAC_KEY; si no está, la service role; sin ninguna, null', () => {
  const env = (e: Record<string, string>) => (n: string) => e[n]
  assert.equal(claveHmacRecupero(env({ RECUPERO_HMAC_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b' })), 'a')
  assert.equal(claveHmacRecupero(env({ SUPABASE_SERVICE_ROLE_KEY: 'b' })), 'b')
  assert.equal(claveHmacRecupero(env({ RECUPERO_HMAC_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'b' })), 'b')
  assert.equal(claveHmacRecupero(env({})), null)
})

await caso('parámetros del RPC: las claves en orden, en tres arrays paralelos', async () => {
  const claves = await clavesRecupero({ tipo: 'dni', dni: '1' }, '203.0.113.7', CLAVE)
  assert.deepEqual(parametrosLimite(claves), {
    p_claves: claves.map((c) => c.clave),
    p_ventanas: ['60 seconds', '3600 seconds', '3600 seconds'],
    p_maximos: [1, 3, 20],
  })
})

await caso('decisión: 0 → enviar; índice de la primera clave rechazada → limitado, con aviso sólo de clave hasheada y ventana (auth review)', async () => {
  const claves = await clavesRecupero({ tipo: 'dni', dni: '30123456' }, '203.0.113.7', CLAVE)
  assert.deepEqual(decisionRecupero(0, claves), { decision: 'enviar', aviso: null })
  const corto = decisionRecupero(1, claves)
  assert.equal(corto.decision, 'limitado')
  assert.equal(corto.aviso, `login-dni reset: limitado (clave=${claves[0].clave}, ventana=60 seconds)`)
  const ip = decisionRecupero(3, claves)
  assert.equal(ip.decision, 'limitado')
  assert.ok(ip.aviso?.includes(claves[2].clave))
  assert.ok(ip.aviso?.includes('3600 seconds'))
  for (const d of [corto, ip]) {
    assert.ok(!d.aviso?.includes('30123456'))
    assert.ok(!d.aviso?.includes('203.0.113.7'))
  }
})

await caso('decisión: falla de la base o respuesta fuera de rango → error', async () => {
  const claves = await clavesRecupero({ tipo: 'dni', dni: '1' }, null, CLAVE)
  for (const r of ['error', 3, -1, 1.5, null, '1', undefined] as unknown[]) {
    assert.deepEqual(decisionRecupero(r, claves), { decision: 'error', aviso: null }, String(r))
  }
})

console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
