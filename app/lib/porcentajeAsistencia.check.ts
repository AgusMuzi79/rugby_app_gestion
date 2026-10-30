// Verificación autocontenida de porcentajeAsistencia.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/porcentajeAsistencia.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { estadisticaJugador, eventosQueCuentan, porcentajeDivision } from './porcentajeAsistencia'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-10-29'
const EVENTOS = [
  { id: 'e1', fecha: '2026-10-20', tipo: 'entrenamiento' },
  { id: 'e2', fecha: '2026-10-22', tipo: 'entrenamiento' },
  { id: 'e3', fecha: '2026-10-24', tipo: 'partido' },
  { id: 'e4', fecha: '2026-10-27', tipo: 'entrenamiento' }, // sin lista tomada
  { id: 'act', fecha: '2026-10-25', tipo: 'actividad' },
  { id: 'hoy', fecha: HOY, tipo: 'entrenamiento' },
]
const CUENTAN = eventosQueCuentan(EVENTOS, HOY)

caso('no cuentan el evento de hoy (todavía no pasó) ni las actividades', () => {
  assert.deepEqual([...CUENTAN].sort(), ['e1', 'e2', 'e3', 'e4'])
})

caso('un evento sin lista no cuenta como falta (antes: 4 eventos → 2/4 = 50 %)', () => {
  const filas = [
    { jugador_id: 'a', evento_id: 'e1', estado: 'presente' },
    { jugador_id: 'a', evento_id: 'e2', estado: 'presente' },
    { jugador_id: 'a', evento_id: 'e3', estado: 'ausente' },
  ]
  assert.deepEqual(estadisticaJugador('a', filas, CUENTAN), { presentes: 2, total: 3, porcentaje: 67 })
})

caso('justificado no suma ni resta: fuera del numerador y del denominador', () => {
  const filas = [
    { jugador_id: 'a', evento_id: 'e1', estado: 'presente' },
    { jugador_id: 'a', evento_id: 'e2', estado: 'justificado' },
    { jugador_id: 'a', evento_id: 'e3', estado: 'ausente' },
  ]
  assert.deepEqual(estadisticaJugador('a', filas, CUENTAN), { presentes: 1, total: 2, porcentaje: 50 })
})

caso('la lista de hoy no entra todavía', () => {
  const filas = [
    { jugador_id: 'a', evento_id: 'e1', estado: 'presente' },
    { jugador_id: 'a', evento_id: 'hoy', estado: 'ausente' },
  ]
  assert.deepEqual(estadisticaJugador('a', filas, CUENTAN), { presentes: 1, total: 1, porcentaje: 100 })
})

caso('cada jugador con su denominador: el que se sumó hace poco no se divide por todo el mes', () => {
  const filas = [
    { jugador_id: 'viejo', evento_id: 'e1', estado: 'presente' },
    { jugador_id: 'viejo', evento_id: 'e2', estado: 'ausente' },
    { jugador_id: 'viejo', evento_id: 'e3', estado: 'presente' },
    { jugador_id: 'nuevo', evento_id: 'e3', estado: 'presente' },
  ]
  assert.equal(estadisticaJugador('viejo', filas, CUENTAN).total, 3)
  assert.deepEqual(estadisticaJugador('nuevo', filas, CUENTAN), { presentes: 1, total: 1, porcentaje: 100 })
})

caso('sin filas que cuenten (o sólo justificadas): porcentaje null, no 0 %', () => {
  assert.deepEqual(estadisticaJugador('a', [], CUENTAN), { presentes: 0, total: 0, porcentaje: null })
  assert.deepEqual(
    estadisticaJugador('a', [{ jugador_id: 'a', evento_id: 'e1', estado: 'justificado' }], CUENTAN),
    { presentes: 0, total: 0, porcentaje: null },
  )
})

caso('barra de la división (Inicio del coordinador): mismo criterio sobre todas las filas', () => {
  const filas = [
    { jugador_id: 'a', evento_id: 'e1', estado: 'presente' },
    { jugador_id: 'b', evento_id: 'e1', estado: 'ausente' },
    { jugador_id: 'c', evento_id: 'e1', estado: 'justificado' },
    { jugador_id: 'a', evento_id: 'hoy', estado: 'ausente' },
  ]
  assert.equal(porcentajeDivision(filas, CUENTAN), 50)
  assert.equal(porcentajeDivision([], CUENTAN), null)
})

console.log(`\n${casos} casos ok`)
