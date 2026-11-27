// Self-contained check for web/lib/noticiaSubcomision.ts (copy of the app one;
// same cases as app/lib/noticiaSubcomision.check.ts).
//   cd web && npx tsx lib/noticiaSubcomision.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import {
  buildNoticiaSubcomision,
  camposImagenesNoticia,
  DIAS_DESTACADA,
  destacadaHasta,
  MAX_IMAGENES_NOTICIA,
  pathsImagenesNoticia,
} from './noticiaSubcomision'

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
    imagenes:    [],
    destacada_hasta: null,
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

caso('imagenes are kept in order and imagen_path is the first one', () => {
  const r = buildNoticiaSubcomision({ titulo: 'X', autorId: AUTOR, imagenes: ['user-1/1.jpg', 'user-1/2.jpg'] })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.payload.imagenes, ['user-1/1.jpg', 'user-1/2.jpg'])
  assert.equal(r.payload.imagen_path, 'user-1/1.jpg')
})

caso('up to MAX_IMAGENES_NOTICIA (6) images are accepted, more are rejected', () => {
  assert.equal(MAX_IMAGENES_NOTICIA, 6)
  const seis = Array.from({ length: 6 }, (_, i) => `user-1/${i}.jpg`)
  assert.equal(buildNoticiaSubcomision({ titulo: 'X', autorId: AUTOR, imagenes: seis }).ok, true)
  const siete = buildNoticiaSubcomision({ titulo: 'X', autorId: AUTOR, imagenes: [...seis, 'user-1/6.jpg'] })
  assert.equal(siete.ok, false)
  if (!siete.ok) assert.equal(siete.error, 'demasiadas_imagenes')
})

caso('camposImagenesNoticia mirrors the paths into imagenes + imagen_path', () => {
  assert.deepEqual(camposImagenesNoticia([]), { imagenes: [], imagen_path: null })
  assert.deepEqual(camposImagenesNoticia(['a.jpg', 'b.jpg']), { imagenes: ['a.jpg', 'b.jpg'], imagen_path: 'a.jpg' })
})

caso('pathsImagenesNoticia prefers imagenes and falls back to imagen_path', () => {
  assert.deepEqual(pathsImagenesNoticia({ imagenes: ['a.jpg', 'b.jpg'], imagen_path: 'a.jpg' }), ['a.jpg', 'b.jpg'])
  assert.deepEqual(pathsImagenesNoticia({ imagenes: [], imagen_path: 'viejo.jpg' }), ['viejo.jpg'])
  assert.deepEqual(pathsImagenesNoticia({ imagenes: null, imagen_path: 'viejo.jpg' }), ['viejo.jpg'])
  assert.deepEqual(pathsImagenesNoticia({ imagen_path: null }), [])
})

caso('destacadaHasta is ahora + DIAS_DESTACADA (7) days, as ISO', () => {
  assert.equal(DIAS_DESTACADA, 7)
  assert.equal(destacadaHasta(new Date('2026-11-27T12:00:00.000Z')), '2026-12-04T12:00:00.000Z')
})

caso('destacar sets destacada_hasta from ahora; otherwise it is null', () => {
  const ahora = new Date('2026-11-27T12:00:00.000Z')
  const si = buildNoticiaSubcomision({ titulo: 'X', autorId: AUTOR, destacar: true, ahora })
  assert.equal(si.ok && si.payload.destacada_hasta, '2026-12-04T12:00:00.000Z')
  const no = buildNoticiaSubcomision({ titulo: 'X', autorId: AUTOR, destacar: false, ahora })
  assert.equal(no.ok && no.payload.destacada_hasta, null)
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
