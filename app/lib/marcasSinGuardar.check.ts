// Verificación autocontenida de marcasSinGuardar.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/marcasSinGuardar.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { cantidadSinGuardar, presenciasSinGuardar, textoSinGuardar } from './marcasSinGuardar'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('lista recién cargada: nada sin guardar (se puede cambiar de división sin preguntar)', () => {
  assert.equal(cantidadSinGuardar([
    { estado: null, estadoGuardado: null },
    { estado: 'presente', estadoGuardado: 'presente' },
  ]), 0)
})

caso('28 marcas nuevas sin guardar: se cuentan (antes el cambio de división las borraba sin avisar)', () => {
  const jugadores = Array.from({ length: 30 }, (_, i) => ({
    estado: i < 28 ? ('presente' as const) : null,
    estadoGuardado: null,
  }))
  assert.equal(cantidadSinGuardar(jugadores), 28)
})

caso('cambiar una marca ya guardada también cuenta', () => {
  assert.equal(cantidadSinGuardar([{ estado: 'ausente', estadoGuardado: 'presente' }]), 1)
})

caso('después de guardar (estadoGuardado = estado) no queda nada', () => {
  const marcados = [{ estado: 'ausente' as const }, { estado: 'presente' as const }]
  assert.equal(cantidadSinGuardar(marcados.map(j => ({ ...j, estadoGuardado: j.estado }))), 0)
})

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

caso('texto del aviso: singular, plural y dónde', () => {
  assert.equal(textoSinGuardar(1, 'M15'), 'Tenés 1 marca sin guardar en M15.')
  assert.equal(textoSinGuardar(28, 'M15'), 'Tenés 28 marcas sin guardar en M15.')
  assert.equal(textoSinGuardar(3, ''), 'Tenés 3 marcas sin guardar.')
})

console.log(`\n${casos} casos ok`)
