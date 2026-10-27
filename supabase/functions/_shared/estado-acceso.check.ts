// Verificación autocontenida de estado-acceso.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/estado-acceso.check.ts

import assert from 'node:assert/strict'
import { motivoRechazoPorEstado } from './estado-acceso.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('un socio dado de baja (inactivo) no pasa en ningún lector', () => {
  assert.equal(motivoRechazoPorEstado('inactivo'), 'Socio dado de baja. Consultá en Secretaría.')
})

caso('activo y pendiente siguen pasando (el semáforo decide el aviso)', () => {
  assert.equal(motivoRechazoPorEstado('activo'), null)
  assert.equal(motivoRechazoPorEstado('pendiente'), null)
  assert.equal(motivoRechazoPorEstado(null), null)
})

console.log(`\n${casos} casos ok`)
