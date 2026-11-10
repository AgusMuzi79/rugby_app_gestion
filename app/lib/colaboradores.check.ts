// Verificación autocontenida de colaboradores.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/colaboradores.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  MIN_CARACTERES_BUSQUEDA,
  busquedaColaborador,
  colaboradoresDeDivision,
  divisionInicial,
  marcarDesignado,
  textoConfirmarQuitar,
  type ColaboradorListado,
  type ResultadoBusqueda,
} from './colaboradores'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Búsqueda: nombre o DNI (mismas reglas que _shared/colaboradores.ts) ─────

caso('búsqueda: vacía o sólo espacios → no se busca y no hay aviso', () => {
  assert.deepEqual(busquedaColaborador(''), { tipo: 'vacia' })
  assert.deepEqual(busquedaColaborador('   '), { tipo: 'vacia' })
})

caso('búsqueda: menos de 3 caracteres → aviso, no se llama al servidor', () => {
  assert.equal(MIN_CARACTERES_BUSQUEDA, 3)
  assert.deepEqual(busquedaColaborador('ab'), { tipo: 'corta', mensaje: 'Escribí al menos 3 caracteres' })
})

caso('búsqueda: nombre → se manda limpio (espacios colapsados)', () => {
  assert.deepEqual(busquedaColaborador('  juan   pérez '), { tipo: 'buscar', q: 'juan pérez', esDni: false })
})

caso('búsqueda: DNI con puntos o espacios → sólo dígitos', () => {
  assert.deepEqual(busquedaColaborador('30.123.456'), { tipo: 'buscar', q: '30123456', esDni: true })
  assert.deepEqual(busquedaColaborador('30 123 456'), { tipo: 'buscar', q: '30123456', esDni: true })
})

caso('búsqueda: DNI de menos de 3 dígitos → aviso de dígitos', () => {
  assert.deepEqual(busquedaColaborador('1.2'), { tipo: 'corta', mensaje: 'Escribí al menos 3 dígitos' })
})

caso('búsqueda: letras y números mezclados es un nombre', () => {
  assert.deepEqual(busquedaColaborador('juan 2'), { tipo: 'buscar', q: 'juan 2', esDni: false })
})

// ─── Lista por división ──────────────────────────────────────────────────────

const lista: ColaboradorListado[] = [
  { profileId: 'b', nombre: 'Zárate, Ana', divisionIds: ['d1'] },
  { profileId: 'a', nombre: 'Álvarez, Luis', divisionIds: ['d1', 'd2'] },
  { profileId: 'c', nombre: 'Gómez, Pía', divisionIds: ['d2'] },
]

caso('lista: sólo los de esa división, por nombre (con tildes en orden)', () => {
  assert.deepEqual(colaboradoresDeDivision(lista, 'd1').map(c => c.profileId), ['a', 'b'])
  assert.deepEqual(colaboradoresDeDivision(lista, 'd2').map(c => c.profileId), ['a', 'c'])
})

caso('lista: sin división elegida o división sin colaboradores → vacía', () => {
  assert.deepEqual(colaboradoresDeDivision(lista, null), [])
  assert.deepEqual(colaboradoresDeDivision(lista, 'd9'), [])
})

// ─── División inicial ────────────────────────────────────────────────────────

caso('división inicial: conserva la elegida si sigue; si no, la primera', () => {
  const divs = [{ id: 'd1', nombre: 'M15' }, { id: 'd2', nombre: 'M17' }]
  assert.equal(divisionInicial(divs, 'd2'), 'd2')
  assert.equal(divisionInicial(divs, 'd9'), 'd1')
  assert.equal(divisionInicial(divs, null), 'd1')
  assert.equal(divisionInicial([], 'd1'), null)
})

// ─── Resultado designado ─────────────────────────────────────────────────────

caso('designar: el resultado pasa a "ya es colaborador" sin tocar los demás', () => {
  const resultados: ResultadoBusqueda[] = [
    { profileId: 'a', nombre: 'A', yaEsColaborador: false, elegible: true },
    { profileId: 'b', nombre: 'B', yaEsColaborador: false, elegible: false, motivo: 'No es socio del club' },
  ]
  const nuevos = marcarDesignado(resultados, 'a')
  assert.equal(nuevos[0].yaEsColaborador, true)
  assert.deepEqual(nuevos[1], resultados[1])
  // no muta la lista original
  assert.equal(resultados[0].yaEsColaborador, false)
})

// ─── Confirmación de quitar ──────────────────────────────────────────────────

caso('confirmar quitar: nombra a la persona y la división', () => {
  assert.equal(
    textoConfirmarQuitar('Gómez, Pía', 'M17'),
    'Gómez, Pía deja de ser colaborador de M17: ya no toma asistencia ni recibe el recordatorio de esa división.',
  )
})

console.log(`\n${casos} casos OK`)
