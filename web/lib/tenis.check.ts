// Self-contained check for tenis.ts (the repo has no test runner).
//   npx --yes tsx web/lib/tenis.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import {
  normalizarDni, validarEmail, validarTitular, validarJugadores, jugadoresRequeridos,
  formatearPrecio, resumenPrecios, fechasReservables, hoyArgentina, horaArgentina,
  inicioIso, turnosDesdeLibres, vencimientoComprobante, formatearFechaHora, validarComprobante,
  mensajeTenis, mensajeRespuesta, pantallaConfirmar, jugadoresPayload, CODIGOS_TENIS, CONFIG_DEFAULT,
  type JugadorForm,
} from './tenis'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('DNI: strips dots and spaces, accepts 7 or 8 digits (same as tenis-invitados)', () => {
  assert.equal(normalizarDni('30.123.456'), '30123456')
  assert.equal(normalizarDni(' 7 110 123 '), '7110123')
  assert.equal(normalizarDni('123456'), null)
  assert.equal(normalizarDni('123456789'), null)
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

caso('reservar payload: players are exactly {dni, nombre?, apellido?} (no tipo)', () => {
  assert.deepEqual(jugadoresPayload([
    { tipo: 'socio', dni: '20.111.222', nombre: 'ignorado', apellido: 'x' },
    { tipo: 'invitado', dni: '20333444', nombre: ' Juan ', apellido: 'Gómez ' },
  ]), [
    { dni: '20111222' },
    { dni: '20333444', nombre: 'Juan', apellido: 'Gómez' },
  ])
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

caso('free slots: grouped per court from the function `libres`, in court order, unknown courts dropped', () => {
  const canchas = [{ id: 'c1', nombre: '01' }, { id: 'c2', nombre: '02' }]
  const libres = [
    { cancha_id: 'c2', inicio: '2026-11-21T11:00:00.000Z', hora: '08:00', hora_real: '08:05' },
    { cancha_id: 'c1', inicio: '2026-11-21T13:00:00.000Z', hora: '10:00', hora_real: '10:05' },
    { cancha_id: 'c1', inicio: '2026-11-21T11:00:00.000Z', hora: '08:00', hora_real: '08:05' },
    { cancha_id: 'otra', inicio: '2026-11-21T11:00:00.000Z', hora: '08:00', hora_real: '08:05' },
    { basura: true },
  ]
  const r = turnosDesdeLibres(canchas, libres)
  assert.deepEqual(r.map(c => c.cancha.id), ['c1', 'c2'])
  assert.deepEqual(r[0].turnos.map(t => t.hora), ['08:00', '10:00'])
  assert.deepEqual(r[0].turnos[0], { hora: '08:00', empieza: '08:05', inicio: '2026-11-21T11:00:00.000Z' })
  assert.deepEqual(r[1].turnos.map(t => t.empieza), ['08:05'])
  assert.deepEqual(turnosDesdeLibres(canchas, undefined).map(c => c.turnos.length), [0, 0])
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

// Codes the guest flow can get from tenis-invitados (DB codes it passes through + its own).
const CODIGOS_WEB = [
  'parametros', 'modalidad_invalida', 'cancha_inexistente', 'cancha_inactiva', 'horario_invalido',
  'fuera_de_horario', 'pasado', 'anticipacion', 'bloqueado', 'turno_ocupado', 'limite_dia', 'limite_activas',
  'cantidad_jugadores', 'jugadores_duplicados', 'jugador_ocupado', 'socio_no_encontrado', 'dni_invalido',
  'invitado_incompleto', 'email_invalido', 'titular_suspendido', 'jugador_no_habilitado', 'titular_es_socio',
  'plazo_invitado', 'estado_invalido', 'token_invalido', 'hold_vencido', 'reserva_cancelada',
  'comprobante_vencido', 'path_invalido', 'hueco_invalido',
  'limitado', 'jugador_sin_nombre', 'comprobante_invalido', 'comprobante_no_subido',
]

caso('error codes: every code the function can return has its own Spanish copy', () => {
  const generico = mensajeTenis('codigo_que_no_existe')
  for (const c of CODIGOS_WEB) {
    assert.ok(CODIGOS_TENIS.includes(c), c)
    assert.notEqual(mensajeTenis(c), generico, c)
  }
  assert.match(mensajeTenis('token_invalido'), /enlace/i)
  assert.match(mensajeTenis('hueco_invalido'), /media hora libre/)
  assert.equal(mensajeTenis('Algo pasó'), 'Algo pasó')
  assert.match(mensajeTenis(undefined), /Probá de nuevo/)
})

caso('function answers: the code is read from `codigo`; unknown codes fall back to the function motivo', () => {
  assert.equal(mensajeRespuesta({ ok: false, codigo: 'turno_ocupado', motivo: 'x' }).codigo, 'turno_ocupado')
  assert.match(mensajeRespuesta({ ok: false, codigo: 'turno_ocupado', motivo: 'x' }).mensaje, /turno/i)
  assert.equal(mensajeRespuesta({ ok: false, codigo: 'nuevo_codigo', motivo: 'Texto de la función.' }).mensaje, 'Texto de la función.')
  assert.equal(mensajeRespuesta({ error: 'Error interno' }).codigo, undefined)
  assert.equal(mensajeRespuesta({ error: 'Error interno' }).mensaje, 'Error interno')
})

caso('confirm page: which screen each code shows', () => {
  assert.equal(pantallaConfirmar('token_invalido'), 'invalido')
  assert.equal(pantallaConfirmar('hold_vencido'), 'vencido')
  assert.equal(pantallaConfirmar('reserva_cancelada'), 'vencido')
  assert.equal(pantallaConfirmar('comprobante_vencido'), 'vencido')
  assert.equal(pantallaConfirmar('estado_invalido'), 'vencido')
  assert.equal(pantallaConfirmar(undefined), 'error')
  assert.equal(pantallaConfirmar('parametros'), 'error')
})

console.log(`\n${casos} casos ok`)
