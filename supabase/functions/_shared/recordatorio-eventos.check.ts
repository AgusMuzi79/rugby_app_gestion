// Verificación autocontenida de recordatorio-eventos.ts (push 30 minutos antes de
// entrenamientos y actividades); no hay runner de tests en el repo ni Deno local.
// Desde la raíz del repo:
//   npx --yes tsx supabase/functions/_shared/recordatorio-eventos.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  type EventoReclamado,
  agruparPorSesion,
  mensajesRecordatorios,
  parsearReclamados,
  planificarRecordatorios,
  tituloRecordatorio,
  unirConY,
} from './recordatorio-eventos.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

function evento(parcial: Partial<EventoReclamado> = {}): EventoReclamado {
  return {
    evento_id: 'ev-1',
    tipo: 'entrenamiento',
    titulo: null,
    fecha: '2026-11-02',
    hora: '20:30:00',
    lugar: null,
    division_id: 'div-1',
    division_nombre: 'M15',
    socio_ids: [],
    entrenador_profile_ids: [],
    ...parcial,
  }
}

// Gimnasio 20:30 cargado una vez por división del plantel superior.
const DIVS = ['Mayores', 'M22', 'M19', 'M21', 'M20']
const gimnasio = DIVS.map((nombre, i) => evento({
  evento_id: `gym-${nombre}`,
  lugar: 'Gimnasio',
  division_id: `div-${nombre}`,
  division_nombre: nombre,
  socio_ids: [`socio-${nombre}`],
  entrenador_profile_ids: i < 5 ? ['prof-entrenador'] : [],
}))
// socio -> profiles que reciben por él (su profile + tutores).
const porSocio = new Map<string, string[]>(DIVS.map((n) => [`socio-${n}`, [`prof-${n}`]]))

// ─── Textos ───────────────────────────────────────────────────────────────────

caso('unirConY: "A", "A y B", "A, B y C"', () => {
  assert.equal(unirConY(['A']), 'A')
  assert.equal(unirConY(['A', 'B']), 'A y B')
  assert.equal(unirConY(['A', 'B', 'C']), 'A, B y C')
})

caso('título: entrenamiento, con y sin lugar', () => {
  assert.equal(tituloRecordatorio(evento()), 'Entrenamiento')
  assert.equal(tituloRecordatorio(evento({ lugar: 'Gimnasio' })), 'Entrenamiento — Gimnasio')
  assert.equal(tituloRecordatorio(evento({ lugar: '   ' })), 'Entrenamiento')
})

caso('título: actividad usa su título (y el lugar si hay); sin título → "Actividad"', () => {
  assert.equal(tituloRecordatorio(evento({ tipo: 'actividad', titulo: 'Charla de nutrición' })), 'Charla de nutrición')
  assert.equal(tituloRecordatorio(evento({ tipo: 'actividad', titulo: 'Testeo', lugar: 'Cancha 2' })), 'Testeo — Cancha 2')
  assert.equal(tituloRecordatorio(evento({ tipo: 'actividad', titulo: '  ' })), 'Actividad')
})

// ─── Agrupado y deduplicado ───────────────────────────────────────────────────

caso('la misma sesión en 5 divisiones es un solo grupo', () => {
  assert.equal(agruparPorSesion(gimnasio).length, 1)
})

caso('dos sesiones a la misma hora con distinto título o lugar no se juntan', () => {
  const grupos = agruparPorSesion([
    evento({ evento_id: 'a', lugar: 'Gimnasio' }),
    evento({ evento_id: 'b', lugar: 'Cancha 1' }),
    evento({ evento_id: 'c', tipo: 'actividad', titulo: 'Charla' }),
    evento({ evento_id: 'd', tipo: 'actividad', titulo: 'Testeo' }),
  ])
  assert.equal(grupos.length, 4)
  const plan = planificarRecordatorios(
    [evento({ evento_id: 'a', lugar: 'Gimnasio', entrenador_profile_ids: ['p'] }),
     evento({ evento_id: 'b', lugar: 'Cancha 1', entrenador_profile_ids: ['p'] })],
    new Map(),
  )
  assert.equal(plan.length, 2)
})

caso('entrenador de las 5 divisiones: 1 push que lista las 5', () => {
  const plan = planificarRecordatorios(gimnasio, porSocio)
  const delEntrenador = plan.filter((r) => r.profileId === 'prof-entrenador')
  assert.equal(delEntrenador.length, 1)
  assert.equal(delEntrenador[0].title, 'Entrenamiento — Gimnasio')
  assert.equal(delEntrenador[0].body, 'Arranca a las 20:30 (M19, M20, M21, M22 y Mayores)')
})

caso('jugador: 1 push con sólo su división', () => {
  const plan = planificarRecordatorios(gimnasio, porSocio)
  const delJugador = plan.filter((r) => r.profileId === 'prof-M21')
  assert.equal(delJugador.length, 1)
  assert.equal(delJugador[0].body, 'Arranca a las 20:30 (M21)')
  assert.equal(delJugador[0].eventoId, 'gym-M21')
  assert.equal(delJugador[0].divisionId, 'div-M21')
  // 5 jugadores + 1 entrenador.
  assert.equal(plan.length, 6)
})

caso('profile que es jugador y entrenador: 1 push con todas sus divisiones', () => {
  const eventos = [
    evento({ evento_id: 'x1', division_id: 'd1', division_nombre: 'M19', socio_ids: ['s-ambos'] }),
    evento({ evento_id: 'x2', division_id: 'd2', division_nombre: 'M20', entrenador_profile_ids: ['prof-ambos'] }),
    evento({ evento_id: 'x3', division_id: 'd3', division_nombre: 'M21', entrenador_profile_ids: ['prof-ambos'] }),
  ]
  const plan = planificarRecordatorios(eventos, new Map([['s-ambos', ['prof-ambos']]]))
  assert.equal(plan.length, 1)
  assert.equal(plan[0].body, 'Arranca a las 20:30 (M19, M20 y M21)')
})

caso('tutor de dos hermanos en divisiones distintas de la misma sesión: 1 push', () => {
  const eventos = [
    evento({ evento_id: 'h1', division_id: 'd1', division_nombre: 'M9', socio_ids: ['hijo-1'] }),
    evento({ evento_id: 'h2', division_id: 'd2', division_nombre: 'M11', socio_ids: ['hijo-2'] }),
  ]
  const plan = planificarRecordatorios(eventos, new Map([
    ['hijo-1', ['prof-hijo-1', 'prof-tutor']],
    ['hijo-2', ['prof-tutor']],
  ]))
  const delTutor = plan.filter((r) => r.profileId === 'prof-tutor')
  assert.equal(delTutor.length, 1)
  assert.equal(delTutor[0].body, 'Arranca a las 20:30 (M9 y M11)')
  assert.equal(plan.length, 2)
})

caso('socio sin profile (no está en el mapa) no genera push', () => {
  const plan = planificarRecordatorios([evento({ socio_ids: ['sin-cuenta'] })], new Map())
  assert.equal(plan.length, 0)
})

// ─── Mensajes ─────────────────────────────────────────────────────────────────

caso('mensajes: uno por token distinto, clave por destinatario y sesión, data con ids', () => {
  const plan = planificarRecordatorios([evento({ lugar: 'Gimnasio', entrenador_profile_ids: ['p1', 'p2'] })], new Map())
  const items = mensajesRecordatorios(plan, new Map([
    ['p1', ['ExponentPushToken[a]', 'ExponentPushToken[a]', 'ExponentPushToken[b]']],
    ['p2', []],
  ]))
  assert.equal(items.length, 2)
  assert.equal(items[0].clave, items[1].clave)
  assert.deepEqual(items[0].msg, {
    to: 'ExponentPushToken[a]',
    title: 'Entrenamiento — Gimnasio',
    body: 'Arranca a las 20:30 (M15)',
    data: { type: 'recordatorio_evento', eventoId: 'ev-1', divisionId: 'div-1' },
    sound: 'default',
  })
})

caso('mensajes: el mismo token en dos profiles se manda una sola vez por sesión', () => {
  const plan = planificarRecordatorios([evento({ entrenador_profile_ids: ['p1', 'p2'] })], new Map())
  const items = mensajesRecordatorios(plan, new Map([['p1', ['ExponentPushToken[a]']], ['p2', ['ExponentPushToken[a]']]]))
  assert.equal(items.length, 1)
})

// ─── Respuesta del RPC ────────────────────────────────────────────────────────

caso('parsear: respuesta del RPC', () => {
  const r = parsearReclamados([{
    evento_id: 'ev-1', tipo: 'actividad', titulo: 'Charla', fecha: '2026-11-02', hora: '20:35:00',
    lugar: null, division_id: 'div-1', division_nombre: 'M15', socio_ids: ['s-1', 's-2'],
    entrenador_profile_ids: ['p-1'],
  }])
  assert.equal(r.length, 1)
  assert.equal(r[0].titulo, 'Charla')
  assert.deepEqual(r[0].socio_ids, ['s-1', 's-2'])
  assert.deepEqual(r[0].entrenador_profile_ids, ['p-1'])
})

caso('parsear: null o vacío → lista vacía; listas ausentes → vacías; formato inválido → error', () => {
  assert.deepEqual(parsearReclamados(null), [])
  assert.deepEqual(parsearReclamados([]), [])
  const r = parsearReclamados([{ evento_id: 'e', tipo: 'entrenamiento', fecha: '2026-11-02', hora: '20:00:00', division_id: 'd', division_nombre: 'M15' }])
  assert.deepEqual(r[0].socio_ids, [])
  assert.deepEqual(r[0].entrenador_profile_ids, [])
  assert.throws(() => parsearReclamados({ no: 'array' }))
  assert.throws(() => parsearReclamados([{ tipo: 'entrenamiento' }]))
})

console.log(`\n${casos} casos OK`)
