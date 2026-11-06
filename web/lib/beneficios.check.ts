// Self-contained check for beneficios.ts (the repo has no test runner).
//   npx --yes tsx web/lib/beneficios.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import {
  RUBROS, labelRubro, estadoBeneficio, hoyArgentina, ordenarBeneficios,
  formVacio, formDesdeBeneficio, validarBeneficio, datosBeneficio,
  rutaDesdeUrlPublica, errorImagen, extensionImagen,
  type FormBeneficio,
} from './beneficios'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-11-06'
const vig = (activo: boolean, desde: string | null, hasta: string | null) =>
  ({ activo, vigente_desde: desde, vigente_hasta: hasta })

caso('the rubro list matches the CHECK constraint', () => {
  assert.deepEqual(RUBROS.map(r => r.value),
    ['gastronomia', 'deportes', 'salud', 'belleza', 'indumentaria', 'educacion', 'servicios', 'otros'])
  assert.equal(labelRubro('educacion'), 'Educación')
  assert.equal(labelRubro('desconocido'), 'desconocido')
})

caso('estado: active with no dates is Activo', () => {
  assert.equal(estadoBeneficio(vig(true, null, null), HOY), 'activo')
})

caso('estado: inactive is Pausado even if expired', () => {
  assert.equal(estadoBeneficio(vig(false, null, null), HOY), 'pausado')
  assert.equal(estadoBeneficio(vig(false, null, '2026-01-01'), HOY), 'pausado')
})

caso('estado: past hasta is Vencido, future desde is Programado, bounds inclusive', () => {
  assert.equal(estadoBeneficio(vig(true, null, '2026-11-05'), HOY), 'vencido')
  assert.equal(estadoBeneficio(vig(true, '2026-11-07', null), HOY), 'programado')
  assert.equal(estadoBeneficio(vig(true, HOY, HOY), HOY), 'activo')
})

caso('hoyArgentina uses the Buenos Aires date, not UTC', () => {
  // 02:00 UTC on Nov 7 is still 23:00 on Nov 6 in Argentina (UTC-3).
  assert.equal(hoyArgentina(new Date('2026-11-07T02:00:00Z')), '2026-11-06')
  assert.equal(hoyArgentina(new Date('2026-11-07T03:00:00Z')), '2026-11-07')
})

caso('ordenar: destacado first, then orden, then nombre', () => {
  const b = (nombre: string, destacado: boolean, orden: number) => ({ nombre, destacado, orden })
  const lista = [b('Zeta', false, 0), b('Alfa', false, 0), b('Café', true, 5), b('Bar', false, -1)]
  assert.deepEqual(ordenarBeneficios(lista).map(x => x.nombre), ['Café', 'Bar', 'Alfa', 'Zeta'])
  assert.equal(lista[0].nombre, 'Zeta', 'does not mutate the input')
})

const valido = (cambios: Partial<FormBeneficio> = {}): FormBeneficio =>
  ({ ...formVacio(), nombre: 'Café Uncas', rubro: 'gastronomia', descuento: '10% off', ...cambios })

caso('validar: a complete form has no error', () => {
  assert.equal(validarBeneficio(valido()), null)
})

caso('validar: nombre, rubro and descuento are required (blank counts as empty)', () => {
  assert.equal(validarBeneficio(valido({ nombre: '   ' })), 'El nombre del local es obligatorio.')
  assert.equal(validarBeneficio(valido({ rubro: '' })), 'Elegí un rubro.')
  assert.equal(validarBeneficio(valido({ descuento: '' })), 'El descuento es obligatorio.')
})

caso('validar: unknown rubro is rejected', () => {
  assert.equal(validarBeneficio(valido({ rubro: 'bebidas' })), 'Elegí un rubro.')
})

caso('validar: desde after hasta is rejected, equal is fine', () => {
  assert.equal(
    validarBeneficio(valido({ vigente_desde: '2026-12-01', vigente_hasta: '2026-11-30' })),
    'La fecha "vigente desde" no puede ser posterior a "vigente hasta".',
  )
  assert.equal(validarBeneficio(valido({ vigente_desde: '2026-12-01', vigente_hasta: '2026-12-01' })), null)
  assert.equal(validarBeneficio(valido({ vigente_desde: '2026-12-01' })), null)
})

caso('validar: orden must be an integer', () => {
  assert.equal(validarBeneficio(valido({ orden: '1.5' })), 'El orden tiene que ser un número entero.')
  assert.equal(validarBeneficio(valido({ orden: 'abc' })), 'El orden tiene que ser un número entero.')
  assert.equal(validarBeneficio(valido({ orden: '' })), null)
  assert.equal(validarBeneficio(valido({ orden: '-3' })), null)
})

caso('datos: trims text, blanks become null, orden defaults to 0', () => {
  const d = datosBeneficio(valido({ nombre: '  Café  ', zona: '  ', instagram: ' @cafe ', orden: '' }))
  assert.equal(d.nombre, 'Café')
  assert.equal(d.zona, null)
  assert.equal(d.instagram, '@cafe')
  assert.equal(d.orden, 0)
  assert.equal(d.vigente_desde, null)
  assert.equal(d.activo, true)
  assert.equal(d.destacado, false)
  assert.equal('logo_url' in d, false, 'images are handled separately')
})

caso('form from an existing row round-trips through datos', () => {
  const fila = {
    id: 'b1', nombre: 'Gym', rubro: 'deportes', descuento: '15%', descripcion: null, condiciones: 'Solo efectivo',
    direccion: null, zona: 'Centro', telefono_whatsapp: null, instagram: null, sitio_web: 'gym.com',
    logo_url: null, imagen_url: null, destacado: true, orden: 2, activo: false,
    vigente_desde: '2026-01-01', vigente_hasta: null,
  }
  const f = formDesdeBeneficio(fila)
  assert.equal(f.orden, '2')
  assert.equal(f.descripcion, '')
  const d = datosBeneficio(f)
  assert.deepEqual(
    { ...d },
    {
      nombre: 'Gym', rubro: 'deportes', descuento: '15%', descripcion: null, condiciones: 'Solo efectivo',
      direccion: null, zona: 'Centro', telefono_whatsapp: null, instagram: null, sitio_web: 'gym.com',
      destacado: true, orden: 2, activo: false, vigente_desde: '2026-01-01', vigente_hasta: null,
    },
  )
})

caso('storage path from a public URL of the bucket', () => {
  const base = 'https://x.supabase.co/storage/v1/object/public/beneficios/'
  assert.equal(rutaDesdeUrlPublica(`${base}b1/logo-123.jpg`, 'beneficios'), 'b1/logo-123.jpg')
  assert.equal(rutaDesdeUrlPublica(`${base}b1/foto%20uno.jpg?v=2`, 'beneficios'), 'b1/foto uno.jpg')
  assert.equal(rutaDesdeUrlPublica('https://otro.com/logo.png', 'beneficios'), null)
  assert.equal(rutaDesdeUrlPublica('https://x.supabase.co/storage/v1/object/public/noticias/a.jpg', 'beneficios'), null)
  assert.equal(rutaDesdeUrlPublica(null, 'beneficios'), null)
})

caso('image check follows the bucket limits (5 MB, jpeg/png/webp)', () => {
  assert.equal(errorImagen({ type: 'image/jpeg', size: 1000 }), null)
  assert.equal(errorImagen({ type: 'image/webp', size: 5 * 1024 * 1024 }), null)
  assert.equal(errorImagen({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), 'La imagen pesa más de 5 MB. Elegí una más liviana.')
  assert.equal(errorImagen({ type: 'image/heic', size: 1000 }), 'Formato no admitido. Usá una imagen JPG, PNG o WEBP.')
  assert.equal(extensionImagen('image/jpeg'), 'jpg')
  assert.equal(extensionImagen('image/png'), 'png')
  assert.equal(extensionImagen('image/webp'), 'webp')
})

console.log(`\n${casos} casos ok`)
