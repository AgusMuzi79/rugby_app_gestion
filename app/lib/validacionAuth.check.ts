// Verificación autocontenida de validacionAuth.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/validacionAuth.check.ts

import assert from 'node:assert/strict'
import {
  erroresVisibles,
  fechaAIso,
  formatearFechaTipeada,
  hayErrores,
  todosTocados,
  validarFormPassword,
  validarFormRegistro,
  validarFormTutorCodigo,
  validarFormTutorDatos,
} from './validacionAuth'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('contraseña nueva: vacía, corta, distinta; cada campo con su propio error', () => {
  assert.deepEqual(validarFormPassword({ password: '', confirmacion: '' }), {
    password: 'Ingresá una contraseña.',
    confirmacion: 'Repetí la contraseña.',
  })
  assert.deepEqual(validarFormPassword({ password: '1234567', confirmacion: '1234567' }), {
    password: 'Tiene que tener al menos 8 caracteres.',
  })
  assert.deepEqual(validarFormPassword({ password: '12345678', confirmacion: '12345679' }), {
    confirmacion: 'Las contraseñas no coinciden.',
  })
  assert.deepEqual(validarFormPassword({ password: '12345678', confirmacion: '12345678' }), {})
})

caso('registro de usuario nuevo: el nombre es obligatorio, más las reglas de contraseña', () => {
  assert.deepEqual(validarFormRegistro({ nombre: '  ', password: '12345678', confirmacion: '12345678' }), {
    nombre: 'Ingresá tu nombre.',
  })
  assert.deepEqual(validarFormRegistro({ nombre: 'Ana', password: 'corta', confirmacion: 'otra' }), {
    password: 'Tiene que tener al menos 8 caracteres.',
    confirmacion: 'Las contraseñas no coinciden.',
  })
})

caso('tutor, paso datos: relación, mail, fecha y DNI, todos a la vez (antes uno por vez)', () => {
  assert.deepEqual(validarFormTutorDatos({ relacion: null, email: 'x', fecha: '31/02/1980', dniMenor: '..' }), {
    relacion: 'Elegí tu relación con el socio.',
    email: 'Ingresá un mail válido.',
    fecha: 'Ingresá tu fecha de nacimiento con el formato DD/MM/AAAA.',
    dniMenor: 'Ingresá el DNI del socio menor.',
  })
  assert.deepEqual(validarFormTutorDatos({ relacion: 'madre', email: ' Ana@Mail.com ', fecha: '01/02/1980', dniMenor: '50.123.456' }), {})
})

caso('tutor, paso código: 6 números y contraseña', () => {
  assert.deepEqual(validarFormTutorCodigo({ codigo: '123', password: '12345678', password2: '12345678' }), {
    codigo: 'El código tiene 6 números.',
  })
  assert.deepEqual(validarFormTutorCodigo({ codigo: '123456', password: '1', password2: '2' }), {
    password: 'Tiene que tener al menos 8 caracteres.',
    password2: 'Las contraseñas no coinciden.',
  })
  assert.deepEqual(validarFormTutorCodigo({ codigo: '123456', password: '12345678', password2: '12345678' }), {})
})

caso('sólo se muestran los errores de campos tocados; al enviar se tocan todos', () => {
  const errores = validarFormPassword({ password: '', confirmacion: '' })
  assert.deepEqual(erroresVisibles(errores, {}), {})
  assert.deepEqual(erroresVisibles(errores, { password: true }), { password: 'Ingresá una contraseña.' })
  assert.deepEqual(todosTocados(['password', 'confirmacion']), { password: true, confirmacion: true })
  assert.equal(hayErrores(errores), true)
  assert.equal(hayErrores({}), false)
})

caso('fecha DD/MM/AAAA: se formatea al tipear y sólo vale una fecha real y pasada', () => {
  assert.equal(formatearFechaTipeada('01021980'), '01/02/1980')
  assert.equal(formatearFechaTipeada('0102'), '01/02')
  assert.equal(fechaAIso('01/02/1980'), '1980-02-01')
  assert.equal(fechaAIso('31/02/1980'), null)
  assert.equal(fechaAIso('01/01/1899'), null)
  assert.equal(fechaAIso('01/01/2999'), null)
  assert.equal(fechaAIso('1/1/1980'), null)
})

console.log(`\n${casos} casos ok`)
