// Verificación autocontenida de terminos.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/terminos.check.ts

import assert from 'node:assert/strict'
import { aceptacionRegistrada, estadoTerminos } from './terminos'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const ACTIVA = { id: 'v2', version: '2.0', titulo: 'Términos', pdf_path: 'terminos-2.pdf' }
const red = { message: 'TypeError: Network request failed' }

caso('si falla leer la versión activa NO deja pasar (antes: pendiente false = entraba sin aceptar)', () => {
  const e = estadoTerminos({ activa: null, errorActiva: red, aceptacion: null, errorAceptacion: null })
  assert.equal(e.pendiente, true)
  assert.ok(e.error)
})

caso('si falla leer la aceptación tampoco deja pasar', () => {
  const e = estadoTerminos({ activa: ACTIVA, errorActiva: null, aceptacion: null, errorAceptacion: red })
  assert.equal(e.pendiente, true)
  assert.ok(e.error)
})

caso('sin versión activa configurada no hay nada que aceptar', () => {
  const e = estadoTerminos({ activa: null, errorActiva: null, aceptacion: null, errorAceptacion: null })
  assert.equal(e.pendiente, false)
  assert.equal(e.error, null)
})

caso('versión activa ya aceptada → no pendiente; sin aceptar → pendiente', () => {
  assert.equal(estadoTerminos({ activa: ACTIVA, errorActiva: null, aceptacion: { id: 'a' }, errorAceptacion: null }).pendiente, false)
  assert.equal(estadoTerminos({ activa: ACTIVA, errorActiva: null, aceptacion: null, errorAceptacion: null }).pendiente, true)
})

caso('sin red, si esta cuenta ya aceptó en este teléfono, pasa (el carnet abre sin señal)', () => {
  const e = estadoTerminos({ activa: null, errorActiva: red, aceptacion: null, errorAceptacion: null, aceptadaEnTelefono: true })
  assert.equal(e.pendiente, false)
  assert.equal(e.error, null)
  const e2 = estadoTerminos({ activa: ACTIVA, errorActiva: null, aceptacion: null, errorAceptacion: red, aceptadaEnTelefono: true })
  assert.equal(e2.pendiente, false)
})

caso('con red, el registro del teléfono no alcanza: manda la base (versión nueva sin aceptar)', () => {
  const e = estadoTerminos({ activa: ACTIVA, errorActiva: null, aceptacion: null, errorAceptacion: null, aceptadaEnTelefono: true })
  assert.equal(e.pendiente, true)
})

caso('una aceptación duplicada (23505) cuenta como aceptada', () => {
  assert.equal(aceptacionRegistrada(null), true)
  assert.equal(aceptacionRegistrada({ code: '23505', message: 'duplicate key' }), true)
  assert.equal(aceptacionRegistrada({ code: '42501', message: 'rls' }), false)
})

console.log(`\n${casos} casos ok`)
