// Verificación autocontenida de usuariosForm.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/usuariosForm.check.ts

import assert from 'node:assert/strict'
import { divisionesCambiaron, validarFormNuevoUsuario } from './usuariosForm'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('divisiones sin tocar no cuentan como cambio (null y [] son lo mismo)', () => {
  assert.equal(divisionesCambiaron(null, []), false)
  assert.equal(divisionesCambiaron([], []), false)
  assert.equal(divisionesCambiaron(['a', 'b'], ['a', 'b']), false)
})

caso('el orden no importa: destildar y volver a tildar no es un cambio', () => {
  assert.equal(divisionesCambiaron(['a', 'b'], ['b', 'a']), false)
})

caso('agregar o quitar una división es un cambio sin guardar', () => {
  assert.equal(divisionesCambiaron(null, ['a']), true)
  assert.equal(divisionesCambiaron(['a', 'b'], ['a']), true)
  assert.equal(divisionesCambiaron(['a'], ['b']), true)
})

const VALIDO = { nombre: 'Juan Pérez', email: 'juan@ejemplo.com', dni: '30123456', rol: 'entrenador' }

caso('usuario nuevo vacío: cada campo con su propio error, no sólo el primero', () => {
  assert.deepEqual(validarFormNuevoUsuario({ nombre: ' ', email: '', dni: '', rol: null }), {
    nombre: 'Ingresá el nombre completo.',
    email:  'Ingresá el email.',
    dni:    'Ingresá el DNI.',
    rol:    'Seleccioná un rol.',
  })
})

caso('usuario nuevo completo y válido no tiene errores', () => {
  assert.deepEqual(validarFormNuevoUsuario(VALIDO), {})
  // Mayúsculas y espacios alrededor del mail se normalizan al enviar.
  assert.deepEqual(validarFormNuevoUsuario({ ...VALIDO, email: '  Juan@Ejemplo.com ' }), {})
})

caso('mail mal escrito', () => {
  assert.deepEqual(validarFormNuevoUsuario({ ...VALIDO, email: 'juan@ejemplo' }), {
    email: 'El email no es válido.',
  })
})

caso('DNI: puntos y espacios se aceptan (el servidor guarda sólo los números); letras no', () => {
  assert.deepEqual(validarFormNuevoUsuario({ ...VALIDO, dni: '30.123.456' }), {})
  assert.deepEqual(validarFormNuevoUsuario({ ...VALIDO, dni: '30 123 456' }), {})
  assert.deepEqual(validarFormNuevoUsuario({ ...VALIDO, dni: '30123456a' }), {
    dni: 'El DNI sólo lleva números.',
  })
  assert.deepEqual(validarFormNuevoUsuario({ ...VALIDO, dni: '..' }), {
    dni: 'Ingresá el DNI.',
  })
})

console.log(`\n${casos} casos ok`)
