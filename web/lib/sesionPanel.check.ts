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

caso('JWT vencido o inválido al leer el perfil (PGRST30x) va al login: reintentar no lo arregla', () => {
  for (const code of ['PGRST301', 'PGRST302', 'PGRST303']) {
    const d = decidirSesion({ user, perfil: null, perfilError: { code, message: 'JWT expired' }, rolesPermitidos: roles })
    assert.deepEqual(d, { tipo: 'login' }, code)
  }
})

caso('PGRST300 (al server le falta la config del JWT) es falla del server: error, no login (evita un loop)', () => {
  const d = decidirSesion({ user, perfil: null, perfilError: { code: 'PGRST300', message: 'Server lacks JWT secret' }, rolesPermitidos: roles })
  assert.deepEqual(d, { tipo: 'error' })
})

caso('si la lectura tiró una excepción, muestra error', () => {
  const d = decidirSesion({ user: null, excepcion: new TypeError('Failed to fetch'), rolesPermitidos: roles })
  assert.equal(d.tipo, 'error')
})

// Same config as PANELES.beneficios in components/PanelShell.tsx: admin by the
// active rol, beneficios by membership in roles[] (the app keeps them on 'socio').
const panelBeneficios = { rolesPermitidos: ['admin'], rolesPorMembresia: ['beneficios'] }

caso('panel Beneficios: a socio-active account with beneficios in roles[] enters', () => {
  const d = decidirSesion({ user, perfil: { rol: 'socio', roles: ['socio', 'beneficios'] }, ...panelBeneficios })
  assert.equal(d.tipo, 'ok')
})

caso('panel Beneficios: admin enters by its active rol', () => {
  assert.equal(decidirSesion({ user, perfil: { rol: 'admin', roles: ['admin'] }, ...panelBeneficios }).tipo, 'ok')
})

caso('panel Beneficios: plain socio, subcomisión and secretaría are signed out', () => {
  for (const perfil of [
    { rol: 'socio', roles: ['socio'] },
    { rol: 'socio', roles: null },
    { rol: 'subcomision', roles: ['socio', 'subcomision'] },
    { rol: 'secretaria', roles: ['secretaria'] },
  ]) {
    assert.equal(decidirSesion({ user, perfil, ...panelBeneficios }).tipo, 'cerrar', perfil.rol)
  }
})

caso('other panels still decide by the active rol only: roles[] does not open them', () => {
  const d = decidirSesion({ user, perfil: { rol: 'socio', roles: ['socio', 'secretaria'] }, rolesPermitidos: roles })
  assert.equal(d.tipo, 'cerrar')
})

// Same config as PANELES.entrenador in components/PanelShell.tsx: the active rol
// only (the login rewrites profiles.rol to 'entrenador', the RLS checks it).
const panelEntrenador = { rolesPermitidos: ['entrenador'] }

caso('panel Entrenador: an account with entrenador as its active rol enters', () => {
  const d = decidirSesion({ user, perfil: { rol: 'entrenador', roles: ['socio', 'entrenador'] }, ...panelEntrenador })
  assert.equal(d.tipo, 'ok')
})

caso('panel Entrenador: socio-only, coordinador-only and colaborador accounts are signed out', () => {
  for (const perfil of [
    { rol: 'socio', roles: ['socio'] },
    { rol: 'coordinador', roles: ['coordinador'] },
    { rol: 'colaborador', roles: ['colaborador'] },
  ]) {
    assert.equal(decidirSesion({ user, perfil, ...panelEntrenador }).tipo, 'cerrar', perfil.rol)
  }
})

caso('panel Entrenador: entrenador in roles[] alone does not open it (active rol decides)', () => {
  const d = decidirSesion({ user, perfil: { rol: 'socio', roles: ['socio', 'entrenador'] }, ...panelEntrenador })
  assert.equal(d.tipo, 'cerrar')
})

caso('panel Subcomisión: an entrenador account is signed out', () => {
  const d = decidirSesion({ user, perfil: { rol: 'entrenador', roles: ['entrenador'] }, rolesPermitidos: ['subcomision', 'admin'] })
  assert.equal(d.tipo, 'cerrar')
})

console.log(`\n${casos} casos ok`)
