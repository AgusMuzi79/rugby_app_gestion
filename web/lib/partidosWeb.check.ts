// Verificación autocontenida de partidosWeb.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/partidosWeb.check.ts
// Casos portados de app/lib/partidosEntrenador.check.ts. Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { ventanaPartidos, seccionarPartidos, elegirDivision, pasosPartido } from './partidosWeb'

process.env.TZ = 'America/Argentina/Buenos_Aires'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const p = (id: string, fecha: string, conResultado = false) => ({ id, fecha, conResultado })

caso('ventana: 7 días atrás y 14 adelante, en fecha local (lunes 22:30 ART)', () => {
  // 2026-10-27 01:30 UTC = lunes 26/10 22:30 en Argentina
  const v = ventanaPartidos(new Date('2026-10-27T01:30:00Z'))
  assert.deepEqual(v, { hoy: '2026-10-26', desde: '2026-10-19', hasta: '2026-11-09' })
})

caso('el partido del sábado sin resultado aparece el lunes, primero, en SIN RESULTADO', () => {
  const secciones = seccionarPartidos(
    [p('prox', '2026-10-31'), p('sab', '2026-10-24'), p('hoy', '2026-10-26'), p('ant', '2026-10-20')],
    '2026-10-26', true,
  )
  assert.deepEqual(secciones.map(s => s.clave), ['sin_resultado', 'proximos'])
  assert.equal(secciones[0].titulo, 'SIN RESULTADO')
  assert.deepEqual(secciones[0].partidos.map(x => x.id), ['sab', 'ant'])
  assert.deepEqual(secciones[1].partidos.map(x => x.id), ['hoy', 'prox'])
})

caso('pasados con resultado van a JUGADOS (al final); vacías no se muestran', () => {
  const secciones = seccionarPartidos([p('a', '2026-10-24', true), p('b', '2026-10-17', true)], '2026-10-26', true)
  assert.deepEqual(secciones.map(s => s.clave), ['jugados'])
  assert.deepEqual(secciones[0].partidos.map(x => x.id), ['a', 'b'])
})

caso('infantiles no cargan resultado: un pasado sin resultado no es "SIN RESULTADO"', () => {
  const secciones = seccionarPartidos([p('a', '2026-10-24')], '2026-10-26', false)
  assert.deepEqual(secciones.map(s => s.clave), ['jugados'])
})

caso('división: la pedida si es del entrenador; si no, la actual; si no, la primera', () => {
  const divs = [{ id: 'a' }, { id: 'b' }]
  assert.equal(elegirDivision(divs, 'b', 'a'), 'b')
  assert.equal(elegirDivision(divs, 'zz', 'b'), 'b')
  assert.equal(elegirDivision(divs, null, 'zz'), 'a')
  assert.equal(elegirDivision([], 'a', 'a'), null)
})

caso('pasos: infantil sólo equipo y asistencia; el resto los cuatro', () => {
  assert.deepEqual(pasosPartido(true), ['equipo', 'asistencia'])
  assert.deepEqual(pasosPartido(false), ['equipo', 'asistencia', 'mesa', 'resultado'])
})

console.log(`\n${casos} casos ok`)
