// Verificación autocontenida de totp.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/totp.check.ts

import assert from 'node:assert/strict'
import { STEP, codigoEnPaso, generateSecret, matchingStep, pasoUsable, verifyTOTP } from './totp.ts'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void> | void) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

async function main() {
const secret = generateSecret()
const ahora = Date.UTC(2026, 9, 26, 15, 0, 30)
const paso = Math.floor(ahora / 1000 / STEP)

await caso('matchingStep devuelve el paso que coincidió (actual, anterior y siguiente)', async () => {
  assert.equal(await matchingStep(secret, await codigoEnPaso(secret, paso), 1, ahora), paso)
  assert.equal(await matchingStep(secret, await codigoEnPaso(secret, paso - 1), 1, ahora), paso - 1)
  assert.equal(await matchingStep(secret, await codigoEnPaso(secret, paso + 1), 1, ahora), paso + 1)
})

await caso('un código de hace dos pasos no coincide', async () => {
  assert.equal(await matchingStep(secret, await codigoEnPaso(secret, paso - 2), 1, ahora), null)
})

await caso('verifyTOTP sigue funcionando igual', async () => {
  const codigoActual = await codigoEnPaso(secret, Math.floor(Date.now() / 1000 / STEP))
  assert.equal(await verifyTOTP(secret, codigoActual), true)
})

await caso('un paso ya usado (o anterior) no se acepta de nuevo: la captura reenviada falla', () => {
  assert.equal(pasoUsable(paso, null), true)
  assert.equal(pasoUsable(paso, paso - 1), true)
  assert.equal(pasoUsable(paso, paso), false)
  assert.equal(pasoUsable(paso - 1, paso), false)
})

console.log(`\n${casos} casos ok`)
}

main().catch((e) => { console.error(e); process.exit(1) })
