// Verificación autocontenida de cargaPartido.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/cargaPartido.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { abrirPaso, type DestinoPartido } from './cargaPartido'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const PARTIDO = { id: 'p1', rival: 'Pucará' }
const EQUIPO = { id: 'e1' }
const BASE = [{ id: 'j1' }]
const RED = new TypeError('Network request failed')

// Puerto falso: `errores` dice qué devuelve cada lectura, en orden.
function puertoFalso(errores: unknown[]) {
  const cargas: unknown[][] = []
  const pasos: [DestinoPartido, unknown, unknown][] = []
  let reintentar: (() => void) | null = null
  const puerto = {
    cargar: async (p: unknown, e: unknown, b: unknown) => { cargas.push([p, e, b]); return errores.shift() ?? null },
    fallo: (_err: unknown, repetir: () => void) => { reintentar = repetir },
    irA: async (d: DestinoPartido, p: unknown, e: unknown) => { pasos.push([d, p, e]) },
  }
  return { puerto, cargas, pasos, reintentar: () => reintentar }
}

async function main() {
  await caso('lectura OK: va al paso pedido con ese partido y ese equipo', async () => {
    const f = puertoFalso([null])
    const ok = await abrirPaso({ partido: PARTIDO, equipo: EQUIPO, base: BASE, destino: 'resultado' }, f.puerto)
    assert.equal(ok, true)
    assert.deepEqual(f.pasos, [['resultado', PARTIDO, EQUIPO]])
  })

  await caso('RESULTADO desde el Inicio falla: REINTENTAR repite esa misma carga y abre RESULTADO (antes: no hacía nada)', async () => {
    const f = puertoFalso([RED, null])
    const ok = await abrirPaso({ partido: PARTIDO, equipo: EQUIPO, base: BASE, destino: 'resultado' }, f.puerto)
    assert.equal(ok, false)
    assert.deepEqual(f.pasos, [])
    const r = f.reintentar()
    assert.ok(r, 'el fallo deja un reintento')
    r!()
    await new Promise(res => setImmediate(res))
    assert.deepEqual(f.cargas, [[PARTIDO, EQUIPO, BASE], [PARTIDO, EQUIPO, BASE]])
    assert.deepEqual(f.pasos, [['resultado', PARTIDO, EQUIPO]])
  })

  await caso('desde ASISTENCIA: el reintento vuelve a ASISTENCIA, no a RESULTADO', async () => {
    const f = puertoFalso([RED, null])
    await abrirPaso({ partido: PARTIDO, equipo: EQUIPO, base: BASE, destino: 'asistencia' }, f.puerto)
    f.reintentar()!()
    await new Promise(res => setImmediate(res))
    assert.deepEqual(f.pasos, [['asistencia', PARTIDO, EQUIPO]])
  })

  await caso('si el reintento vuelve a fallar deja otro reintento igual', async () => {
    const f = puertoFalso([RED, RED, null])
    await abrirPaso({ partido: PARTIDO, equipo: EQUIPO, base: BASE, destino: 'resultado' }, f.puerto)
    f.reintentar()!()
    await new Promise(res => setImmediate(res))
    assert.deepEqual(f.pasos, [])
    f.reintentar()!()
    await new Promise(res => setImmediate(res))
    assert.equal(f.cargas.length, 3)
    assert.deepEqual(f.pasos, [['resultado', PARTIDO, EQUIPO]])
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(e => { console.error(e); process.exit(1) })
