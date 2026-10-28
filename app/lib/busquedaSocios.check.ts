// Verificación autocontenida de busquedaSocios.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/busquedaSocios.check.ts

import assert from 'node:assert/strict'
import { coincideBusqueda, nombresSocio, normalizar, filtrarSocios } from './busquedaSocios'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const garcia = { nombre: 'GARCÍA, José María', nombreApp: 'Pepe Garcia', dni: '30111222', numero_socio: '1528', estado: 'activo' }
const perez  = { nombre: 'PÉREZ, Ana',         nombreApp: '',            dni: '40999888', numero_socio: '77',   estado: 'pendiente' }

caso('normalizar: sin tildes ni mayúsculas', () => {
  assert.equal(normalizar('García ÑANDÚ'), 'garcia nandu')
})

caso('busca por nombre del padrón sin importar tildes ni mayúsculas', () => {
  assert.ok(coincideBusqueda('garcia', garcia))
  assert.ok(coincideBusqueda('JOSÉ', garcia))
})

caso('busca por el nombre que el socio puso en la app', () => {
  assert.ok(coincideBusqueda('pepe', garcia))
})

caso('las palabras pueden venir en cualquier orden', () => {
  assert.ok(coincideBusqueda('maria garcia', garcia))
  assert.ok(!coincideBusqueda('maria perez', garcia))
})

caso('busca por DNI y por Nº de socio', () => {
  assert.ok(coincideBusqueda('30111', garcia))
  assert.ok(coincideBusqueda('1528', garcia))
})

caso('búsqueda vacía o sólo espacios coincide con todos', () => {
  assert.ok(coincideBusqueda('', perez))
  assert.ok(coincideBusqueda('   ', perez))
})

caso('nombresSocio: el nombre del padrón manda y el de la app queda aparte', () => {
  assert.deepEqual(nombresSocio('GARCÍA, José', { nombre: 'Pepe' }), { nombre: 'GARCÍA, José', nombreApp: 'Pepe' })
  assert.deepEqual(nombresSocio(null, { nombre: 'Pepe' }), { nombre: 'Pepe', nombreApp: 'Pepe' })
  assert.deepEqual(nombresSocio('  ', null), { nombre: '—', nombreApp: '' })
})

caso('filtrarSocios: aplica el filtro de estado y la búsqueda juntos', () => {
  const lista = [garcia, perez]
  assert.deepEqual(filtrarSocios(lista, 'todos', ''), lista)
  assert.deepEqual(filtrarSocios(lista, 'pendiente', ''), [perez])
  assert.deepEqual(filtrarSocios(lista, 'todos', 'perez'), [perez])
  assert.deepEqual(filtrarSocios(lista, 'activo', 'perez'), [])
})

console.log(`\n${casos} casos ok`)
