// Verificación autocontenida de accesosRango.ts (rango, paginación y conteo de
// invitados de listar-accesos); no hay runner de tests en el repo ni Deno local.
// Desde la raíz del repo:
//   npx --yes tsx supabase/functions/_shared/accesosRango.check.ts
// Sale con código distinto de 0 si algo falla. La consulta se inyecta, nunca sale a la red.

import assert from 'node:assert/strict'
import {
  MAX_DIAS_LISTAR_ACCESOS,
  contarVecesInvitadoPorVisita,
  enTandas,
  hoyAR,
  resolverRango,
  traerTodasLasPaginas,
} from './accesosRango.ts'
import { MAX_DIAS_RANGO, validarRango } from '../../../web/lib/accesosFiltro.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

function rango(body: Record<string, unknown>) {
  const r = resolverRango(body, '2026-10-08')
  if ('error' in r) throw new Error(`no se esperaba error: ${r.error}`)
  return r
}
function errorDe(body: Record<string, unknown>): string {
  const r = resolverRango(body, '2026-10-08')
  assert.ok('error' in r, 'se esperaba error')
  return r.error
}

async function main() {

// ─── Rango ────────────────────────────────────────────────────────────────────

await caso('sin parámetros es hoy', () => {
  const r = rango({})
  assert.equal(r.desde, '2026-10-08')
  assert.equal(r.hasta, '2026-10-08')
})
await caso('`fecha` sola es un rango de un día (clientes viejos)', () => {
  const r = rango({ fecha: '2026-10-01' })
  assert.deepEqual([r.desde, r.hasta], ['2026-10-01', '2026-10-01'])
})
await caso('desde/hasta tienen prioridad sobre fecha', () => {
  const r = rango({ fecha: '2026-10-01', desde: '2026-09-01', hasta: '2026-09-30' })
  assert.deepEqual([r.desde, r.hasta], ['2026-09-01', '2026-09-30'])
})
await caso('desde sin hasta es un solo día', () => {
  const r = rango({ desde: '2026-09-15' })
  assert.deepEqual([r.desde, r.hasta], ['2026-09-15', '2026-09-15'])
})
await caso('los límites son medianoche de Argentina (UTC-3)', () => {
  const r = rango({ desde: '2026-10-01', hasta: '2026-10-02' })
  assert.equal(r.inicio.toISOString(), '2026-10-01T03:00:00.000Z')
  assert.equal(r.fin.toISOString(), '2026-10-03T03:00:00.000Z')
})
await caso('formato inválido', () => {
  assert.match(errorDe({ desde: '01/10/2026' }), /formato/)
})
await caso('fechas imposibles (mes 13, día 00, 30/02) se rechazan', () => {
  for (const desde of ['2026-13-01', '2026-10-00', '2026-02-30']) {
    assert.match(errorDe({ desde }), /formato/, desde)
  }
})
await caso('desde posterior a hasta', () => {
  assert.match(errorDe({ desde: '2026-10-02', hasta: '2026-10-01' }), /posterior/)
})
await caso(`${MAX_DIAS_LISTAR_ACCESOS} días pasan, uno más no`, () => {
  rango({ desde: '2026-01-01', hasta: '2026-04-02' })
  assert.match(errorDe({ desde: '2026-01-01', hasta: '2026-04-03' }), /92/)
})
await caso('el tope y el conteo de días coinciden con el panel web', () => {
  assert.equal(MAX_DIAS_LISTAR_ACCESOS, MAX_DIAS_RANGO)
  const pares: [string, string][] = [
    ['2026-01-01', '2026-04-02'], ['2026-01-01', '2026-04-03'],
    ['2026-10-08', '2026-10-08'], ['2026-03-01', '2026-05-31'], ['2026-03-01', '2026-06-01'],
  ]
  for (const [desde, hasta] of pares) {
    const servidorOk = !('error' in resolverRango({ desde, hasta }, '2026-10-08'))
    const webOk = validarRango(desde, hasta) === null
    assert.equal(servidorOk, webOk, `${desde}..${hasta}`)
  }
})
await caso('hoyAR usa el día de Argentina, no el de UTC', () => {
  assert.equal(hoyAR(new Date('2026-10-09T01:30:00Z')), '2026-10-08') // 22:30 del 08 en AR
  assert.equal(hoyAR(new Date('2026-10-09T03:30:00Z')), '2026-10-09')
})

// ─── Paginación ───────────────────────────────────────────────────────────────

  function fuente(total: number) {
  const pedidos: [number, number][] = []
  const pagina = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta])
    const data = Array.from({ length: Math.max(0, Math.min(hasta, total - 1) - desde + 1) }, (_, i) => desde + i)
    return { data, error: null }
  }
  return { pagina, pedidos }
}

await caso('menos de una página: un solo pedido', async () => {
  const { pagina, pedidos } = fuente(3)
  assert.deepEqual(await traerTodasLasPaginas(pagina, 10), { data: [0, 1, 2] })
  assert.deepEqual(pedidos, [[0, 9]])
})
await caso('exactamente una página: pide la siguiente y corta en vacía', async () => {
  const { pagina, pedidos } = fuente(10)
  const r = await traerTodasLasPaginas(pagina, 10)
  assert.ok('data' in r && r.data.length === 10)
  assert.deepEqual(pedidos, [[0, 9], [10, 19]])
})
await caso('varias páginas se concatenan en orden', async () => {
  const { pagina } = fuente(25)
  const r = await traerTodasLasPaginas(pagina, 10)
  assert.ok('data' in r)
  assert.deepEqual(r.data, Array.from({ length: 25 }, (_, i) => i))
})
await caso('un error en una página corta y lo devuelve', async () => {
  let llamadas = 0
  const r = await traerTodasLasPaginas(async () => {
    llamadas++
    return llamadas === 1
      ? { data: Array.from({ length: 10 }, (_, i) => i), error: null }
      : { data: null, error: { message: 'boom' } }
  }, 10)
  assert.deepEqual(r, { error: 'boom' })
})

// ─── Tandas ───────────────────────────────────────────────────────────────────

await caso('enTandas parte respetando el tamaño y el orden', () => {
  assert.deepEqual(enTandas([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})
await caso('enTandas con lista exacta o vacía', () => {
  assert.deepEqual(enTandas([1, 2], 2), [[1, 2]])
  assert.deepEqual(enTandas([], 2), [])
})

// ─── Veces invitado (ventana de 30 días por visita) ──────────────────────────

const visita = (creado_en: string, dni = '30111222') => ({ creado_en, invitado_dni: dni })

await caso('cuenta los 30 días que terminan al cierre del día de cada visita', () => {
  const historial = [
    visita('2026-07-10T15:00:00Z'),
    visita('2026-07-20T15:00:00Z'),
    visita('2026-09-25T15:00:00Z'),
    visita('2026-10-01T15:00:00Z'),
  ]
  // Pedido julio..octubre: la visita del 20/07 ve 2 (10/07 y 20/07), no las de septiembre.
  const veces = contarVecesInvitadoPorVisita(
    [visita('2026-07-20T15:00:00Z'), visita('2026-10-01T15:00:00Z')],
    historial,
    30,
  )
  assert.deepEqual(veces, [2, 2])
})
await caso('incluye las visitas posteriores del mismo día', () => {
  const historial = [visita('2026-10-01T12:00:00Z'), visita('2026-10-01T20:00:00Z')]
  assert.deepEqual(contarVecesInvitadoPorVisita([historial[0]], historial, 30), [2])
})
await caso('el día se corta en horario de Argentina', () => {
  // 02/10 01:00Z es el 01/10 22:00 en AR: mismo día que la visita del 01/10.
  const historial = [visita('2026-10-01T12:00:00Z'), visita('2026-10-02T01:00:00Z')]
  assert.deepEqual(contarVecesInvitadoPorVisita([historial[0]], historial, 30), [2])
})
await caso('una visita de hace exactamente 30 días queda afuera', () => {
  // Ventana del 01/10: [02/09 00:00 AR, 02/10 00:00 AR).
  const historial = [visita('2026-09-02T02:59:00Z'), visita('2026-09-02T03:00:00Z'), visita('2026-10-01T12:00:00Z')]
  assert.deepEqual(contarVecesInvitadoPorVisita([historial[2]], historial, 30), [2])
})
await caso('cada DNI se cuenta por separado; sin DNI va null', () => {
  const historial = [visita('2026-10-01T12:00:00Z', 'A'), visita('2026-10-01T13:00:00Z', 'B'), visita('2026-09-30T13:00:00Z', 'B')]
  assert.deepEqual(
    contarVecesInvitadoPorVisita([historial[0], historial[1], { creado_en: '2026-10-01T14:00:00Z', invitado_dni: null }], historial, 30),
    [1, 2, null],
  )
})

console.log(`\n${casos} casos ok`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

