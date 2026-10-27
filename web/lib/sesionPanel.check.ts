// Verificación autocontenida de sesionPanel.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/sesionPanel.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { decidirSesion } from './sesionPanel'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const roles = ['secretaria', 'admin']
const user = { id: 'u1' }

caso('perfil con rol permitido entra', () => {
  const d = decidirSesion({ user, perfil: { rol: 'secretaria' }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'ok')
})

caso('rol no permitido cierra la sesión', () => {
  const d = decidirSesion({ user, perfil: { rol: 'socio' }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'cerrar')
})

caso('sin perfil (PGRST116, 0 filas) cierra la sesión', () => {
  const d = decidirSesion({ user, perfil: null, perfilError: { code: 'PGRST116', message: '0 rows' }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'cerrar')
})

caso('sin sesión va al login sin cerrar nada', () => {
  assert.equal(decidirSesion({ user: null, rolesPermitidos: roles }).tipo, 'login')
  assert.equal(
    decidirSesion({ user: null, userError: { name: 'AuthSessionMissingError', status: 400 }, rolesPermitidos: roles }).tipo,
    'login',
  )
})

caso('token vencido o inválido (4xx de Auth) va al login', () => {
  const d = decidirSesion({ user: null, userError: { name: 'AuthApiError', status: 403 }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'login')
})

caso('error de red al leer la sesión NO cierra la sesión: muestra error', () => {
  const d = decidirSesion({ user: null, userError: { name: 'AuthRetryableFetchError', status: 0 }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'error')
})

caso('Auth caído (5xx) muestra error', () => {
  const d = decidirSesion({ user: null, userError: { name: 'AuthApiError', status: 503 }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'error')
})

caso('error de red al leer el perfil NO cierra la sesión: muestra error', () => {
  const d = decidirSesion({
    user,
    perfil: null,
    perfilError: { code: '', message: 'TypeError: Failed to fetch' },
    rolesPermitidos: roles,
  })
  assert.equal(d.tipo, 'error')
})

caso('error del servidor al leer el perfil muestra error', () => {
  const d = decidirSesion({ user, perfil: null, perfilError: { code: '57014', message: 'timeout' }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'error')
})

caso('si la lectura tiró una excepción, muestra error', () => {
  const d = decidirSesion({ user: null, excepcion: new TypeError('Failed to fetch'), rolesPermitidos: roles })
  assert.equal(d.tipo, 'error')
})

console.log(`\n${casos} casos ok`)
