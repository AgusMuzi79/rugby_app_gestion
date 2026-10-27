// Verificación autocontenida de bajas-import.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/bajas-import.check.ts

import assert from 'node:assert/strict'
import { CONFIRMACION_BAJAS, bajaMasivaConfirmada, esBajaMasiva, etiquetaMotivoBaja, nombreBaja, umbralBajaMasiva } from './bajas-import.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('motivo legible en vez de "ausencia" / "cesante"', () => {
  assert.equal(etiquetaMotivoBaja('ausencia'), 'No está en el padrón')
  assert.equal(etiquetaMotivoBaja('cesante'), 'Cesante en el padrón')
})

caso('una baja por ausencia muestra el nombre del padrón guardado (antes "—")', () => {
  assert.equal(nombreBaja(undefined, 'GOMEZ, ANA'), 'GOMEZ, ANA')
  assert.equal(nombreBaja('PEREZ, JUAN', 'otro'), 'PEREZ, JUAN')
  assert.equal(nombreBaja(undefined, null), '')
  // Fila con nombre vacío en el archivo: también usa el guardado.
  assert.equal(nombreBaja('  ', 'GOMEZ, ANA'), 'GOMEZ, ANA')
})

caso('umbral: el mayor entre 20 y el 3 % de los activos', () => {
  assert.equal(umbralBajaMasiva(100), 20)
  assert.equal(umbralBajaMasiva(1500), 45)
})

caso('baja masiva = más bajas que el umbral', () => {
  assert.equal(esBajaMasiva(20, 100), false)
  assert.equal(esBajaMasiva(21, 100), true)
  assert.equal(esBajaMasiva(45, 1500), false)
  assert.equal(esBajaMasiva(46, 1500), true)
  // Archivo equivocado o recortado: se irían cientos de socios.
  assert.equal(esBajaMasiva(1400, 1500), true)
})

caso('una baja masiva se aplica sólo con "BAJAS" tipeado', () => {
  assert.equal(CONFIRMACION_BAJAS, 'BAJAS')
  assert.equal(bajaMasivaConfirmada(true, null), false)
  assert.equal(bajaMasivaConfirmada(true, 'bajas'), false)
  assert.equal(bajaMasivaConfirmada(true, ' BAJAS '), true)
  assert.equal(bajaMasivaConfirmada(false, null), true)
})

console.log(`\n${casos} casos ok`)
