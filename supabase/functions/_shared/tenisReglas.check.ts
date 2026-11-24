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
  assert.equal(validarTurno(ar('2026-11-21T18:10'), 'singles', ahora, CFG), 'no_alineado')
  assert.equal(validarTurno(ar('2026-11-21T21:30'), 'singles', ahora, CFG), 'fuera_de_horario')
  assert.equal(validarTurno(ar('2026-11-20T09:00'), 'singles', ahora, CFG), 'pasado')
  assert.equal(validarTurno(ar('2026-11-20T10:00'), 'singles', ahora, CFG), 'pasado')
  assert.equal(validarTurno(ar('2026-11-23T18:00'), 'singles', ahora, CFG), 'fuera_de_anticipacion')
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
  assert.equal(codigoDeError({ code: 'P0001', message: 'cancha_ocupada' }), 'cancha_ocupada')
  assert.equal(codigoDeError({ code: 'P0001', message: 'algo con espacios' }), null)
  assert.equal(codigoDeError({ code: '23P01', message: 'conflicting key value violates exclusion constraint' }), 'cancha_ocupada')
  assert.equal(codigoDeError({ code: '42501', message: 'permission denied' }), null)
  assert.equal(codigoDeError(null), null)
  assert.equal(typeof motivoTenis('cancha_ocupada'), 'string')
  assert.equal(motivoTenis('codigo_que_no_existe'), 'No se pudo completar la operación. Probá de nuevo.')
})

await caso('resumen de tenis_procesar(): ids sueltos u objetos, claves que falten = listas vacías', () => {
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  assert.deepEqual(parsearResumenProcesar({
    vencidas: [a],
    canceladas: [{ reserva_id: b }],
    no_shows: [{ reserva_id: a, total: 18000 }, 'basura'],
    advertencias: [{ socio_id: b, reserva_id: a }, { invitado_id: a }],
  }), {
    vencidas: [a],
    canceladas: [b],
    no_shows: [a],
    advertencias: [
      { socio_id: b, invitado_id: null, reserva_id: a },
      { socio_id: null, invitado_id: a, reserva_id: null },
    ],
  })
  assert.deepEqual(parsearResumenProcesar(null), { vencidas: [], canceladas: [], no_shows: [], advertencias: [] })
  assert.deepEqual(parsearResumenProcesar({ canceladas_sin_comprobante: [a] }).canceladas, [a])
})

console.log(`\n${casos} casos ok`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
