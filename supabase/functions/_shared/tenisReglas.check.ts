// Verificación autocontenida de tenisReglas.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/tenisReglas.check.ts

import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import {
  COMPROBANTE_MAX_BYTES,
  LIMITES_INVITADOS,
  TENIS_CONFIG_DEFAULT as CFG,
  alineadoAModulo,
  cargoJugador,
  clavesLimiteInvitado,
  codigoDeError,
  dejaHuecoValido,
  dentroDeAnticipacion,
  dentroDeHorario,
  diaSemanaIso,
  duracionMin,
  extensionComprobante,
  fechaLocal,
  fechaValida,
  finTurno,
  formatoPesos,
  generarToken,
  hashToken,
  horaInicioReal,
  horaLocal,
  inicioReal,
  instanteLocal,
  jugadoresRequeridos,
  linkConfirmacion,
  motivoTenis,
  normalizarDni,
  normalizarEmail,
  normalizarNombre,
  parsearAvisosJugadores,
  parsearResumenProcesar,
  pathComprobanteValido,
  puedeCancelar,
  sumarDias,
  clasificarAvisosJugadores,
  clavePush,
  textoJugadorAgregado,
  textoJugadorCambio,
  textoAvisoJugador,
  tokenConForma,
  totalCargos,
  validarTurno,
  venceComprobante,
  venceHold,
  configDelDia,
  horarioDelDia,
  mailDestino,
  normalizarComentario,
  parsearBloqueoPuntual,
  parsearCancelarVarias,
  parsearHorarios,
  parsearIdsReserva,
  parsearReclamoNovedad,
  parsearSocioIds,
  htmlNovedad,
  textoPushNovedad,
  COMENTARIO_MAX,
  formatoAnticipacion,
  parsearAvisosGestores,
  textoCancelacionTardia,
  TIPOS_BLOQUE,
} from './tenisReglas.ts'

let casos = 0
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Instante a partir de hora de Argentina (UTC-3).
const ar = (s: string) => new Date(`${s}:00-03:00`)

// tsx compila a CJS: sin await de primer nivel.
async function main() {

await caso('config por defecto = defaults de tenis_config', () => {
  assert.equal(CFG.hora_desde, '08:00')
  assert.equal(CFG.hora_hasta, '22:00')
  assert.equal(CFG.modulo_min, 30)
  assert.equal(CFG.margen_inicio_min, 5)
  assert.equal(CFG.singles_min, 60)
  assert.equal(CFG.dobles_min, 90)
  assert.equal(CFG.cancelacion_horas, 3)
  assert.equal(CFG.comprobante_horas_antes, 3)
  assert.equal(CFG.hold_min, 15)
  assert.equal(CFG.anticipacion_dias, 2)
  assert.equal(CFG.alias_pago, 'uncas.tenis.macro')
})

await caso('día local de Argentina: 23:30 AR ya es el día siguiente en UTC pero sigue siendo el mismo día local', () => {
  const t = ar('2026-11-20T23:30')
  assert.equal(t.toISOString(), '2026-11-21T02:30:00.000Z')
  assert.equal(fechaLocal(t), '2026-11-20')
  assert.equal(horaLocal(t), '23:30')
  assert.equal(fechaLocal(ar('2026-11-21T00:00')), '2026-11-21')
  assert.equal(instanteLocal('2026-11-21', '08:00').toISOString(), '2026-11-21T11:00:00.000Z')
  assert.equal(instanteLocal('2026-11-21', '08:00:00').toISOString(), '2026-11-21T11:00:00.000Z')
})

await caso('fechas: suma de días, día ISO, validación', () => {
  assert.equal(sumarDias('2026-11-30', 1), '2026-12-01')
  assert.equal(sumarDias('2026-12-31', 2), '2027-01-02')
  assert.equal(diaSemanaIso('2026-11-23'), 1) // lunes
  assert.equal(diaSemanaIso('2026-11-22'), 7) // domingo
  assert.equal(fechaValida('2026-11-20'), true)
  assert.equal(fechaValida('2026-02-30'), false)
  assert.equal(fechaValida('20-11-2026'), false)
  assert.equal(fechaValida(undefined), false)
})

await caso('duración por modalidad: singles 60, dobles 90; jugadores además del titular: 1 y 3', () => {
  assert.equal(duracionMin('singles', CFG), 60)
  assert.equal(duracionMin('dobles', CFG), 90)
  assert.equal(jugadoresRequeridos('singles'), 1)
  assert.equal(jugadoresRequeridos('dobles'), 3)
  assert.equal(finTurno(ar('2026-11-21T18:00'), 'dobles', CFG).toISOString(), ar('2026-11-21T19:30').toISOString())
})

await caso('inicio real = turno + 5 minutos (barrido de cancha)', () => {
  assert.equal(inicioReal(ar('2026-11-21T18:00'), CFG).toISOString(), ar('2026-11-21T18:05').toISOString())
  assert.equal(horaInicioReal(ar('2026-11-21T18:00'), CFG), '18:05')
  assert.equal(horaInicioReal(ar('2026-11-21T08:30'), CFG), '08:35')
})

await caso('módulos de 30 minutos', () => {
  assert.equal(alineadoAModulo(ar('2026-11-21T18:00'), CFG), true)
  assert.equal(alineadoAModulo(ar('2026-11-21T18:30'), CFG), true)
  assert.equal(alineadoAModulo(ar('2026-11-21T18:15'), CFG), false)
  assert.equal(alineadoAModulo(new Date(ar('2026-11-21T18:00').getTime() + 1000), CFG), false)
})

await caso('horario 08:00–22:00: el turno entero tiene que entrar', () => {
  assert.equal(dentroDeHorario(ar('2026-11-21T08:00'), 'singles', CFG), true)
  assert.equal(dentroDeHorario(ar('2026-11-21T07:30'), 'singles', CFG), false)
  assert.equal(dentroDeHorario(ar('2026-11-21T21:00'), 'singles', CFG), true)
  assert.equal(dentroDeHorario(ar('2026-11-21T21:00'), 'dobles', CFG), false)
  assert.equal(dentroDeHorario(ar('2026-11-21T20:30'), 'dobles', CFG), true)
})

await caso('anticipación: hoy y hasta 2 días (día local)', () => {
  const ahora = ar('2026-11-20T23:50')
  assert.equal(dentroDeAnticipacion('2026-11-20', ahora, CFG), true)
  assert.equal(dentroDeAnticipacion('2026-11-22', ahora, CFG), true)
  assert.equal(dentroDeAnticipacion('2026-11-23', ahora, CFG), false)
  assert.equal(dentroDeAnticipacion('2026-11-19', ahora, CFG), false)
})

await caso('validarTurno devuelve el primer código que falla, o null', () => {
  const ahora = ar('2026-11-20T10:00')
  assert.equal(validarTurno(ar('2026-11-21T18:00'), 'singles', ahora, CFG), null)
  assert.equal(validarTurno(ar('2026-11-21T18:00'), 'paddle', ahora, CFG), 'modalidad_invalida')
  assert.equal(validarTurno(ar('2026-11-21T18:10'), 'singles', ahora, CFG), 'horario_invalido')
  assert.equal(validarTurno(ar('2026-11-21T21:30'), 'singles', ahora, CFG), 'fuera_de_horario')
  assert.equal(validarTurno(ar('2026-11-20T09:00'), 'singles', ahora, CFG), 'pasado')
  assert.equal(validarTurno(ar('2026-11-20T10:00'), 'singles', ahora, CFG), 'pasado')
  assert.equal(validarTurno(ar('2026-11-23T18:00'), 'singles', ahora, CFG), 'anticipacion')
  assert.equal(validarTurno(new Date('basura'), 'singles', ahora, CFG), 'parametros')
})

await caso('optimizador: el hueco hasta lo anterior/siguiente (o apertura/cierre) es 0 o de al menos singles_min', () => {
  const ahora = ar('2026-11-20T10:00') // mañana = 21/11
  const libre: { inicio: string; fin: string }[] = []
  // Cancha vacía: 08:00 y 21:00 no dejan hueco; 09:00 deja 60 (ok); 08:30 deja 30 a la apertura.
  assert.equal(dejaHuecoValido(ar('2026-11-21T08:00'), 'singles', libre, ahora, CFG), true)
  assert.equal(dejaHuecoValido(ar('2026-11-21T09:00'), 'singles', libre, ahora, CFG), true)
  assert.equal(dejaHuecoValido(ar('2026-11-21T08:30'), 'singles', libre, ahora, CFG), false)
  assert.equal(dejaHuecoValido(ar('2026-11-21T21:00'), 'singles', libre, ahora, CFG), true)
  // 20:30 singles termina 21:30: deja 30 al cierre; dobles 20:30 termina 22:00.
  assert.equal(dejaHuecoValido(ar('2026-11-21T20:30'), 'singles', libre, ahora, CFG), false)
  assert.equal(dejaHuecoValido(ar('2026-11-21T20:30'), 'dobles', libre, ahora, CFG), true)
  // Ocupado 12:00–13:00 (reserva o bloque, ISO o Date).
  const ocupados = [{ inicio: ar('2026-11-21T12:00').toISOString(), fin: ar('2026-11-21T13:00') }]
  assert.equal(dejaHuecoValido(ar('2026-11-21T13:00'), 'singles', ocupados, ahora, CFG), true)
  assert.equal(dejaHuecoValido(ar('2026-11-21T13:30'), 'singles', ocupados, ahora, CFG), false)
  assert.equal(dejaHuecoValido(ar('2026-11-21T14:00'), 'singles', ocupados, ahora, CFG), true)
  assert.equal(dejaHuecoValido(ar('2026-11-21T10:30'), 'singles', ocupados, ahora, CFG), false) // 11:30–12:00
  assert.equal(dejaHuecoValido(ar('2026-11-21T10:00'), 'singles', ocupados, ahora, CFG), true)
  // Lo de otro día no cuenta.
  const ayer = [{ inicio: ar('2026-11-20T21:00'), fin: ar('2026-11-21T00:00') }]
  assert.equal(dejaHuecoValido(ar('2026-11-21T08:00'), 'singles', ayer, ahora, CFG), true)
  // Hoy (día local) se permite cualquier hueco.
  assert.equal(dejaHuecoValido(ar('2026-11-20T20:30'), 'singles', libre, ahora, CFG), true)
  assert.equal(dejaHuecoValido(ar('2026-11-21T08:30'), 'singles', libre, ar('2026-11-20T23:50'), CFG), false) // mañana local
})

await caso('precio por jugador: carnet gratis el primer turno del día, después precio socio; invitado precio no socio', () => {
  assert.deepEqual(cargoJugador({ tipo: 'socio', carnetTenis: true, otroTurnoEseDia: false }, 'singles', CFG), { cargo: 0, motivo: 'carnet_gratis' })
  assert.deepEqual(cargoJugador({ tipo: 'socio', carnetTenis: true, otroTurnoEseDia: true }, 'singles', CFG), { cargo: 9000, motivo: 'turno_extra' })
  assert.deepEqual(cargoJugador({ tipo: 'socio', carnetTenis: true, otroTurnoEseDia: true }, 'dobles', CFG), { cargo: 10000, motivo: 'turno_extra' })
  assert.deepEqual(cargoJugador({ tipo: 'socio', carnetTenis: false, otroTurnoEseDia: false }, 'singles', CFG), { cargo: 9000, motivo: 'socio' })
  assert.deepEqual(cargoJugador({ tipo: 'socio', carnetTenis: false, otroTurnoEseDia: true }, 'dobles', CFG), { cargo: 10000, motivo: 'socio' })
  assert.deepEqual(cargoJugador({ tipo: 'invitado' }, 'singles', CFG), { cargo: 16000, motivo: 'no_socio' })
  assert.deepEqual(cargoJugador({ tipo: 'invitado' }, 'dobles', CFG), { cargo: 18000, motivo: 'no_socio' })
})

await caso('total de la reserva = suma de cargos', () => {
  assert.equal(totalCargos([{ cargo: 16000 }, { cargo: 0 }, { cargo: 10000 }, { cargo: 18000 }]), 44000)
  assert.equal(totalCargos([]), 0)
})

await caso('cancelación hasta 3 h antes (inclusive)', () => {
  const inicio = ar('2026-11-21T18:00')
  assert.equal(puedeCancelar(inicio, ar('2026-11-21T15:00'), CFG), true)
  assert.equal(puedeCancelar(inicio, ar('2026-11-21T15:01'), CFG), false)
  assert.equal(puedeCancelar(inicio, ar('2026-11-20T10:00'), CFG), true)
})

await caso('comprobante hasta 3 h antes; hold de 15 minutos', () => {
  assert.equal(venceComprobante(ar('2026-11-21T18:00'), CFG).toISOString(), ar('2026-11-21T15:00').toISOString())
  assert.equal(venceHold(ar('2026-11-21T10:00'), CFG).toISOString(), ar('2026-11-21T10:15').toISOString())
})

await caso('pesos con separador de miles', () => {
  assert.equal(formatoPesos(9000), '$9.000')
  assert.equal(formatoPesos(44000), '$44.000')
  assert.equal(formatoPesos(0), '$0')
  assert.equal(formatoPesos(1234567), '$1.234.567')
})

await caso('datos del invitado: DNI con puntos, mail, nombre', () => {
  assert.equal(normalizarDni('30.123.456'), '30123456')
  assert.equal(normalizarDni(' 7123456 '), '7123456')
  assert.equal(normalizarDni('12345'), null)
  assert.equal(normalizarDni('123456789'), null)
  assert.equal(normalizarDni('abc'), null)
  assert.equal(normalizarDni(30123456), null)
  assert.equal(normalizarEmail('  Ana@Mail.COM '), 'ana@mail.com')
  assert.equal(normalizarEmail('ana@mail'), null)
  assert.equal(normalizarEmail('a b@mail.com'), null)
  assert.equal(normalizarNombre('  María José  '), 'María José')
  assert.equal(normalizarNombre('   '), null)
  assert.equal(normalizarNombre('x'.repeat(61)), null)
  assert.equal(normalizarNombre('<script>'), null)
})

await caso('comprobante: sólo jpg/png/pdf, 5 MB, path <reserva>/<uuid>.<ext>', () => {
  assert.equal(COMPROBANTE_MAX_BYTES, 5 * 1024 * 1024)
  assert.equal(extensionComprobante('image/jpeg'), 'jpg')
  assert.equal(extensionComprobante('JPEG'), 'jpg')
  assert.equal(extensionComprobante('jpg'), 'jpg')
  assert.equal(extensionComprobante('image/png'), 'png')
  assert.equal(extensionComprobante('application/pdf'), 'pdf')
  assert.equal(extensionComprobante('pdf'), 'pdf')
  assert.equal(extensionComprobante('image/gif'), null)
  assert.equal(extensionComprobante('exe'), null)
  const r = '7f8e2a10-1111-4222-8333-944445555666'
  assert.equal(pathComprobanteValido(`${r}/0b1c2d3e-aaaa-4bbb-8ccc-dddddddddddd.jpg`, r), true)
  assert.equal(pathComprobanteValido(`${r}/0b1c2d3e-aaaa-4bbb-8ccc-dddddddddddd.pdf`, r), true)
  assert.equal(pathComprobanteValido(`${r}/0b1c2d3e-aaaa-4bbb-8ccc-dddddddddddd.gif`, r), false)
  assert.equal(pathComprobanteValido(`otra/0b1c2d3e-aaaa-4bbb-8ccc-dddddddddddd.jpg`, r), false)
  assert.equal(pathComprobanteValido(`${r}/../x.jpg`, r), false)
  assert.equal(pathComprobanteValido(undefined, r), false)
})

await caso('token: 32 bytes al azar en base64url, se guarda sólo su SHA-256', async () => {
  const t1 = generarToken()
  const t2 = generarToken()
  assert.notEqual(t1, t2)
  assert.equal(t1.length, 43)
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(tokenConForma(t1), true)
  assert.equal(tokenConForma('corto'), false)
  assert.equal(tokenConForma(`${t1}=`), false)
  assert.equal(tokenConForma(null), false)
  assert.equal(await hashToken(t1), createHash('sha256').update(t1).digest('hex'))
  assert.equal(linkConfirmacion(t1), `https://uncasapp.com/tenis/confirmar?t=${t1}`)
})

await caso('límite de invitados: claves HMAC por DNI, mail e IP (nunca el dato en claro)', async () => {
  const claves = await clavesLimiteInvitado({ dni: '30123456', email: 'ana@mail.com', ip: '203.0.113.7' }, 'k')
  assert.equal(claves.length, 3)
  const h = (s: string) => createHmac('sha256', 'k').update(s).digest('hex')
  assert.equal(claves[0].clave, `tenis:dni:${h('dni:30123456')}`)
  assert.equal(claves[1].clave, `tenis:email:${h('email:ana@mail.com')}`)
  assert.equal(claves[2].clave, `tenis:ip:${h('ip:203.0.113.7')}`)
  for (const c of claves) {
    assert.ok(!c.clave.includes('30123456') && !c.clave.includes('ana@') && !c.clave.includes('203.0'))
  }
  assert.deepEqual(claves.map((c) => [c.ventanaSegundos, c.maximo]), [
    [LIMITES_INVITADOS.dni.ventanaSegundos, LIMITES_INVITADOS.dni.maximo],
    [LIMITES_INVITADOS.email.ventanaSegundos, LIMITES_INVITADOS.email.maximo],
    [LIMITES_INVITADOS.ip.ventanaSegundos, LIMITES_INVITADOS.ip.maximo],
  ])
  // Sin IP confiable, sólo DNI y mail.
  assert.equal((await clavesLimiteInvitado({ dni: '30123456', email: 'ana@mail.com', ip: null }, 'k')).length, 2)
})

await caso('código estable de los errores de las RPC (raise P0001 con el código como mensaje)', () => {
  assert.equal(codigoDeError({ code: 'P0001', message: 'turno_ocupado' }), 'turno_ocupado')
  assert.equal(codigoDeError({ code: 'P0001', message: 'algo con espacios' }), null)
  assert.equal(codigoDeError({ code: '23P01', message: 'conflicting key value violates exclusion constraint' }), 'turno_ocupado')
  assert.equal(codigoDeError({ code: '42501', message: 'permission denied' }), null)
  assert.equal(codigoDeError(null), null)
  assert.equal(motivoTenis('codigo_que_no_existe'), 'No se pudo completar la operación. Probá de nuevo.')
  // turno_seguido con el nombre del DETAIL; sin nombre, genérico.
  assert.equal(motivoTenis('turno_seguido', 'Gómez Ana'), 'Gómez Ana ya juega en un turno pegado a este. No se pueden jugar dos turnos seguidos.')
  assert.equal(motivoTenis('turno_seguido', '  '), 'Uno de los jugadores ya juega en un turno pegado a este. No se pueden jugar dos turnos seguidos.')
  assert.equal(motivoTenis('turno_seguido'), 'Uno de los jugadores ya juega en un turno pegado a este. No se pueden jugar dos turnos seguidos.')
})

// Los códigos de la migración (header de 20261112000000_reservas_tenis.sql) y los que agregan
// las Edge Functions: todos con texto en castellano.
const CODIGOS_DB = [
  'no_autorizado', 'sin_socio', 'no_es_socio', 'parametros', 'modalidad_invalida', 'origen_invalido',
  'cancha_inexistente', 'cancha_inactiva', 'horario_invalido', 'fuera_de_horario', 'pasado', 'anticipacion',
  'bloqueado', 'turno_ocupado', 'limite_dia', 'limite_activas', 'cantidad_jugadores', 'jugadores_duplicados',
  'jugador_ocupado', 'socio_no_encontrado', 'dni_invalido', 'invitado_incompleto', 'email_invalido',
  'titular_suspendido', 'titular_moroso', 'jugador_no_habilitado', 'titular_es_socio', 'plazo_invitado',
  'reserva_inexistente', 'estado_invalido', 'reserva_finalizada', 'fuera_de_plazo', 'token_invalido',
  'hold_vencido', 'reserva_cancelada', 'comprobante_vencido', 'path_invalido', 'motivo_requerido',
  'bloque_invalido', 'bloque_inexistente', 'config_invalida', 'dias_invalidos', 'persona_requerida',
  'jugador_inexistente', 'infraccion_inexistente', 'suspension_inexistente', 'extension_invalida',
  'hueco_invalido',
  // 20261130000000_tenis_sin_turnos_seguidos.
  'turno_seguido',
]
const CODIGOS_FUNCIONES = ['limitado', 'jugador_sin_nombre', 'comprobante_invalido', 'comprobante_no_subido']

await caso('cada código de la base y de las funciones tiene texto propio', () => {
  const generico = motivoTenis('codigo_que_no_existe')
  for (const c of [...CODIGOS_DB, ...CODIGOS_FUNCIONES]) assert.notEqual(motivoTenis(c), generico, c)
})

await caso('resumen de tenis_procesar(): avisos con el titular, ids de jugadas, no_shows con cargo', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const s = '33333333-3333-4333-8333-333333333333'
  const aviso = (id: string, titular: Record<string, unknown>) => ({
    reserva_id: id, cancha_nombre: '03', inicio: '2026-11-21T21:00:00+00:00', fin: '2026-11-21T22:00:00+00:00',
    modalidad: 'singles', origen: 'invitado', estado: 'cancelada', motivo: 'x', titular,
  })
  const r = parsearResumenProcesar({
    ahora: '2026-11-21T20:00:00+00:00',
    holds_vencidos: [aviso(a, { invitado_id: b, nombre: 'Ana Paz', email: 'ana@mail.com' })],
    comprobantes_vencidos: [aviso(b, { invitado_id: a, nombre: 'Leo', email: null }), 'basura'],
    jugadas: [a, 'basura'],
    no_shows: [{ ...aviso(a, { socio_id: s, profile_id: b, nombre: 'Pérez Juan' }), cargo_titular: 18000, infraccion_id: b, advertencia: true }],
    comprobantes_sin_revisar: [{ ...aviso(b, { invitado_id: a, nombre: 'Leo', email: 'leo@mail.com' }), resultado: 'no_show' }, { ...aviso(a, {}), resultado: 'raro' }],
  })
  assert.equal(r.ahora, '2026-11-21T20:00:00+00:00')
  assert.equal(r.holds_vencidos.length, 1)
  assert.deepEqual(r.holds_vencidos[0].titular, { socio_id: null, profile_id: null, invitado_id: b, nombre: 'Ana Paz', email: 'ana@mail.com' })
  assert.equal(r.holds_vencidos[0].cancha_nombre, '03')
  assert.equal(r.comprobantes_vencidos.length, 1)
  assert.equal(r.comprobantes_vencidos[0].titular.email, null)
  assert.deepEqual(r.jugadas, [a])
  assert.equal(r.no_shows.length, 1)
  assert.equal(r.no_shows[0].titular.socio_id, s)
  assert.equal(r.no_shows[0].cargo_titular, 18000)
  assert.equal(r.no_shows[0].advertencia, true)
  assert.equal(r.no_shows[0].infraccion_id, b)
  // Comprobante en revisión al terminar el turno: jugada o no_show sin cargo; sólo se informa.
  assert.equal(r.comprobantes_sin_revisar.length, 2)
  assert.equal(r.comprobantes_sin_revisar[0].resultado, 'no_show')
  assert.equal(r.comprobantes_sin_revisar[0].titular.email, 'leo@mail.com')
  assert.equal(r.comprobantes_sin_revisar[1].resultado, null)
  assert.deepEqual(parsearResumenProcesar(null), {
    ahora: null, holds_vencidos: [], comprobantes_vencidos: [], jugadas: [], no_shows: [], comprobantes_sin_revisar: [],
  })
})

await caso('aviso "te sumaron": título, quién agregó, turno real (+5), cancha y modalidad', () => {
  const t = textoJugadorAgregado(
    { titular_nombre: 'Juan Pérez', inicio: ar('2026-11-26T18:00'), cancha: '03', modalidad: 'dobles' }, CFG)
  assert.equal(t.title, 'Te sumaron a un turno de tenis')
  assert.equal(t.body, 'Juan Pérez te agregó: jueves 26/11, 18:05 · Cancha 03 · Dobles.')
  // Sin nombre ni cancha; 08:00 AR = 11:00 UTC.
  const s = textoJugadorAgregado(
    { titular_nombre: null, inicio: new Date('2026-11-21T11:00:00Z'), cancha: null, modalidad: 'singles' }, CFG)
  assert.equal(s.body, 'Te agregaron: sábado 21/11, 08:05 · Singles.')
  // 21:30 AR del 26 ya es el 27 en UTC: el día es el local.
  const tarde = textoJugadorAgregado(
    { titular_nombre: '  ', inicio: new Date('2026-11-27T00:30:00Z'), cancha: '01', modalidad: 'raro' }, CFG)
  assert.equal(tarde.body, 'Te agregaron: jueves 26/11, 21:35 · Cancha 01.')
})

await caso('reclamo de avisos a jugadores: tolerante, descarta filas sin id, socio o inicio', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const r = '22222222-2222-4222-8222-222222222222'
  const s = '33333333-3333-4333-8333-333333333333'
  const p = parsearAvisosJugadores({
    descartados: 2,
    avisos: [
      { id: a, reserva_id: r, socio_id: s, titular_nombre: 'Pérez Juan', cancha: '01', inicio: '2026-11-21T21:00:00+00:00', modalidad: 'singles' },
      { id: 'x', reserva_id: r, socio_id: s, inicio: '2026-11-21T21:00:00+00:00' },
      { id: a, reserva_id: r, socio_id: null, inicio: '2026-11-21T21:00:00+00:00' },
      { id: a, reserva_id: r, socio_id: s, inicio: 'mañana' },
    ],
  })
  assert.equal(p.descartados, 2)
  assert.equal(p.avisos.length, 1)
  assert.equal(p.avisos[0].titular_nombre, 'Pérez Juan')
  assert.equal(p.avisos[0].cancha, '01')
  assert.equal(p.avisos[0].inicio.toISOString(), '2026-11-21T21:00:00.000Z')
  assert.deepEqual(parsearAvisosJugadores(null), { descartados: 0, avisos: [] })
  // Sin motivo (tenis-cron nueva con la migración anterior): "te sumaron".
  assert.equal(p.avisos[0].motivo, 'agregado')
  const c = parsearAvisosJugadores({ avisos: [
    { id: a, reserva_id: r, socio_id: s, motivo: 'cambio', inicio: '2026-11-21T21:00:00+00:00' },
    { id: a, reserva_id: r, socio_id: s, motivo: 'otro', inicio: '2026-11-21T21:00:00+00:00' },
  ] })
  assert.deepEqual(c.avisos.map((x) => x.motivo), ['cambio', 'agregado'])
})

await caso('aviso "cambió tu turno": título, quién lo cambió, turno real (+5), cancha y modalidad', () => {
  const t = textoJugadorCambio(
    { titular_nombre: 'Juan Pérez', inicio: ar('2026-11-26T18:00'), cancha: '03', modalidad: 'dobles' }, CFG)
  assert.equal(t.title, 'Cambió tu turno de tenis')
  assert.equal(t.body, 'Juan Pérez lo cambió: jueves 26/11, 18:05 · Cancha 03 · Dobles.')
  const s = textoJugadorCambio(
    { titular_nombre: '', inicio: new Date('2026-11-21T11:00:00Z'), cancha: null, modalidad: 'singles' }, CFG)
  assert.equal(s.body, 'Lo cambiaron: sábado 21/11, 08:05 · Singles.')
  // Elige el texto por motivo.
  const base = { titular_nombre: 'Ana', inicio: ar('2026-11-26T18:00'), cancha: '01', modalidad: 'singles' }
  assert.equal(textoAvisoJugador({ ...base, motivo: 'cambio' }, CFG).title, 'Cambió tu turno de tenis')
  assert.equal(textoAvisoJugador({ ...base, motivo: 'agregado' }, CFG).title, 'Te sumaron a un turno de tenis')
})

await caso('resultado de cada aviso a jugadores para marcar (entregado, sin teléfono, error)', () => {
  const avisos = [
    { id: 'a1', socio_id: 's1' },
    { id: 'a2', socio_id: 's2' },
    { id: 'a3', socio_id: 's3' },
    { id: 'a4', socio_id: 's4' },
  ]
  assert.equal(clavePush({ clave: 'a1', socioId: 's1' }), 'a1#s1')
  const estados = new Map([
    [clavePush({ clave: 'a1', socioId: 's1' }), 'entregado' as const],
    [clavePush({ clave: 'a2', socioId: 's2' }), 'sin_dispositivo' as const],
    [clavePush({ clave: 'a3', socioId: 's3' }), 'error' as const],
    // a4 no vino en el resultado: cuenta como error (se reintenta).
  ])
  const r = clasificarAvisosJugadores(avisos, { estados })
  assert.deepEqual(r.resultados, [
    { id: 'a1', resultado: 'entregado', error: null },
    { id: 'a2', resultado: 'sin_dispositivo', error: null },
    { id: 'a3', resultado: 'error', error: 'expo: no entregado' },
    { id: 'a4', resultado: 'error', error: 'expo: no entregado' },
  ])
  assert.deepEqual([r.entregados, r.sin_dispositivo, r.con_error], [1, 1, 2])

  // El envío entero falló (enviarPush tiró): todos error con el motivo, para reintentar.
  const caido = clasificarAvisosJugadores(avisos, { error: 'expo 503' })
  assert.deepEqual(caido.resultados.map((x) => `${x.id}:${x.resultado}:${x.error}`),
    ['a1:error:expo 503', 'a2:error:expo 503', 'a3:error:expo 503', 'a4:error:expo 503'])
  assert.deepEqual([caido.entregados, caido.sin_dispositivo, caido.con_error], [0, 0, 4])
  assert.deepEqual(clasificarAvisosJugadores([], { estados: new Map() }).resultados, [])
})

// ─── Paridad del módulo de tenis (20261128000000): horarios por día, comentario, cancelar varias, novedades ──

await caso('horarios por día: parsea filas de tenis_horarios (time de Postgres) y descarta lo inválido', () => {
  const filas = parsearHorarios([
    { dia_semana: 7, hora_desde: '10:00:00', hora_hasta: '17:00:00', activo: true },
    { dia_semana: 6, hora_desde: '09:00', hora_hasta: '22:00', activo: true },
    { dia_semana: 3, hora_desde: '08:00', hora_hasta: '22:00', activo: false },
    { dia_semana: 8, hora_desde: '08:00', hora_hasta: '22:00' },
    { dia_semana: 2, hora_desde: '23:00', hora_hasta: '08:00' },
    { dia_semana: 1, hora_desde: 'x', hora_hasta: '22:00' },
    null,
  ])
  assert.deepEqual(filas, [
    { dia_semana: 7, hora_desde: '10:00', hora_hasta: '17:00', activo: true },
    { dia_semana: 6, hora_desde: '09:00', hora_hasta: '22:00', activo: true },
    { dia_semana: 3, hora_desde: '08:00', hora_hasta: '22:00', activo: false },
  ])
  assert.deepEqual(parsearHorarios(null), [])
  // activo ausente = abierto (default de la tabla).
  assert.equal(parsearHorarios([{ dia_semana: 1, hora_desde: '08:00', hora_hasta: '22:00' }])[0].activo, true)
})

await caso('horarios por día: el día usa su fila; sin fila, el horario de tenis_config; inactivo = cerrado', () => {
  const filas = parsearHorarios([
    { dia_semana: 7, hora_desde: '10:00:00', hora_hasta: '17:00:00', activo: true },
    { dia_semana: 3, hora_desde: '08:00', hora_hasta: '22:00', activo: false },
  ])
  // 2026-11-29 es domingo, 2026-11-25 miércoles, 2026-11-26 jueves.
  assert.deepEqual(horarioDelDia('2026-11-29', filas, CFG), { desde: '10:00', hasta: '17:00' })
  assert.equal(horarioDelDia('2026-11-25', filas, CFG), null)
  assert.deepEqual(horarioDelDia('2026-11-26', filas, CFG), { desde: '08:00', hasta: '22:00' })
  assert.deepEqual(horarioDelDia('2026-11-26', [], { ...CFG, hora_desde: '07:00:00', hora_hasta: '23:00' }), { desde: '07:00', hasta: '23:00' })
})

await caso('horarios por día: configDelDia ajusta apertura y cierre, y las reglas de turno lo respetan', () => {
  const domingo = configDelDia(CFG, { desde: '10:00', hasta: '17:00' })
  assert.equal(domingo.hora_desde, '10:00')
  assert.equal(domingo.hora_hasta, '17:00')
  assert.equal(CFG.hora_desde, '08:00') // no muta la config base
  const ahora = ar('2026-11-28T12:00')
  assert.equal(validarTurno(ar('2026-11-29T09:30'), 'singles', ahora, domingo), 'fuera_de_horario')
  assert.equal(validarTurno(ar('2026-11-29T10:00'), 'singles', ahora, domingo), null)
  assert.equal(validarTurno(ar('2026-11-29T16:00'), 'singles', ahora, domingo), null)
  assert.equal(validarTurno(ar('2026-11-29T16:00'), 'dobles', ahora, domingo), 'fuera_de_horario')
  // El optimizador mide contra el cierre del día: 15:30 singles deja 30 min hasta las 17.
  assert.equal(dejaHuecoValido(ar('2026-11-29T15:30'), 'singles', [], ahora, domingo), false)
  assert.equal(dejaHuecoValido(ar('2026-11-29T15:00'), 'singles', [], ahora, domingo), true)
  // Día cerrado: ningún turno entra.
  const cerrado = configDelDia(CFG, null)
  assert.equal(validarTurno(ar('2026-11-29T10:00'), 'singles', ahora, cerrado), 'fuera_de_horario')
  assert.equal(validarTurno(ar('2026-11-29T00:00'), 'singles', ahora, cerrado), 'fuera_de_horario')
})

await caso('comentario: recortado, vacío = null, hasta 280 caracteres', () => {
  assert.equal(COMENTARIO_MAX, 280)
  assert.deepEqual(normalizarComentario(undefined), { ok: true, comentario: null })
  assert.deepEqual(normalizarComentario(null), { ok: true, comentario: null })
  assert.deepEqual(normalizarComentario('   '), { ok: true, comentario: null })
  assert.deepEqual(normalizarComentario('  traemos pelotas  '), { ok: true, comentario: 'traemos pelotas' })
  assert.deepEqual(normalizarComentario('a'.repeat(280)), { ok: true, comentario: 'a'.repeat(280) })
  assert.deepEqual(normalizarComentario('a'.repeat(281)), { ok: false })
  assert.deepEqual(normalizarComentario(42), { ok: false })
})

await caso('cancelar varias: ids de reserva válidos, sin repetir, de 1 a 100', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  assert.deepEqual(parsearIdsReserva([a, b, a]), [a, b])
  assert.equal(parsearIdsReserva([]), null)
  assert.equal(parsearIdsReserva([a, 'x']), null)
  assert.equal(parsearIdsReserva('a'), null)
  assert.equal(parsearIdsReserva(Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)), null)
})

await caso('bloqueo puntual: body nuevo o edición (id), cancha opcional, horario, tipo y título', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const cancha = '22222222-2222-4222-8222-222222222222'
  const base = { cancha_id: cancha, desde: '2026-11-21T15:00:00-03:00', hasta: '2026-11-21T16:00:00-03:00', tipo: 'torneo', titulo: '  Torneo  ' }
  const nuevo = parsearBloqueoPuntual(base)
  assert.equal(nuevo?.id, null)
  assert.equal(nuevo?.canchaId, cancha)
  assert.equal(nuevo?.desde.toISOString(), '2026-11-21T18:00:00.000Z')
  assert.equal(nuevo?.hasta.toISOString(), '2026-11-21T19:00:00.000Z')
  assert.equal(nuevo?.tipo, 'torneo')
  assert.equal(nuevo?.titulo, 'Torneo')
  assert.equal(parsearBloqueoPuntual({ ...base, id })?.id, id)
  assert.equal(parsearBloqueoPuntual({ ...base, id: null })?.id, null)
  assert.equal(parsearBloqueoPuntual({ ...base, cancha_id: null })?.canchaId, null)
  assert.equal(parsearBloqueoPuntual({ ...base, cancha_id: undefined })?.canchaId, null)
  assert.equal(parsearBloqueoPuntual({ ...base, titulo: 'x'.repeat(100) })?.titulo.length, 80)
  for (const malo of [
    { ...base, id: 'x' }, { ...base, id: 5 }, { ...base, cancha_id: 'x' }, { ...base, desde: 'nada' },
    { ...base, hasta: base.desde }, { ...base, tipo: 'raro' }, { ...base, tipo: 3 }, { ...base, titulo: '   ' },
    { ...base, titulo: undefined },
  ]) {
    assert.equal(parsearBloqueoPuntual(malo), null, JSON.stringify(malo))
  }
  for (const tipo of TIPOS_BLOQUE) assert.equal(parsearBloqueoPuntual({ ...base, tipo })?.tipo, tipo)
})

await caso('cancelar varias: lee canceladas (avisos o ids) y omitidas de tenis_cancelar_varias', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const c = '33333333-3333-4333-8333-333333333333'
  const r = parsearCancelarVarias({
    canceladas: [{ reserva_id: a, cancha_nombre: '01', titular: {} }, b, { nada: 1 }, a],
    omitidas: [{ reserva_id: c, codigo: 'reserva_finalizada' }, { reserva_id: 'x', codigo: 'y' }, { reserva_id: a }],
  })
  assert.deepEqual(r.canceladas, [a, b])
  assert.deepEqual(r.omitidas, [
    { reserva_id: c, codigo: 'reserva_finalizada' },
    { reserva_id: a, codigo: 'estado_invalido' },
  ])
  assert.deepEqual(parsearCancelarVarias(null), { canceladas: [], omitidas: [] })
})

await caso('audiencia de novedades: acepta uuid sueltos o filas {socio_id}, sin repetir', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  assert.deepEqual(parsearSocioIds([a, { socio_id: b }, { tenis_audiencia_novedades: a }, 'x', null, b]), [a, b])
  assert.deepEqual(parsearSocioIds(a), [a])
  assert.deepEqual(parsearSocioIds(null), [])
  const rec = parsearReclamoNovedad({ estado: 'reclamada', titulo: 'T', texto: 'X', enviada_at: '2026-11-26T12:00:00Z', push_hecho: true, push_enviados: 7 })
  assert.deepEqual(rec, { estado: 'reclamada', titulo: 'T', texto: 'X', enviada_at: '2026-11-26T12:00:00Z', push_hecho: true, push_enviados: 7 })
  assert.equal(parsearReclamoNovedad({ estado: 'reclamada', push_hecho: false, push_enviados: 7 }).push_enviados, 0)
  assert.equal(parsearReclamoNovedad({ estado: 'raro' }).estado, 'en_curso')
  assert.equal(parsearReclamoNovedad(null).estado, 'en_curso')
  assert.equal(parsearReclamoNovedad({ estado: 'ya_enviada' }).push_hecho, false)
})

await caso('mail: sólo direcciones reales (sin vacíos ni mails sintéticos del padrón)', () => {
  assert.equal(mailDestino(' Ana@Mail.com '), 'ana@mail.com')
  assert.equal(mailDestino('socio-123@uncas.local'), null)
  assert.equal(mailDestino('SOCIO-123@UNCAS.LOCAL'), null)
  assert.equal(mailDestino(''), null)
  assert.equal(mailDestino(null), null)
  assert.equal(mailDestino('sin-arroba'), null)
})

await caso('novedad: push con título "Tenis: …" y el texto recortado; mail escapado con saltos de línea', () => {
  const corta = textoPushNovedad({ titulo: 'Torneo de verano', texto: 'Inscripción abierta' })
  assert.deepEqual(corta, { title: 'Tenis: Torneo de verano', body: 'Inscripción abierta' })
  const larga = textoPushNovedad({ titulo: 'X', texto: 'palabra '.repeat(60) })
  assert.ok(larga.body.length <= 178, String(larga.body.length))
  assert.ok(larga.body.endsWith('…'))
  assert.equal(textoPushNovedad({ titulo: 'X', texto: '  ' }).body, 'Hay una novedad en la cartelera de tenis.')
  const html = htmlNovedad({ titulo: 'Cierre <b>', texto: 'Línea 1\nLínea & 2' })
  assert.match(html, /Cierre &lt;b&gt;/)
  assert.match(html, /Línea 1<br>Línea &amp; 2/)
  assert.doesNotMatch(html, /<b>/)
})

await caso('códigos nuevos de las Edge Functions tienen texto propio', () => {
  const generico = motivoTenis('codigo_que_no_existe')
  for (const c of ['comentario_largo', 'motivo_cancelacion', 'novedad_inexistente', 'novedad_ya_enviada', 'novedad_en_curso']) {
    assert.notEqual(motivoTenis(c), generico, c)
  }
})

await caso('cancelación tardía: anticipación en horas y minutos', () => {
  assert.equal(formatoAnticipacion(80), '1 h 20 min')
  assert.equal(formatoAnticipacion(120), '2 h')
  assert.equal(formatoAnticipacion(45), '45 min')
  assert.equal(formatoAnticipacion(1), '1 min')
  assert.equal(formatoAnticipacion(179), '2 h 59 min')
})

await caso('cancelación tardía: texto del push (hoy, mañana, otro día)', () => {
  const base = { titular_nombre: 'Juan Pérez', cancha: '03', inicio: ar('2026-11-27T18:00'), anticipacion_min: 80 }
  const hoy = textoCancelacionTardia(base, ar('2026-11-27T16:45'))
  assert.equal(hoy.title, 'Cancelación tardía')
  assert.equal(hoy.body, 'Juan Pérez canceló la cancha 03 de hoy 18:00 (faltaban 1 h 20 min).')
  // Turno a las 00:30 del día siguiente, cancelado a las 23:50.
  const manana = textoCancelacionTardia({ ...base, inicio: ar('2026-11-28T00:30'), anticipacion_min: 40 }, ar('2026-11-27T23:52'))
  assert.equal(manana.body, 'Juan Pérez canceló la cancha 03 de mañana 00:30 (faltaban 40 min).')
  const otro = textoCancelacionTardia({ ...base, inicio: ar('2026-11-30T18:00') }, ar('2026-11-27T16:45'))
  assert.equal(otro.body, 'Juan Pérez canceló la cancha 03 del lunes 30/11 18:00 (faltaban 1 h 20 min).')
  // 22:30 de Argentina ya es el día siguiente en UTC: sigue siendo "hoy".
  const noche = textoCancelacionTardia({ ...base, inicio: ar('2026-11-27T22:30'), anticipacion_min: 120 }, ar('2026-11-27T20:30'))
  assert.equal(noche.body, 'Juan Pérez canceló la cancha 03 de hoy 22:30 (faltaban 2 h).')
})

await caso('cancelación tardía: sin nombre, sin cancha, sin anticipación o ya por empezar', () => {
  const ahora = ar('2026-11-27T16:45')
  const inicio = ar('2026-11-27T18:00')
  assert.equal(textoCancelacionTardia({ titular_nombre: '  ', cancha: null, inicio, anticipacion_min: null }, ahora).body,
    'Un socio canceló su turno de hoy 18:00.')
  assert.equal(textoCancelacionTardia({ titular_nombre: 'Ana', cancha: '01', inicio, anticipacion_min: 0 }, ahora).body,
    'Ana canceló la cancha 01 de hoy 18:00 (estaba por empezar).')
})

await caso('cancelación tardía: parsear el reclamo de la outbox', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const reserva = '22222222-2222-4222-8222-222222222222'
  const perfil = '33333333-3333-4333-8333-333333333333'
  const r = parsearAvisosGestores({
    descartados: 2,
    avisos: [
      { id, reserva_id: reserva, profile_id: perfil, titular_nombre: 'Pérez Juan', cancha: '01',
        inicio: '2026-11-20T14:00:00+00:00', anticipacion_min: 60 },
      { id, reserva_id: reserva, profile_id: 'no-uuid', inicio: '2026-11-20T14:00:00+00:00' },
      { id, reserva_id: reserva, profile_id: perfil, inicio: 'x' },
      { id, reserva_id: reserva, profile_id: perfil, inicio: '2026-11-20T14:00:00+00:00', anticipacion_min: 'x' },
      'basura',
    ],
  })
  assert.equal(r.descartados, 2)
  assert.equal(r.avisos.length, 2)
  assert.deepEqual(r.avisos[0], {
    id, reserva_id: reserva, profile_id: perfil, titular_nombre: 'Pérez Juan', cancha: '01',
    inicio: new Date('2026-11-20T14:00:00+00:00'), anticipacion_min: 60,
  })
  assert.equal(r.avisos[1].anticipacion_min, null)
  assert.deepEqual(parsearAvisosGestores(null), { descartados: 0, avisos: [] })
})

console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
