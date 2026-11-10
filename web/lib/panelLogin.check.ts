// Verificación autocontenida de panelLogin.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/panelLogin.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { elegirPanelLogin } from './panelLogin'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('entrenador lands on /entrenador/asistencias and the active rol is rewritten', () => {
  assert.deepEqual(elegirPanelLogin({ rol: 'socio', roles: ['socio', 'entrenador'] }), {
    rolWeb: 'entrenador', destino: '/entrenador/asistencias', reescribirRol: true,
  })
})

caso('entrenador already active: no rewrite', () => {
  assert.deepEqual(elegirPanelLogin({ rol: 'entrenador', roles: ['entrenador'] }), {
    rolWeb: 'entrenador', destino: '/entrenador/asistencias', reescribirRol: false,
  })
})

caso('subcomisión, admin, secretaría, portería and buffet win over entrenador', () => {
  const casosRol: [string, string][] = [
    ['subcomision', '/dashboard'],
    ['admin', '/dashboard'],
    ['secretaria', '/secretaria/socios'],
    ['porteria', '/porteria/accesos'],
    ['buffet', '/buffet/promos'],
  ]
  for (const [rol, destino] of casosRol) {
    const r = elegirPanelLogin({ rol: 'entrenador', roles: ['entrenador', rol] })
    assert.equal(r?.rolWeb, rol, rol)
    assert.equal(r?.destino, destino, rol)
    assert.equal(r?.reescribirRol, true, rol)
  }
})

caso('beneficios wins over entrenador and never rewrites profiles.rol', () => {
  assert.deepEqual(elegirPanelLogin({ rol: 'entrenador', roles: ['entrenador', 'beneficios'] }), {
    rolWeb: 'beneficios', destino: '/beneficios', reescribirRol: false,
  })
})

caso('no web role (socio, coordinador, colaborador, manager) is refused', () => {
  for (const rol of ['socio', 'coordinador', 'colaborador', 'manager']) {
    assert.equal(elegirPanelLogin({ rol, roles: [rol] }), null, rol)
  }
  assert.equal(elegirPanelLogin(null), null)
  assert.equal(elegirPanelLogin({ rol: '', roles: null }), null)
})

caso('empty roles[] falls back to the active rol', () => {
  assert.deepEqual(elegirPanelLogin({ rol: 'secretaria', roles: null }), {
    rolWeb: 'secretaria', destino: '/secretaria/socios', reescribirRol: false,
  })
})

console.log(`\n${casos} casos ok`)
