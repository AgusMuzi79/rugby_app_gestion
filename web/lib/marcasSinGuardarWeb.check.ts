// Verificación autocontenida de marcasSinGuardarWeb.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/marcasSinGuardarWeb.check.ts
// Casos de partido portados de app/lib/marcasSinGuardar.check.ts + la mesa (sólo web).
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { presenciasSinGuardar, mesaSinGuardar, textoSinGuardar } from './marcasSinGuardarWeb'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('partido: sólo cuentan los que cambiaron respecto de lo guardado (por defecto presente)', () => {
  const jugadores = [
    { id: 'a', presente: true },
    { id: 'b', presente: false },
    { id: 'c', presente: false },
  ]
  assert.equal(presenciasSinGuardar(jugadores, {}), 2)
  assert.equal(presenciasSinGuardar(jugadores, { b: false }), 1)
  assert.equal(presenciasSinGuardar(jugadores, { b: false, c: false }), 0)
})

caso('mesa: cuentan los presentes cuyo rol cambió respecto de la mesa guardada', () => {
  const jugadores = [
    { id: 'a', presente: true, rolEnMesa: 'titular' as const },
    { id: 'b', presente: true, rolEnMesa: null },
    { id: 'c', presente: true, rolEnMesa: 'suplente' as const },
    { id: 'd', presente: false, rolEnMesa: null },
  ]
  assert.equal(mesaSinGuardar(jugadores, {}), 2)
  assert.equal(mesaSinGuardar(jugadores, { a: 'titular', c: 'suplente' }), 0)
  assert.equal(mesaSinGuardar(jugadores, { a: 'suplente', b: 'titular', c: 'suplente' }), 2)
  // Un ausente que estaba en la mesa guardada sale al guardar: es un cambio.
  assert.equal(mesaSinGuardar(jugadores, { a: 'titular', c: 'suplente', d: 'titular' }), 1)
})

caso('texto del aviso: singular, plural y dónde', () => {
  assert.equal(textoSinGuardar(1, 'M15'), 'Tenés 1 marca sin guardar en M15.')
  assert.equal(textoSinGuardar(28, 'M15'), 'Tenés 28 marcas sin guardar en M15.')
  assert.equal(textoSinGuardar(3, ''), 'Tenés 3 marcas sin guardar.')
})

console.log(`\n${casos} casos ok`)
