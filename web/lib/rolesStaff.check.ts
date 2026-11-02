// Verificación autocontenida de rolesStaff.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/rolesStaff.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { rolStaffDe, reemplazarRolStaff } from './rolesStaff'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const STAFF = ['coordinador', 'entrenador', 'colaborador', 'manager', 'subcomision']

caso('el rol de staff es el activo cuando el activo es de staff', () => {
  assert.equal(rolStaffDe('manager', ['socio', 'entrenador', 'manager'], STAFF), 'manager')
})

caso('en vista socio el rol de staff sale de roles[]', () => {
  assert.equal(rolStaffDe('socio', ['socio', 'entrenador'], STAFF), 'entrenador')
})

caso('sin rol de staff da null', () => {
  assert.equal(rolStaffDe('socio', ['socio'], STAFF), null)
  assert.equal(rolStaffDe('socio', null, STAFF), null)
})

caso('cambiar el rol activo reemplaza también el de roles[]', () => {
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'entrenador', roles: ['socio', 'entrenador'] }, 'entrenador', 'manager'),
    { rol: 'manager', roles: ['socio', 'manager'] },
  )
})

caso('en vista socio cambia roles[] y el activo queda en socio', () => {
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'socio', roles: ['socio', 'entrenador'] }, 'entrenador', 'coordinador'),
    { rol: 'socio', roles: ['socio', 'coordinador'] },
  )
})

caso('si el nuevo rol ya estaba en roles[] no se duplica', () => {
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'entrenador', roles: ['entrenador', 'manager'] }, 'entrenador', 'manager'),
    { rol: 'manager', roles: ['manager'] },
  )
})

caso('los otros roles de staff de la cuenta se conservan', () => {
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'manager', roles: ['socio', 'entrenador', 'manager'] }, 'entrenador', 'coordinador'),
    { rol: 'manager', roles: ['socio', 'coordinador', 'manager'] },
  )
})

caso('roles[] null: queda sólo el nuevo rol', () => {
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'entrenador', roles: null }, 'entrenador', 'manager'),
    { rol: 'manager', roles: ['manager'] },
  )
})

console.log(`\n${casos} casos ok`)
