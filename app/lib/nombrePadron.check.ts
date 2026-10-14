// Verificación autocontenida de nombrePadron.ts (no hay runner de tests en app/).
//   npx tsx app/lib/nombrePadron.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { esColumnaInexistente, nombreCarnet } from './nombrePadron'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('carnet: el nombre del padrón gana sobre el editado en Mi perfil', () => {
  assert.equal(nombreCarnet('PEREZ JUAN CARLOS', 'Juanca'), 'PEREZ JUAN CARLOS')
})

caso('carnet: sin nombre del padrón (null / vacío / espacios) → el del perfil', () => {
  assert.equal(nombreCarnet(null, 'Juan Pérez'), 'Juan Pérez')
  assert.equal(nombreCarnet(undefined, 'Juan Pérez'), 'Juan Pérez')
  assert.equal(nombreCarnet('   ', 'Juan Pérez'), 'Juan Pérez')
})

caso('carnet: sin ninguno → guion', () => {
  assert.equal(nombreCarnet(null, null), '—')
  assert.equal(nombreCarnet('', '  '), '—')
})

caso('carnet: recorta espacios', () => {
  assert.equal(nombreCarnet('  PEREZ JUAN  ', null), 'PEREZ JUAN')
})

caso('columna inexistente (migración sin aplicar) → 42703', () => {
  assert.equal(esColumnaInexistente({ code: '42703' }), true)
  assert.equal(esColumnaInexistente({ code: 'PGRST116' }), false)
  assert.equal(esColumnaInexistente(null), false)
})

console.log(`\n${casos} casos OK`)
