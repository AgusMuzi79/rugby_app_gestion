// Verificación autocontenida de colaboradores.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/colaboradores.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  autorizarCaller, divisionesVisibles, estadoTrasAsignar, estadoTrasQuitar, interpretarBusqueda,
  motivoNoElegible, verificarDivisionDelCaller, type Candidato,
} from './colaboradores.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = new Date('2026-11-10T12:00:00Z')
const CALLER_ID = 'entrenador-1'
const M15 = 'div-m15'
const M16 = 'div-m16'

function candidato(parcial: Partial<Candidato>): Candidato {
  return {
    id: 'socio-1', activo: true, rol: 'socio', roles: ['socio'], divisiones: null,
    fechaNacimiento: '2000-05-01', tieneSocio: true, ...parcial,
  }
}

// ─── Caller ──────────────────────────────────────────────────────────────────

caso('el entrenador activo puede usar la function', () => {
  assert.equal(autorizarCaller({ rol: 'entrenador', activo: true }), null)
})

caso('otro rol activo o una cuenta inactiva no puede', () => {
  assert.equal(autorizarCaller({ rol: 'coordinador', activo: true })?.status, 403)
  assert.equal(autorizarCaller({ rol: 'socio', activo: true })?.status, 403)
  assert.equal(autorizarCaller({ rol: 'entrenador', activo: false })?.status, 403)
  assert.equal(autorizarCaller(null)?.status, 403)
})

caso('una división que no es del entrenador se rechaza', () => {
  assert.equal(verificarDivisionDelCaller(M15, [M15, M16]), null)
  assert.equal(verificarDivisionDelCaller('div-otra', [M15])?.status, 403)
  assert.equal(verificarDivisionDelCaller(M15, null)?.status, 403)
  assert.equal(verificarDivisionDelCaller(undefined, [M15])?.status, 400)
})

caso('listar sólo muestra las divisiones compartidas con el entrenador', () => {
  assert.deepEqual(divisionesVisibles([M15, 'div-x', M16], [M16, M15]), [M16, M15])
  assert.deepEqual(divisionesVisibles(null, [M15]), [])
})

// ─── Búsqueda ────────────────────────────────────────────────────────────────

caso('menos de 3 caracteres se rechaza', () => {
  assert.equal(interpretarBusqueda('ab').tipo, 'error')
  assert.equal(interpretarBusqueda('  a  ').tipo, 'error')
  assert.equal(interpretarBusqueda(undefined).tipo, 'error')
})

caso('sólo dígitos (con puntos o espacios) es DNI; con letras es nombre', () => {
  assert.deepEqual(interpretarBusqueda('30.123.456'), { tipo: 'dni', dni: '30123456' })
  assert.deepEqual(interpretarBusqueda(' 30123456 '), { tipo: 'dni', dni: '30123456' })
  assert.deepEqual(interpretarBusqueda('  Tomás   Pérez '), { tipo: 'nombre', q: 'Tomás Pérez' })
  assert.deepEqual(interpretarBusqueda('Juan 2'), { tipo: 'nombre', q: 'Juan 2' })
})

// ─── Elegibilidad ────────────────────────────────────────────────────────────

caso('un socio activo mayor de 13 es elegible', () => {
  assert.equal(motivoNoElegible(CALLER_ID, candidato({}), HOY), null)
})

caso('alguien que ya es colaborador de otra división sigue siendo elegible', () => {
  const c = candidato({ rol: 'colaborador', roles: ['socio', 'colaborador'], divisiones: [M16] })
  assert.equal(motivoNoElegible(CALLER_ID, c, HOY), null)
})

caso('se rechaza a quien tiene un rol que usa divisiones', () => {
  for (const r of ['entrenador', 'coordinador', 'manager', 'subcomision', 'admin']) {
    const c = candidato({ roles: ['socio', r] })
    assert.notEqual(motivoNoElegible(CALLER_ID, c, HOY), null, r)
  }
})

caso('el entrenador no se designa a sí mismo', () => {
  assert.notEqual(motivoNoElegible(CALLER_ID, candidato({ id: CALLER_ID }), HOY), null)
})

caso('menor de 13 se rechaza; sin fecha de nacimiento no se rechaza por edad', () => {
  assert.notEqual(motivoNoElegible(CALLER_ID, candidato({ fechaNacimiento: '2014-01-01' }), HOY), null)
  assert.equal(motivoNoElegible(CALLER_ID, candidato({ fechaNacimiento: '2013-11-10' }), HOY), null)
  assert.equal(motivoNoElegible(CALLER_ID, candidato({ fechaNacimiento: null }), HOY), null)
})

caso('cuenta inactiva, sin socio o cliente gimnasio no es elegible', () => {
  assert.notEqual(motivoNoElegible(CALLER_ID, candidato({ activo: false }), HOY), null)
  assert.notEqual(motivoNoElegible(CALLER_ID, candidato({ tieneSocio: false }), HOY), null)
  const cliente = candidato({ rol: 'cliente_gimnasio', roles: ['cliente_gimnasio'] })
  assert.notEqual(motivoNoElegible(CALLER_ID, cliente, HOY), null)
})

// ─── Asignar ─────────────────────────────────────────────────────────────────

caso('asignar agrega el rol, la división y lo deja como rol activo', () => {
  const r = estadoTrasAsignar(candidato({ divisiones: ['div-previa'] }), M15)
  assert.deepEqual(r, {
    roles: ['socio', 'colaborador'], rol: 'colaborador', divisiones: ['div-previa', M15], cambia: true,
  })
})

caso('asignar es idempotente si ya es colaborador de esa división', () => {
  const c = candidato({ rol: 'socio', roles: ['socio', 'colaborador'], divisiones: [M15] })
  const r = estadoTrasAsignar(c, M15)
  assert.equal(r.cambia, false)
  assert.deepEqual(r.divisiones, [M15])
  assert.deepEqual(r.roles, ['socio', 'colaborador'])
  // No le cambia el rol activo a quien eligió volver a la vista de socio.
  assert.equal(r.rol, 'socio')
})

// ─── Quitar ──────────────────────────────────────────────────────────────────

caso('quitar la última división saca el rol y vuelve a socio', () => {
  const c = candidato({ rol: 'colaborador', roles: ['socio', 'colaborador'], divisiones: [M15] })
  assert.deepEqual(estadoTrasQuitar(c, M15), { roles: ['socio'], rol: 'socio', divisiones: null })
})

caso('quitar una de dos divisiones conserva el rol', () => {
  const c = candidato({ rol: 'colaborador', roles: ['socio', 'colaborador'], divisiones: [M15, M16] })
  assert.deepEqual(estadoTrasQuitar(c, M15), { roles: ['socio', 'colaborador'], rol: 'colaborador', divisiones: [M16] })
})

caso('si el rol activo no era colaborador, se conserva', () => {
  const c = candidato({ rol: 'porteria', roles: ['porteria', 'colaborador'], divisiones: [M15] })
  assert.deepEqual(estadoTrasQuitar(c, M15), { roles: ['porteria'], rol: 'porteria', divisiones: null })
})

caso('sin socio en roles, el rol activo pasa al primero que queda', () => {
  const c = candidato({ rol: 'colaborador', roles: ['colaborador', 'buffet'], divisiones: [M15] })
  assert.deepEqual(estadoTrasQuitar(c, M15), { roles: ['buffet'], rol: 'buffet', divisiones: null })
})

caso('quitar que deja la cuenta sin roles se rechaza', () => {
  const c = candidato({ rol: 'colaborador', roles: ['colaborador'], divisiones: [M15] })
  assert.equal((estadoTrasQuitar(c, M15) as { status: number }).status, 409)
})

caso('quitar a quien no es colaborador de esa división se rechaza', () => {
  const sinRol = candidato({ roles: ['socio'], divisiones: [M15] })
  assert.equal((estadoTrasQuitar(sinRol, M15) as { status: number }).status, 404)
  const otraDiv = candidato({ rol: 'colaborador', roles: ['socio', 'colaborador'], divisiones: [M16] })
  assert.equal((estadoTrasQuitar(otraDiv, M15) as { status: number }).status, 404)
})

caso('quitar no toca a alguien con un rol que usa divisiones', () => {
  const c = candidato({ rol: 'entrenador', roles: ['socio', 'colaborador', 'entrenador'], divisiones: [M15] })
  assert.equal((estadoTrasQuitar(c, M15) as { status: number }).status, 403)
})

console.log(`\n${casos} casos OK`)
