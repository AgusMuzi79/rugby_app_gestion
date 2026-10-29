// Verificación autocontenida de copiaDelDia.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/copiaDelDia.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  actualizarCopiaDia,
  armarJugadores,
  claveDia,
  leerCopiaDia,
  marcasParaGuardar,
  payloadCola,
  resolverEntrenamientos,
  resolverMarcas,
  serializarCopiaDia,
  type CopiaDia,
} from './copiaDelDia'
import { jugadoresQueLleganAlTope } from './ausenciasConsecutivas'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HOY = '2026-10-29'
const AYER = '2026-10-28'
const RED = new TypeError('Network request failed')
const RLS = { message: 'permission denied for table eventos', code: '42501' }
const PLANTEL = [{ id: 'j1', nombre_completo: 'Ana' }, { id: 'j2', nombre_completo: 'Beto' }]
const TURNOS = [{ id: 'ev-am', hora: '09:00:00' }, { id: 'ev-pm', hora: '20:30:00' }]
const A_LAS_20 = 20 * 60

// Copia que dejó la última lectura buena de hoy: los dos turnos y las marcas
// ya guardadas del de la noche (j1 ausente).
const COPIA: CopiaDia = {
  fecha: HOY,
  guardadoEn: 1000,
  entrenamientos: TURNOS,
  marcas: { 'ev-pm': { j1: 'ausente', j2: 'presente' } },
}

caso('clave por división, separada de la del plantel', () => {
  assert.equal(claveDia('div-1'), 'plantel:dia:div-1')
})

caso('entrenamientos: lectura OK → los de la base y el turno más cercano', () => {
  const r = resolverEntrenamientos({ error: null, remoto: TURNOS, copia: null, fecha: HOY, pedidoId: null, ahoraMin: A_LAS_20 })
  assert.deepEqual(r, { tipo: 'remoto', lista: TURNOS, eventoId: 'ev-pm' })
})

caso('(c) sin señal: los turnos y el elegido salen de la copia de hoy (antes: ninguno → la sync usaba el primero del día)', () => {
  const r = resolverEntrenamientos({ error: RED, remoto: null, copia: COPIA, fecha: HOY, pedidoId: null, ahoraMin: A_LAS_20 })
  assert.deepEqual(r, { tipo: 'guardado', lista: TURNOS, eventoId: 'ev-pm', guardadoEn: 1000 })
})

caso('sin señal: el pedido del Inicio también vale sobre la copia', () => {
  const r = resolverEntrenamientos({ error: RED, remoto: null, copia: COPIA, fecha: HOY, pedidoId: 'ev-am', ahoraMin: A_LAS_20 })
  assert.equal(r.tipo === 'guardado' && r.eventoId, 'ev-am')
})

caso('una copia de otro día no sirve para turnos (sólo el plantel)', () => {
  const vieja = { ...COPIA, fecha: AYER }
  const r = resolverEntrenamientos({ error: RED, remoto: null, copia: vieja, fecha: HOY, pedidoId: null, ahoraMin: A_LAS_20 })
  assert.deepEqual(r, { tipo: 'sinDatos', lista: [], eventoId: null })
})

caso('entrenamientos: error que no es de red → REINTENTAR, sin copia', () => {
  const r = resolverEntrenamientos({ error: RLS, remoto: null, copia: COPIA, fecha: HOY, pedidoId: null, ahoraMin: A_LAS_20 })
  assert.deepEqual(r, { tipo: 'error', error: RLS })
})

caso('marcas: lectura OK → las de la base', () => {
  const r = resolverMarcas({ eventoId: 'ev-pm', error: null, remoto: { j2: 'justificado' }, copia: COPIA, fecha: HOY })
  assert.deepEqual(r, { tipo: 'ok', marcas: { j2: 'justificado' }, deCopia: false })
})

caso('marcas: sin entrenamiento elegido → ninguna', () => {
  const r = resolverMarcas({ eventoId: null, error: null, remoto: null, copia: COPIA, fecha: HOY })
  assert.deepEqual(r, { tipo: 'ok', marcas: {}, deCopia: false })
})

caso('(a) sin señal: las marcas ya guardadas hoy salen de la copia', () => {
  const r = resolverMarcas({ eventoId: 'ev-pm', error: RED, remoto: null, copia: COPIA, fecha: HOY })
  assert.deepEqual(r, { tipo: 'ok', marcas: { j1: 'ausente', j2: 'presente' }, deCopia: true })
})

caso('marcas: sin señal y sin copia de ese turno → desconocidas', () => {
  assert.deepEqual(resolverMarcas({ eventoId: 'ev-am', error: RED, remoto: null, copia: COPIA, fecha: HOY }), { tipo: 'desconocidas' })
  const vieja = { ...COPIA, fecha: AYER }
  assert.deepEqual(resolverMarcas({ eventoId: 'ev-pm', error: RED, remoto: null, copia: vieja, fecha: HOY }), { tipo: 'desconocidas' })
})

caso('marcas: error que no es de red → error', () => {
  assert.deepEqual(resolverMarcas({ eventoId: 'ev-pm', error: RLS, remoto: null, copia: COPIA, fecha: HOY }), { tipo: 'error', error: RLS })
})

caso('(a) la lista muestra lo guardado como guardado (sin "sin guardar")', () => {
  const lista = armarJugadores(PLANTEL, { j1: 'ausente' })
  assert.deepEqual(lista, [
    { id: 'j1', nombre_completo: 'Ana', estado: 'ausente', estadoGuardado: 'ausente' },
    { id: 'j2', nombre_completo: 'Beto', estado: null, estadoGuardado: null },
  ])
})

caso('(b)+(c) el ítem encolado lleva el turno elegido y lo que ya había guardado', () => {
  const marcas = resolverMarcas({ eventoId: 'ev-pm', error: RED, remoto: null, copia: COPIA, fecha: HOY })
  assert.equal(marcas.tipo, 'ok')
  const jugadores = armarJugadores(PLANTEL, marcas.tipo === 'ok' ? marcas.marcas : {})
  // El entrenador sólo cambia a Beto.
  const editados = jugadores.map(j => (j.id === 'j2' ? { ...j, estado: 'ausente' } : j))
  const p = payloadCola({ eventoId: 'ev-pm', divisionId: 'div-1', fecha: HOY, registradoPor: 'u1', marcas: marcasParaGuardar(editados) })
  assert.deepEqual(p, {
    evento_id: 'ev-pm',
    entrenamiento: true,
    division_id: 'div-1',
    fecha: HOY,
    registrado_por: 'u1',
    jugadores: [
      { jugador_id: 'j1', estado: 'ausente', estado_previo: 'ausente' },
      { jugador_id: 'j2', estado: 'ausente', estado_previo: 'presente' },
    ],
  })
})

caso('(b) con el estado previo real la alerta de 4 faltas no sale dos veces', () => {
  // j1 ya tenía su 4ª falta guardada en ev-pm (y el push ya salió).
  const eventos = ['ev-pm', 'e3', 'e2', 'e1']
  const filas = eventos.map(ev => ({ jugador_id: 'j1', evento_id: ev, estado: 'ausente' }))
  const conCopia = marcasParaGuardar(armarJugadores([PLANTEL[0]], { j1: 'ausente' }))
  assert.deepEqual(jugadoresQueLleganAlTope(eventos, filas, 'ev-pm', conCopia), [])
  // Antes (estado_previo null) la sync creía que la 4ª era nueva y avisaba otra vez.
  const sinCopia = marcasParaGuardar(armarJugadores([PLANTEL[0]], {}).map(j => ({ ...j, estado: 'ausente' as const })))
  assert.deepEqual(jugadoresQueLleganAlTope(eventos, filas, 'ev-pm', sinCopia), ['j1'])
})

caso('sin turno elegido el ítem va por fecha (la sync usa el primero del día o lo crea)', () => {
  const p = payloadCola({ eventoId: null, divisionId: 'div-1', fecha: HOY, registradoPor: 'u1', marcas: [] })
  assert.deepEqual(p, { division_id: 'div-1', fecha: HOY, registrado_por: 'u1', jugadores: [] })
})

caso('actualizar la copia: turnos nuevos podan marcas de turnos que ya no están', () => {
  const c = actualizarCopiaDia(COPIA, { fecha: HOY, ahora: 2000, entrenamientos: [TURNOS[0]] })
  assert.deepEqual(c, { fecha: HOY, guardadoEn: 2000, entrenamientos: [TURNOS[0]], marcas: {} })
})

caso('actualizar la copia: marcas leídas reemplazan, las guardadas se suman', () => {
  const leidas = actualizarCopiaDia(COPIA, { fecha: HOY, ahora: 2000, eventoId: 'ev-pm', marcas: { j2: 'ausente' } })
  assert.deepEqual(leidas.marcas['ev-pm'], { j2: 'ausente' })
  const guardadas = actualizarCopiaDia(COPIA, { fecha: HOY, ahora: 2000, eventoId: 'ev-pm', marcas: { j2: 'ausente' }, mezclar: true })
  assert.deepEqual(guardadas.marcas['ev-pm'], { j1: 'ausente', j2: 'ausente' })
})

caso('actualizar la copia: un entrenamiento creado al guardar se agrega a la lista', () => {
  const c = actualizarCopiaDia(null, { fecha: HOY, ahora: 5, eventoId: 'ev-nuevo', marcas: { j1: 'presente' }, mezclar: true })
  assert.deepEqual(c, { fecha: HOY, guardadoEn: 5, entrenamientos: [{ id: 'ev-nuevo', hora: null }], marcas: { 'ev-nuevo': { j1: 'presente' } } })
})

caso('actualizar la copia: una de otro día se descarta entera', () => {
  const c = actualizarCopiaDia({ ...COPIA, fecha: AYER }, { fecha: HOY, ahora: 7, eventoId: 'ev-x', marcas: { j1: 'presente' } })
  assert.deepEqual(c, { fecha: HOY, guardadoEn: 7, entrenamientos: [{ id: 'ev-x', hora: null }], marcas: { 'ev-x': { j1: 'presente' } } })
})

caso('ida y vuelta por AsyncStorage; basura → null', () => {
  assert.deepEqual(leerCopiaDia(serializarCopiaDia(COPIA)), COPIA)
  assert.equal(leerCopiaDia(null), null)
  assert.equal(leerCopiaDia('{no es json'), null)
  assert.equal(leerCopiaDia(JSON.stringify({ fecha: HOY, guardadoEn: 1, entrenamientos: 'x', marcas: {} })), null)
  assert.equal(leerCopiaDia(JSON.stringify({ fecha: 3, guardadoEn: 1, entrenamientos: [], marcas: {} })), null)
})

console.log(`\n${casos} casos ok`)
