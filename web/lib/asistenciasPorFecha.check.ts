// Verificación autocontenida de asistenciasPorFecha.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/asistenciasPorFecha.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  asistenciasPorFecha, restarDias,
  type EventoFecha, type FilaFecha, type JugadorFecha,
} from './asistenciasPorFecha'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-11-10'

function ev(id: string, fecha: string, extra: Partial<EventoFecha> = {}): EventoFecha {
  return { id, division_id: 'm19', fecha, tipo: 'entrenamiento', hora: null, rival: null, created_at: `${fecha}T00:00:00Z`, ...extra }
}
function jug(id: string, nombre: string, extra: Partial<JugadorFecha> = {}): JugadorFecha {
  return { id, nombre_completo: nombre, division_id: 'm19', activo: true, ...extra }
}
function fila(evento_id: string, jugador_id: string, estado: string): FilaFecha {
  return { evento_id, jugador_id, estado }
}

const ana = jug('j1', 'Ana Pérez')
const beto = jug('j2', 'Beto Álvarez')
const caro = jug('j3', 'Caro Díaz')
const dani = jug('j4', 'Dani Gómez')

caso('counts presentes / ausentes / justificados and sin marcar, with names sorted', () => {
  const r = asistenciasPorFecha(
    [ana, beto, caro, dani],
    [ev('e1', '2026-11-05')],
    [fila('e1', 'j1', 'presente'), fila('e1', 'j3', 'presente'), fila('e1', 'j2', 'ausente'), fila('e1', 'j4', 'justificado')],
    HOY,
  )
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].presentes.map(j => j.nombre_completo), ['Ana Pérez', 'Caro Díaz'])
  assert.deepEqual(r[0].ausentes.map(j => j.id), ['j2'])
  assert.deepEqual(r[0].justificados.map(j => j.id), ['j4'])
  assert.deepEqual(r[0].sinMarcar, [])
})

caso('an active player of the division without a row is sin marcar', () => {
  const r = asistenciasPorFecha([ana, beto], [ev('e1', '2026-11-05')], [fila('e1', 'j1', 'presente')], HOY)
  assert.deepEqual(r[0].sinMarcar.map(j => j.id), ['j2'])
})

caso('an inactive player is never sin marcar, but a saved row still shows with its name', () => {
  const baja = jug('j5', 'Eva Baja', { activo: false })
  const r = asistenciasPorFecha([ana, baja], [ev('e1', '2026-11-05')], [fila('e1', 'j5', 'ausente')], HOY)
  assert.deepEqual(r[0].ausentes.map(j => j.nombre_completo), ['Eva Baja'])
  assert.deepEqual(r[0].sinMarcar.map(j => j.id), ['j1'])
})

caso('a row of an unknown player still counts, with a fallback name', () => {
  const r = asistenciasPorFecha([], [ev('e1', '2026-11-05')], [fila('e1', 'jx', 'presente')], HOY)
  assert.equal(r[0].presentes.length, 1)
  assert.equal(r[0].presentes[0].nombre_completo, 'Jugador sin datos')
})

caso('players of another division are not sin marcar for this event', () => {
  const otro = jug('j9', 'Otro M20', { division_id: 'm20' })
  const r = asistenciasPorFecha([ana, otro], [ev('e1', '2026-11-05')], [fila('e1', 'j1', 'presente')], HOY)
  assert.deepEqual(r[0].sinMarcar, [])
})

caso('activities and future events are left out; today is included', () => {
  const r = asistenciasPorFecha(
    [ana],
    [ev('act', '2026-11-05', { tipo: 'actividad' }), ev('fut', '2026-11-11'), ev('hoy', HOY), ev('par', '2026-11-08', { tipo: 'partido', rival: 'CASI' })],
    [],
    HOY,
  )
  assert.deepEqual(r.map(x => x.evento.id), ['hoy', 'par'])
})

caso('newest first: fecha, then hora (without hora after), then created_at', () => {
  const r = asistenciasPorFecha([], [
    ev('a', '2026-11-01'),
    ev('b', '2026-11-03', { hora: '18:00:00' }),
    ev('c', '2026-11-03', { hora: '20:30:00' }),
    ev('d', '2026-11-03'),
    ev('e', '2026-11-02', { created_at: '2026-11-02T10:00:00Z' }),
    ev('f', '2026-11-02', { created_at: '2026-11-02T12:00:00Z' }),
  ], [], HOY)
  assert.deepEqual(r.map(x => x.evento.id), ['c', 'b', 'd', 'f', 'e', 'a'])
})

caso('desde keeps events on or after that date', () => {
  const r = asistenciasPorFecha([], [ev('a', '2026-10-10'), ev('b', '2026-10-11'), ev('c', '2026-11-01')], [], HOY, '2026-10-11')
  assert.deepEqual(r.map(x => x.evento.id), ['c', 'b'])
})

caso('restarDias works across months and years', () => {
  assert.equal(restarDias('2026-11-10', 30), '2026-10-11')
  assert.equal(restarDias('2026-01-15', 30), '2025-12-16')
  assert.equal(restarDias('2026-03-01', 1), '2026-02-28')
  assert.equal(restarDias('2026-11-10', 0), '2026-11-10')
})

console.log(`\n${casos} casos ok`)
