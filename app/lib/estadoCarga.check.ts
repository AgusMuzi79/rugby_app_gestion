// Verificación autocontenida de estadoCarga.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/estadoCarga.check.ts

import assert from 'node:assert/strict'
import { ESTADO_CARGA_INICIAL, transicionCarga } from './estadoCarga'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('primera carga: spinner de pantalla completa', () => {
  const e = transicionCarga(ESTADO_CARGA_INICIAL, 'empezar')
  assert.deepEqual(e, { loading: true, refrescando: false, cargado: false })
})

caso('al terminar la primera carga queda cargado', () => {
  const e = transicionCarga(transicionCarga(ESTADO_CARGA_INICIAL, 'empezar'), 'terminar')
  assert.deepEqual(e, { loading: false, refrescando: false, cargado: true })
})

caso('volver a la pestaña (relectura) NO vuelve a "loading": refresca en silencio', () => {
  const cargado = { loading: false, refrescando: false, cargado: true }
  const e = transicionCarga(cargado, 'empezar')
  assert.equal(e.loading, false)
  assert.equal(e.refrescando, true)
  assert.deepEqual(transicionCarga(e, 'terminar'), cargado)
})

console.log(`\n${casos} casos ok`)
