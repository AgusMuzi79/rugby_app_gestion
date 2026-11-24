// Self-contained check for tenis.ts (the repo has no test runner).
//   npx --yes tsx web/lib/tenis.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import {
  normalizarDni, validarEmail, validarTitular, validarJugadores, jugadoresRequeridos,
  formatearPrecio, resumenPrecios, fechasReservables, hoyArgentina, horaArgentina,
  inicioIso, turnosLibres, vencimientoComprobante, formatearFechaHora, validarComprobante,
  mensajeTenis, CONFIG_DEFAULT,
  type JugadorForm,
} from './tenis'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('DNI: strips dots and spaces, accepts 6 to 9 digits', () => {
  assert.equal(normalizarDni('30.123.456'), '30123456')
  assert.equal(normalizarDni(' 7 110 123 '), '7110123')
  assert.equal(normalizarDni('123456'), '123456')
  assert.equal(normalizarDni('12345'), null)
  assert.equal(normalizarDni('1234567890'), null)
  assert.equal(normalizarDni('30a123456'), null)
  assert.equal(normalizarDni(''), null)
})

caso('email: basic shape, trimmed', () => {
  assert.equal(validarEmail(' ana@mail.com '), true)
  assert.equal(validarEmail('ana@mail'), false)
  assert.equal(validarEmail('ana mail.com'), false)
  assert.equal(validarEmail(''), false)
})

caso('titular: every field is required and reported by field', () => {
  assert.deepEqual(validarTitular({ dni: '30123456', nombre: 'Ana', apellido: 'Pérez', email: 'a@b.co' }), {})
  const e = validarTitular({ dni: '12', nombre: ' ', apellido: '', email: 'x' })
  assert.deepEqual(Object.keys(e).sort(), ['apellido', 'dni', 'email', 'nombre'])
})

caso('players: singles needs 1, doubles needs 3', () => {
  assert.equal(jugadoresRequeridos('singles'), 1)
  assert.equal(jugadoresRequeridos('dobles'), 3)
})

caso('players: member needs DNI only, guest needs DNI + name + surname, no repeated DNI', () => {
  const socio: JugadorForm = { tipo: 'socio', dni: '20111222', nombre: '', apellido: '' }
  const invitado: JugadorForm = { tipo: 'invitado', dni: '20333444', nombre: 'Juan', apellido: 'Gómez' }
  assert.deepEqual(validarJugadores([socio], '30123456'), [{}])
  assert.deepEqual(validarJugadores([invitado], '30123456'), [{}])
  const [e1] = validarJugadores([{ tipo: 'invitado', dni: '20333444', nombre: '', apellido: '' }], '30123456')
  assert.deepEqual(Object.keys(e1).sort(), ['apellido', 'nombre'])
  const [e2] = validarJugadores([{ ...socio, dni: '30.123.456' }], '30123456')
  assert.ok(e2.dni)
  const errs = validarJugadores([socio, { ...invitado, dni: '20111222' }, invitado], '30123456')
  assert.ok(errs[1].dni)
})

caso('price: $ with thousands dot', () => {
  assert.equal(formatearPrecio(16000), '$16.000')
  assert.equal(formatearPrecio(0), '$0')
})

caso('price summary: titular and guests pay non-member price, members are pending', () => {
  const r = resumenPrecios('singles', [{ tipo: 'invitado', dni: '1', nombre: 'Juan', apellido: 'Gómez' }], CONFIG_DEFAULT)
  assert.deepEqual(r.lineas.map(l => l.precio), [16000, 16000])
  assert.equal(r.total, 32000)
  assert.equal(r.hayPendientes, false)
  const d = resumenPrecios('dobles', [
    { tipo: 'socio', dni: '2', nombre: '', apellido: '' },
    { tipo: 'invitado', dni: '3', nombre: 'Eva', apellido: 'Ruiz' },
    { tipo: 'invitado', dni: '4', nombre: 'Leo', apellido: 'Sosa' },
  ], CONFIG_DEFAULT)
  assert.deepEqual(d.lineas.map(l => l.precio), [18000, null, 18000, 18000])
  assert.equal(d.total, 54000)
  assert.equal(d.hayPendientes, true)
})

caso('dates: today plus two days in Argentina, across month end', () => {
  // 2026-11-30 23:30 in Argentina = 2026-12-01 02:30 UTC
  const ahora = new Date('2026-12-01T02:30:00Z')
  assert.equal(hoyArgentina(ahora), '2026-11-30')
  assert.deepEqual(fechasReservables(ahora, 2), ['2026-11-30', '2026-12-01', '2026-12-02'])
})

caso('times: Argentina wall clock from an ISO instant', () => {
  assert.equal(horaArgentina('2026-11-21T21:00:00Z'), '18:00')
  assert.equal(inicioIso('2026-11-21', '18:00'), '2026-11-21T18:00:00-03:00')
})

caso('free slots: 30-min modules, duration by match type, overlaps and past excluded', () => {
  const canchas = [{ id: 'c1', nombre: '01' }]
  const cfg = { ...CONFIG_DEFAULT, hora_desde: '08:00', hora_hasta: '11:00' }
  const items = [{ cancha_id: 'c1', inicio: '2026-11-21T09:00:00-03:00', fin: '2026-11-21T10:00:00-03:00' }]
  const ahora = new Date('2026-11-21T10:00:00Z') // 07:00 local
  const s = turnosLibres({ fecha: '2026-11-21', modalidad: 'singles', config: cfg, canchas, items, ahora })
  assert.deepEqual(s[0].turnos.map(t => t.hora), ['08:00', '10:00'])
  assert.equal(s[0].turnos[0].empieza, '08:05')
  const d = turnosLibres({ fecha: '2026-11-21', modalidad: 'dobles', config: cfg, canchas, items, ahora })
  assert.deepEqual(d[0].turnos.map(t => t.hora), [])
  const tarde = new Date('2026-11-21T11:10:00Z') // 08:10 local
  const p = turnosLibres({ fecha: '2026-11-21', modalidad: 'singles', config: cfg, canchas, items, ahora: tarde })
  assert.deepEqual(p[0].turnos.map(t => t.hora), ['10:00'])
})

caso('free slots: a block for all courts (cancha_id null) blocks every court', () => {
  const canchas = [{ id: 'c1', nombre: '01' }, { id: 'c2', nombre: '02' }]
  const cfg = { ...CONFIG_DEFAULT, hora_desde: '08:00', hora_hasta: '09:00' }
  const items = [{ cancha_id: null, inicio: '2026-11-21T08:00:00-03:00', fin: '2026-11-21T08:30:00-03:00' }]
  const s = turnosLibres({ fecha: '2026-11-21', modalidad: 'singles', config: cfg, canchas, items, ahora: new Date('2026-11-20T00:00:00Z') })
  assert.deepEqual(s.map(c => c.turnos.length), [0, 0])
})

caso('receipt deadline: 3 h before the turn, formatted in Argentina', () => {
  assert.equal(vencimientoComprobante('2026-11-21T21:00:00Z', 3), '2026-11-21T18:00:00.000Z')
  assert.equal(formatearFechaHora('2026-11-21T18:00:00.000Z'), 'sábado 21/11 15:00')
})

caso('receipt file: jpg/png/pdf up to 5 MB', () => {
  assert.equal(validarComprobante({ type: 'image/jpeg', size: 1000 }), null)
  assert.equal(validarComprobante({ type: 'application/pdf', size: 5 * 1024 * 1024 }), null)
  assert.ok(validarComprobante({ type: 'image/gif', size: 1000 }))
  assert.ok(validarComprobante({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }))
})

caso('error codes map to Spanish copy, unknown codes fall back', () => {
  assert.match(mensajeTenis('turno_ocupado'), /turno/i)
  assert.match(mensajeTenis('token_invalido'), /enlace/i)
  assert.equal(mensajeTenis('Algo pasó'), 'Algo pasó')
  assert.match(mensajeTenis(undefined), /Probá de nuevo/)
})

console.log(`\n${casos} casos ok`)
