// Self-contained check for ordenNoticias.ts (the app has no test runner).
//   cd app && npx tsx lib/ordenNoticias.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import { estaDestacada, ordenarNoticiasFeed } from './ordenNoticias'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const AHORA = new Date('2026-11-27T12:00:00.000Z')

function noticia(id: string, created_at: string, destacada_hasta: string | null = null) {
  return { id, created_at, destacada_hasta }
}

caso('estaDestacada: only while destacada_hasta is in the future', () => {
  assert.equal(estaDestacada(noticia('a', '2026-11-20T00:00:00.000Z'), AHORA), false)
  assert.equal(estaDestacada(noticia('a', '2026-11-20T00:00:00.000Z', '2026-11-28T00:00:00.000Z'), AHORA), true)
  assert.equal(estaDestacada(noticia('a', '2026-11-20T00:00:00.000Z', '2026-11-26T00:00:00.000Z'), AHORA), false)
  // The exact end instant is already out of the window.
  assert.equal(estaDestacada(noticia('a', '2026-11-20T00:00:00.000Z', AHORA.toISOString()), AHORA), false)
})

caso('without featured items the feed is by created_at desc', () => {
  const r = ordenarNoticiasFeed([
    noticia('vieja', '2026-11-01T00:00:00.000Z'),
    noticia('nueva', '2026-11-26T00:00:00.000Z'),
    noticia('media', '2026-11-10T00:00:00.000Z'),
  ], AHORA)
  assert.deepEqual(r.map(n => n.id), ['nueva', 'media', 'vieja'])
})

caso('featured items in their window go first, most recent first among them', () => {
  const r = ordenarNoticiasFeed([
    noticia('normal-nueva', '2026-11-26T00:00:00.000Z'),
    noticia('dest-vieja',   '2026-11-21T00:00:00.000Z', '2026-11-28T00:00:00.000Z'),
    noticia('normal-vieja', '2026-11-01T00:00:00.000Z'),
    noticia('dest-nueva',   '2026-11-25T00:00:00.000Z', '2026-12-02T00:00:00.000Z'),
  ], AHORA)
  assert.deepEqual(r.map(n => n.id), ['dest-nueva', 'dest-vieja', 'normal-nueva', 'normal-vieja'])
})

caso('an expired featured item falls back to date order', () => {
  const r = ordenarNoticiasFeed([
    noticia('nueva',   '2026-11-26T00:00:00.000Z'),
    noticia('vencida', '2026-11-10T00:00:00.000Z', '2026-11-17T00:00:00.000Z'),
    noticia('vieja',   '2026-11-01T00:00:00.000Z'),
  ], AHORA)
  assert.deepEqual(r.map(n => n.id), ['nueva', 'vencida', 'vieja'])
})

caso('stable for equal created_at and does not mutate the input', () => {
  const entrada = [
    noticia('a', '2026-11-20T00:00:00.000Z'),
    noticia('b', '2026-11-20T00:00:00.000Z'),
    noticia('c', '2026-11-20T00:00:00.000Z', '2026-11-30T00:00:00.000Z'),
  ]
  const copia = entrada.map(n => ({ ...n }))
  const r = ordenarNoticiasFeed(entrada, AHORA)
  assert.deepEqual(r.map(n => n.id), ['c', 'a', 'b'])
  assert.deepEqual(entrada, copia)
  assert.notEqual(r, entrada)
})

caso('keeps the extra fields of each item', () => {
  const r = ordenarNoticiasFeed([{ ...noticia('a', '2026-11-20T00:00:00.000Z'), titulo: 'Hola' }], AHORA)
  assert.equal(r[0].titulo, 'Hola')
})

console.log(`\n${casos} casos ok`)
