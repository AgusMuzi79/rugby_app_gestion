// Verificación autocontenida de rolesStaff.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/rolesStaff.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { rolStaffDe, reemplazarRolStaff, rolesParaEditar, rolesParaCrear, esRolSoloWeb } from './rolesStaff'

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

// Web-only roles (beneficios): granted through assign-role, which ADDS them to
// roles[] and keeps the active rol. EDITAR ROL replaces a role, so it must not
// turn another staff role into a web-only one, nor offer it on account creation
// (admin-usuarios `create` rejects web-only roles).
const ADMIN = [...STAFF, 'secretaria', 'porteria', 'canchero', 'buffet', 'beneficios']

caso('EDITAR ROL does not offer a web-only role to replace another staff role', () => {
  assert.deepEqual(rolesParaEditar(ADMIN, 'coordinador'), ADMIN.filter(r => r !== 'beneficios'))
})

caso('EDITAR ROL keeps the web-only role visible when it is the current one', () => {
  assert.deepEqual(rolesParaEditar(ADMIN, 'beneficios'), ADMIN)
})

caso('new accounts cannot be created with a web-only role', () => {
  assert.deepEqual(rolesParaCrear(ADMIN), ADMIN.filter(r => r !== 'beneficios'))
})

caso('esRolSoloWeb only marks beneficios', () => {
  assert.equal(esRolSoloWeb('beneficios'), true)
  assert.equal(esRolSoloWeb('buffet'), false)
})

// Colaborador (2026-11-10): subcomisión ya no lo gestiona (lo designa el
// entrenador). EDITAR ROL de subcomisión tiene que dejarlo en roles[]: si lo
// sacara, guard_profile_role_update (20261112000000) rechazaría el UPDATE.
const STAFF_SUBCO = ['coordinador', 'entrenador', 'manager', 'subcomision']

caso('subcomisión: el rol de staff de un colaborador-entrenador es entrenador', () => {
  assert.equal(rolStaffDe('colaborador', ['socio', 'colaborador', 'entrenador'], STAFF_SUBCO), 'entrenador')
  assert.equal(rolStaffDe('colaborador', ['socio', 'colaborador'], STAFF_SUBCO), null)
})

caso('subcomisión: EDITAR ROL conserva colaborador en roles[] y como rol activo', () => {
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'colaborador', roles: ['socio', 'colaborador', 'entrenador'] }, 'entrenador', 'manager'),
    { rol: 'colaborador', roles: ['socio', 'colaborador', 'manager'] },
  )
  assert.deepEqual(
    reemplazarRolStaff({ rol: 'entrenador', roles: ['socio', 'entrenador', 'colaborador'] }, 'entrenador', 'coordinador'),
    { rol: 'coordinador', roles: ['socio', 'coordinador', 'colaborador'] },
  )
})

console.log(`\n${casos} casos ok`)
