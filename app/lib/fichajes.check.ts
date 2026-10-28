// Verificación autocontenida de fichajes.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/fichajes.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  divisionInicial,
  filtrarPorDivision,
  mensajeErrorFichaje,
  validarFichaje,
} from './fichajes'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const M15 = { id: 'd15', nombre: 'M15' }
const M16 = { id: 'd16', nombre: 'M16' }
const FORM = { nombre: ' Juan Pérez ', dni: ' 40000001 ', fechaNacimiento: '2011-03-04', divisionId: 'd16' }

caso('la división es obligatoria', () => {
  assert.equal(validarFichaje({ ...FORM, divisionId: null }), 'Elegí la división.')
  assert.equal(validarFichaje(FORM), null)
})

caso('nombre, DNI y fecha siguen siendo obligatorios (con espacios = vacío)', () => {
  assert.equal(validarFichaje({ ...FORM, nombre: '   ' }), 'Ingresá el nombre completo.')
  assert.equal(validarFichaje({ ...FORM, dni: ' ' }), 'Ingresá el DNI.')
  assert.equal(validarFichaje({ ...FORM, fechaNacimiento: '' }), 'Seleccioná la fecha de nacimiento.')
})

caso('con una sola división se preselecciona; con varias, la del filtro o ninguna', () => {
  assert.equal(divisionInicial([M15], null), 'd15')
  assert.equal(divisionInicial([M15, M16], null), null)
  assert.equal(divisionInicial([M15, M16], 'd16'), 'd16')
  assert.equal(divisionInicial([M15, M16], 'otra'), null)
  assert.equal(divisionInicial([], null), null)
})

caso('el filtro null muestra todas; con división, sólo esa', () => {
  const lista = [{ id: 'a', divisionId: 'd15' }, { id: 'b', divisionId: 'd16' }]
  assert.deepEqual(filtrarPorDivision(lista, null).map(j => j.id), ['a', 'b'])
  assert.deepEqual(filtrarPorDivision(lista, 'd16').map(j => j.id), ['b'])
})

caso('errores del RPC: DNI repetido, sin permiso y genérico', () => {
  assert.equal(
    mensajeErrorFichaje({ code: '23505', message: 'duplicate key value violates unique constraint "jugadores_dni_division_id_key"' }),
    'Ya existe un jugador con ese DNI en esta división.',
  )
  assert.equal(
    mensajeErrorFichaje({ code: '42501', message: 'new row violates row-level security policy for table "jugadores"' }),
    'No tenés permiso para fichar en esa división.',
  )
  assert.equal(mensajeErrorFichaje({ code: '22023', message: 'Elegí la división.' }), 'Elegí la división.')
  assert.equal(mensajeErrorFichaje({ message: '' }), 'No se pudo registrar el fichaje. Revisá la conexión y reintentá.')
  assert.equal(mensajeErrorFichaje(null), 'No se pudo registrar el fichaje. Revisá la conexión y reintentá.')
})

console.log(`\n${casos} casos OK`)
