// Verificación autocontenida de mensajeError.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/mensajeError.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { mensajeError, SIN_PERMISO, DATOS_INVALIDOS } from './mensajeError'
import { SIN_CONEXION } from './errorFunction'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const POR_DEFECTO = 'No se pudo guardar la asistencia. Probá de nuevo.'

caso('error de red (fetch caído) → sin conexión, aunque traiga código', () => {
  assert.equal(mensajeError({ message: 'TypeError: Network request failed', code: '' }, POR_DEFECTO), SIN_CONEXION)
  assert.equal(mensajeError(new Error('Failed to fetch'), POR_DEFECTO), SIN_CONEXION)
})

caso('RLS / permisos (42501, PGRST301-303) → sin permiso', () => {
  for (const code of ['42501', 'PGRST301', 'PGRST302', 'PGRST303']) {
    assert.equal(mensajeError({ code, message: 'new row violates row-level security policy for table "asistencias"' }, POR_DEFECTO), SIN_PERMISO)
  }
  assert.equal(SIN_PERMISO, 'No tenés permiso para hacer esto.')
})

caso('violación de unique (23505) → el mensaje que pasa quien llama', () => {
  const err = { code: '23505', message: 'duplicate key value violates unique constraint "x"' }
  assert.equal(mensajeError(err, POR_DEFECTO, { duplicado: 'Ese jugador ya está en la mesa.' }), 'Ese jugador ya está en la mesa.')
  // Sin mensaje propio para duplicado: el por defecto, nunca el texto crudo.
  assert.equal(mensajeError(err, POR_DEFECTO), POR_DEFECTO)
})

caso('datos inválidos (22023, 23514) → el de quien llama o "Revisá los datos."', () => {
  for (const code of ['22023', '23514']) {
    const err = { code, message: 'new row for relation "eventos" violates check constraint "eventos_tipo_check"' }
    assert.equal(mensajeError(err, POR_DEFECTO), DATOS_INVALIDOS)
    assert.equal(mensajeError(err, POR_DEFECTO, { invalido: 'Ese equipo no es de esta división.' }), 'Ese equipo no es de esta división.')
  }
  assert.equal(DATOS_INVALIDOS, 'Revisá los datos.')
})

caso('cualquier otro error → el por defecto, nunca error.message', () => {
  const err = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }
  assert.equal(mensajeError(err, POR_DEFECTO), POR_DEFECTO)
  assert.equal(mensajeError({ message: 'column "x" does not exist', code: '42703' }, POR_DEFECTO), POR_DEFECTO)
  assert.equal(mensajeError('algo raro', POR_DEFECTO), POR_DEFECTO)
  assert.equal(mensajeError(null, POR_DEFECTO), POR_DEFECTO)
})

console.log(`\n${casos} casos ok`)
