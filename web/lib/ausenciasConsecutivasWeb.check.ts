// Verificación autocontenida de ausenciasConsecutivasWeb.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/ausenciasConsecutivasWeb.check.ts
// Casos portados de app/lib/ausenciasConsecutivas.check.ts. Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  jugadoresQueLleganAlTope, rachaDeAusencias, marcasDelGuardado, VENTANA_EVENTOS,
  type FilaHistorial,
} from './ausenciasConsecutivasWeb'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const EVENTOS = ['e5', 'e4', 'e3', 'e2', 'e1']

function filas(jugador: string, estados: Record<string, string>): FilaHistorial[] {
  return Object.entries(estados).map(([evento_id, estado]) => ({ jugador_id: jugador, evento_id, estado }))
}

caso('ventana de 12 eventos, como la app', () => {
  assert.equal(VENTANA_EVENTOS, 12)
})

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
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]), ['a'])
})

caso('volver a guardar la misma lista no vuelve a avisar', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' })
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: 'ausente' }]), [])
})

caso('la 5ª falta seguida no repite el aviso', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente', e1: 'ausente' })
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]), [])
})

caso('corregir de presente a ausente también puede completar la 4ª', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' })
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, historial, 'e5', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: 'presente' }]), ['a'])
})

caso('un evento viejo (fuera de los recientes) no avisa', () => {
  const historial = filas('a', { e5: 'ausente', e4: 'ausente', e3: 'ausente', e2: 'ausente' })
  assert.deepEqual(jugadoresQueLleganAlTope(EVENTOS, historial, 'e0', [{ jugador_id: 'a', estado: 'ausente', estadoPrevio: null }]), [])
})

caso('marcas del guardado: estado nuevo y el que había (null = sin fila)', () => {
  assert.deepEqual(
    marcasDelGuardado(
      [{ id: 'a', presente: true }, { id: 'b', presente: false }],
      { b: 'presente' },
    ),
    [
      { jugador_id: 'a', estado: 'presente', estadoPrevio: null },
      { jugador_id: 'b', estado: 'ausente', estadoPrevio: 'presente' },
    ],
  )
})

console.log(`\n${casos} casos ok`)
