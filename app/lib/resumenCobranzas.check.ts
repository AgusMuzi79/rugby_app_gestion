// Verificación autocontenida de resumenCobranzas.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/resumenCobranzas.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  pctCobrado,
  pendientesDe,
  resumenDe,
  resumenesPorEvento,
  RESUMEN_VACIO,
} from './resumenCobranzas'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('3 de 80 pagaron → 4 % (antes 3/3 filas = 100 %)', () => {
  const r = { jugadores: 80, pagados: 3, cobrado: 45000 }
  assert.equal(pctCobrado(r), 4)
  assert.equal(pendientesDe(r), 77)
})

caso('sin jugadores no hay porcentaje (null, la pantalla muestra "—")', () => {
  assert.equal(pctCobrado({ jugadores: 0, pagados: 0, cobrado: 0 }), null)
  assert.equal(pendientesDe({ jugadores: 0, pagados: 0, cobrado: 0 }), 0)
})

caso('todos pagaron → 100 %; nunca pasa de 100 ni da pendientes negativos', () => {
  assert.equal(pctCobrado({ jugadores: 20, pagados: 20, cobrado: 1 }), 100)
  assert.equal(pctCobrado({ jugadores: 2, pagados: 3, cobrado: 1 }), 100)
  assert.equal(pendientesDe({ jugadores: 2, pagados: 3, cobrado: 1 }), 0)
})

caso('las filas del RPC se indexan por evento y convierten numeric en number', () => {
  const mapa = resumenesPorEvento([
    { evento_id: 'a', jugadores: 80, pagados: 3, cobrado: '45000.00' },
    { evento_id: 'b', jugadores: 10, pagados: 0, cobrado: 0 },
  ])
  assert.deepEqual(mapa.get('a'), { jugadores: 80, pagados: 3, cobrado: 45000 })
  assert.deepEqual(mapa.get('b'), { jugadores: 10, pagados: 0, cobrado: 0 })
})

caso('un evento sin fila (no visible) da el resumen vacío', () => {
  const mapa = resumenesPorEvento([])
  assert.deepEqual(resumenDe(mapa, 'x'), RESUMEN_VACIO)
  assert.deepEqual(resumenesPorEvento(null).size, 0)
})

console.log(`\n${casos} casos OK`)
