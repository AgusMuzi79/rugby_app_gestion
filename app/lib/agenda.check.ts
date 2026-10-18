// Verificación autocontenida de agenda.ts (no hay runner de tests en app/).
//   npx tsx app/lib/agenda.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  AGENDA_VACIA,
  agruparPorFecha,
  etiquetaFecha,
  horaCorta,
  lineaEvento,
  mostrarTabAgenda,
  parsearAgenda,
  puedeVerAgenda,
  ventanaAgenda,
  type DivisionAgenda,
  type EventoAgenda,
} from './agenda'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const M15: DivisionAgenda = { id: 'd1', nombre: 'M15', deporte: 'rugby' }
const SUB14: DivisionAgenda = { id: 'd2', nombre: 'Sub 14', deporte: 'hockey' }

function ev(p: Partial<EventoAgenda>): EventoAgenda {
  return {
    id: 'e', tipo: 'entrenamiento', titulo: null, fecha: '2026-10-20', hora: null,
    lugar: null, rival: null, modalidad: null, division_id: 'd1', ...p,
  }
}

// ─── Visibilidad ──────────────────────────────────────────────────────────────

caso('sin gimnasio ni división no ve la agenda', () => {
  assert.equal(puedeVerAgenda({ tiene_gimnasio: false, divisiones: [] }), false)
})

caso('con gimnasio o con división ve la agenda', () => {
  assert.equal(puedeVerAgenda({ tiene_gimnasio: true, divisiones: [] }), true)
  assert.equal(puedeVerAgenda({ tiene_gimnasio: false, divisiones: [M15] }), true)
  assert.equal(puedeVerAgenda({ tiene_gimnasio: true, divisiones: [M15, SUB14] }), true)
})

caso('la pestaña queda oculta mientras carga', () => {
  assert.equal(mostrarTabAgenda({ loading: true, error: null, agenda: null }), false)
})

caso('si la carga falla la pestaña se muestra (la pantalla ofrece Reintentar)', () => {
  assert.equal(mostrarTabAgenda({ loading: false, error: 'x', agenda: null }), true)
})

caso('cargada, la pestaña sigue a puedeVerAgenda', () => {
  assert.equal(mostrarTabAgenda({ loading: false, error: null, agenda: AGENDA_VACIA }), false)
  assert.equal(
    mostrarTabAgenda({ loading: false, error: null, agenda: { ...AGENDA_VACIA, tiene_gimnasio: true } }),
    true,
  )
})

caso('una recarga en curso no oculta una pestaña ya visible', () => {
  assert.equal(
    mostrarTabAgenda({ loading: true, error: null, agenda: { ...AGENDA_VACIA, divisiones: [M15] } }),
    true,
  )
})

// ─── Parseo de la respuesta del RPC ───────────────────────────────────────────

caso('respuesta nula o mal formada cae en agenda vacía', () => {
  assert.deepEqual(parsearAgenda(null), AGENDA_VACIA)
  assert.deepEqual(parsearAgenda('x'), AGENDA_VACIA)
  assert.deepEqual(parsearAgenda({ tiene_gimnasio: 'si', divisiones: 3 }), AGENDA_VACIA)
})

caso('respuesta válida se conserva', () => {
  const raw = { tiene_gimnasio: true, divisiones: [M15], eventos: [ev({ id: 'a' })] }
  assert.deepEqual(parsearAgenda(raw), raw)
})

// ─── Agrupado por fecha ───────────────────────────────────────────────────────

caso('agrupa por fecha en orden de fecha y hora', () => {
  const grupos = agruparPorFecha([
    ev({ id: 'c', fecha: '2026-10-22', hora: '10:00:00' }),
    ev({ id: 'b', fecha: '2026-10-20', hora: '19:00:00' }),
    ev({ id: 'a', fecha: '2026-10-20', hora: '08:30:00' }),
    ev({ id: 'd', fecha: '2026-10-20', hora: null }),
  ])
  assert.deepEqual(grupos.map(g => g.fecha), ['2026-10-20', '2026-10-22'])
  assert.deepEqual(grupos[0].eventos.map(e => e.id), ['a', 'b', 'd'])
  assert.deepEqual(grupos[1].eventos.map(e => e.id), ['c'])
})

caso('sin eventos no hay grupos', () => {
  assert.deepEqual(agruparPorFecha([]), [])
})

caso('etiqueta de fecha con día de semana', () => {
  assert.equal(etiquetaFecha('2026-10-20'), 'MARTES 20/10')
  assert.equal(etiquetaFecha('2026-10-25'), 'DOMINGO 25/10')
})

caso('hora corta HH:MM o null', () => {
  assert.equal(horaCorta('19:30:00'), '19:30')
  assert.equal(horaCorta('08:00'), '08:00')
  assert.equal(horaCorta(null), null)
})

// ─── Línea visible ────────────────────────────────────────────────────────────

caso('entrenamiento con una sola división: sólo la etiqueta', () => {
  assert.equal(lineaEvento(ev({ tipo: 'entrenamiento' }), [M15]), 'Entrenamiento')
})

caso('partido muestra el rival', () => {
  assert.equal(lineaEvento(ev({ tipo: 'partido', rival: 'Los Tilos' }), [M15]), 'Partido vs Los Tilos')
})

caso('partido sin rival no muestra "vs"', () => {
  assert.equal(lineaEvento(ev({ tipo: 'partido', rival: '  ' }), [M15]), 'Partido')
})

caso('actividad usa su título', () => {
  assert.equal(lineaEvento(ev({ tipo: 'actividad', titulo: 'Charla de nutrición' }), [M15]), 'Charla de nutrición')
})

caso('con más de una división se agrega el nombre de la división', () => {
  assert.equal(
    lineaEvento(ev({ tipo: 'partido', rival: 'SIC', division_id: 'd2' }), [M15, SUB14]),
    'Partido vs SIC · Sub 14',
  )
  assert.equal(lineaEvento(ev({ division_id: 'd1' }), [M15, SUB14]), 'Entrenamiento · M15')
})

caso('la ventana va de hoy a 7 días adelante, en fecha local', () => {
  assert.deepEqual(ventanaAgenda(new Date(2026, 9, 18, 23, 30)), { p_desde: '2026-10-18', p_hasta: '2026-10-25' })
})

caso('la ventana cruza fin de mes y de año', () => {
  assert.deepEqual(ventanaAgenda(new Date(2026, 11, 28, 9, 0)), { p_desde: '2026-12-28', p_hasta: '2027-01-04' })
})

console.log(`\n${casos} casos OK`)
