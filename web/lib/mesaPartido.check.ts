// Verificación autocontenida de mesaPartido.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/mesaPartido.check.ts
// Reglas de app/hooks/usePartido.ts (asistencia, mesa, resultado). Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  MAX_TITULARES, MAX_SUPLENTES, type JugadorPartido,
  contarMesa, alternarPresente, asignarRol, jugadoresDeMesa,
  debeVerificarObligatorio, avisoMesaObligatoria, mensajeErrorMesa, leerPuntos,
} from './mesaPartido'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

function plantel(n: number, extra: Partial<JugadorPartido> = {}): JugadorPartido[] {
  return Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, nombre_completo: `Jugador ${i + 1}`, presente: true, rolEnMesa: null, ...extra }))
}

caso('topes: 15 titulares y 8 suplentes, como la app', () => {
  assert.equal(MAX_TITULARES, 15)
  assert.equal(MAX_SUPLENTES, 8)
})

caso('asignar y sacar: tocar el mismo rol lo saca de la mesa', () => {
  let js = plantel(3)
  js = asignarRol(js, 'j1', 'titular').jugadores
  assert.equal(js[0].rolEnMesa, 'titular')
  js = asignarRol(js, 'j1', 'titular').jugadores
  assert.equal(js[0].rolEnMesa, null)
  js = asignarRol(js, 'j2', 'suplente').jugadores
  js = asignarRol(js, 'j2', 'titular').jugadores // cambiar de rol
  assert.equal(js[1].rolEnMesa, 'titular')
})

caso('el titular 16 no entra: "Máximo 15 titulares alcanzado."', () => {
  let js = plantel(20)
  for (let i = 1; i <= 15; i++) js = asignarRol(js, `j${i}`, 'titular').jugadores
  const r = asignarRol(js, 'j16', 'titular')
  assert.equal(r.error, 'Máximo 15 titulares alcanzado.')
  assert.equal(r.jugadores[15].rolEnMesa, null)
  assert.deepEqual(contarMesa(r.jugadores), { titular: 15, suplente: 0 })
})

caso('el suplente 9 no entra: "Máximo 8 suplentes alcanzado."', () => {
  let js = plantel(10)
  for (let i = 1; i <= 8; i++) js = asignarRol(js, `j${i}`, 'suplente').jugadores
  const r = asignarRol(js, 'j9', 'suplente')
  assert.equal(r.error, 'Máximo 8 suplentes alcanzado.')
  assert.equal(r.jugadores[8].rolEnMesa, null)
})

caso('sólo los presentes: un ausente no se puede poner en la mesa', () => {
  const js = plantel(2)
  js[1].presente = false
  const r = asignarRol(js, 'j2', 'titular')
  assert.equal(r.jugadores[1].rolEnMesa, null)
  assert.ok(r.error)
})

caso('marcar ausente saca al jugador de la mesa (como la app)', () => {
  let js = asignarRol(plantel(2), 'j1', 'titular').jugadores
  js = alternarPresente(js, 'j1')
  assert.equal(js[0].presente, false)
  assert.equal(js[0].rolEnMesa, null)
  js = alternarPresente(js, 'j1')
  assert.equal(js[0].presente, true)
})

caso('lo que se manda a guardar_mesa: presentes con rol, sin repetidos', () => {
  const js: JugadorPartido[] = [
    { id: 'a', nombre_completo: 'A', presente: true, rolEnMesa: 'titular' },
    { id: 'b', nombre_completo: 'B', presente: false, rolEnMesa: 'titular' }, // ausente: fuera
    { id: 'c', nombre_completo: 'C', presente: true, rolEnMesa: null },
    { id: 'd', nombre_completo: 'D', presente: true, rolEnMesa: 'suplente' },
    { id: 'a', nombre_completo: 'A', presente: true, rolEnMesa: 'suplente' }, // repetido: fuera
  ]
  assert.deepEqual(jugadoresDeMesa(js), [
    { jugador_id: 'a', rol_en_mesa: 'titular' },
    { jugador_id: 'd', rol_en_mesa: 'suplente' },
  ])
  assert.deepEqual(contarMesa(js.slice(0, 4)), { titular: 1, suplente: 1 }) // el ausente no cuenta
})

caso('equipo opcional: primero tiene que tener mesa el obligatorio (no en infantiles)', () => {
  assert.equal(debeVerificarObligatorio({ esInfantil: false, equipoId: 'e2', obligatorioId: 'e1' }), true)
  assert.equal(debeVerificarObligatorio({ esInfantil: false, equipoId: 'e1', obligatorioId: 'e1' }), false)
  assert.equal(debeVerificarObligatorio({ esInfantil: true, equipoId: 'e2', obligatorioId: 'e1' }), false)
  assert.equal(
    avisoMesaObligatoria('Primera'),
    'Completá primero la mesa de "Primera" antes de guardar este equipo.',
  )
})

caso('errores de guardar_mesa → mensaje de la app', () => {
  assert.equal(mensajeErrorMesa({ code: '23505', message: 'dup' }), 'Hay un jugador repetido en la mesa.')
  assert.equal(mensajeErrorMesa({ code: '22023', message: 'x' }), 'Ese equipo no es de esta división. Recargá la pantalla.')
  assert.equal(mensajeErrorMesa({ code: '23514', message: 'x' }), 'Ese equipo no es de esta división. Recargá la pantalla.')
  assert.equal(mensajeErrorMesa({ code: '42501', message: 'rls' }), 'No tenés permiso para hacer esto.')
  assert.equal(mensajeErrorMesa({ code: 'XX000', message: 'x' }), 'No se pudo guardar la mesa. Probá de nuevo.')
})

caso('resultado: puntos válidos o "Ingresá puntos válidos."', () => {
  assert.deepEqual(leerPuntos('24', '17'), { propios: 24, rival: 17 })
  assert.deepEqual(leerPuntos('0', '0'), { propios: 0, rival: 0 })
  assert.deepEqual(leerPuntos('', '3'), { error: 'Ingresá puntos válidos.' })
  assert.deepEqual(leerPuntos('3', 'abc'), { error: 'Ingresá puntos válidos.' })
  assert.deepEqual(leerPuntos('-3', '2'), { error: 'Ingresá puntos válidos.' })
})

console.log(`\n${casos} casos ok`)
