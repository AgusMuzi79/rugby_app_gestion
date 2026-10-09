// Verificación autocontenida de sistemaAdmin.ts (no hay runner de tests en la app).
//   npx tsx app/lib/sistemaAdmin.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { conteoOVacio, seccionOVacia } from './sistemaAdmin'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Secciones ────────────────────────────────────────────────────────────────

caso('una sección con error es null (no disponible), no lista vacía', () => {
  assert.equal(seccionOVacia({ data: null, error: { message: 'rls' } }), null)
  assert.equal(seccionOVacia({ data: [{ id: 1 }], error: { message: 'rls' } }), null)
})
caso('una sección sin error devuelve sus filas', () => {
  assert.deepEqual(seccionOVacia({ data: [{ id: 1 }], error: null }), [{ id: 1 }])
})
caso('una sección sin error y sin data es lista vacía', () => {
  assert.deepEqual(seccionOVacia({ data: null, error: null }), [])
})

// ─── Conteo ───────────────────────────────────────────────────────────────────

caso('un conteo con error es null', () => {
  assert.equal(conteoOVacio({ count: 5, error: { message: 'rls' } }), null)
})
caso('un conteo sin error devuelve el número', () => {
  assert.equal(conteoOVacio({ count: 12, error: null }), 12)
})
caso('un conteo sin error y sin count es 0', () => {
  assert.equal(conteoOVacio({ count: null, error: null }), 0)
})

console.log(`\n${casos} casos ok`)
