// Verificación autocontenida de partidosEntrenador.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/partidosEntrenador.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  ventanaPartidos, seccionarPartidos, paramsPedidoPartido, leerPedidoPartido,
  partidosSinResultado, elegirDivision,
} from './partidosEntrenador'

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
  assert.deepEqual(secciones[0].partidos.map(x => x.id), ['sab', 'ant'])     // el más reciente primero
  assert.deepEqual(secciones[1].partidos.map(x => x.id), ['hoy', 'prox'])    // hoy cuenta como próximo
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

caso('deep link de la tarea RESULTADO: ida y vuelta por los params de la ruta', () => {
  const params = paramsPedidoPartido({ eventoId: 'ev1', divisionId: 'd2', paso: 'resultado' }, '123')
  assert.deepEqual(params, { eventoId: 'ev1', divisionId: 'd2', paso: 'resultado', pedido: '123' })
  assert.deepEqual(leerPedidoPartido(params), { eventoId: 'ev1', divisionId: 'd2', paso: 'resultado', marca: '123' })
})

caso('deep link: sin paso (tarea MESA) y params raros', () => {
  assert.deepEqual(paramsPedidoPartido({ eventoId: 'ev1', divisionId: 'd2' }, '9'), { eventoId: 'ev1', divisionId: 'd2', pedido: '9' })
  assert.deepEqual(leerPedidoPartido({ eventoId: ['ev1', 'x'], paso: 'cualquiera' }), { eventoId: 'ev1' })
  assert.deepEqual(leerPedidoPartido({}), {})
})

caso('tarea RESULTADO: pendientes de la última semana, el más reciente primero, sin infantiles', () => {
  const pendientes = partidosSinResultado(
    [
      { id: 'a', fecha: '2026-10-20', division_id: 'm15' },
      { id: 'b', fecha: '2026-10-24', division_id: 'm16' },
      { id: 'c', fecha: '2026-10-24', division_id: 'm8' },   // infantil
      { id: 'd', fecha: '2026-10-25', division_id: 'm15' },  // ya tiene resultado
    ],
    new Set(['d']),
    new Set(['m8']),
  )
  assert.deepEqual(pendientes.map(x => x.id), ['b', 'a'])
})

caso('división: la pedida si es del entrenador; si no, la actual; si no, la primera', () => {
  const divs = [{ id: 'a' }, { id: 'b' }]
  assert.equal(elegirDivision(divs, 'b', 'a'), 'b')
  assert.equal(elegirDivision(divs, 'zz', 'b'), 'b')
  assert.equal(elegirDivision(divs, null, 'zz'), 'a')
  assert.equal(elegirDivision([], 'a', 'a'), null)
})

console.log(`\n${casos} casos ok`)
