// Verificación autocontenida de serviciosCatalogo.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/serviciosCatalogo.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { motivoNoEliminar, nombreBloqueado } from './serviciosCatalogo'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('un servicio con socios no se puede eliminar', () => {
  const motivo = motivoNoEliminar('Gimnasio', 312)
  assert.ok(motivo)
  assert.match(motivo!, /312 socios/)
  assert.match(motivo!, /desactivalo/i)
})

caso('un socio en singular', () => {
  assert.match(motivoNoEliminar('Pileta', 1)!, /1 socio[^s]/)
})

caso('un servicio mapeado por el importador no se puede eliminar aunque no tenga socios', () => {
  assert.ok(motivoNoEliminar('Rugby Inclusivo', 0))
})

caso('un servicio sin socios ni mapeo se puede eliminar', () => {
  assert.equal(motivoNoEliminar('Pileta', 0), null)
})

caso('los seis nombres mapeados quedan bloqueados para renombrar', () => {
  for (const n of ['Gimnasio', 'Rugby', 'Hockey', 'Carnet Tenis', 'Rugby Inclusivo', 'Hockey Inclusivo']) {
    assert.equal(nombreBloqueado(n), true, n)
  }
  assert.equal(nombreBloqueado('Pileta'), false)
  assert.equal(nombreBloqueado('gimnasio'), false) // el importador compara exacto
})

console.log(`\n${casos} casos ok`)
