// Verificación autocontenida de mensajeErrorWeb.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/mensajeErrorWeb.check.ts
// Casos portados de app/lib/mensajeError.check.ts. Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { mensajeError, SIN_CONEXION, SIN_PERMISO, DATOS_INVALIDOS } from './mensajeErrorWeb'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const POR_DEFECTO = 'No se pudo guardar la asistencia. Probá de nuevo.'

caso('error de red (fetch caído en el navegador) → sin conexión, aunque traiga código', () => {
  assert.equal(mensajeError({ message: 'TypeError: Failed to fetch', code: '' }, POR_DEFECTO), SIN_CONEXION)
  assert.equal(mensajeError(new TypeError('NetworkError when attempting to fetch resource.'), POR_DEFECTO), SIN_CONEXION)
  assert.equal(mensajeError(new TypeError('Load failed'), POR_DEFECTO), SIN_CONEXION)
  assert.equal(SIN_CONEXION, 'No hay conexión. Revisá internet y volvé a intentar.')
})

caso('RLS / permisos (42501, PGRST301-303) → sin permiso', () => {
  for (const code of ['42501', 'PGRST301', 'PGRST302', 'PGRST303']) {
    assert.equal(mensajeError({ code, message: 'new row violates row-level security policy' }, POR_DEFECTO), SIN_PERMISO)
  }
  assert.equal(SIN_PERMISO, 'No tenés permiso para hacer esto.')
})

caso('violación de unique (23505) → el mensaje que pasa quien llama, o el por defecto', () => {
  const err = { code: '23505', message: 'duplicate key value violates unique constraint "x"' }
  assert.equal(mensajeError(err, POR_DEFECTO, { duplicado: 'Hay un jugador repetido en la mesa.' }), 'Hay un jugador repetido en la mesa.')
  assert.equal(mensajeError(err, POR_DEFECTO), POR_DEFECTO)
})

caso('datos inválidos (22023, 23514) → el de quien llama o "Revisá los datos."', () => {
  for (const code of ['22023', '23514']) {
    const err = { code, message: 'violates check constraint' }
    assert.equal(mensajeError(err, POR_DEFECTO), DATOS_INVALIDOS)
    assert.equal(mensajeError(err, POR_DEFECTO, { invalido: 'Ese equipo no es de esta división.' }), 'Ese equipo no es de esta división.')
  }
})

caso('cualquier otro error → el por defecto, nunca error.message', () => {
  assert.equal(mensajeError({ code: 'PGRST116', message: 'JSON object requested' }, POR_DEFECTO), POR_DEFECTO)
  assert.equal(mensajeError('algo raro', POR_DEFECTO), POR_DEFECTO)
  assert.equal(mensajeError(null, POR_DEFECTO), POR_DEFECTO)
})

console.log(`\n${casos} casos ok`)
