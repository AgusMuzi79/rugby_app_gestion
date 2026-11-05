// Self-contained check for beneficios.ts (the app has no test runner).
//   npx tsx app/lib/beneficios.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import {
  RUBROS,
  esVigente,
  filtrarBeneficios,
  ordenarBeneficios,
  labelRubro,
  urlMaps,
  urlWhatsapp,
  urlInstagram,
  urlSitioWeb,
  type Beneficio,
} from './beneficios'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

function b(over: Partial<Beneficio>): Beneficio {
  return {
    id: 'id',
    nombre: 'Local',
    rubro: 'otros',
    descuento: '10% OFF',
    descripcion: null,
    condiciones: null,
    direccion: null,
    zona: null,
    telefono_whatsapp: null,
    instagram: null,
    sitio_web: null,
    logo_url: null,
    imagen_url: null,
    destacado: false,
    orden: 0,
    activo: true,
    vigente_desde: null,
    vigente_hasta: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}

const HOY = '2026-11-04'

// --- RUBROS -----------------------------------------------------------------

caso('RUBROS has unique values with Spanish labels, matching the DB check', () => {
  const values = RUBROS.map(r => r.value)
  assert.deepEqual(values, ['gastronomia', 'deportes', 'salud', 'belleza', 'indumentaria', 'educacion', 'servicios', 'otros'])
  assert.equal(new Set(values).size, values.length)
  assert.equal(labelRubro('gastronomia'), 'Gastronomía')
  assert.equal(labelRubro('salud'), 'Salud')
})

caso('labelRubro falls back to the raw value for an unknown rubro', () => {
  assert.equal(labelRubro('mascotas'), 'mascotas')
})

// --- esVigente --------------------------------------------------------------

caso('open bounds and active: vigente', () => {
  assert.equal(esVigente(b({}), HOY), true)
})

caso('inactive is never vigente', () => {
  assert.equal(esVigente(b({ activo: false }), HOY), false)
})

caso('bounds are inclusive', () => {
  assert.equal(esVigente(b({ vigente_desde: HOY }), HOY), true)
  assert.equal(esVigente(b({ vigente_hasta: HOY }), HOY), true)
  assert.equal(esVigente(b({ vigente_desde: HOY, vigente_hasta: HOY }), HOY), true)
})

caso('expired or not started yet is not vigente', () => {
  assert.equal(esVigente(b({ vigente_hasta: '2026-11-03' }), HOY), false)
  assert.equal(esVigente(b({ vigente_desde: '2026-11-05' }), HOY), false)
})

caso('date comparison is by calendar day, not lexicographic accident', () => {
  assert.equal(esVigente(b({ vigente_hasta: '2026-12-01' }), HOY), true)
  assert.equal(esVigente(b({ vigente_desde: '2025-12-31' }), HOY), true)
})

// --- filtrarBeneficios ------------------------------------------------------

const LISTA = [
  b({ id: '1', nombre: 'Café Martínez', rubro: 'gastronomia', zona: 'Centro', descuento: '15% OFF' }),
  b({ id: '2', nombre: 'Gimnasio Fuerza', rubro: 'deportes', zona: 'Barrio Norte', descuento: '2x1' }),
  b({ id: '3', nombre: 'Óptica Visión', rubro: 'salud', zona: 'Centro', descuento: '20% OFF' }),
]

caso('no filters returns everything, same order, new array', () => {
  const r = filtrarBeneficios(LISTA, {})
  assert.deepEqual(r.map(x => x.id), ['1', '2', '3'])
  assert.notEqual(r, LISTA)
})

caso('filter by rubro', () => {
  assert.deepEqual(filtrarBeneficios(LISTA, { rubro: 'salud' }).map(x => x.id), ['3'])
})

caso('null rubro means all', () => {
  assert.equal(filtrarBeneficios(LISTA, { rubro: null }).length, 3)
})

caso('search is case and accent insensitive on nombre', () => {
  assert.deepEqual(filtrarBeneficios(LISTA, { busqueda: 'MARTINEZ' }).map(x => x.id), ['1'])
  assert.deepEqual(filtrarBeneficios(LISTA, { busqueda: 'optica' }).map(x => x.id), ['3'])
})

caso('search matches rubro label, zona and descuento', () => {
  assert.deepEqual(filtrarBeneficios(LISTA, { busqueda: 'gastronomía' }).map(x => x.id), ['1'])
  assert.deepEqual(filtrarBeneficios(LISTA, { busqueda: 'norte' }).map(x => x.id), ['2'])
  assert.deepEqual(filtrarBeneficios(LISTA, { busqueda: '2x1' }).map(x => x.id), ['2'])
})

caso('blank search is ignored; search is trimmed', () => {
  assert.equal(filtrarBeneficios(LISTA, { busqueda: '   ' }).length, 3)
  assert.deepEqual(filtrarBeneficios(LISTA, { busqueda: '  centro ' }).map(x => x.id), ['1', '3'])
})

caso('rubro and search combine', () => {
  assert.deepEqual(filtrarBeneficios(LISTA, { rubro: 'gastronomia', busqueda: 'centro' }).map(x => x.id), ['1'])
  assert.deepEqual(filtrarBeneficios(LISTA, { rubro: 'deportes', busqueda: 'centro' }).map(x => x.id), [])
})

// --- ordenarBeneficios ------------------------------------------------------

caso('destacado first, then orden, then nombre (locale, accent aware)', () => {
  const r = ordenarBeneficios([
    b({ id: 'a', nombre: 'Zapatería', orden: 0 }),
    b({ id: 'b', nombre: 'Árbol', orden: 0 }),
    b({ id: 'c', nombre: 'Bar', orden: -1 }),
    b({ id: 'd', nombre: 'Yoga', destacado: true, orden: 5 }),
    b({ id: 'e', nombre: 'Café', destacado: true, orden: 5 }),
  ])
  assert.deepEqual(r.map(x => x.id), ['e', 'd', 'c', 'b', 'a'])
})

caso('ordenarBeneficios does not mutate the input', () => {
  const input = [b({ id: '2', nombre: 'B' }), b({ id: '1', nombre: 'A' })]
  ordenarBeneficios(input)
  assert.deepEqual(input.map(x => x.id), ['2', '1'])
})

// --- urlMaps ----------------------------------------------------------------

caso('urlMaps builds an encoded Google Maps search URL', () => {
  assert.equal(
    urlMaps('Av. San Martín 123, Tandil'),
    'https://www.google.com/maps/search/?api=1&query=Av.%20San%20Mart%C3%ADn%20123%2C%20Tandil',
  )
})

caso('urlMaps returns null for empty or missing address', () => {
  assert.equal(urlMaps(null), null)
  assert.equal(urlMaps('   '), null)
})

// --- urlWhatsapp ------------------------------------------------------------

caso('urlWhatsapp keeps numbers already in international format', () => {
  assert.equal(urlWhatsapp('+54 9 249 412-3456'), 'https://wa.me/5492494123456')
  assert.equal(urlWhatsapp('5492494123456'), 'https://wa.me/5492494123456')
})

caso('urlWhatsapp adds 9 to +54 numbers without it', () => {
  assert.equal(urlWhatsapp('+54 249 4123456'), 'https://wa.me/5492494123456')
})

caso('urlWhatsapp converts local formats with leading 0 and 15', () => {
  assert.equal(urlWhatsapp('0249 15 412-3456'), 'https://wa.me/5492494123456')
  assert.equal(urlWhatsapp('011 15 1234-5678'), 'https://wa.me/5491112345678')
  assert.equal(urlWhatsapp('(0249) 4123456'), 'https://wa.me/5492494123456')
})

caso('urlWhatsapp drops 15 after a 4-digit area code', () => {
  assert.equal(urlWhatsapp('02972 15 412345'), 'https://wa.me/5492972412345')
})

caso('urlWhatsapp accepts a 10-digit national number without 0', () => {
  assert.equal(urlWhatsapp('2494123456'), 'https://wa.me/5492494123456')
})

caso('urlWhatsapp returns null for empty or too short input', () => {
  assert.equal(urlWhatsapp(null), null)
  assert.equal(urlWhatsapp(''), null)
  assert.equal(urlWhatsapp('4123456'), null)
})

// --- urlInstagram -----------------------------------------------------------

caso('urlInstagram builds from a handle with or without @', () => {
  assert.equal(urlInstagram('@cafe.martinez'), 'https://www.instagram.com/cafe.martinez/')
  assert.equal(urlInstagram('cafe_martinez'), 'https://www.instagram.com/cafe_martinez/')
})

caso('urlInstagram normalizes a full or partial URL', () => {
  assert.equal(urlInstagram('https://www.instagram.com/cafe.martinez/?hl=es'), 'https://www.instagram.com/cafe.martinez/')
  assert.equal(urlInstagram('instagram.com/cafe.martinez'), 'https://www.instagram.com/cafe.martinez/')
})

caso('urlInstagram only takes the path of a real instagram.com host', () => {
  assert.equal(urlInstagram('https://instagram.com/cafe.martinez'), 'https://www.instagram.com/cafe.martinez/')
  assert.equal(urlInstagram('https://notinstagram.com/cafe.martinez'), null)
  assert.equal(urlInstagram('https://evil.com/?u=instagram.com/cafe.martinez'), null)
})

caso('urlInstagram returns null for post, reel, story and explore URLs', () => {
  assert.equal(urlInstagram('https://www.instagram.com/p/Cx123abc/'), null)
  assert.equal(urlInstagram('https://www.instagram.com/reel/Cx123abc/'), null)
  assert.equal(urlInstagram('https://www.instagram.com/reels/Cx123abc/'), null)
  assert.equal(urlInstagram('https://www.instagram.com/stories/cafe.martinez/123/'), null)
  assert.equal(urlInstagram('https://www.instagram.com/explore/tags/cafe/'), null)
  assert.equal(urlInstagram('https://www.instagram.com/tv/Cx123abc/'), null)
})

caso('urlInstagram returns null for empty or invalid input', () => {
  assert.equal(urlInstagram(null), null)
  assert.equal(urlInstagram('  '), null)
  assert.equal(urlInstagram('@'), null)
  assert.equal(urlInstagram('no válido!'), null)
})

// --- urlSitioWeb ------------------------------------------------------------

caso('urlSitioWeb keeps http(s) URLs and adds https:// when missing', () => {
  assert.equal(urlSitioWeb('https://cafe.com.ar/menu'), 'https://cafe.com.ar/menu')
  assert.equal(urlSitioWeb('http://cafe.com.ar'), 'http://cafe.com.ar')
  assert.equal(urlSitioWeb('  www.cafe.com.ar '), 'https://www.cafe.com.ar')
})

caso('urlSitioWeb returns null for empty, spaced or non-web schemes', () => {
  assert.equal(urlSitioWeb(null), null)
  assert.equal(urlSitioWeb('   '), null)
  assert.equal(urlSitioWeb('no es un sitio'), null)
  assert.equal(urlSitioWeb('javascript:alert(1)'), null)
})

console.log(`\n${casos} casos ok`)
