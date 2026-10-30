// Verificación autocontenida de entrenamientoHoy.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/entrenamientoHoy.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { accionDelEvento, elegirEntrenamiento, etiquetaEntrenamiento, minutosDeHora } from './entrenamientoHoy'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-10-29'

caso('inicio: TOMAR ASISTENCIA sólo para el entrenamiento de hoy', () => {
  assert.equal(accionDelEvento({ tipo: 'entrenamiento', fecha: HOY }, HOY), 'asistencia')
  // Antes el botón salía para el próximo evento de cualquier día y la asistencia
  // caía en un entrenamiento fantasma creado hoy.
  assert.equal(accionDelEvento({ tipo: 'entrenamiento', fecha: '2026-10-30' }, HOY), null)
})

caso('inicio: un partido de hoy va a la pantalla Partido; uno de otro día no tiene botón', () => {
  assert.equal(accionDelEvento({ tipo: 'partido', fecha: HOY }, HOY), 'partido')
  assert.equal(accionDelEvento({ tipo: 'partido', fecha: '2026-11-01' }, HOY), null)
})

caso('inicio: una actividad no toma asistencia', () => {
  assert.equal(accionDelEvento({ tipo: 'actividad', fecha: HOY }, HOY), null)
})

caso('hora "20:30:00" → minutos; sin hora → null', () => {
  assert.equal(minutosDeHora('20:30:00'), 20 * 60 + 30)
  assert.equal(minutosDeHora('08:05'), 8 * 60 + 5)
  assert.equal(minutosDeHora(null), null)
  assert.equal(minutosDeHora('basura'), null)
})

const doble = [
  { id: 'gim', hora: '19:00:00' },
  { id: 'cancha', hora: '21:00:00' },
]

caso('sin entrenamientos hoy → null (se crea al guardar)', () => {
  assert.equal(elegirEntrenamiento([], undefined, 600), null)
  assert.equal(elegirEntrenamiento([], 'otro', 600), null)
})

caso('uno solo → ese', () => {
  assert.equal(elegirEntrenamiento([{ id: 'unico', hora: null }], undefined, 600), 'unico')
})

caso('doble turno: el pedido desde Inicio gana', () => {
  assert.equal(elegirEntrenamiento(doble, 'cancha', 19 * 60), 'cancha')
})

caso('doble turno sin pedido (o pedido que no es de hoy): el de hora más cercana a ahora', () => {
  assert.equal(elegirEntrenamiento(doble, undefined, 18 * 60), 'gim')
  assert.equal(elegirEntrenamiento(doble, undefined, 20 * 60 + 30), 'cancha')
  assert.equal(elegirEntrenamiento(doble, 'de-ayer', 22 * 60), 'cancha')
})

caso('doble turno sin hora cargada: el primero de la lista', () => {
  assert.equal(elegirEntrenamiento([{ id: 'a', hora: null }, { id: 'b', hora: null }], undefined, 600), 'a')
  assert.equal(elegirEntrenamiento([{ id: 'a', hora: null }, { id: 'b', hora: '10:00' }], undefined, 600), 'b')
})

caso('etiqueta del chip: la hora, o "Turno N" si no tiene', () => {
  assert.equal(etiquetaEntrenamiento({ id: 'a', hora: '20:30:00' }, 0), '20:30')
  assert.equal(etiquetaEntrenamiento({ id: 'b', hora: null }, 1), 'Turno 2')
})

console.log(`\n${casos} casos ok`)
