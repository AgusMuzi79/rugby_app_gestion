// Verificación autocontenida de rolMovil.ts (no hay runner de tests en app/).
//   npx tsx app/lib/rolMovil.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { aplicarPerfilMovil, normalizarRolesMovil } from './rolMovil'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}
async function casoAsync(nombre: string, fn: () => Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── normalizarRolesMovil ────────────────────────────────────────────────────

caso('socio + beneficios con rol socio: se oculta beneficios, sin reescribir', () => {
  assert.deepEqual(normalizarRolesMovil('socio', ['socio', 'beneficios']), {
    rol: 'socio', roles: ['socio'], reescribir: false,
  })
})

caso('socio + beneficios con rol beneficios: pasa a socio y se reescribe', () => {
  assert.deepEqual(normalizarRolesMovil('beneficios', ['socio', 'beneficios']), {
    rol: 'socio', roles: ['socio'], reescribir: true,
  })
})

caso('coordinador + socio + beneficios: sólo se saca beneficios', () => {
  assert.deepEqual(normalizarRolesMovil('coordinador', ['coordinador', 'socio', 'beneficios']), {
    rol: 'coordinador', roles: ['coordinador', 'socio'], reescribir: false,
  })
})

caso('rol web sin socio: toma el primer rol móvil que quede', () => {
  assert.deepEqual(normalizarRolesMovil('beneficios', ['beneficios', 'manager', 'entrenador']), {
    rol: 'manager', roles: ['manager', 'entrenador'], reescribir: true,
  })
})

caso('sólo beneficios: sin rol móvil (no tiene acceso a la app)', () => {
  assert.deepEqual(normalizarRolesMovil('beneficios', ['beneficios']), {
    rol: null, roles: [], reescribir: false,
  })
})

caso('un rol desconocido también se descarta', () => {
  assert.deepEqual(normalizarRolesMovil('inventado', ['inventado', 'socio']), {
    rol: 'socio', roles: ['socio'], reescribir: true,
  })
})

caso('roles null: se arma con el rol activo', () => {
  assert.deepEqual(normalizarRolesMovil('socio', null), {
    rol: 'socio', roles: ['socio'], reescribir: false,
  })
})

caso('rol activo móvil que no está en roles se conserva tal cual', () => {
  assert.deepEqual(normalizarRolesMovil('tutor', ['socio']), {
    rol: 'tutor', roles: ['socio'], reescribir: false,
  })
})

caso('sin rol ni roles: null, sin reescribir', () => {
  assert.deepEqual(normalizarRolesMovil(null, null), { rol: null, roles: [], reescribir: false })
})

caso('roles repetidos se deduplican', () => {
  assert.deepEqual(normalizarRolesMovil('socio', ['socio', 'socio', 'beneficios']).roles, ['socio'])
})

// ─── aplicarPerfilMovil ──────────────────────────────────────────────────────

async function main() {
  await casoAsync('reescribe profiles.rol cuando hace falta', async () => {
    const escritos: string[] = []
    const r = await aplicarPerfilMovil({ rol: 'beneficios', roles: ['socio', 'beneficios'] },
      async rol => { escritos.push(rol) })
    assert.deepEqual(escritos, ['socio'])
    assert.equal(r.rol, 'socio')
  })

  await casoAsync('no escribe cuando el rol activo ya es móvil', async () => {
    let llamadas = 0
    await aplicarPerfilMovil({ rol: 'socio', roles: ['socio', 'beneficios'] }, async () => { llamadas++ })
    assert.equal(llamadas, 0)
  })

  await casoAsync('si falla la escritura igual devuelve el rol normalizado', async () => {
    const original = console.warn
    console.warn = () => {}
    try {
      const r = await aplicarPerfilMovil({ rol: 'beneficios', roles: ['socio', 'beneficios'] },
        async () => { throw new Error('sin red') })
      assert.deepEqual(r, { rol: 'socio', roles: ['socio'], reescribir: true })
    } finally {
      console.warn = original
    }
  })

  console.log(`\n${casos} casos ok`)
}

main().catch(e => { console.error(e); process.exit(1) })
