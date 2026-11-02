// Verificación autocontenida de validacionDivision.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/validacionDivision.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { validarRecibeAdultos, avisoRama, type DivisionExistente } from './validacionDivision'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const MAYORES: DivisionExistente = {
  id: 'd1', nombre: 'Mayores', deporte: 'rugby', rama: 'caballeros', activa: true, recibe_adultos: true,
}
const PRIMERA_DAMAS: DivisionExistente = {
  id: 'd2', nombre: 'Primera Damas', deporte: 'hockey', rama: 'damas', activa: true, recibe_adultos: true,
}
const VIEJA: DivisionExistente = {
  id: 'd3', nombre: 'Intermedia', deporte: 'rugby', rama: 'damas', activa: false, recibe_adultos: true,
}
const TODAS = [MAYORES, PRIMERA_DAMAS, VIEJA]

caso('sin recibe adultos no hay nada que validar', () => {
  assert.equal(validarRecibeAdultos({ id: null, deporte: 'rugby', rama: '', activa: true, recibe_adultos: false }, TODAS), null)
})

caso('una segunda activa del mismo deporte y rama se rechaza y nombra a la existente', () => {
  const msg = validarRecibeAdultos({ id: null, deporte: 'rugby', rama: 'caballeros', activa: true, recibe_adultos: true }, TODAS)
  assert.ok(msg && msg.includes('Mayores'), `mensaje: ${msg}`)
})

caso('editar la misma división que ya recibe adultos no choca consigo misma', () => {
  assert.equal(validarRecibeAdultos({ id: 'd1', deporte: 'rugby', rama: 'caballeros', activa: true, recibe_adultos: true }, TODAS), null)
})

caso('otra rama del mismo deporte se permite', () => {
  assert.equal(validarRecibeAdultos({ id: null, deporte: 'rugby', rama: 'damas', activa: true, recibe_adultos: true }, TODAS), null)
})

caso('el mismo deporte y rama en otro deporte se permite', () => {
  assert.equal(validarRecibeAdultos({ id: null, deporte: 'hockey', rama: 'caballeros', activa: true, recibe_adultos: true }, TODAS), null)
})

caso('una existente inactiva no cuenta como duplicada', () => {
  // VIEJA (rugby damas) está inactiva.
  assert.equal(validarRecibeAdultos({ id: null, deporte: 'rugby', rama: 'damas', activa: true, recibe_adultos: true }, [VIEJA]), null)
})

caso('editar una inactiva no choca aunque haya otra activa igual', () => {
  assert.equal(validarRecibeAdultos({ id: 'd3', deporte: 'rugby', rama: 'caballeros', activa: false, recibe_adultos: true }, TODAS), null)
})

caso('rama mixto con recibe adultos se rechaza', () => {
  const msg = validarRecibeAdultos({ id: null, deporte: 'tenis', rama: 'mixto', activa: true, recibe_adultos: true }, TODAS)
  assert.ok(msg && msg.toLowerCase().includes('mixto'), `mensaje: ${msg}`)
})

caso('rama vacía con recibe adultos se rechaza', () => {
  const msg = validarRecibeAdultos({ id: null, deporte: 'tenis', rama: '', activa: true, recibe_adultos: true }, TODAS)
  assert.ok(msg && msg.toLowerCase().includes('rama'), `mensaje: ${msg}`)
})

caso('el aviso de rama aparece con la rama vacía y no con damas o caballeros', () => {
  assert.ok(avisoRama(''))
  assert.ok(avisoRama('  '))
  assert.equal(avisoRama('damas'), null)
  assert.equal(avisoRama('caballeros'), null)
})

caso('el aviso de rama mixto avisa que la asignación automática no la usa para adultos', () => {
  assert.ok(avisoRama('mixto'))
})

console.log(`\n${casos} casos ok`)
