// Verificación autocontenida de permisos-usuarios.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/permisos-usuarios.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  autorizarAccion, esRolSoloWeb, rolesTrasAsignar, rolesTrasQuitarStaff, ROLES_POR_CALLER, type Destino,
} from './permisos-usuarios.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const SUBCO = { id: 'subco-1', rol: 'subcomision' }
const ADMIN = { id: 'admin-1', rol: 'admin' }

function destino(parcial: Partial<Destino>): Destino {
  return { id: 'u-1', rol: 'entrenador', roles: ['entrenador'], tieneSocio: false, ...parcial }
}

caso('subcomisión no puede eliminar a nadie (sólo admin elimina)', () => {
  const r = autorizarAccion(SUBCO, destino({}), 'delete')
  assert.equal(r?.status, 403)
})

caso('admin elimina una cuenta de staff sin socio', () => {
  assert.equal(autorizarAccion(ADMIN, destino({}), 'delete'), null)
})

caso('nadie elimina una cuenta con fila de socio (cascada a cuotas y pagos)', () => {
  const r = autorizarAccion(ADMIN, destino({ roles: ['socio', 'entrenador'], tieneSocio: true }), 'delete')
  assert.equal(r?.status, 409)
})

caso('subcomisión no puede banear ni leer al admin', () => {
  const admin = destino({ id: 'admin-1b', rol: 'admin', roles: ['admin'] })
  for (const a of ['deactivate', 'reactivate', 'getUser', 'delete', 'remove-role'] as const) {
    assert.equal(autorizarAccion(SUBCO, admin, a)?.status, 403, a)
  }
})

caso('admin tampoco actúa sobre otra cuenta admin', () => {
  const otro = destino({ id: 'admin-2', rol: 'socio', roles: ['socio', 'admin'], tieneSocio: true })
  assert.equal(autorizarAccion(ADMIN, otro, 'deactivate')?.status, 403)
})

caso('nadie se banea ni se elimina a sí mismo', () => {
  const yo = destino({ id: SUBCO.id, rol: 'subcomision', roles: ['subcomision'] })
  assert.equal(autorizarAccion(SUBCO, yo, 'deactivate')?.status, 403)
  assert.equal(autorizarAccion(SUBCO, yo, 'remove-role')?.status, 403)
})

caso('subcomisión no actúa sobre un socio común ni sobre staff que no gestiona', () => {
  const socio = destino({ rol: 'socio', roles: ['socio'], tieneSocio: true })
  assert.equal(autorizarAccion(SUBCO, socio, 'deactivate')?.status, 403)
  assert.equal(autorizarAccion(SUBCO, socio, 'getUser')?.status, 403)
  const secretaria = destino({ rol: 'secretaria', roles: ['secretaria'] })
  assert.equal(autorizarAccion(SUBCO, secretaria, 'deactivate')?.status, 403)
  assert.equal(autorizarAccion(ADMIN, secretaria, 'deactivate'), null)
})

caso('subcomisión gestiona staff que tiene un rol suyo aunque el rol activo sea socio', () => {
  const coach = destino({ rol: 'socio', roles: ['socio', 'entrenador'], tieneSocio: true })
  for (const a of ['deactivate', 'reactivate', 'getUser', 'remove-role'] as const) {
    assert.equal(autorizarAccion(SUBCO, coach, a), null, a)
  }
})

caso('quitar rol de staff exige que quede otro rol (si no, desactivar)', () => {
  const soloStaff = destino({})
  assert.equal(autorizarAccion(SUBCO, soloStaff, 'remove-role')?.status, 409)
})

caso('quitar rol de staff deja socio y los roles que el caller no gestiona', () => {
  assert.deepEqual(
    rolesTrasQuitarStaff('subcomision', ['socio', 'entrenador', 'manager']),
    { roles: ['socio'], rol: 'socio' },
  )
  assert.deepEqual(
    rolesTrasQuitarStaff('subcomision', ['socio', 'secretaria', 'entrenador']),
    { roles: ['socio', 'secretaria'], rol: 'socio' },
  )
  assert.deepEqual(
    rolesTrasQuitarStaff('admin', ['secretaria', 'tutor']),
    { roles: ['tutor'], rol: 'tutor' },
  )
  assert.equal(rolesTrasQuitarStaff('admin', ['buffet']), null)
})

caso('colaborador (T23): subcomisión y admin lo crean, como a un entrenador', () => {
  assert.ok(ROLES_POR_CALLER.subcomision.includes('colaborador'))
  assert.ok(ROLES_POR_CALLER.admin.includes('colaborador'))
})

caso('colaborador (T23): subcomisión gestiona la cuenta y quitarle el rol deja socio', () => {
  const colab = destino({ rol: 'colaborador', roles: ['colaborador'] })
  for (const a of ['deactivate', 'reactivate', 'getUser'] as const) {
    assert.equal(autorizarAccion(SUBCO, colab, a), null, a)
  }
  assert.deepEqual(
    rolesTrasQuitarStaff('subcomision', ['socio', 'colaborador']),
    { roles: ['socio'], rol: 'socio' },
  )
})

caso('beneficios: sólo admin lo asigna (subcomisión no)', () => {
  assert.ok(ROLES_POR_CALLER.admin.includes('beneficios'))
  assert.ok(!ROLES_POR_CALLER.subcomision.includes('beneficios'))
})

caso('beneficios es un rol sólo web; los roles de la app no', () => {
  assert.ok(esRolSoloWeb('beneficios'))
  for (const r of ['socio', 'entrenador', 'secretaria', 'subcomision', 'admin']) {
    assert.ok(!esRolSoloWeb(r), r)
  }
})

caso('asignar beneficios lo agrega a roles y deja el rol activo como estaba', () => {
  assert.deepEqual(
    rolesTrasAsignar(['socio'], 'socio', 'beneficios'),
    { roles: ['socio', 'beneficios'], rol: 'socio' },
  )
  assert.deepEqual(
    rolesTrasAsignar(['socio', 'entrenador'], 'entrenador', 'beneficios'),
    { roles: ['socio', 'entrenador', 'beneficios'], rol: 'entrenador' },
  )
  // Sin rol activo conocido: queda socio (la app no puede usar un rol sólo web).
  assert.deepEqual(
    rolesTrasAsignar([], null, 'beneficios'),
    { roles: ['socio', 'beneficios'], rol: 'socio' },
  )
})

caso('asignar un rol de la app sigue pasándolo a rol activo (comportamiento previo)', () => {
  assert.deepEqual(
    rolesTrasAsignar(['socio'], 'socio', 'entrenador'),
    { roles: ['socio', 'entrenador'], rol: 'entrenador' },
  )
  assert.deepEqual(
    rolesTrasAsignar(['socio', 'beneficios'], 'socio', 'manager'),
    { roles: ['socio', 'beneficios', 'manager'], rol: 'manager' },
  )
})

caso('beneficios: admin gestiona la cuenta y quitarle el rol deja socio; subcomisión no', () => {
  const socia = destino({ rol: 'socio', roles: ['socio', 'beneficios'], tieneSocio: true })
  assert.equal(autorizarAccion(ADMIN, socia, 'remove-role'), null)
  assert.deepEqual(
    rolesTrasQuitarStaff('admin', ['socio', 'beneficios']),
    { roles: ['socio'], rol: 'socio' },
  )
  assert.equal(autorizarAccion(SUBCO, socia, 'remove-role')?.status, 403)
  // Si además tiene un rol de staff de subcomisión, ésta sólo le saca ese.
  assert.deepEqual(
    rolesTrasQuitarStaff('subcomision', ['socio', 'entrenador', 'beneficios']),
    { roles: ['socio', 'beneficios'], rol: 'socio' },
  )
})

console.log(`\n${casos} casos ok`)
