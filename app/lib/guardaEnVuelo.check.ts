// Verificación autocontenida de guardaEnVuelo.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/guardaEnVuelo.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { crearGuardaEnVuelo, crearGuardaPorClave } from './guardaEnVuelo'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

function demora(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

async function main() {
  await caso('doble toque antes del re-render: el envío corre una sola vez', async () => {
    const guarda = crearGuardaEnVuelo()
    let inserts = 0
    const enviar = () => guarda(async () => { inserts++; await demora(10); return true }, false)
    const [a, b] = await Promise.all([enviar(), enviar()])
    assert.equal(inserts, 1)
    assert.deepEqual([a, b], [true, false])   // el segundo toque devuelve el valor "ocupado"
  })

  await caso('terminado el primero, se puede volver a enviar', async () => {
    const guarda = crearGuardaEnVuelo()
    let inserts = 0
    await guarda(async () => { inserts++ }, undefined)
    await guarda(async () => { inserts++ }, undefined)
    assert.equal(inserts, 2)
  })

  await caso('si el envío falla (throw), la guarda se libera', async () => {
    const guarda = crearGuardaEnVuelo()
    await assert.rejects(guarda(async () => { throw new Error('red') }, undefined))
    let corrio = false
    await guarda(async () => { corrio = true }, undefined)
    assert.equal(corrio, true)
  })

  await caso('dos guardas distintas no se bloquean entre sí', async () => {
    const crear  = crearGuardaEnVuelo()
    const cerrar = crearGuardaEnVuelo()
    let n = 0
    await Promise.all([
      crear(async () => { n++; await demora(5) }, undefined),
      cerrar(async () => { n++; await demora(5) }, undefined),
    ])
    assert.equal(n, 2)
  })

  await caso('por clave: el mismo id en vuelo no corre dos veces; otro id sí corre', async () => {
    const guarda = crearGuardaPorClave()
    let borrados: string[] = []
    const borrar = (id: string) => guarda(id, async () => { await demora(5); borrados.push(id); return true }, false)
    const [a1, a2, b] = await Promise.all([borrar('a'), borrar('a'), borrar('b')])
    assert.deepEqual([a1, a2, b], [true, false, true])
    assert.deepEqual(borrados.sort(), ['a', 'b'])
    // Liberada: el mismo id puede volver a correr.
    borrados = []
    assert.equal(await borrar('a'), true)
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(err => { console.error(err); process.exit(1) })
