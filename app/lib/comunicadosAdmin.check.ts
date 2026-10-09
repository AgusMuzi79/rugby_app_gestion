// Verificación autocontenida de comunicadosAdmin.ts (no hay runner de tests en la app).
//   npx tsx app/lib/comunicadosAdmin.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { normalizarAudiencia, resultadoBorrado } from './comunicadosAdmin'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Audiencia ────────────────────────────────────────────────────────────────

caso('cuerpo_tecnico se mantiene', () => {
  assert.equal(normalizarAudiencia('cuerpo_tecnico'), 'cuerpo_tecnico')
})
caso('todos se mantiene', () => {
  assert.equal(normalizarAudiencia('todos'), 'todos')
})
caso('un valor desconocido no se convierte en "todos"', () => {
  assert.equal(normalizarAudiencia('socios'), 'desconocida')
})
caso('null, undefined y no-strings son desconocida', () => {
  assert.equal(normalizarAudiencia(null), 'desconocida')
  assert.equal(normalizarAudiencia(undefined), 'desconocida')
  assert.equal(normalizarAudiencia(42), 'desconocida')
  assert.equal(normalizarAudiencia(''), 'desconocida')
})

// ─── Borrado ──────────────────────────────────────────────────────────────────

caso('borrado con una fila devuelta es ok', () => {
  assert.equal(resultadoBorrado(null, [{ id: 'a' }]), 'ok')
})
caso('borrado sin error pero sin filas (RLS o ya eliminado) es sin_filas', () => {
  assert.equal(resultadoBorrado(null, []), 'sin_filas')
  assert.equal(resultadoBorrado(null, null), 'sin_filas')
})
caso('borrado con error es error, aunque vengan filas', () => {
  assert.equal(resultadoBorrado({ message: 'boom' }, null), 'error')
  assert.equal(resultadoBorrado({ message: 'boom' }, [{ id: 'a' }]), 'error')
})

console.log(`\n${casos} casos ok`)
