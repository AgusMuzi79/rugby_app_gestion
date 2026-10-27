// Verificación autocontenida de qrCarnet.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/qrCarnet.check.ts

import assert from 'node:assert/strict'
import { codigoManualAQR, contenidoQR, normalizarCodigo, normalizarNumeroSocio, parsearQR } from './qrCarnet'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('el carnet arma "{numero_socio}:{código}" y el escáner lo lee igual', () => {
  assert.equal(contenidoQR('16823', '045123'), '16823:045123')
  assert.deepEqual(parsearQR('16823:045123'), { numero_socio: '16823', code: '045123' })
})

caso('QR con otro formato → null (QR NO VÁLIDO)', () => {
  assert.equal(parsearQR('https://otro.qr'), null)
  assert.equal(parsearQR('16823:12345'), null)
  assert.equal(parsearQR('16823:045123:9'), null)
  assert.equal(parsearQR(':045123'), null)
})

caso('código manual: Nº de socio + 6 dígitos → el mismo contenido que el QR', () => {
  assert.equal(codigoManualAQR('16823', '045123'), contenidoQR('16823', '045123'))
  assert.deepEqual(parsearQR(codigoManualAQR('16823', '045123')!), { numero_socio: '16823', code: '045123' })
})

caso('normaliza lo tipeado: espacios y el separador "·" del carnet, ceros a la izquierda se mantienen', () => {
  assert.equal(normalizarNumeroSocio(' 0168 23 '), '016823')
  assert.equal(normalizarCodigo('045 · 123'), '045123')
  assert.equal(normalizarCodigo('0451234'), '045123')
  assert.equal(codigoManualAQR(' 16823 ', '045 · 123'), '16823:045123')
})

caso('incompleto → null (el botón queda deshabilitado)', () => {
  assert.equal(codigoManualAQR('', '045123'), null)
  assert.equal(codigoManualAQR('16823', '04512'), null)
})

console.log(`\n${casos} casos ok`)
