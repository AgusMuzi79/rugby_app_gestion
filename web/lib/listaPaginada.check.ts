// Verificación autocontenida de listaPaginada.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/listaPaginada.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { PAGINA_LISTA, paginar, ordenarCon, reemplazarPorId } from './listaPaginada'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const mil = Array.from({ length: 1528 }, (_, i) => i)

caso('la página es de 100 filas', () => {
  assert.equal(PAGINA_LISTA, 100)
})

caso('muestra las primeras N y cuenta las que faltan', () => {
  const r = paginar(mil, 100)
  assert.equal(r.visibles.length, 100)
  assert.equal(r.visibles[0], 0)
  assert.equal(r.restantes, 1428)
})

caso('si la lista es más corta que el límite no quedan restantes', () => {
  const r = paginar([1, 2, 3], 100)
  assert.deepEqual(r.visibles, [1, 2, 3])
  assert.equal(r.restantes, 0)
})

caso('ordenarCon no muta la lista y respeta la dirección', () => {
  const base = [3, 1, 2]
  assert.deepEqual(ordenarCon(base, (a, b) => a - b, 'asc'), [1, 2, 3])
  assert.deepEqual(ordenarCon(base, (a, b) => a - b, 'desc'), [3, 2, 1])
  assert.deepEqual(base, [3, 1, 2])
})

caso('reemplazarPorId cambia sólo el socio editado y mantiene el orden', () => {
  const lista = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }]
  const r = reemplazarPorId(lista, 'b', { id: 'b', v: 20 })
  assert.deepEqual(r, [{ id: 'a', v: 1 }, { id: 'b', v: 20 }, { id: 'c', v: 3 }])
  assert.equal(r[0], lista[0]) // las demás filas son las mismas referencias
})

caso('reemplazarPorId saca el socio si ya no existe', () => {
  const lista = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]
  assert.deepEqual(reemplazarPorId(lista, 'b', null), [{ id: 'a', v: 1 }])
})

caso('reemplazarPorId agrega el socio si no estaba', () => {
  assert.deepEqual(reemplazarPorId([{ id: 'a', v: 1 }], 'z', { id: 'z', v: 9 }), [{ id: 'a', v: 1 }, { id: 'z', v: 9 }])
})

console.log(`\n${casos} casos ok`)
