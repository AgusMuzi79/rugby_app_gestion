// Verificación autocontenida de guardRaiz.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/guardRaiz.check.ts

import assert from 'node:assert/strict'
import { destinoGuard, yaEstaEnDestino, type EstadoGuard } from './guardRaiz'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const base: EstadoGuard = {
  haySesion: true, rol: 'socio',
  nuevoUsuario: false, recuperandoPassword: false, registroSinSesion: false,
  restringido: false, restringidoLoading: false,
  terminosPendiente: false, terminosLoading: false,
  mailPendiente: false, mailLoading: false,
}

caso('sesión con rol: va al inicio del rol', () => {
  assert.equal(destinoGuard(base), '/(socio)/carnet')
})

caso('cada rol va al mismo inicio que el mapa que reemplazó (_layout.tsx)', () => {
  const antes: Record<string, string> = {
    subcomision: '/(subcomision)/diario', coordinador: '/(coordinador)/diario',
    entrenador: '/(entrenador)/diario', manager: '/(manager)/diario',
    admin: '/(admin)/usuarios', secretaria: '/(secretaria)/diario',
    porteria: '/(porteria)/scanner', canchero: '/(porteria)/scanner', buffet: '/(porteria)/scanner',
    cliente_gimnasio: '/(cliente-gimnasio)/carnet', socio: '/(socio)/carnet', tutor: '/(tutor)/carnet',
  }
  for (const [rol, ruta] of Object.entries(antes)) {
    assert.equal(destinoGuard({ ...base, rol: rol as EstadoGuard['rol'] }), ruta, rol)
  }
})

caso('sin sesión: login, salvo durante el registro de tutor', () => {
  assert.equal(destinoGuard({ ...base, haySesion: false, rol: null }), '/(auth)/login')
  assert.equal(destinoGuard({ ...base, haySesion: false, rol: null, registroSinSesion: true }), null)
})

caso('gates en orden: restringido, términos, mail; mientras cargan, no se mueve', () => {
  assert.equal(destinoGuard({ ...base, restringido: true, terminosPendiente: true }), '/(auth)/acceso-restringido')
  assert.equal(destinoGuard({ ...base, terminosPendiente: true, mailPendiente: true }), '/(auth)/terminos')
  assert.equal(destinoGuard({ ...base, mailPendiente: true }), '/(auth)/registrar-mail')
  assert.equal(destinoGuard({ ...base, restringidoLoading: true }), null)
  assert.equal(destinoGuard({ ...base, terminosLoading: true }), null)
  assert.equal(destinoGuard({ ...base, mailLoading: true }), null)
})

caso('sesión sin rol todavía (perfil cargando): no se mueve', () => {
  assert.equal(destinoGuard({ ...base, rol: null }), null)
})

caso('nuevo usuario y recuperación de contraseña van primero', () => {
  assert.equal(destinoGuard({ ...base, nuevoUsuario: true, restringido: true }), '/(auth)/registro')
  assert.equal(destinoGuard({ ...base, recuperandoPassword: true }), '/(auth)/reset-password')
})

caso('refresh de token dentro del grupo del rol: NO redirige (no saca a nadie de lo que hace)', () => {
  assert.equal(yaEstaEnDestino('/(socio)/carnet', ['(socio)', 'cuotas']), true)
  assert.equal(yaEstaEnDestino('/(porteria)/scanner', ['(porteria)', 'promos']), true)
})

caso('en otro grupo o en la raíz: redirige', () => {
  assert.equal(yaEstaEnDestino('/(socio)/carnet', ['(auth)', 'login']), false)
  assert.equal(yaEstaEnDestino('/(socio)/carnet', ['(manager)', 'diario']), false)
  assert.equal(yaEstaEnDestino('/(socio)/carnet', []), false)
})

caso('pantallas de auth: la misma pantalla, o las que se recorren sin sesión', () => {
  assert.equal(yaEstaEnDestino('/(auth)/terminos', ['(auth)', 'terminos']), true)
  assert.equal(yaEstaEnDestino('/(auth)/terminos', ['(auth)', 'login']), false)
  assert.equal(yaEstaEnDestino('/(auth)/login', ['(auth)', 'forgot-password']), true)
  assert.equal(yaEstaEnDestino('/(auth)/login', ['(auth)', 'registro-tutor']), true)
  assert.equal(yaEstaEnDestino('/(auth)/login', ['(auth)', 'terminos']), false)
  assert.equal(yaEstaEnDestino('/(auth)/acceso-restringido', ['(auth)', 'registro-tutor']), true)
})

console.log(`\n${casos} casos ok`)
