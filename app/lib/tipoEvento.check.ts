// Verificación autocontenida de tipoEvento.ts (no hay runner de tests en app/).
//   npx tsx app/lib/tipoEvento.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  admiteAsistencia,
  etiquetaEvento,
  letraEvento,
  tituloActividadValido,
  tituloCancelacion,
} from './tipoEvento'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Etiqueta ─────────────────────────────────────────────────────────────────

caso('partido y entrenamiento conservan su etiqueta', () => {
  assert.equal(etiquetaEvento({ tipo: 'partido', titulo: null }), 'Partido')
  assert.equal(etiquetaEvento({ tipo: 'entrenamiento', titulo: null }), 'Entrenamiento')
})

caso('una actividad se muestra con su título recortado', () => {
  assert.equal(etiquetaEvento({ tipo: 'actividad', titulo: '  Charla de nutrición ' }), 'Charla de nutrición')
})

caso('una actividad sin título cae en "Actividad"', () => {
  assert.equal(etiquetaEvento({ tipo: 'actividad', titulo: null }), 'Actividad')
  assert.equal(etiquetaEvento({ tipo: 'actividad', titulo: '   ' }), 'Actividad')
  assert.equal(etiquetaEvento({ tipo: 'actividad' }), 'Actividad')
})

caso('el título se ignora fuera de actividad', () => {
  assert.equal(etiquetaEvento({ tipo: 'entrenamiento', titulo: 'Otra cosa' }), 'Entrenamiento')
})

caso('un tipo desconocido no se muestra como entrenamiento', () => {
  assert.equal(etiquetaEvento({ tipo: 'otro', titulo: null }), 'Evento')
})

// ─── Título de la noticia / push de cancelación ───────────────────────────────

caso('cancelación de entrenamiento y partido sin cambios', () => {
  assert.equal(tituloCancelacion({ tipo: 'entrenamiento' }, 'M15'), 'Entrenamiento cancelado — M15')
  assert.equal(tituloCancelacion({ tipo: 'partido' }, 'M15'), 'Partido cancelado — M15')
})

caso('cancelación de actividad usa su título sin forzar el género', () => {
  assert.equal(
    tituloCancelacion({ tipo: 'actividad', titulo: 'Charla de nutrición' }, 'Plantel Superior'),
    'Cancelado: Charla de nutrición — Plantel Superior',
  )
})

// ─── Letra del badge ──────────────────────────────────────────────────────────

caso('letra del badge por tipo', () => {
  assert.equal(letraEvento('partido'), 'P')
  assert.equal(letraEvento('entrenamiento'), 'E')
  assert.equal(letraEvento('actividad'), 'A')
})

// ─── Asistencia ───────────────────────────────────────────────────────────────

caso('entrenamiento y partido admiten asistencia (sin cambios)', () => {
  assert.equal(admiteAsistencia('entrenamiento'), true)
  assert.equal(admiteAsistencia('partido'), true)
})

caso('actividad no admite asistencia ni cuenta para estadísticas', () => {
  assert.equal(admiteAsistencia('actividad'), false)
})

// ─── Validación del título ────────────────────────────────────────────────────

caso('título de actividad: obligatorio y no vacío', () => {
  assert.equal(tituloActividadValido('Test de gimnasio'), true)
  assert.equal(tituloActividadValido(''), false)
  assert.equal(tituloActividadValido('   '), false)
})

console.log(`\n${casos} casos OK`)
