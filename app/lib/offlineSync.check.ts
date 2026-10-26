// Verificación autocontenida de offlineSync.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/offlineSync.check.ts

import assert from 'node:assert/strict'
import { esErrorDeRed, nuevoIdCola, sincronizarItems, type FilaAsistencia, type PuertoSync } from './offlineSync'
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

  await caso('ids de cola distintos sin crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 200 }, () => nuevoIdCola()))
    assert.equal(ids.size, 200)
  })

  console.log(`\n${casos} casos ok`)
}

main().catch((e) => { console.error(e); process.exit(1) })
