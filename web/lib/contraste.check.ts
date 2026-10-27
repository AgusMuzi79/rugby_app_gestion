// Verificación autocontenida de contraste.ts y de los tokens de color de
// app/globals.css (auditoría UX, X4). Lee los valores del @theme, así que un
// cambio de token que rompa AA falla acá.
//   npx --yes tsx web/lib/contraste.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contraste, CONTRASTE_TEXTO_AA, CONTRASTE_UI } from './contraste'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
function token(nombre: string): string {
  const m = css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`))
  assert.ok(m, `falta --color-${nombre} en globals.css`)
  return m![1]
}

caso('contraste: extremos y simetría', () => {
  assert.equal(contraste('#FFFFFF', '#000000'), 21)
  assert.equal(contraste('#000000', '#FFFFFF'), contraste('#FFFFFF', '#000000'))
})

caso('contraste: valor conocido (#767676 sobre blanco ≈ 4.54)', () => {
  assert.equal(Math.round(contraste('#767676', '#FFFFFF') * 100) / 100, 4.54)
})

caso('globals.css: tokens nuevos con el valor de la auditoría', () => {
  assert.equal(token('rojo-texto').toUpperCase(), '#E5634A')
  assert.equal(token('texto-2').toUpperCase(), '#9D998F')
  assert.equal(token('borde-control').toUpperCase(), '#7A7060')
})

// [nombre, primer plano, fondo, mínimo]
const pares: [string, string, string, number][] = [
  ['rojo-texto sobre papel (errores, ELIMINAR)', token('rojo-texto'), token('papel'), CONTRASTE_TEXTO_AA],
  ['rojo-texto sobre card (errores en tarjetas y modales)', token('rojo-texto'), token('card'), CONTRASTE_TEXTO_AA],
  ['texto-2 sobre papel (secundarios, vacíos, CARGANDO; antes tinta/40)', token('texto-2'), token('papel'), CONTRASTE_TEXTO_AA],
  ['texto-2 sobre card (SIN FOTO, Sin comprobante; antes tinta/30)', token('texto-2'), token('card'), CONTRASTE_TEXTO_AA],
  ['borde-control sobre papel (borde de inputs, componente UI)', token('borde-control'), token('papel'), CONTRASTE_UI],
  ['borde-control sobre card (borde de inputs, componente UI)', token('borde-control'), token('card'), CONTRASTE_UI],
  ['blanco sobre rojo (hover de DESACTIVAR / ELIMINAR, badge 4 AUS.)', '#FFFFFF', token('rojo'), CONTRASTE_TEXTO_AA],
]

for (const [nombre, fg, bg, minimo] of pares) {
  caso(`${minimo === CONTRASTE_UI ? 'UI 3:1' : 'AA'}: ${nombre} = ${contraste(fg, bg).toFixed(2)}`, () => {
    assert.ok(contraste(fg, bg) >= minimo)
  })
}

console.log(`\n${casos} casos OK`)
