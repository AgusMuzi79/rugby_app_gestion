// Self-contained check for tenis.ts (the repo has no test runner).
//   npx --yes tsx web/lib/tenis.check.ts
// Exits with a non-zero code if anything fails.

import assert from 'node:assert/strict'
import {
  AVISO_SANCIONES, normalizarDni, validarEmail, validarTitular, validarJugadores, jugadoresRequeridos,
  formatearPrecio, resumenPrecios, fechasReservables, hoyArgentina, horaArgentina,
  inicioIso, turnosDesdeLibres, vencimientoComprobante, formatearFechaHora, validarComprobante,
  mensajeTenis, mensajeRespuesta, pantallaConfirmar, jugadoresPayload, CODIGOS_TENIS, CONFIG_DEFAULT,
  configDesde, resultadoInvitados, mensajeFalloInvitados,
  horariosDisponibles, franjaDeHora, horariosPorFranja, etiquetaDia, diaCorto, duracionTexto, faltaParaReservar,
  COMENTARIO_MAX, validarComentario, horarioDesde, textoHorario,
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

caso('dates: follow the server anticipacion_dias; bad values fall back to safe ones', () => {
  const ahora = new Date('2026-11-21T15:00:00Z')
  assert.deepEqual(fechasReservables(ahora, configDesde({ anticipacion_dias: 4 }).anticipacion_dias),
    ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'])
  assert.deepEqual(fechasReservables(ahora, 0), ['2026-11-21'])
  assert.deepEqual(fechasReservables(ahora, -3), ['2026-11-21'])
  assert.deepEqual(fechasReservables(ahora, Number.NaN), ['2026-11-21', '2026-11-22', '2026-11-23'])
  // A page left open past midnight offers the new day first, never yesterday.
  assert.equal(fechasReservables(new Date('2026-11-22T03:01:00Z'), 2)[0], '2026-11-22')
})

caso('config: server values win, Postgres times are trimmed, bad numbers keep defaults', () => {
  assert.deepEqual(configDesde(null), CONFIG_DEFAULT)
  const c = configDesde({ hora_desde: '09:00:00', hora_hasta: '21:30:00', anticipacion_dias: 3, alias_pago: 'otro.alias' })
  assert.equal(c.hora_desde, '09:00')
  assert.equal(c.hora_hasta, '21:30')
  assert.equal(c.anticipacion_dias, 3)
  assert.equal(c.alias_pago, 'otro.alias')
  assert.equal(c.singles_min, 60)
  const raro = configDesde({ anticipacion_dias: '5', singles_min: 'x', hold_min: null } as unknown as Partial<typeof CONFIG_DEFAULT>)
  assert.equal(raro.anticipacion_dias, 5)
  assert.equal(raro.singles_min, 60)
  assert.equal(raro.hold_min, 15)
})

caso('API: ok bodies pass through; business and real errors become Spanish copy with the code', () => {
  const ok = resultadoInvitados<{ reserva_id: string }>(200, JSON.stringify({ reserva_id: 'r1' }))
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.data.reserva_id, 'r1')
  const negocio = resultadoInvitados(200, JSON.stringify({ ok: false, codigo: 'hueco_invalido', motivo: 'x' }))
  assert.equal(negocio.ok, false)
  assert.equal(!negocio.ok && negocio.codigo, 'hueco_invalido')
  assert.match(!negocio.ok ? negocio.error : '', /media hora libre/)
  const conDni = resultadoInvitados(200, JSON.stringify({ ok: false, codigo: 'jugador_sin_nombre', dni: '30111777' }))
  assert.equal(!conDni.ok && conDni.data?.dni, '30111777')
  const real = resultadoInvitados(500, JSON.stringify({ error: 'Error interno' }))
  assert.equal(!real.ok && real.error, 'Error interno')
  const html = resultadoInvitados(502, '<html>Bad gateway</html>')
  assert.equal(html.ok, false)
  assert.match(!html.ok ? html.error : '', /502/)
  assert.match(mensajeFalloInvitados(true), /tardó/)
  assert.match(mensajeFalloInvitados(false), /conexión/)
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

caso('time slots: one list of free start times, deduplicated across courts, with the courts free at each', () => {
  const canchas = [{ id: 'c1', nombre: '01' }, { id: 'c2', nombre: '02' }, { id: 'c3', nombre: '03' }]
  const libres = {
    singles: [
      { cancha_id: 'c3', inicio: '2026-11-26T21:00:00.000Z', hora: '18:00', hora_real: '18:05' },
      { cancha_id: 'c1', inicio: '2026-11-26T21:00:00.000Z', hora: '18:00', hora_real: '18:05' },
      { cancha_id: 'c2', inicio: '2026-11-26T11:00:00.000Z', hora: '08:00', hora_real: '08:05' },
      { cancha_id: 'otra', inicio: '2026-11-26T12:00:00.000Z', hora: '09:00', hora_real: '09:05' },
      { cancha_id: 'c1', inicio: '2026-11-26T16:30:00.000Z', hora: '13:30' },
      { basura: true },
    ],
    dobles: [{ cancha_id: 'c2', inicio: '2026-11-26T22:00:00.000Z', hora: '19:00', hora_real: '19:05' }],
  }
  const s = horariosDisponibles(canchas, libres, 'singles')
  assert.deepEqual(s.map(h => h.hora), ['08:00', '13:30', '18:00'])
  assert.deepEqual(s[2], {
    hora: '18:00', horaReal: '18:05', inicio: '2026-11-26T21:00:00.000Z', franja: 'noche',
    canchas: [{ id: 'c1', nombre: '01' }, { id: 'c3', nombre: '03' }],
  })
  assert.equal(s[1].horaReal, '13:30') // no hora_real → the booked time
  assert.deepEqual(horariosDisponibles(canchas, libres, 'dobles').map(h => [h.horaReal, h.canchas.length]), [['19:05', 1]])
  assert.deepEqual(horariosDisponibles(canchas, undefined, 'singles'), [])
  assert.deepEqual(horariosDisponibles(canchas, { singles: 'x' }, 'singles'), [])
})

caso('time bands: morning before 12, afternoon 12 to 18, night from 18; empty bands are dropped', () => {
  assert.equal(franjaDeHora('08:00'), 'manana')
  assert.equal(franjaDeHora('11:30'), 'manana')
  assert.equal(franjaDeHora('12:00'), 'tarde')
  assert.equal(franjaDeHora('17:30'), 'tarde')
  assert.equal(franjaDeHora('18:00'), 'noche')
  assert.equal(franjaDeHora('21:30'), 'noche')
  const canchas = [{ id: 'c1', nombre: '01' }]
  const h = horariosDisponibles(canchas, { singles: [
    { cancha_id: 'c1', inicio: '2026-11-26T22:00:00.000Z', hora: '19:00', hora_real: '19:05' },
    { cancha_id: 'c1', inicio: '2026-11-26T11:00:00.000Z', hora: '08:00', hora_real: '08:05' },
  ] }, 'singles')
  const g = horariosPorFranja(h)
  assert.deepEqual(g.map(x => [x.franja, x.titulo, x.horarios.length]), [['manana', 'Mañana', 1], ['noche', 'Noche', 1]])
})

caso('day labels: today and tomorrow are named, the rest show short weekday and day', () => {
  assert.equal(diaCorto('2026-11-25'), 'mié 25')
  assert.equal(diaCorto('2026-11-29'), 'dom 29')
  assert.equal(etiquetaDia('2026-11-25', '2026-11-25'), 'Hoy · mié 25')
  assert.equal(etiquetaDia('2026-11-26', '2026-11-25'), 'Mañana · jue 26')
  assert.equal(etiquetaDia('2026-11-27', '2026-11-25'), 'vie 27')
  assert.equal(etiquetaDia('2026-12-01', '2026-11-30'), 'Mañana · mar 01')
})

caso('durations: whole hours and hours with minutes', () => {
  assert.equal(duracionTexto(60), '1 h')
  assert.equal(duracionTexto(90), '1 h 30')
  assert.equal(duracionTexto(120), '2 h')
  assert.equal(duracionTexto(45), '45 min')
})

caso('booking bar: says the first thing still missing, in page order', () => {
  const base = { hayHorario: true, hayCancha: true, modalidad: 'singles' as const, erroresTitular: {}, erroresJugadores: [{}] }
  assert.equal(faltaParaReservar(base), null)
  assert.deepEqual(faltaParaReservar({ ...base, hayHorario: false, hayCancha: false, erroresTitular: { dni: 'x' } }),
    { paso: 'horario', mensaje: 'Elegí un horario' })
  assert.deepEqual(faltaParaReservar({ ...base, hayCancha: false }), { paso: 'cancha', mensaje: 'Elegí una cancha' })
  assert.deepEqual(faltaParaReservar({ ...base, erroresTitular: { email: 'x' }, erroresJugadores: [{ dni: 'x' }] }),
    { paso: 'titular', mensaje: 'Completá tus datos' })
  assert.deepEqual(faltaParaReservar({ ...base, erroresJugadores: [{ dni: 'x' }] }),
    { paso: 'jugadores', mensaje: 'Completá los datos de tu rival' })
  assert.deepEqual(faltaParaReservar({ ...base, modalidad: 'dobles', erroresJugadores: [{}, {}, { nombre: 'x' }] }),
    { paso: 'jugadores', mensaje: 'Completá los datos de los otros jugadores' })
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
  'limitado', 'jugador_sin_nombre', 'comprobante_invalido', 'comprobante_no_subido', 'comentario_largo',
  'turno_seguido',
]

caso('back-to-back turn: the name in detalle when the function sends it, generic otherwise', () => {
  assert.equal(mensajeRespuesta({ ok: false, codigo: 'turno_seguido', detalle: 'Gui Dni' }).mensaje,
    'Gui Dni ya juega en un turno pegado a este. No se pueden jugar dos turnos seguidos.')
  assert.equal(mensajeRespuesta({ ok: false, codigo: 'turno_seguido', motivo: 'x' }).mensaje,
    'Uno de los jugadores ya juega en un turno pegado a este. No se pueden jugar dos turnos seguidos.')
})

caso('comment: optional, up to 280 characters after trimming', () => {
  assert.equal(COMENTARIO_MAX, 280)
  assert.equal(validarComentario(''), undefined)
  assert.equal(validarComentario('   '), undefined)
  assert.equal(validarComentario('  ' + 'a'.repeat(280) + '  '), undefined)
  assert.match(validarComentario('a'.repeat(281)) ?? '', /280/)
})

caso('opening hours of the day: read from `disponibilidad.horario`; null = closed, missing = unknown', () => {
  assert.deepEqual(horarioDesde({ desde: '10:00:00', hasta: '17:00' }), { desde: '10:00', hasta: '17:00' })
  assert.equal(horarioDesde(null), null)
  assert.equal(horarioDesde({ desde: '10:00', hasta: '17:00', abierto: false }), null)
  assert.deepEqual(horarioDesde({ desde: '10:00', hasta: '17:00', abierto: true }), { desde: '10:00', hasta: '17:00' })
  assert.equal(horarioDesde(undefined), undefined)
  assert.equal(horarioDesde({ desde: 'x', hasta: '17:00' }), undefined)
  assert.equal(textoHorario({ desde: '10:00', hasta: '17:00' }), 'de 10 a 17 h')
  assert.equal(textoHorario({ desde: '08:30', hasta: '22:00' }), 'de 8:30 a 22 h')
})

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

caso('AVISO_SANCIONES: warns about sanctions, suspension and that the holder pays', () => {
  assert.equal(AVISO_SANCIONES.titulo, 'Antes de confirmar')
  assert.match(AVISO_SANCIONES.texto, /sanciones/)
  assert.match(AVISO_SANCIONES.texto, /suspendido/)
  assert.match(AVISO_SANCIONES.texto, /titular/)
})

console.log(`\n${casos} casos ok`)
