// Verificación autocontenida de tenisGrilla.ts (no hay runner de tests en app/).
//   npx tsx app/lib/tenisGrilla.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { calorTenis } from '../constants/theme'
import { CONTRASTE_TEXTO_AA, contraste } from './contraste'
import { CONFIG_DEFECTO, parsearDisponibilidad, type ItemGrilla } from './tenis'
import {
  COL_MIN_W, HORA_W, anchoColumna, configDelDia, diasVista, esDiaReservable, fechaLarga, lineaAhora,
  nivelCalor, nombresBloque, paginar, parsearSemana, reservasPorCancha, sumarDias, textoDisponibles,
} from './tenisGrilla'

let fallas = 0
function caso(nombre: string, fn: () => void) {
  try { fn(); console.log(`ok   ${nombre}`) } catch (e) { fallas++; console.error(`FAIL ${nombre}\n  ${(e as Error).message}`) }
}

const FECHA = '2026-11-26' // jueves
const item = (p: Partial<ItemGrilla>): ItemGrilla => ({
  cancha_id: 'c1', inicio: `${FECHA}T18:00:00-03:00`, fin: `${FECHA}T19:00:00-03:00`,
  tipo: 'reserva_web', titulo: null, recurrente: false, mio: false, ...p,
})

caso('ancho de columna: 8 canchas entran en 390 px sin scroll', () => {
  const w = anchoColumna(350, 8)
  assert.equal(w, Math.floor((350 - HORA_W) / 8))
  assert.ok(HORA_W + w * 8 <= 350)
  assert.equal(anchoColumna(100, 8), COL_MIN_W)
  assert.equal(anchoColumna(350, 0), 0)
})

caso('horario del día: el payload pisa al de la config; sin él queda la config', () => {
  const c = configDelDia(CONFIG_DEFECTO, { desde: '10:00', hasta: '17:00' })
  assert.equal(c.hora_desde, '10:00')
  assert.equal(c.hora_hasta, '17:00')
  assert.equal(configDelDia(CONFIG_DEFECTO, null).hora_desde, '08:00')
  // Un horario vacío o al revés se ignora.
  assert.equal(configDelDia(CONFIG_DEFECTO, { desde: '18:00', hasta: '09:00' }).hora_desde, '08:00')
})

caso('línea de la hora actual: sólo hoy y dentro del horario', () => {
  const ahora = Date.parse(`${FECHA}T09:15:00-03:00`)
  // 08:00 → 09:15 = 75 min = 2.5 filas de 30 min.
  assert.equal(lineaAhora(FECHA, ahora, CONFIG_DEFECTO, 64), 2.5 * 64)
  assert.equal(lineaAhora('2026-11-27', ahora, CONFIG_DEFECTO, 64), null)
  assert.equal(lineaAhora(FECHA, Date.parse(`${FECHA}T07:00:00-03:00`), CONFIG_DEFECTO, 64), null)
  assert.equal(lineaAhora(FECHA, Date.parse(`${FECHA}T22:30:00-03:00`), CONFIG_DEFECTO, 64), null)
})

caso('ventana de días: hoy + dias_vista − 1, reservables hasta la anticipación', () => {
  const ahora = Date.parse('2026-11-26T02:30:00Z') // 25/11 23:30 en Argentina
  const dias = diasVista(ahora, 7)
  assert.equal(dias.length, 7)
  assert.equal(dias[0], '2026-11-25')
  assert.equal(dias[6], '2026-12-01')
  assert.equal(diasVista(ahora, 0).length, 1)
  assert.equal(esDiaReservable('2026-11-27', ahora, 2), true)
  assert.equal(esDiaReservable('2026-11-28', ahora, 2), false)
  assert.equal(esDiaReservable('2026-11-24', ahora, 2), false)
})

caso('fechas: sumar días y fecha larga en castellano', () => {
  assert.equal(sumarDias('2026-11-30', 1), '2026-12-01')
  assert.equal(sumarDias('2026-01-01', -1), '2025-12-31')
  assert.equal(fechaLarga(FECHA), 'jueves 26 de noviembre')
  assert.equal(fechaLarga('2026-03-01'), 'domingo 1 de marzo')
})

caso('nivel de calor y texto de disponibles', () => {
  assert.equal(nivelCalor(8, 8), 'alto')
  assert.equal(nivelCalor(4, 8), 'alto')
  assert.equal(nivelCalor(3, 8), 'medio')
  assert.equal(nivelCalor(2, 8), 'medio')
  assert.equal(nivelCalor(1, 8), 'bajo')
  assert.equal(nivelCalor(0, 8), 'completo')
  assert.equal(nivelCalor(0, 0), 'completo')
  assert.equal(textoDisponibles(0), 'Completo')
  assert.equal(textoDisponibles(1), '1 disponible')
  assert.equal(textoDisponibles(5), '5 disponibles')
})

caso('colores de calor con texto AA', () => {
  for (const [k, v] of Object.entries(calorTenis)) {
    assert.ok(contraste(v.fondo, v.texto) >= CONTRASTE_TEXTO_AA, `${k}: ${contraste(v.fondo, v.texto).toFixed(2)}`)
  }
})

caso('paginar de a 3', () => {
  assert.deepEqual(paginar([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7]])
  assert.deepEqual(paginar([], 3), [])
})

caso('nombres del bloque: todos los jugadores en mayúsculas; bloques con su título', () => {
  const r = item({ jugadores: [
    { nombre: 'Pérez, Juan' }, { nombre: 'Socio a designar' },
  ].map(j => ({ ...j, id: '', es_titular: false, cargo: 0, motivo: null, cobrado: false, monto_cobrado: null, diferencia: 0, check_in_at: null, socio_id: null, invitado_id: null, numero_socio: null, dni: null })) })
  assert.deepEqual(nombresBloque(r), ['PÉREZ, JUAN', 'SOCIO A DESIGNAR'])
  assert.deepEqual(nombresBloque(item({ tipo: 'entrenamiento', titulo: 'Academia' })), ['ACADEMIA'])
  assert.deepEqual(nombresBloque(item({ tipo: 'no_disponible' })), ['NO DISPONIBLE'])
  assert.deepEqual(nombresBloque(item({ mio: true })), ['TU RESERVA'])
  assert.deepEqual(nombresBloque(item({ tipo: 'reserva_telefonica' })), ['RESERVA TELEFÓNICA'])
})

caso('reservas por cancha: cuenta reservas, no bloques', () => {
  const canchas = [{ id: 'c1' }, { id: 'c2' }]
  const r = reservasPorCancha([
    item({}), item({ inicio: `${FECHA}T20:00:00-03:00`, fin: `${FECHA}T21:00:00-03:00` }),
    item({ cancha_id: 'c2', tipo: 'reserva_telefonica' }),
    item({ cancha_id: null, tipo: 'no_disponible' }), item({ cancha_id: 'c2', tipo: 'clase' }),
  ], canchas)
  assert.deepEqual(r.porCancha, { c1: 2, c2: 1 })
  assert.equal(r.total, 3)
})

caso('disponibilidad: horario y reservable del payload', () => {
  const d = parsearDisponibilidad({ horario: { desde: '09:00:00', hasta: '22:00:00' }, reservable: false, config: { dias_vista: 14 } })
  assert.deepEqual(d.horario, { desde: '09:00', hasta: '22:00' })
  assert.equal(d.reservable, false)
  assert.equal(d.config.dias_vista, 14)
  const v = parsearDisponibilidad(null)
  assert.equal(v.horario, null)
  assert.equal(v.reservable, true)
  assert.equal(v.config.dias_vista, 7)
})

caso('semana: parseo tolerante de tenis_disponibilidad_semana', () => {
  const s = parsearSemana([
    { fecha: FECHA, reservable: true, slots: [{ hora: '08:00:00', libres: 8, total: 8 }, { hora: 'x' }, 'y'] },
    { fecha: 'mal' }, null,
    { fecha: '2026-11-27', slots: [{ hora: '10:00', libres: '3', total: 8 }] },
  ])
  assert.equal(s.length, 2)
  assert.deepEqual(s[0].slots, [{ hora: '08:00', libres: 8, total: 8 }])
  assert.equal(s[1].reservable, false)
  assert.equal(s[1].slots[0].libres, 3)
  assert.deepEqual(parsearSemana(null), [])
})

if (fallas > 0) { console.error(`\n${fallas} caso(s) fallaron`); process.exit(1) }
console.log('\ntenisGrilla: todo ok')
