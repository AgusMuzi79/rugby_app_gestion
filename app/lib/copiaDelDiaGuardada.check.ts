// Verificación autocontenida de copiaDelDiaGuardada.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/copiaDelDiaGuardada.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { actualizarCopiaDia, claveDia, leerCopiaDia, serializarCopiaDia, type CopiaDia } from './copiaDelDia'
import { actualizarCopiaGuardada, conCandadoPorClave, type AlmacenTexto } from './copiaDelDiaGuardada'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-10-29'
const CLAVE = claveDia('div-1')
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// AsyncStorage en memoria. Cada lectura toma el valor al llamarla y lo entrega
// después de lo que diga `demorasLectura` (en orden de llamada): como la carga
// que leía la copia y después esperaba la red, la primera lectura queda "en
// vuelo" con una base vieja mientras otra actualización lee y escribe.
function almacenFalso(inicial: Record<string, string> = {}, demorasLectura: number[] = []) {
  const datos = new Map(Object.entries(inicial))
  const almacen: AlmacenTexto = {
    async getItem(clave) {
      const valor = datos.get(clave) ?? null
      await esperar(demorasLectura.shift() ?? 0)
      return valor
    },
    async setItem(clave, valor) {
      await esperar(0)
      datos.set(clave, valor)
    },
  }
  return { almacen, leer: (clave: string) => leerCopiaDia(datos.get(clave) ?? null) }
}

const BASE: CopiaDia = {
  fecha: HOY,
  guardadoEn: 1,
  entrenamientos: [{ id: 'ev-1', hora: '20:30' }],
  marcas: { 'ev-1': { j1: 'presente' } },
  marcasEn: { 'ev-1': 1 },
}

// La carga de la lista (turnos leídos de la base) y un guardado (suma marcas).
const deLaCarga = (actual: CopiaDia | null) =>
  actualizarCopiaDia(actual, { fecha: HOY, ahora: 2, entrenamientos: [{ id: 'ev-1', hora: '20:30' }] })
const delGuardado = (actual: CopiaDia | null) =>
  actualizarCopiaDia(actual, { fecha: HOY, ahora: 3, eventoId: 'ev-1', marcas: { j2: 'ausente' }, mezclar: true })

// Lo de antes: leer, (esperar) y escribir sin candado.
async function sinCandado(almacen: AlmacenTexto, clave: string, cambiar: (a: CopiaDia | null) => CopiaDia) {
  const actual = leerCopiaDia(await almacen.getItem(clave))
  await almacen.setItem(clave, serializarCopiaDia(cambiar(actual)))
}

async function main() {
  await caso('sin candado (lo de antes): la carga con base vieja pisa el guardado', async () => {
    const { almacen, leer } = almacenFalso({ [CLAVE]: serializarCopiaDia(BASE) }, [20, 0])
    await Promise.all([sinCandado(almacen, CLAVE, deLaCarga), sinCandado(almacen, CLAVE, delGuardado)])
    assert.deepEqual(leer(CLAVE)?.marcas['ev-1'], { j1: 'presente' }, 'la marca guardada se pierde')
  })

  await caso('con candado: dos actualizaciones a la vez en la misma clave no se pierden', async () => {
    const { almacen, leer } = almacenFalso({ [CLAVE]: serializarCopiaDia(BASE) }, [20, 0])
    await Promise.all([
      actualizarCopiaGuardada(almacen, CLAVE, deLaCarga),
      actualizarCopiaGuardada(almacen, CLAVE, delGuardado),
    ])
    assert.deepEqual(leer(CLAVE)?.marcas['ev-1'], { j1: 'presente', j2: 'ausente' })
    assert.equal(leer(CLAVE)?.guardadoEn, 3, 'la segunda escribió sobre la primera')
  })

  await caso('con candado: muchos guardados a la vez suman todas las marcas', async () => {
    const { almacen, leer } = almacenFalso({}, [15, 5, 10, 0, 1])
    await Promise.all(['j1', 'j2', 'j3', 'j4', 'j5'].map((j, i) => actualizarCopiaGuardada(almacen, CLAVE, a =>
      actualizarCopiaDia(a, { fecha: HOY, ahora: i, eventoId: 'ev-1', marcas: { [j]: 'presente' }, mezclar: true }))))
    assert.deepEqual(Object.keys(leer(CLAVE)?.marcas['ev-1'] ?? {}).sort(), ['j1', 'j2', 'j3', 'j4', 'j5'])
  })

  await caso('claves distintas no se esperan entre sí', async () => {
    let soltar!: () => void
    const trabada = conCandadoPorClave(claveDia('div-a'), () => new Promise<void>(r => { soltar = r }))
    const { almacen, leer } = almacenFalso()
    const otra = await Promise.race([
      actualizarCopiaGuardada(almacen, claveDia('div-b'), delGuardado).then(() => 'terminó'),
      esperar(200).then(() => 'esperando'),
    ])
    assert.equal(otra, 'terminó')
    assert.deepEqual(leer(claveDia('div-b'))?.marcas['ev-1'], { j2: 'ausente' })
    // La misma clave sí espera a la trabada.
    let corrio = false
    const misma = conCandadoPorClave(claveDia('div-a'), async () => { corrio = true })
    await esperar(10)
    assert.equal(corrio, false)
    soltar()
    await Promise.all([trabada, misma])
    assert.equal(corrio, true)
  })

  // La carga lee las marcas de la base, espera la red y recién después las
  // escribe; en el medio un guardado (online o en la cola) entra a la copia.
  async function cargaConGuardadoEnElMedio(conLeidoEn: boolean) {
    const { almacen, leer } = almacenFalso({ [CLAVE]: serializarCopiaDia(BASE) })
    const carga = (async () => {
      const leidoEn = Date.now()
      const deLaBase = { j1: 'presente' } // lo que había en la base al leer
      await esperar(30) // la red
      await actualizarCopiaGuardada(almacen, CLAVE, a => actualizarCopiaDia(a, {
        fecha: HOY, ahora: Date.now(), entrenamientos: [{ id: 'ev-1', hora: '20:30' }],
        eventoId: 'ev-1', marcas: deLaBase, ...(conLeidoEn ? { leidoEn } : {}),
      }))
    })()
    const guardado = (async () => {
      await esperar(10)
      await actualizarCopiaGuardada(almacen, CLAVE, a => actualizarCopiaDia(a, {
        fecha: HOY, ahora: Date.now(), eventoId: 'ev-1', marcas: { j2: 'ausente' }, mezclar: true,
      }))
    })()
    await Promise.all([carga, guardado])
    return leer(CLAVE)?.marcas['ev-1']
  }

  await caso('sin hora de lectura (lo de antes): la carga pisa el guardado hecho mientras leía', async () => {
    assert.deepEqual(await cargaConGuardadoEnElMedio(false), { j1: 'presente' })
  })

  await caso('con hora de lectura: el guardado hecho mientras la carga leía sobrevive', async () => {
    assert.deepEqual(await cargaConGuardadoEnElMedio(true), { j1: 'presente', j2: 'ausente' })
  })

  await caso('si AsyncStorage falla no rechaza y la próxima actualización corre', async () => {
    const roto: AlmacenTexto = {
      async getItem() { throw new Error('lectura') },
      async setItem() { throw new Error('escritura') },
    }
    const r = await actualizarCopiaGuardada(roto, CLAVE, delGuardado)
    assert.deepEqual(r?.marcas['ev-1'], { j2: 'ausente' })
    const { almacen, leer } = almacenFalso()
    await actualizarCopiaGuardada(almacen, CLAVE, delGuardado)
    assert.deepEqual(leer(CLAVE)?.marcas['ev-1'], { j2: 'ausente' })
  })

  await caso('un cambio que tira error o devuelve null no escribe y no traba la clave', async () => {
    const { almacen, leer } = almacenFalso({ [CLAVE]: serializarCopiaDia(BASE) })
    assert.equal(await actualizarCopiaGuardada(almacen, CLAVE, () => { throw new Error('x') }), null)
    assert.equal(await actualizarCopiaGuardada(almacen, CLAVE, () => null), null)
    assert.deepEqual(leer(CLAVE), BASE)
    await actualizarCopiaGuardada(almacen, CLAVE, delGuardado)
    assert.deepEqual(leer(CLAVE)?.marcas['ev-1'], { j1: 'presente', j2: 'ausente' })
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(e => { console.error(e); process.exit(1) })
