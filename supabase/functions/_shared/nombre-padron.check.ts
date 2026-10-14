// Verificación autocontenida de nombre-padron.ts (nombre del padrón NUVIX en
// socios.nombre_padron, auditoría UX socio T12); no hay runner de tests en el
// repo ni Deno local. Desde la raíz del repo:
//   npx --yes tsx supabase/functions/_shared/nombre-padron.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { nombrePadronACambiar, nombreVisible } from './nombre-padron.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('importador: mismo nombre del padrón → no cambia', () => {
  assert.equal(nombrePadronACambiar('PEREZ JUAN', 'PEREZ JUAN'), null)
})

caso('importador: el padrón trae otro nombre → se escribe', () => {
  assert.equal(nombrePadronACambiar('PEREZ GOMEZ JUAN', 'PEREZ JUAN'), 'PEREZ GOMEZ JUAN')
})

caso('importador: socio sin nombre_padron (alta manual) → se completa', () => {
  assert.equal(nombrePadronACambiar('PEREZ JUAN', null), 'PEREZ JUAN')
})

caso('importador: fila sin nombre nunca borra el que hay', () => {
  assert.equal(nombrePadronACambiar('', 'PEREZ JUAN'), null)
  assert.equal(nombrePadronACambiar('   ', null), null)
})

caso('importador: espacios alrededor no cuentan como cambio', () => {
  assert.equal(nombrePadronACambiar('  PEREZ JUAN ', 'PEREZ JUAN'), null)
})

caso('escaneo: padrón primero, perfil de respaldo, guion si no hay', () => {
  assert.equal(nombreVisible('PEREZ JUAN', 'Juanca'), 'PEREZ JUAN')
  assert.equal(nombreVisible(null, 'Juanca'), 'Juanca')
  assert.equal(nombreVisible(' ', undefined), '—')
})

console.log(`\n${casos} casos OK`)
