// Verificación autocontenida de errorCarga.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/errorCarga.check.ts

import assert from 'node:assert/strict'
import { mensajeErrorCarga, primerError } from './errorCarga'
import { SIN_CONEXION } from './errorFunction'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('sin red: el aviso de conexión de siempre', () => {
  assert.equal(mensajeErrorCarga('los socios', { message: 'TypeError: Network request failed' }), SIN_CONEXION)
  assert.equal(mensajeErrorCarga('el resumen', { message: 'Failed to fetch' }), SIN_CONEXION)
})

caso('otro error (permisos, datos): dice qué no se pudo cargar, en plural', () => {
  assert.equal(
    mensajeErrorCarga('los socios', { message: 'permission denied for table socios', code: '42501' }),
    'No se pudieron cargar los socios. Probá de nuevo.',
  )
})

caso('otro error, en singular', () => {
  assert.equal(
    mensajeErrorCarga('el resumen de socios', { message: 'boom' }),
    'No se pudo cargar el resumen de socios. Probá de nuevo.',
  )
})

caso('primerError devuelve el primero no nulo', () => {
  const e = { message: 'x' }
  assert.equal(primerError(null, undefined, e, { message: 'y' }), e)
  assert.equal(primerError(null, undefined), null)
})

console.log(`\n${casos} casos ok`)
