// Self-contained check for noticiaSubcomision.ts (the app has no test runner).
//   npx tsx app/lib/noticiaSubcomision.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import { buildNoticiaSubcomision } from './noticiaSubcomision'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const AUTOR = 'user-1'

caso('title only: cuerpo is empty string, published to everyone', () => {
  const r = buildNoticiaSubcomision({ titulo: '  Entrenamiento suspendido  ', autorId: AUTOR })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.payload, {
    titulo:      'Entrenamiento suspendido',
    cuerpo:      '',
    etiquetas:   [],
    audiencia:   'todos',
    autor_id:    AUTOR,
    publicada:   true,
    imagen_path: null,
  })
})

caso('description is trimmed into cuerpo', () => {
  const r = buildNoticiaSubcomision({ titulo: 'Fiesta', descripcion: '  El sábado a las 21  ', autorId: AUTOR })
  assert.equal(r.ok && r.payload.cuerpo, 'El sábado a las 21')
})

caso('blank description becomes empty cuerpo', () => {
  const r = buildNoticiaSubcomision({ titulo: 'Fiesta', descripcion: '   ', autorId: AUTOR })
  assert.equal(r.ok && r.payload.cuerpo, '')
})

caso('deporte of the subcomision becomes the only etiqueta', () => {
  for (const d of ['rugby', 'hockey', 'tenis'] as const) {
    const r = buildNoticiaSubcomision({ titulo: 'X', deporte: d, autorId: AUTOR })
    assert.deepEqual(r.ok && r.payload.etiquetas, [d])
  }
})

caso('null or unknown deporte yields no etiquetas', () => {
  const a = buildNoticiaSubcomision({ titulo: 'X', deporte: null, autorId: AUTOR })
  assert.deepEqual(a.ok && a.payload.etiquetas, [])
  const b = buildNoticiaSubcomision({ titulo: 'X', deporte: 'futbol', autorId: AUTOR })
  assert.deepEqual(b.ok && b.payload.etiquetas, [])
})

caso('imagen_path is kept when present', () => {
  const r = buildNoticiaSubcomision({ titulo: 'X', autorId: AUTOR, imagenPath: 'user-1/123.jpg' })
  assert.equal(r.ok && r.payload.imagen_path, 'user-1/123.jpg')
})

caso('empty or blank title is rejected', () => {
  for (const titulo of ['', '   ']) {
    const r = buildNoticiaSubcomision({ titulo, autorId: AUTOR })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'titulo_vacio')
  }
})

caso('missing author is rejected', () => {
  const r = buildNoticiaSubcomision({ titulo: 'X', autorId: '' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'sin_autor')
})

console.log(`\n${casos} casos ok`)
