// Verificación autocontenida de cronica.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/cronica.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  alcanceCronica, tiposNotificacion, ordenarFeed,
  itemFichaje, itemResultado, itemNotificacion, type FeedItem,
} from './cronica'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('alcance: subcomisión y admin ven todo el club (lo recorta la RLS)', () => {
  assert.deepEqual(alcanceCronica('subcomision', ['a']), { todas: true })
  assert.deepEqual(alcanceCronica('admin', []), { todas: true })
})

caso('alcance: entrenador, coordinador y manager ven TODAS sus divisiones, no sólo la primera', () => {
  for (const rol of ['entrenador', 'coordinador', 'manager']) {
    assert.deepEqual(alcanceCronica(rol, ['m15', 'm16', 'm17']), { todas: false, divisiones: ['m15', 'm16', 'm17'] })
  }
  // Sin divisiones asignadas no hay nada de división que mostrar.
  assert.deepEqual(alcanceCronica('entrenador', []), { todas: false, divisiones: [] })
})

caso('notificaciones: subcomisión ve también las manuales; el resto sólo las de 4 ausencias', () => {
  assert.deepEqual(tiposNotificacion('subcomision'), ['ausencias_consecutivas', 'manual'])
  assert.deepEqual(tiposNotificacion('admin'), ['ausencias_consecutivas', 'manual'])
  assert.deepEqual(tiposNotificacion('coordinador'), ['ausencias_consecutivas'])
})

caso('fichaje: sale de la tabla fichajes (jugador embebido), con ruta sólo para el manager', () => {
  const fila = {
    id: 'f1', created_at: '2026-10-28T12:00:00Z',
    jugadores: { nombre_completo: 'Juan Pérez', division_id: 'm15', divisiones: { nombre: 'M15' } },
  }
  const it = itemFichaje(fila, 'manager')
  assert.equal(it.id, 'fichaje-f1')
  assert.equal(it.tipo, 'FICHAJE')
  assert.equal(it.titulo, 'Nuevo fichaje — Juan Pérez')
  assert.equal(it.desc, 'M15')
  assert.equal(it.createdAt, '2026-10-28T12:00:00Z')
  assert.equal(it.route, '/(manager)/fichajes')
  assert.equal(itemFichaje(fila, 'coordinador').route, null)
})

caso('resultado: título con rival y ruta sólo para el entrenador', () => {
  const fila = { id: 'r1', created_at: '2026-10-27T10:00:00Z', eventos: { rival: 'CASI', divisiones: { nombre: 'M16' } } }
  assert.equal(itemResultado(fila, 'entrenador').titulo, 'Resultado registrado — vs CASI')
  assert.equal(itemResultado(fila, 'entrenador').route, '/(entrenador)/partido')
  assert.equal(itemResultado({ ...fila, eventos: { rival: null, divisiones: null } }, 'manager').titulo, 'Resultado registrado')
})

caso('notificación: 4 ausencias → ASISTENCIA; manual → INFO con el mensaje completo', () => {
  const largo = 'x'.repeat(100)
  const info = itemNotificacion({ id: 'n1', titulo: 'Aviso', mensaje: largo, tipo: 'manual', created_at: '2026-10-26T00:00:00Z' }, 'subcomision')
  assert.equal(info.tipo, 'INFO')
  assert.equal(info.desc, 'x'.repeat(80) + '…')
  assert.equal(info.mensaje, largo)
  const asis = itemNotificacion({ id: 'n2', titulo: '4 ausencias', mensaje: 'corto', tipo: 'ausencias_consecutivas', created_at: '2026-10-26T00:00:00Z' }, 'coordinador')
  assert.equal(asis.tipo, 'ASISTENCIA')
  assert.equal(asis.route, '/(coordinador)/asistencia')
  assert.equal(asis.mensaje, null)
})

caso('feed: mezcla las listas, lo más nuevo primero y sin repetidos', () => {
  const base = { tipo: 'INFO' as const, titulo: '', desc: '', autor: '', urgente: false, route: null, mensaje: null }
  const a: FeedItem = { ...base, id: 'a', createdAt: '2026-10-25T00:00:00Z' }
  const b: FeedItem = { ...base, id: 'b', createdAt: '2026-10-28T00:00:00Z' }
  const c: FeedItem = { ...base, id: 'c', createdAt: '2026-10-26T00:00:00Z' }
  assert.deepEqual(ordenarFeed([a], [b, c], [b]).map(i => i.id), ['b', 'c', 'a'])
  assert.deepEqual(ordenarFeed([], []), [])
})

console.log(`\n${casos} casos ok`)
