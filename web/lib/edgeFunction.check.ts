// Verificación autocontenida de la parte pura de edgeFunction.ts.
//   npx --yes tsx web/lib/edgeFunction.check.ts

import assert from 'node:assert/strict'
import { interpretarRespuesta, mensajeFalloRed } from './edgeFunctionRespuesta'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('JSON con { error } de un non-2xx: se muestra ese mensaje', () => {
  const r = interpretarRespuesta(409, '{"error":"Ya existe un usuario con ese email"}')
  assert.equal(r.error, 'Ya existe un usuario con ese email')
  assert.equal(r.status, 409)
})

caso('200 con { ok:false, motivo } se respeta tal cual', () => {
  const r = interpretarRespuesta(200, '{"ok":false,"motivo":"DNI inválido"}')
  assert.equal(r.motivo, 'DNI inválido')
  assert.equal(r.error, undefined)
})

caso('respuesta del gateway sin JSON (HTML, 502): mensaje en castellano, no el HTML crudo', () => {
  const r = interpretarRespuesta(502, '<html><body>Bad Gateway</body></html>')
  assert.match(r.error!, /servidor no respondió/)
  assert.doesNotMatch(r.error!, /html/i)
})

caso('non-2xx con JSON pero sin error: igual hay error', () => {
  const r = interpretarRespuesta(500, '{"foo":1}')
  assert.match(r.error!, /500/)
})

caso('200 con JSON normal pasa sin error', () => {
  const r = interpretarRespuesta(200, '{"importacion_id":"x"}')
  assert.equal(r.error, undefined)
  assert.equal((r as { importacion_id?: string }).importacion_id, 'x')
})

caso('fallas de red y timeout en castellano', () => {
  assert.match(mensajeFalloRed(false), /No hay conexión/)
  assert.match(mensajeFalloRed(true), /revisá el historial antes de reintentar/i)
})

console.log(`\n${casos} casos ok`)
