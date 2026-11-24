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
  parsearResumenProcesar,
  pathComprobanteValido,
  puedeCancelar,
  sumarDias,
  tokenConForma,
  totalCargos,
  validarTurno,
  venceComprobante,
  venceHold,
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

console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
