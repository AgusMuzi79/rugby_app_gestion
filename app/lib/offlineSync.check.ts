// Verificación autocontenida de offlineSync.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/offlineSync.check.ts

import assert from 'node:assert/strict'
import { LOTE_ACCESOS_OFFLINE, MAX_INTENTOS, esErrorDeRed, nuevoIdCola, particionarFallidos, sinNoEnviadasDe, sincronizarAccesosOffline, sincronizarItems, type EscaneoOffline, type FilaAsistencia, type PuertoAccesos, type PuertoSync, type ResultadoAccesoOffline } from './offlineSync'
import type { ItemCola } from './offlineQueue'

let casos = 0
async function caso(nombre: string, fn: () => Promise<void> | void) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Base falsa: eventos por (división, fecha) y asistencias por (evento, jugador).
function baseFalsa(opciones: { caida?: boolean } = {}) {
  const eventos = new Map<string, string>()
  const asistencias = new Map<string, FilaAsistencia>()
  let creados = 0
  const puerto: PuertoSync = {
    async buscarEntrenamiento(divisionId, fecha) {
      if (opciones.caida) throw new TypeError('Network request failed')
      return eventos.get(`${divisionId}|${fecha}`) ?? null
    },
    async crearEntrenamiento(divisionId, fecha) {
      const id = `ev-${++creados}`
      eventos.set(`${divisionId}|${fecha}`, id)
      return id
    },
    async upsertAsistencias(filas) {
      if (opciones.caida) throw new TypeError('Network request failed')
      for (const f of filas) asistencias.set(`${f.evento_id}|${f.jugador_id}`, f)
    },
  }
  return { puerto, eventos, asistencias, creados: () => creados }
}

const entrenamiento = (id: string, fecha = '2026-10-26'): ItemCola => ({
  id, tipo: 'asistencia', creadoEn: 1,
  payload: {
    division_id: 'div-1', fecha, registrado_por: 'coach',
    jugadores: [{ jugador_id: 'j1', estado: 'presente' }, { jugador_id: 'j2', estado: 'ausente' }],
  },
})

async function main() {
  await caso('una asistencia de entrenamiento encolada llega a la base (antes nadie drenaba la cola)', async () => {
    const db = baseFalsa()
    const r = await sincronizarItems([entrenamiento('a')], db.puerto)
    assert.deepEqual(r.enviados, ['a'])
    assert.equal(db.asistencias.size, 2)
    assert.deepEqual(db.asistencias.get('ev-1|j1'), {
      evento_id: 'ev-1', jugador_id: 'j1', division_id: 'div-1', estado: 'presente', registrado_por: 'coach',
    })
  })

  await caso('si el entrenamiento del día ya existe se usa ese (no se crea otro)', async () => {
    const db = baseFalsa()
    db.eventos.set('div-1|2026-10-26', 'ev-existente')
    await sincronizarItems([entrenamiento('a'), entrenamiento('b')], db.puerto)
    assert.equal(db.creados(), 0)
    assert.ok(db.asistencias.has('ev-existente|j1'))
  })

  await caso('la asistencia de un partido usa su evento_id', async () => {
    const db = baseFalsa()
    const item: ItemCola = {
      id: 'p', tipo: 'asistencia', creadoEn: 1,
      payload: { evento_id: 'partido-9', division_id: 'div-1', registrado_por: 'coach', jugadores: [{ jugador_id: 'j1', estado: 'presente' }] },
    }
    const r = await sincronizarItems([item], db.puerto)
    assert.deepEqual(r.enviados, ['p'])
    assert.ok(db.asistencias.has('partido-9|j1'))
    assert.equal(db.creados(), 0)
  })

  await caso('sin red el ítem queda en la cola (fallido, no enviado)', async () => {
    const db = baseFalsa({ caida: true })
    const r = await sincronizarItems([entrenamiento('a')], db.puerto)
    assert.deepEqual(r.enviados, [])
    assert.deepEqual(r.fallidos.map(f => f.id), ['a'])
  })

  await caso('las lesiones se dejan en la cola mientras el módulo está oculto', async () => {
    const db = baseFalsa()
    const r = await sincronizarItems([{ id: 'l', tipo: 'lesion', creadoEn: 1, payload: {} }], db.puerto)
    assert.deepEqual(r.enviados, [])
    assert.deepEqual(r.omitidos, ['l'])
  })

  await caso('un escaneo de la puerta (acceso) no lo toca la sync de asistencia: sólo omitido', async () => {
    const db = baseFalsa()
    const acceso = { id: 'x', tipo: 'acceso' as const, creadoEn: 1, payload: { tipo: 'qr', qr: '123:456789' } }
    const r = await sincronizarItems([acceso as never, entrenamiento('a')], db.puerto)
    assert.deepEqual(r.omitidos, ['x'])
    assert.equal(r.fallidos.some(f => f.id === 'x'), false)
    assert.equal(r.enviados.includes('x'), false)
  })

  await caso('un payload roto no frena al resto', async () => {
    const db = baseFalsa()
    const roto: ItemCola = { id: 'x', tipo: 'asistencia', creadoEn: 1, payload: { jugadores: 'no' } }
    const r = await sincronizarItems([roto, entrenamiento('a')], db.puerto)
    assert.deepEqual(r.enviados, ['a'])
    assert.deepEqual(r.fallidos.map(f => f.id), ['x'])
  })

  await caso('errores de red reconocibles', () => {
    assert.equal(esErrorDeRed(new TypeError('Network request failed')), true)
    assert.equal(esErrorDeRed({ message: 'TypeError: Failed to fetch' }), true)
    assert.equal(esErrorDeRed({ message: 'new row violates row-level security policy', code: '42501' }), false)
    assert.equal(esErrorDeRed(null), false)
  })

  await caso('después de mandar un entrenamiento se corre la alerta de 4 faltas (partido no)', async () => {
    const db = baseFalsa()
    const llamadas: [string, string[]][] = []
    db.puerto.alSincronizarEntrenamiento = async (div, ids) => { llamadas.push([div, ids]) }
    const partido: ItemCola = {
      id: 'p', tipo: 'asistencia', creadoEn: 1,
      payload: { evento_id: 'partido-9', division_id: 'div-1', registrado_por: 'coach', jugadores: [{ jugador_id: 'j1', estado: 'ausente' }] },
    }
    await sincronizarItems([entrenamiento('a'), partido], db.puerto)
    assert.deepEqual(llamadas, [['div-1', ['j1', 'j2']]])
  })

  await caso('una falla de la alerta no deja la asistencia en la cola', async () => {
    const db = baseFalsa()
    db.puerto.alSincronizarEntrenamiento = async () => { throw new Error('push caído') }
    const r = await sincronizarItems([entrenamiento('a')], db.puerto)
    assert.deepEqual(r.enviados, ['a'])
  })

  await caso('fallas: la de red se reintenta siempre; la permanente suma intentos y al tope sale de la cola', () => {
    const items: ItemCola[] = [
      { ...entrenamiento('red'), intentos: 9 },
      { ...entrenamiento('rls'), intentos: 1 },
      { ...entrenamiento('fk'), intentos: MAX_INTENTOS - 1 },
    ]
    const p = particionarFallidos(items, [
      { id: 'red', error: 'Network request failed', red: true },
      { id: 'rls', error: 'new row violates row-level security policy', red: false },
      { id: 'fk', error: 'violates foreign key constraint', red: false },
    ])
    assert.deepEqual(p.reintentar.map(i => [i.id, i.intentos]), [['red', 9], ['rls', 2]])
    assert.deepEqual(p.descartar.map(i => i.id), ['fk'])
  })

  await caso('el resultado marca qué fallas fueron de red', async () => {
    const r = await sincronizarItems([entrenamiento('a')], baseFalsa({ caida: true }).puerto)
    assert.equal(r.fallidos[0].red, true)
  })

  await caso('guardar online división+fecha saca sólo las no enviadas de esa división y fecha', () => {
    const otraFecha = entrenamiento('b', '2026-10-25')
    const otraDiv: ItemCola = { ...entrenamiento('c'), payload: { ...entrenamiento('c').payload, division_id: 'div-2' } }
    const quedan = sinNoEnviadasDe([entrenamiento('a'), otraFecha, otraDiv], 'div-1', '2026-10-26')
    assert.deepEqual(quedan.map(i => i.id), ['b', 'c'])
  })

  await caso('ids de cola distintos sin crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 200 }, () => nuevoIdCola()))
    assert.equal(ids.size, 200)
  })

  // ─── Escaneos de la puerta sin conexión (T4) ─────────────────────────────────

  const escaneo = (id: string, payload: Record<string, unknown> = { tipo: 'qr', qr: '1234:045123', escaneado_en: '2026-10-27T13:00:00.000Z', rol: 'porteria' }): ItemCola =>
    ({ id, tipo: 'acceso', creadoEn: 1, payload })

  function puertoAccesos(respuesta: (lote: EscaneoOffline[]) => ResultadoAccesoOffline[] | Promise<ResultadoAccesoOffline[]>) {
    const lotes: EscaneoOffline[][] = []
    const puerto: PuertoAccesos = {
      async registrarAccesosOffline(lote) {
        lotes.push(lote)
        return respuesta(lote)
      },
    }
    return { puerto, lotes }
  }

  await caso('el escaneo viaja con el id de la cola como id_cola (idempotencia en el servidor)', async () => {
    const { puerto, lotes } = puertoAccesos(l => l.map(e => ({ id_cola: e.id_cola, estado: 'registrado' })))
    const r = await sincronizarAccesosOffline([escaneo('a1'), entrenamiento('x')], puerto)
    assert.deepEqual(lotes, [[{ id_cola: 'a1', escaneado_en: '2026-10-27T13:00:00.000Z', tipo: 'qr', qr: '1234:045123' }]])
    assert.deepEqual(r.enviados, ['a1'])
    assert.deepEqual(r.omitidos, ['x'], 'la asistencia no es de este envío')
  })

  await caso('registrado y duplicado salen de la cola; no_encontrado e invalido van directo a no enviadas', async () => {
    const { puerto } = puertoAccesos(() => [
      { id_cola: 'r', estado: 'registrado', motivo: 'Código inválido' },
      { id_cola: 'd', estado: 'duplicado' },
      { id_cola: 'n', estado: 'no_encontrado', motivo: 'Socio no encontrado' },
      { id_cola: 'i', estado: 'invalido', motivo: 'Escaneo de hace más de 7 días' },
      { id_cola: 'e', estado: 'error', motivo: 'No se pudo registrar' },
    ])
    const items = ['r', 'd', 'n', 'i', 'e'].map(id => escaneo(id))
    const r = await sincronizarAccesosOffline(items, puerto)
    assert.deepEqual(r.enviados, ['r', 'd'])
    const p = particionarFallidos(items, r.fallidos)
    assert.deepEqual(p.descartar.map(i => i.id), ['n', 'i'], 'definitivos: no se reintentan 5 veces')
    assert.deepEqual(p.reintentar.map(i => [i.id, i.intentos]), [['e', 1]])
  })

  await caso('sin red todo el lote se reintenta sin sumar intentos', async () => {
    const { puerto } = puertoAccesos(() => { throw new TypeError('Network request failed') })
    const items = [escaneo('a'), escaneo('b')]
    const r = await sincronizarAccesosOffline(items, puerto)
    assert.deepEqual(r.fallidos.map(f => [f.id, f.red]), [['a', true], ['b', true]])
    assert.equal(particionarFallidos(items, r.fallidos).reintentar.every(i => !i.intentos), true)
  })

  await caso('un ítem sin respuesta del servidor no se da por enviado', async () => {
    const { puerto } = puertoAccesos(() => [])
    const r = await sincronizarAccesosOffline([escaneo('a')], puerto)
    assert.deepEqual(r.enviados, [])
    assert.equal(r.fallidos[0].red, false)
  })

  await caso('un payload roto no se manda y va directo a no enviadas', async () => {
    const { puerto, lotes } = puertoAccesos(l => l.map(e => ({ id_cola: e.id_cola, estado: 'registrado' })))
    const r = await sincronizarAccesosOffline([escaneo('roto', { tipo: 'qr' })], puerto)
    assert.equal(lotes.length, 0)
    assert.equal(r.fallidos[0].definitivo, true)
  })

  await caso('se manda en tandas de LOTE_ACCESOS_OFFLINE', async () => {
    const { puerto, lotes } = puertoAccesos(l => l.map(e => ({ id_cola: e.id_cola, estado: 'registrado' })))
    const items = Array.from({ length: LOTE_ACCESOS_OFFLINE + 3 }, (_, i) => escaneo(`a${i}`))
    const r = await sincronizarAccesosOffline(items, puerto)
    assert.deepEqual(lotes.map(l => l.length), [LOTE_ACCESOS_OFFLINE, 3])
    assert.equal(r.enviados.length, LOTE_ACCESOS_OFFLINE + 3)
  })

  await caso('el escaneo por DNI viaja con el DNI', async () => {
    const { puerto, lotes } = puertoAccesos(l => l.map(e => ({ id_cola: e.id_cola, estado: 'registrado' })))
    await sincronizarAccesosOffline([escaneo('d1', { tipo: 'dni', dni: '30123456', escaneado_en: '2026-10-27T13:00:00.000Z', rol: 'porteria' })], puerto)
    assert.deepEqual(lotes[0], [{ id_cola: 'd1', escaneado_en: '2026-10-27T13:00:00.000Z', tipo: 'dni', dni: '30123456' }])
  })

  console.log(`\n${casos} casos ok`)
}

main().catch((e) => { console.error(e); process.exit(1) })
