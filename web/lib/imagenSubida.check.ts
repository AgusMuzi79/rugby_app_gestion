// Verificación autocontenida de imagenSubida.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/imagenSubida.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { LADO_MAXIMO, CALIDAD_JPEG, BYTES_MAXIMOS, medidasDestino, errorTamano, nombreJpeg } from './imagenSubida'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('constantes: 1600 px, JPEG 0.82, 10 MB', () => {
  assert.equal(LADO_MAXIMO, 1600)
  assert.equal(CALIDAD_JPEG, 0.82)
  assert.equal(BYTES_MAXIMOS, 10 * 1024 * 1024)
})

caso('una foto horizontal grande baja a 1600 de ancho manteniendo la proporción', () => {
  assert.deepEqual(medidasDestino(4000, 3000), { ancho: 1600, alto: 1200 })
})

caso('una foto vertical grande baja a 1600 de alto', () => {
  assert.deepEqual(medidasDestino(3024, 4032), { ancho: 1200, alto: 1600 })
})

caso('una imagen chica no se agranda', () => {
  assert.deepEqual(medidasDestino(800, 600), { ancho: 800, alto: 600 })
  assert.deepEqual(medidasDestino(1600, 900), { ancho: 1600, alto: 900 })
})

caso('redondea y nunca da 0 px', () => {
  assert.deepEqual(medidasDestino(5000, 3), { ancho: 1600, alto: 1 })
  assert.deepEqual(medidasDestino(1601, 1001), { ancho: 1600, alto: 1000 })
})

caso('más de 10 MB da un mensaje; 10 MB justos pasan', () => {
  assert.equal(errorTamano(BYTES_MAXIMOS), null)
  assert.match(errorTamano(BYTES_MAXIMOS + 1) ?? '', /10 MB/)
})

caso('el archivo subido se llama .jpg', () => {
  assert.equal(nombreJpeg('IMG_1234.HEIC'), 'IMG_1234.jpg')
  assert.equal(nombreJpeg('promo.final.png'), 'promo.final.jpg')
  assert.equal(nombreJpeg('sin-extension'), 'sin-extension.jpg')
})

console.log(`\n${casos} casos ok`)
