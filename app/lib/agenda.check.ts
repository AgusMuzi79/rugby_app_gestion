// Verificación autocontenida de agenda.ts (no hay runner de tests en app/).
//   npx tsx app/lib/agenda.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  AGENDA_VACIA,
  agruparAgenda,
  agruparPorFecha,
  agendaVacia,
  lineaTenis,
  otrosJugadores,
  reservasTenisAgenda,
  etiquetaFecha,
  horaCorta,
  lineaEvento,
  mostrarTabAgenda,
  parsearAgenda,
  nombreMisDivisiones,
  opcionesReserva,
  puedeVerAgenda,
  ventanaAgenda,
  type DivisionAgenda,
  type EventoAgenda,
} from './agenda'
import type { MiReserva } from './tenis'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const M15: DivisionAgenda = { id: 'd1', nombre: 'M15', deporte: 'rugby' }
const SUB14: DivisionAgenda = { id: 'd2', nombre: 'Sub 14', deporte: 'hockey' }

function ev(p: Partial<EventoAgenda>): EventoAgenda {
  return {
    id: 'e', tipo: 'entrenamiento', titulo: null, fecha: '2026-10-20', hora: null,
    lugar: null, rival: null, modalidad: null, division_id: 'd1', ...p,
  }
}

// ─── Visibilidad ──────────────────────────────────────────────────────────────

caso('sin gimnasio ni división no ve la agenda', () => {
  assert.equal(puedeVerAgenda({ tiene_gimnasio: false, divisiones: [] }), false)
})

caso('con gimnasio o con división ve la agenda', () => {
  assert.equal(puedeVerAgenda({ tiene_gimnasio: true, divisiones: [] }), true)
  assert.equal(puedeVerAgenda({ tiene_gimnasio: false, divisiones: [M15] }), true)
  assert.equal(puedeVerAgenda({ tiene_gimnasio: true, divisiones: [M15, SUB14] }), true)
})

caso('la pestaña queda oculta mientras carga', () => {
  assert.equal(mostrarTabAgenda({ loading: true, error: null, agenda: null }), false)
})

caso('si la carga falla la pestaña se muestra (la pantalla ofrece Reintentar)', () => {
  assert.equal(mostrarTabAgenda({ loading: false, error: 'x', agenda: null }), true)
})

caso('cargada, la pestaña sigue a puedeVerAgenda', () => {
  assert.equal(mostrarTabAgenda({ loading: false, error: null, agenda: AGENDA_VACIA }), false)
  assert.equal(
    mostrarTabAgenda({ loading: false, error: null, agenda: { ...AGENDA_VACIA, tiene_gimnasio: true } }),
    true,
  )
})

caso('una recarga en curso no oculta una pestaña ya visible', () => {
  assert.equal(
    mostrarTabAgenda({ loading: true, error: null, agenda: { ...AGENDA_VACIA, divisiones: [M15] } }),
    true,
  )
})

// ─── Parseo de la respuesta del RPC ───────────────────────────────────────────

caso('respuesta nula o mal formada cae en agenda vacía', () => {
  assert.deepEqual(parsearAgenda(null), AGENDA_VACIA)
  assert.deepEqual(parsearAgenda('x'), AGENDA_VACIA)
  assert.deepEqual(parsearAgenda({ tiene_gimnasio: 'si', divisiones: 3 }), AGENDA_VACIA)
})

caso('respuesta válida se conserva', () => {
  const raw = { tiene_gimnasio: true, divisiones: [M15], eventos: [ev({ id: 'a' })] }
  assert.deepEqual(parsearAgenda(raw), raw)
})

// ─── Agrupado por fecha ───────────────────────────────────────────────────────

caso('agrupa por fecha en orden de fecha y hora', () => {
  const grupos = agruparPorFecha([
    ev({ id: 'c', fecha: '2026-10-22', hora: '10:00:00' }),
    ev({ id: 'b', fecha: '2026-10-20', hora: '19:00:00' }),
    ev({ id: 'a', fecha: '2026-10-20', hora: '08:30:00' }),
    ev({ id: 'd', fecha: '2026-10-20', hora: null }),
  ])
  assert.deepEqual(grupos.map(g => g.fecha), ['2026-10-20', '2026-10-22'])
  assert.deepEqual(grupos[0].eventos.map(e => e.id), ['a', 'b', 'd'])
  assert.deepEqual(grupos[1].eventos.map(e => e.id), ['c'])
})

caso('sin eventos no hay grupos', () => {
  assert.deepEqual(agruparPorFecha([]), [])
})

caso('etiqueta de fecha con día de semana', () => {
  assert.equal(etiquetaFecha('2026-10-20'), 'MARTES 20/10')
  assert.equal(etiquetaFecha('2026-10-25'), 'DOMINGO 25/10')
})

caso('hora corta HH:MM o null', () => {
  assert.equal(horaCorta('19:30:00'), '19:30')
  assert.equal(horaCorta('08:00'), '08:00')
  assert.equal(horaCorta(null), null)
})

// ─── Línea visible ────────────────────────────────────────────────────────────

caso('entrenamiento con una sola división: sólo la etiqueta', () => {
  assert.equal(lineaEvento(ev({ tipo: 'entrenamiento' }), [M15]), 'Entrenamiento')
})

caso('partido muestra el rival', () => {
  assert.equal(lineaEvento(ev({ tipo: 'partido', rival: 'Los Tilos' }), [M15]), 'Partido vs Los Tilos')
})

caso('partido sin rival no muestra "vs"', () => {
  assert.equal(lineaEvento(ev({ tipo: 'partido', rival: '  ' }), [M15]), 'Partido')
})

caso('actividad usa su título', () => {
  assert.equal(lineaEvento(ev({ tipo: 'actividad', titulo: 'Charla de nutrición' }), [M15]), 'Charla de nutrición')
})

caso('con más de una división se agrega el nombre de la división', () => {
  assert.equal(
    lineaEvento(ev({ tipo: 'partido', rival: 'SIC', division_id: 'd2' }), [M15, SUB14]),
    'Partido vs SIC · Sub 14',
  )
  assert.equal(lineaEvento(ev({ division_id: 'd1' }), [M15, SUB14]), 'Entrenamiento · M15')
})

caso('la ventana va de hoy a 7 días adelante, en fecha local', () => {
  assert.deepEqual(ventanaAgenda(new Date(2026, 9, 18, 23, 30)), { p_desde: '2026-10-18', p_hasta: '2026-10-25' })
})

caso('la ventana cruza fin de mes y de año', () => {
  assert.deepEqual(ventanaAgenda(new Date(2026, 11, 28, 9, 0)), { p_desde: '2026-12-28', p_hasta: '2027-01-04' })
})

caso('nombreMisDivisiones: sin divisiones es null', () => {
  assert.equal(nombreMisDivisiones([]), null)
})

caso('nombreMisDivisiones: una, dos y tres divisiones', () => {
  const M21: DivisionAgenda = { id: 'd3', nombre: 'M21', deporte: 'rugby' }
  assert.equal(nombreMisDivisiones([M15]), 'M15')
  assert.equal(nombreMisDivisiones([M15, SUB14]), 'M15 y Sub 14')
  assert.equal(nombreMisDivisiones([M15, SUB14, M21]), 'M15, Sub 14 y M21')
})

// ─── Botón RESERVAR ───────────────────────────────────────────────────────────

caso('opcionesReserva: sin gimnasio ni tenis no hay botón', () => {
  assert.deepEqual(opcionesReserva({ tieneGimnasio: false, tenisActivo: false, esSocio: true }), [])
})

caso('opcionesReserva: sólo gimnasio', () => {
  assert.deepEqual(opcionesReserva({ tieneGimnasio: true, tenisActivo: false, esSocio: true }), ['gimnasio'])
})

caso('opcionesReserva: sólo tenis (socio sin gimnasio, tenis activo)', () => {
  assert.deepEqual(opcionesReserva({ tieneGimnasio: false, tenisActivo: true, esSocio: true }), ['tenis'])
})

caso('opcionesReserva: gimnasio y tenis, en ese orden', () => {
  assert.deepEqual(opcionesReserva({ tieneGimnasio: true, tenisActivo: true, esSocio: true }), ['gimnasio', 'tenis'])
})

caso('opcionesReserva: cliente gimnasio nunca tiene tenis', () => {
  assert.deepEqual(opcionesReserva({ tieneGimnasio: true, tenisActivo: true, esSocio: false }), ['gimnasio'])
  assert.deepEqual(opcionesReserva({ tieneGimnasio: false, tenisActivo: true, esSocio: false }), [])
})

caso('opcionesReserva: con el flag de tenis apagado el socio sólo tiene gimnasio', () => {
  assert.deepEqual(opcionesReserva({ tieneGimnasio: false, tenisActivo: false, esSocio: true }), [])
  assert.deepEqual(opcionesReserva({ tieneGimnasio: true, tenisActivo: false, esSocio: true }), ['gimnasio'])
})

// ─── Mis turnos de tenis en la Agenda ─────────────────────────────────────────

const YO = 's-yo'
function tenis(p: Partial<MiReserva>): MiReserva {
  return {
    id: 'r', cancha: '03', cancha_id: 'c3', origen: 'socio',
    inicio: '2026-10-20T18:00:00-03:00', fin: '2026-10-20T19:00:00-03:00',
    modalidad: 'singles', estado: 'confirmada', es_titular: true, jugadores: [],
    personas: [
      { socio_id: YO, invitado_id: null, nombre: 'Yo Mismo', es_titular: true },
      { socio_id: 's2', invitado_id: null, nombre: 'Gómez Ana', es_titular: false },
    ],
    mi_socio_id: YO, total: 9000, mi_cargo: 0, mi_motivo: null, cancelable_hasta: null, puede_cancelar: true, ...p,
  }
}
const AHORA = Date.parse('2026-10-20T10:00:00-03:00')

caso('tenis en la agenda: sólo reservas vivas que no terminaron, por horario', () => {
  const lista = reservasTenisAgenda([
    tenis({ id: 'tarde', inicio: '2026-10-21T18:00:00-03:00', fin: '2026-10-21T19:00:00-03:00' }),
    tenis({ id: 'hoy' }),
    tenis({ id: 'cancelada', estado: 'cancelada' }),
    tenis({ id: 'jugada', estado: 'jugada' }),
    tenis({ id: 'pasada', inicio: '2026-10-20T08:00:00-03:00', fin: '2026-10-20T09:00:00-03:00' }),
    tenis({ id: 'comprobante', estado: 'pendiente_comprobante', inicio: '2026-10-20T12:00:00-03:00', fin: '2026-10-20T13:00:00-03:00' }),
    tenis({ id: 'lejos', inicio: '2026-10-28T18:00:00-03:00', fin: '2026-10-28T19:00:00-03:00' }),
  ], AHORA)
  assert.deepEqual(lista.map(r => r.id), ['comprobante', 'hoy', 'tarde'])
})

caso('tenis en la agenda: la que está en juego todavía se ve', () => {
  const ahora = Date.parse('2026-10-20T18:30:00-03:00')
  assert.deepEqual(reservasTenisAgenda([tenis({})], ahora).map(r => r.id), ['r'])
})

caso('agenda mezclada: eventos y tenis por día y hora (sin hora al final)', () => {
  const grupos = agruparAgenda(
    [
      ev({ id: 'a', fecha: '2026-10-20', hora: '20:30:00' }),
      ev({ id: 'b', fecha: '2026-10-20', hora: null }),
      ev({ id: 'c', fecha: '2026-10-22', hora: '09:00:00' }),
    ],
    [
      tenis({ id: 't1', inicio: '2026-10-20T18:00:00-03:00' }),
      tenis({ id: 't2', inicio: '2026-10-21T08:00:00-03:00' }),
    ],
  )
  assert.deepEqual(
    grupos.map(g => `${g.fecha}:${g.items.map(i => (i.tipo === 'tenis' ? i.reserva.id : i.evento.id)).join(',')}`),
    ['2026-10-20:t1,a,b', '2026-10-21:t2', '2026-10-22:c'],
  )
})

caso('agenda mezclada: sólo tenis (sin división) igual arma los días', () => {
  assert.deepEqual(agruparAgenda([], [tenis({})]).map(g => g.fecha), ['2026-10-20'])
  assert.deepEqual(agruparAgenda([], []), [])
})

caso('tenis: con quién juego (sin mí), siendo titular o jugador', () => {
  assert.deepEqual(otrosJugadores(tenis({})), ['Gómez Ana'])
  const comoJugador = tenis({
    es_titular: false,
    personas: [
      { socio_id: 's9', invitado_id: null, nombre: 'Titular Otro', es_titular: true },
      { socio_id: YO, invitado_id: null, nombre: 'Yo Mismo', es_titular: false },
      { socio_id: null, invitado_id: 'i1', nombre: 'Ana Paz', es_titular: false },
    ],
  })
  assert.deepEqual(otrosJugadores(comoJugador), ['Titular Otro', 'Ana Paz'])
  // Sin mi_socio_id (servidor viejo): siendo titular, el titular soy yo.
  assert.deepEqual(otrosJugadores(tenis({ mi_socio_id: null })), ['Gómez Ana'])
})

caso('tenis: línea de la card con arranque real (+5 min), cancha y modalidad', () => {
  assert.equal(lineaTenis(tenis({}), 5), 'Tenis · 18:05 · Cancha 03 · Singles')
  assert.equal(lineaTenis(tenis({ modalidad: 'dobles' }), 5), 'Tenis · 18:05 · Cancha 03 · Dobles')
})

caso('agenda vacía: sólo si cargó todo sin errores y no hay nada', () => {
  const base = { agendaCargada: true, errorAgenda: null, errorTenis: null, tenisActivo: true, divisiones: 0, turnosTenis: 0 }
  assert.equal(agendaVacia(base), true)
  // Falló la carga de los turnos de tenis: no se puede afirmar que no hay nada.
  assert.equal(agendaVacia({ ...base, errorTenis: 'No se pudieron cargar tus turnos de tenis.' }), false)
  // Con tenis apagado su error no cuenta (no se pide).
  assert.equal(agendaVacia({ ...base, tenisActivo: false, errorTenis: 'x' }), true)
  assert.equal(agendaVacia({ ...base, errorAgenda: 'x' }), false)
  assert.equal(agendaVacia({ ...base, agendaCargada: false }), false)
  assert.equal(agendaVacia({ ...base, divisiones: 1 }), false)
  assert.equal(agendaVacia({ ...base, turnosTenis: 2 }), false)
})

console.log(`\n${casos} casos OK`)
