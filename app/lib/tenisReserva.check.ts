// Verificación autocontenida de tenisReserva.ts (no hay runner de tests en app/).
//   npx tsx app/lib/tenisReserva.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  COMENTARIO_MAX,
  NOMBRE_A_DESIGNAR,
  canchasLibresExtension,
  claveCotizacion,
  titularSocioCotizable,
  aDesignarTrasCobro,
  elegidoADesignar,
  elegidoInvitado,
  esEntradaADesignar,
  etiquetaCarnetTurno,
  etiquetasSaldo,
  jugadorTrasCobro,
  normalizarComentario,
  parsearCotizacion,
  parsearNovedades,
} from './tenisReserva'
import { jugadoresParaEditar, parsearCheckin, parsearMisReservas } from './tenis'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('comentario: recortado, null si vacío, hasta 280', () => {
  assert.equal(normalizarComentario('  hola  '), 'hola')
  assert.equal(normalizarComentario('   '), null)
  assert.equal(normalizarComentario(null), null)
  assert.equal(normalizarComentario('x'.repeat(300))?.length, COMENTARIO_MAX)
})

caso('socio a designar: entrada, nombre y claves que no se repiten', () => {
  const a = elegidoADesignar([])
  assert.deepEqual(a.entrada, { a_designar: true })
  assert.equal(a.nombre, NOMBRE_A_DESIGNAR)
  const b = elegidoADesignar([a.clave, 'sx'])
  assert.notEqual(a.clave, b.clave)
  assert.equal(esEntradaADesignar(a.entrada), true)
  assert.equal(esEntradaADesignar({ socio_id: 'sx' }), false)
})

caso('invitado: sólo nombre y apellido (sin DNI) o con DNI', () => {
  const sinDni = elegidoInvitado({ dni: '', nombre: ' Ana ', apellido: 'Paz ' }, [])
  assert.ok(sinDni.ok)
  if (sinDni.ok) {
    assert.deepEqual(sinDni.elegido.entrada, { invitado: { nombre: 'Ana', apellido: 'Paz' } })
    assert.equal(sinDni.elegido.nombre, 'Ana Paz (invitado)')
    const repetido = elegidoInvitado({ dni: '', nombre: 'ana', apellido: 'PAZ' }, [sinDni.elegido.clave])
    assert.equal(repetido.ok, false)
  }
  const conDni = elegidoInvitado({ dni: '30.111.777', nombre: 'Ana', apellido: 'Paz' }, [])
  assert.ok(conDni.ok)
  if (conDni.ok) assert.deepEqual(conDni.elegido.entrada, { invitado: { dni: '30111777', nombre: 'Ana', apellido: 'Paz' } })
  assert.equal(elegidoInvitado({ dni: '123', nombre: 'Ana', apellido: 'Paz' }, []).ok, false)
  assert.equal(elegidoInvitado({ dni: '', nombre: 'Ana', apellido: ' ' }, []).ok, false)
  // Sin DNI y sin permiso para eso (corregir jugadores): el DNI es obligatorio.
  assert.equal(elegidoInvitado({ dni: '', nombre: 'Ana', apellido: 'Paz' }, [], { dniOpcional: false }).ok, false)
})

caso('cotización: jugadores con cargo y total; basura da null', () => {
  const c = parsearCotizacion({ jugadores: [{ nombre: 'Pérez Juan', cargo: '9000', motivo: 'socio' }, { nombre: 'Ana', cargo: 0, motivo_cargo: 'carnet_gratis' }], total: 9000 })
  assert.deepEqual(c, {
    jugadores: [{ nombre: 'Pérez Juan', cargo: 9000, motivo: 'socio' }, { nombre: 'Ana', cargo: 0, motivo: 'carnet_gratis' }],
    total: 9000,
  })
  assert.equal(parsearCotizacion('x'), null)
  assert.equal(parsearCotizacion({ total: 5 }), null)
})

caso('cotización: la clave cambia con cancha, horario o jugadores', () => {
  const base = { canchaId: 'c1', inicio: 'i', modalidad: 'singles' as const, jugadores: [{ socio_id: 's' }], reservaId: null }
  assert.equal(claveCotizacion(base), claveCotizacion({ ...base }))
  assert.notEqual(claveCotizacion(base), claveCotizacion({ ...base, canchaId: 'c2' }))
  assert.notEqual(claveCotizacion(base), claveCotizacion({ ...base, jugadores: [{ a_designar: true }] }))
  assert.notEqual(claveCotizacion(base), claveCotizacion({ ...base, titularSocioId: 's9' }))
})

caso('cotización telefónica: sólo con un titular socio', () => {
  assert.equal(titularSocioCotizable({ socio_id: 's9' }), 's9')
  assert.equal(titularSocioCotizable({ dni: '30111777' }), null)
  assert.equal(titularSocioCotizable({ invitado: { dni: '30111777', nombre: 'Ana', apellido: 'Paz' } }), null)
  assert.equal(titularSocioCotizable(null), null)
})

caso('check-in: saldo del jugador con datos nuevos y con un servidor anterior', () => {
  const c = parsearCheckin({
    jugador: { jugador_id: 'j1', cargo: 10000, cobrado: true, monto_cobrado: 9000, diferencia: 1000, cargo_no_show: 18000, cargo_no_show_cobrado: false, pendiente: 19000 },
    resultado: 'ok',
  })
  assert.deepEqual(c.jugador, {
    id: 'j1', cargo: 10000, cobrado: true, monto_cobrado: 9000, diferencia: 1000, cargo_no_show: 18000, cargo_no_show_cobrado: false, pendiente: 19000,
    pendiente_propio: 19000, a_designar: [],
    motivo: null, carnet: false, turnos_dia: 0, turno_n: 0,
  })
  const viejo = parsearCheckin({ jugador: { jugador_id: 'j2', cargo: 9000, cobrado: false }, resultado: 'ok' })
  assert.equal(viejo.jugador?.pendiente, 9000)
  assert.equal(viejo.jugador?.diferencia, 0)
  assert.equal(viejo.jugador?.cargo_no_show, 0)
})

caso('check-in: etiquetas Debe / Saldo a favor / No-show', () => {
  assert.deepEqual(etiquetasSaldo({ pendiente: 19000, diferencia: 1000, cargo_no_show: 18000, cargo_no_show_cobrado: false }), [
    { texto: 'Debe $ 19.000', tono: 'debe' },
    { texto: 'No-show $ 18.000 · sin cobrar', tono: 'debe' },
  ])
  assert.deepEqual(etiquetasSaldo({ pendiente: 0, diferencia: -1000, cargo_no_show: 0, cargo_no_show_cobrado: false }), [
    { texto: 'Saldo a favor $ 1.000', tono: 'favor' },
  ])
  assert.deepEqual(etiquetasSaldo({ pendiente: 0, diferencia: 0, cargo_no_show: 18000, cargo_no_show_cobrado: true }), [
    { texto: 'No-show $ 18.000 · cobrado', tono: 'info' },
  ])
  assert.deepEqual(etiquetasSaldo({ pendiente: 0, diferencia: 0, cargo_no_show: 0, cargo_no_show_cobrado: false }), [])
})

caso('check-in: al cobrar baja lo pendiente y la diferencia queda en 0', () => {
  const j = { cargo: 9000, cobrado: false, monto_cobrado: null, diferencia: 0, pendiente: 27000 }
  assert.deepEqual(jugadorTrasCobro(j), { cargo: 9000, cobrado: true, monto_cobrado: 9000, diferencia: 0, pendiente: 18000 })
  const dif = { cargo: 10000, cobrado: true, monto_cobrado: 9000, diferencia: 1000, pendiente: 1000 }
  assert.deepEqual(jugadorTrasCobro(dif), { cargo: 10000, cobrado: true, monto_cobrado: 10000, diferencia: 0, pendiente: 0 })
})

caso('extensión: canchas libres en la ventana (bloques de todas las canchas ocupan todas)', () => {
  const canchas = [{ id: 'c1', nombre: '01' }, { id: 'c2', nombre: '02' }, { id: 'c3', nombre: '03' }]
  const T = (h: string) => `2026-11-26T${h}:00-03:00`
  const items = [
    { cancha_id: 'c1', inicio: T('18:00'), fin: T('19:00'), estado: 'confirmada' },
    { cancha_id: 'c2', inicio: T('19:00'), fin: T('20:00'), estado: 'confirmada' },
    { cancha_id: 'c3', inicio: T('19:00'), fin: T('20:00'), estado: 'cancelada' },
  ]
  assert.deepEqual(canchasLibresExtension(items, canchas, T('19:00'), T('19:30')).map(c => c.id), ['c1', 'c3'])
  const conBloque = [...items, { cancha_id: null, inicio: T('19:15'), fin: T('21:00'), estado: null }]
  assert.deepEqual(canchasLibresExtension(conBloque, canchas, T('19:00'), T('19:30')), [])
})

caso('novedades: destacadas primero, después las más nuevas; basura afuera', () => {
  const n = parsearNovedades([
    { id: 'a', titulo: 'Vieja', texto: 't', destacada: false, created_at: '2026-11-01T10:00:00Z' },
    { id: 'b', titulo: 'Nueva', texto: 't', destacada: false, created_at: '2026-11-20T10:00:00Z' },
    { id: 'c', titulo: 'Fija', texto: 't', destacada: true, created_at: '2026-10-01T10:00:00Z' },
    { titulo: 'sin id' },
    'x',
  ])
  assert.deepEqual(n.map(x => x.id), ['c', 'b', 'a'])
  assert.deepEqual(parsearNovedades({ items: [{ id: 'z', titulo: 'T', texto: '' }] }).map(x => x.id), ['z'])
  assert.deepEqual(parsearNovedades(null), [])
})

caso('editar: "Socio a designar" se precarga y el comentario se lee', () => {
  const [r] = parsearMisReservas([{
    reserva_id: 'r1', inicio: 'i', fin: 'f', comentario: 'Traigo pelotas',
    jugadores: [
      { socio_id: 's1', nombre: 'Titular', es_titular: true },
      { socio_id: null, invitado_id: null, a_designar: true, nombre: 'Socio a designar' },
    ],
  }])
  assert.equal(r.comentario, 'Traigo pelotas')
  const pre = jugadoresParaEditar(r)
  assert.equal(pre.length, 1)
  assert.deepEqual(pre[0].entrada, { a_designar: true })
  assert.equal(pre[0].nombre, NOMBRE_A_DESIGNAR)
})


caso('check-in: cobrar un "a designar" del titular baja su pendiente', () => {
  const j = { pendiente: 18000, a_designar: [{ jugador_id: 'a1', cargo: 9000, cobrado: false, pendiente: 9000 }] }
  const t = aDesignarTrasCobro(j, 'a1')
  assert.equal(t.pendiente, 9000)
  assert.deepEqual(t.a_designar, [{ jugador_id: 'a1', cargo: 9000, cobrado: true, pendiente: 0 }])
  assert.equal(aDesignarTrasCobro(j, 'otro'), j)
})

caso('check-in: carnet y turnos del día (servidor nuevo y anterior)', () => {
  const c = parsearCheckin({
    jugador: { jugador_id: 'j1', cargo: 9000, motivo: 'turno_extra', cobrado: false, carnet: true, turnos_dia: 2, turno_n: 2 },
    resultado: 'ok',
  })
  assert.equal(c.jugador?.motivo, 'turno_extra')
  assert.equal(c.jugador?.carnet, true)
  assert.equal(c.jugador?.turnos_dia, 2)
  assert.equal(c.jugador?.turno_n, 2)
  const raro = parsearCheckin({ jugador: { jugador_id: 'j1', cargo: 0, carnet: 'si', turnos_dia: 'x', turno_n: -1 } })
  assert.equal(raro.jugador?.carnet, false)
  assert.equal(raro.jugador?.turnos_dia, 0)
  assert.equal(raro.jugador?.turno_n, 0)
})

caso('check-in: línea del carnet según el turno del día', () => {
  assert.equal(etiquetaCarnetTurno({ carnet: true, turnos_dia: 1, turno_n: 1, cargo: 0 }),
    'Carnet Tenis · 1º turno de hoy · sin cargo')
  assert.equal(etiquetaCarnetTurno({ carnet: true, turnos_dia: 2, turno_n: 1, cargo: 0 }),
    'Carnet Tenis · 1º turno de hoy (juega 2 hoy) · sin cargo')
  assert.equal(etiquetaCarnetTurno({ carnet: true, turnos_dia: 2, turno_n: 2, cargo: 9000 }),
    'Carnet Tenis · 2º turno de hoy (juega 2 hoy) · paga como socio $ 9.000')
  // Sin carnet, o un servidor anterior sin los campos: nada.
  assert.equal(etiquetaCarnetTurno({ carnet: false, turnos_dia: 2, turno_n: 2, cargo: 9000 }), null)
  assert.equal(etiquetaCarnetTurno({ carnet: true, turnos_dia: 0, turno_n: 0, cargo: 0 }), null)
})

console.log(`\n${casos} casos ok`)
