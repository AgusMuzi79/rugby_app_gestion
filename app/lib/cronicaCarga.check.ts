// Verificación autocontenida de cronicaCarga.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/cronicaCarga.check.ts
// Sale con código distinto de 0 si algo falla.
//
// Maneja las consultas con un cliente falso que anota cada llamada (from,
// select, gte, in, eq, order, limit, single) por tabla.

import assert from 'node:assert/strict'
import { aplicarCarga, leerCronica, type ClienteCronica } from './cronicaCarga'
import type { FeedItem } from './cronica'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

type Llamada = [string, unknown[]]
type Respuesta = { data: unknown; error: unknown }

function clienteFalso(respuestas: Record<string, Respuesta>) {
  const llamadas: Record<string, Llamada[]> = {}
  const cliente = {
    from(tabla: string) {
      const reg: Llamada[] = [['from', [tabla]]]
      llamadas[tabla] = reg
      const respuesta = () => Promise.resolve(respuestas[tabla] ?? { data: [], error: null })
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'gte', 'in', 'eq', 'order', 'limit']) {
        b[m] = (...args: unknown[]) => { reg.push([m, args]); return b }
      }
      b.single = () => { reg.push(['single', []]); return respuesta() }
      b.then = (ok: (v: Respuesta) => unknown, mal: (e: unknown) => unknown) => respuesta().then(ok, mal)
      return b
    },
  } as unknown as ClienteCronica
  return { cliente, llamadas }
}

const DESDE = '2026-10-22T00:00:00.000Z'
const DIVS = ['m15', 'm16']
const perfil = (divisiones: string[]): Respuesta => ({ data: { divisiones }, error: null })
const metodos = (ls: Llamada[] | undefined) => (ls ?? []).map(([m]) => m)
const args = (ls: Llamada[] | undefined, m: string) => (ls ?? []).filter(([n]) => n === m).map(([, a]) => a)

function filtroAntesDelLimite(ls: Llamada[] | undefined, columna: string) {
  const ms = ls ?? []
  const iIn = ms.findIndex(([m, a]) => m === 'in' && a[0] === columna)
  const iLimit = ms.findIndex(([m]) => m === 'limit')
  assert.ok(iIn >= 0, `falta .in('${columna}', …)`)
  assert.ok(iLimit >= 0, 'falta .limit()')
  assert.ok(iIn < iLimit, `el filtro ${columna} tiene que ir antes del limit`)
  assert.deepEqual(ms[iIn][1][1], DIVS)
}

async function main() {
  await caso('entrenador: fichajes filtrados por sus divisiones en la base (jugadores!inner), antes del limit', async () => {
    const f = clienteFalso({ profiles: perfil(DIVS) })
    await leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true })
    assert.match(String(args(f.llamadas.fichajes, 'select')[0][0]), /jugadores!inner\(/)
    filtroAntesDelLimite(f.llamadas.fichajes, 'jugadores.division_id')
  })

  await caso('entrenador: resultados filtrados por sus divisiones en la base (eventos!inner), antes del limit', async () => {
    const f = clienteFalso({ profiles: perfil(DIVS) })
    await leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true })
    assert.match(String(args(f.llamadas.resultados, 'select')[0][0]), /eventos!inner\(/)
    filtroAntesDelLimite(f.llamadas.resultados, 'eventos.division_id')
  })

  await caso('entrenador: lesiones filtradas por division_id antes del limit', async () => {
    const f = clienteFalso({ profiles: perfil(DIVS) })
    await leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true })
    filtroAntesDelLimite(f.llamadas.lesiones, 'division_id')
  })

  await caso('subcomisión: sin filtro de división (lo recorta la RLS)', async () => {
    const f = clienteFalso({ profiles: perfil([]) })
    await leerCronica(f.cliente, { userId: 'u1', rol: 'subcomision', desde: DESDE, conLesiones: true })
    for (const t of ['lesiones', 'fichajes', 'resultados']) {
      assert.ok(f.llamadas[t], `consulta ${t}`)
      assert.ok(!args(f.llamadas[t], 'in').some(a => String(a[0]).includes('division_id')), `${t} sin filtro de división`)
    }
  })

  await caso('sin divisiones asignadas: no se consultan las tablas de división, sólo las notificaciones', async () => {
    const f = clienteFalso({ profiles: perfil([]) })
    const items = await leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true })
    assert.deepEqual(Object.keys(f.llamadas).sort(), ['notificaciones', 'profiles'])
    assert.deepEqual(items, [])
  })

  await caso('módulo de lesiones oculto: ni se consulta la tabla', async () => {
    const f = clienteFalso({ profiles: perfil(DIVS) })
    await leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: false })
    assert.equal(f.llamadas.lesiones, undefined)
  })

  await caso('las notificaciones van por tipo según el rol, en la ventana de 7 días', async () => {
    const f = clienteFalso({ profiles: perfil(DIVS) })
    await leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true })
    assert.deepEqual(args(f.llamadas.notificaciones, 'in'), [['tipo', ['ausencias_consecutivas']]])
    assert.deepEqual(args(f.llamadas.notificaciones, 'gte'), [['created_at', DESDE]])
    assert.deepEqual(metodos(f.llamadas.profiles), ['from', 'select', 'eq', 'single'])
  })

  await caso('arma el feed con lo leído', async () => {
    const f = clienteFalso({
      profiles: perfil(DIVS),
      fichajes: { data: [{ id: 'f1', created_at: '2026-10-28T10:00:00Z', jugadores: { nombre_completo: 'Ana', divisiones: { nombre: 'M15' } } }], error: null },
    })
    const items = await leerCronica(f.cliente, { userId: 'u1', rol: 'manager', desde: DESDE, conLesiones: true })
    assert.deepEqual(items.map(i => i.id), ['fichaje-f1'])
  })

  await caso('un error de cualquier lectura sale como error (no como "sin novedades")', async () => {
    const err = { message: 'permission denied', code: '42501' }
    const f = clienteFalso({ profiles: perfil(DIVS), resultados: { data: null, error: err } })
    await assert.rejects(leerCronica(f.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true }), e => e === err)
    const g = clienteFalso({ profiles: { data: null, error: err } })
    await assert.rejects(leerCronica(g.cliente, { userId: 'u1', rol: 'entrenador', desde: DESDE, conLesiones: true }), e => e === err)
  })

  await caso('con error queda el mensaje y la lista de antes; con éxito se reemplaza y se limpia el error', async () => {
    const previo: FeedItem[] = [{ id: 'x', tipo: 'INFO', titulo: 't', desc: '', autor: '', createdAt: DESDE, urgente: false, route: null, mensaje: null }]
    const conError = aplicarCarga({ items: previo, errorCarga: null }, { tipo: 'error', mensaje: 'No se pudo cargar la crónica. Probá de nuevo.' })
    assert.deepEqual(conError, { items: previo, errorCarga: 'No se pudo cargar la crónica. Probá de nuevo.' })
    const ok = aplicarCarga(conError, { tipo: 'ok', items: [] })
    assert.deepEqual(ok, { items: [], errorCarga: null })
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(e => { console.error(e); process.exit(1) })
