// Verificación autocontenida de ausenciasConsecutivas.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/ausenciasConsecutivas.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { jugadoresQueLleganAlTope, rachaDeAusencias, type FilaHistorial } from './ausenciasConsecutivas'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Eventos de la división, el más reciente primero: hoy es e5.
const EVENTOS = ['e5', 'e4', 'e3', 'e2', 'e1']

function filas(jugador: string, estados: Record<string, string>): FilaHistorial[] {
  return Object.entries(estados).map(([evento_id, estado]) => ({ jugador_id: jugador, evento_id, estado }))
}

caso('racha: cuenta ausentes seguidos desde el más reciente; presente o justificado la corta', () => {
  assert.equal(rachaDeAusencias(EVENTOS, filas('a', { e5: 'ausente', e4: 'ausente', e3: 'presente', e2: 'ausente' }), 'a'), 2)
  assert.equal(rachaDeAusencias(EVENTOS, filas('a', { e5: 'ausente', e4: 'justificado', e3: 'ausente' }), 'a'), 1)
  assert.equal(rachaDeAusencias(EVENTOS, [], 'a'), 0)
})

caso('racha: un evento sin fila del jugador no corta ni suma', () => {
  assert.equal(rachaDeAusencias(EVENTOS, filas('a', { e5: 'ausente', e3: 'ausente', e2: 'ausente', e1: 'ausente' }), 'a'), 4)
})

caso('esta carga hace la 4ª falta seguida → se avisa', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente', e1: 'presente' })
  assert.deepEqual(
    jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]),
    ['a'],
  )
})

caso('volver a guardar la misma lista no vuelve a avisar (antes mandaba el push en cada guardado)', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' })
  assert.deepEqual(
    jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: 'ausente' }]),
    [],
  )
})

caso('la 5ª falta seguida no repite el aviso (ya se avisó en la 4ª)', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente', e1: 'ausente' })
  assert.deepEqual(
    jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]),
    [],
  )
})

caso('corregir de presente a ausente también puede completar la 4ª', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' })
  assert.deepEqual(
    jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: 'presente' }]),
    ['a'],
  )
})

caso('3 faltas, o presente hoy: nada', () => {
  const tres = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'presente' })
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, tres, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]), [])
  const hoyPresente = filas('b', { e5: 'presente', e4: 'ausente', e3: 'ausente', e2: 'ausente', e1: 'ausente' })
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, hoyPresente, 'e5', [{ jugador_id: 'b', estado: 'presente', estadoPrevio: null }]), [])
})

caso('una carga de un evento viejo (fuera de los recientes) no cambia la racha: no avisa', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' })
  assert.deepEqual(
    jugadoresQueLleganAlTope(EVENTOS, historial, 'e0', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]),
    [],
  )
})

caso('varios jugadores en una sola pasada: sólo los que cruzan', () => {
  const historial = [
    ...filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' }),
    ...filas('b', { e5: 'ausente', e4: 'presente' }),
    ...filas('c', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' }),
  ]
  assert.deepEqual(
    jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [
      { jugador_id: 'a', estado: 'ausente', estadoPrevio: null },
      { jugador_id: 'b', estado: 'ausente', estadoPrevio: null },
      { jugador_id: 'c', estado: 'ausente', estadoPrevio: 'ausente' },
    ]),
    ['a'],
  )
})

console.log(`\n${casos} casos ok`)
