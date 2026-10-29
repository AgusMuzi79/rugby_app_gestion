// Verificación autocontenida de perfilAvatar.ts (no hay runner de tests en app/).
//   npx tsx app/lib/perfilAvatar.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { inicialesNombre, rutaPerfil, avatarVencido, nuevoCargadoAt, AVATAR_TTL_MS } from './perfilAvatar'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Iniciales ────────────────────────────────────────────────────────────────

caso('iniciales: nombre y apellido', () => {
  assert.equal(inicialesNombre('Agustín Muzi'), 'AM')
})

caso('iniciales: primera y última palabra con varios nombres', () => {
  assert.equal(inicialesNombre('Juan Pablo  de la Fuente'), 'JF')
})

caso('iniciales: una sola palabra', () => {
  assert.equal(inicialesNombre('josefina'), 'J')
})

caso('iniciales: conserva tildes y ñ', () => {
  assert.equal(inicialesNombre('ñandú álvarez'), 'ÑÁ')
})

caso('iniciales: vacío, null o sólo espacios → cadena vacía', () => {
  assert.equal(inicialesNombre(''), '')
  assert.equal(inicialesNombre('   '), '')
  assert.equal(inicialesNombre(null), '')
  assert.equal(inicialesNombre(undefined), '')
})

// ─── Ruta de Mi Perfil según el grupo de rol ─────────────────────────────────

caso('ruta: grupo de rol → su sobre', () => {
  assert.equal(rutaPerfil(['(socio)', 'carnet']), '/(socio)/sobre')
  assert.equal(rutaPerfil(['(tutor)', 'cuotas']), '/(tutor)/sobre')
  assert.equal(rutaPerfil(['(cliente-gimnasio)', 'turnos']), '/(cliente-gimnasio)/sobre')
  assert.equal(rutaPerfil(['(subcomision)']), '/(subcomision)/sobre')
  // T23: el colaborador sólo tiene Asistencia; Mi perfil se abre desde el avatar.
  assert.equal(rutaPerfil(['(colaborador)', 'asistencia']), '/(colaborador)/sobre')
})

caso('ruta: fuera de un grupo de rol → null (sin avatar)', () => {
  assert.equal(rutaPerfil(['(auth)', 'login']), null)
  assert.equal(rutaPerfil([]), null)
  assert.equal(rutaPerfil(['index']), null)
  assert.equal(rutaPerfil(['(desconocido)', 'x']), null)
})

// ─── Vencimiento de la URL firmada de la foto ────────────────────────────────

caso('vencido: nunca cargado → true', () => {
  assert.equal(avatarVencido(null, 1_000_000), true)
})

caso('vencido: dentro del TTL → false; en el borde → true', () => {
  const t = 10_000_000
  assert.equal(avatarVencido(t, t + AVATAR_TTL_MS - 1), false)
  assert.equal(avatarVencido(t, t + AVATAR_TTL_MS), true)
})

caso('nuevoCargadoAt: cambiar sólo el nombre no renueva el vencimiento de la foto', () => {
  const antes = 1_000_000
  const ahora = antes + 30 * 60 * 1000
  assert.equal(nuevoCargadoAt({ anterior: antes, mismoUsuario: true, cambiaFoto: false, ahora }), antes)
})

caso('nuevoCargadoAt: sólo una foto nueva arranca el reloj', () => {
  const antes = 1_000_000
  const ahora = antes + 30 * 60 * 1000
  assert.equal(nuevoCargadoAt({ anterior: antes, mismoUsuario: true, cambiaFoto: true, ahora }), ahora)
  assert.equal(nuevoCargadoAt({ anterior: null, mismoUsuario: true, cambiaFoto: true, ahora }), ahora)
  assert.equal(nuevoCargadoAt({ anterior: antes, mismoUsuario: false, cambiaFoto: true, ahora }), ahora)
})

caso('nuevoCargadoAt: sin foto cargada todavía, guardar el nombre no la da por vigente', () => {
  const antes = 1_000_000
  const ahora = antes + 30 * 60 * 1000
  // nunca se cargó la foto (o falló la carga): sigue vencido, se vuelve a pedir
  assert.equal(nuevoCargadoAt({ anterior: null, mismoUsuario: true, cambiaFoto: false, ahora }), null)
  // otro usuario sin foto: no hereda el reloj del anterior
  assert.equal(nuevoCargadoAt({ anterior: antes, mismoUsuario: false, cambiaFoto: false, ahora }), null)
})

console.log(`\n${casos} casos OK`)
