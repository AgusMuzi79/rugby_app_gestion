// Verificación autocontenida de plantelGuardado.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/plantelGuardado.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { clavePlantel, horaGuardado, leerGuardado, resolverCarga, serializarGuardado } from './plantelGuardado'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const PLANTEL = [{ id: 'j1', nombre_completo: 'Ana' }, { id: 'j2', nombre_completo: 'Beto' }]
const RED = new TypeError('Network request failed')

caso('clave por división', () => {
  assert.equal(clavePlantel('div-1'), 'plantel:div-1')
})

caso('lectura OK: se usa la de la base y se guarda una copia', () => {
  const r = resolverCarga({ error: null, remoto: PLANTEL, guardado: null })
  assert.deepEqual(r, { tipo: 'remoto', datos: PLANTEL, guardar: true })
})

caso('sin señal y con copia: se marca sobre la lista guardada (antes: "Sin división asignada")', () => {
  const guardado = { guardadoEn: 1000, datos: PLANTEL }
  const r = resolverCarga({ error: RED, remoto: null, guardado })
  assert.deepEqual(r, { tipo: 'guardado', datos: PLANTEL, guardadoEn: 1000 })
})

caso('falla sin copia: error con reintento, nunca una lista vacía', () => {
  assert.deepEqual(resolverCarga({ error: RED, remoto: null, guardado: null }), { tipo: 'error', error: RED })
})

caso('un error de permisos tampoco usa la copia (no es falta de señal)', () => {
  const rls = { message: 'permission denied for table jugadores', code: '42501' }
  const r = resolverCarga({ error: rls, remoto: null, guardado: { guardadoEn: 1, datos: PLANTEL } })
  assert.deepEqual(r, { tipo: 'error', error: rls })
})

caso('ida y vuelta por AsyncStorage; basura o vacío → null', () => {
  const raw = serializarGuardado(PLANTEL, 1234)
  assert.deepEqual(leerGuardado(raw), { guardadoEn: 1234, datos: PLANTEL })
  assert.equal(leerGuardado(null), null)
  assert.equal(leerGuardado('{no es json'), null)
  assert.equal(leerGuardado(JSON.stringify({ guardadoEn: 'x', datos: [] })), null)
  assert.equal(leerGuardado(JSON.stringify({ guardadoEn: 1, datos: 'x' })), null)
})

caso('hora de la copia para la nota "lista guardada al HH:MM"', () => {
  const d = new Date(2026, 9, 29, 9, 5)
  assert.equal(horaGuardado(d.getTime()), '09:05')
})

console.log(`\n${casos} casos ok`)
