// Verificación autocontenida de errorCarga.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/errorCarga.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { detalleError, mensajeErrorCarga, primerError } from './errorCarga'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('detalle de un error de PostgREST, de un Error y de algo desconocido', () => {
  assert.equal(detalleError({ message: 'permission denied for table socios', code: '42501' }), 'permission denied for table socios')
  assert.equal(detalleError(new TypeError('Failed to fetch')), 'Failed to fetch')
  assert.equal(detalleError('timeout'), 'timeout')
  assert.equal(detalleError(null), '')
  assert.equal(detalleError({}), '')
})

caso('mensaje de carga con detalle técnico al final', () => {
  assert.equal(
    mensajeErrorCarga('los socios', new TypeError('Failed to fetch')),
    'No se pudieron cargar los socios. Revisá la conexión y probá de nuevo. (Failed to fetch)',
  )
})

caso('mensaje de carga sin detalle', () => {
  assert.equal(
    mensajeErrorCarga('el historial', {}),
    'No se pudo cargar el historial. Revisá la conexión y probá de nuevo.',
  )
})

caso('singular/plural según el artículo', () => {
  assert.match(mensajeErrorCarga('la lista', null), /^No se pudo cargar la lista\./)
  assert.match(mensajeErrorCarga('las noticias', null), /^No se pudieron cargar las noticias\./)
})

caso('primerError devuelve el primer error no nulo de varias consultas', () => {
  const e = { message: 'x' }
  assert.equal(primerError(null, undefined, e, { message: 'y' }), e)
  assert.equal(primerError(null, undefined), null)
})

console.log(`\n${casos} casos ok`)
