// Verificación autocontenida de accesosFiltro.ts (no hay runner de tests en el repo).
//   npx tsx web/lib/accesosFiltro.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  type Acceso,
  FILTROS_VACIOS,
  MAX_DIAS_RANGO,
  accesosACsv,
  crearSecuenciador,
  filtrarAccesos,
  respuestaCubreRango,
  validarRango,
} from './accesosFiltro'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

function acceso(parcial: Partial<Acceso>): Acceso {
  return {
    creado_en: '2026-10-08T13:30:00Z', // 10:30 en Argentina
    punto: 'gimnasio',
    semaforo: 'verde',
    sin_servicio: false,
    sin_reserva: false,
    es_invitado: false,
    invitado_dni: null,
    veces_invitado: null,
    numero_socio: '100',
    nombre: 'Ana Pérez',
    ...parcial,
  }
}

const ana      = acceso({})
const beto     = acceso({ numero_socio: '200', nombre: 'Beto Gómez', semaforo: 'rojo', sin_servicio: true })
const carla    = acceso({ numero_socio: '300', nombre: 'Carla Ruiz', semaforo: 'amarillo', sin_reserva: true })
const invitado = acceso({ numero_socio: '—', nombre: 'Diego Invitado', semaforo: null, es_invitado: true, invitado_dni: '30111222', veces_invitado: 4 })
const todos = [ana, beto, carla, invitado]

const nombres = (lista: Acceso[]) => lista.map(a => a.nombre)

// ─── Filtros ──────────────────────────────────────────────────────────────────

caso('sin filtros devuelve todo', () => {
  assert.deepEqual(filtrarAccesos(todos, FILTROS_VACIOS), todos)
})
caso('búsqueda por nombre ignora tildes y mayúsculas', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, busqueda: 'PEREZ' })), ['Ana Pérez'])
})
caso('búsqueda por número de socio', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, busqueda: '200' })), ['Beto Gómez'])
})
caso('búsqueda por DNI del invitado', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, busqueda: '30111' })), ['Diego Invitado'])
})
caso('estado de cuota', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, estado: 'rojo' })), ['Beto Gómez'])
})
caso('tipo socios excluye invitados', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, tipo: 'socios' })), ['Ana Pérez', 'Beto Gómez', 'Carla Ruiz'])
})
caso('tipo invitados', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, tipo: 'invitados' })), ['Diego Invitado'])
})
caso('sólo sin servicio', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, soloSinServicio: true })), ['Beto Gómez'])
})
caso('sólo sin reserva', () => {
  assert.deepEqual(nombres(filtrarAccesos(todos, { ...FILTROS_VACIOS, soloSinReserva: true })), ['Carla Ruiz'])
})
caso('los filtros se combinan (AND)', () => {
  assert.deepEqual(filtrarAccesos(todos, { ...FILTROS_VACIOS, estado: 'rojo', soloSinReserva: true }), [])
})

// ─── Rango ────────────────────────────────────────────────────────────────────

caso('rango de un día es válido', () => {
  assert.equal(validarRango('2026-10-08', '2026-10-08'), null)
})
caso('desde posterior a hasta es inválido', () => {
  assert.match(validarRango('2026-10-09', '2026-10-08') ?? '', /posterior/)
})
caso(`rango de ${MAX_DIAS_RANGO} días es válido, uno más no`, () => {
  assert.equal(validarRango('2026-01-01', '2026-04-02'), null) // 92 días
  assert.match(validarRango('2026-01-01', '2026-04-03') ?? '', /92/)
})
caso('fechas imposibles son inválidas', () => {
  assert.notEqual(validarRango('2026-13-01', '2026-13-02'), null)
  assert.notEqual(validarRango('2026-02-30', '2026-03-01'), null)
})
caso('fecha mal formada es inválida', () => {
  assert.notEqual(validarRango('', '2026-10-08'), null)
})

// ─── Respuesta del servidor ───────────────────────────────────────────────────

caso('la respuesta cubre el rango si devuelve el mismo desde/hasta', () => {
  assert.equal(respuestaCubreRango({ desde: '2026-10-01', hasta: '2026-10-08', accesos: [] }, '2026-10-01', '2026-10-08'), true)
})
caso('una Edge Function vieja (sólo `fecha`) no cubre el rango', () => {
  assert.equal(respuestaCubreRango({ fecha: '2026-10-08', accesos: [] }, '2026-10-01', '2026-10-08'), false)
})
caso('un rango distinto al pedido no lo cubre', () => {
  assert.equal(respuestaCubreRango({ desde: '2026-10-08', hasta: '2026-10-08' }, '2026-10-01', '2026-10-08'), false)
})

// ─── Pedidos fuera de orden ───────────────────────────────────────────────────

caso('sólo el último pedido es vigente', () => {
  const secuencia = crearSecuenciador()
  const primero = secuencia.nuevo()
  assert.equal(primero(), true)
  const segundo = secuencia.nuevo()
  assert.equal(primero(), false, 'una respuesta del rango anterior se descarta')
  assert.equal(segundo(), true)
})
caso('cada secuenciador es independiente', () => {
  const a = crearSecuenciador()
  const b = crearSecuenciador()
  const pedidoA = a.nuevo()
  b.nuevo()
  assert.equal(pedidoA(), true)
})

// ─── CSV ──────────────────────────────────────────────────────────────────────

caso('CSV con columna Fecha en horario de Argentina y ";" como delimitador', () => {
  const csv = accesosACsv([acceso({ creado_en: '2026-10-09T01:15:00Z' })]) // 08/10 22:15 en AR
  const [encabezado, fila] = csv.replace(/^﻿/, '').split('\r\n')
  assert.ok(encabezado.startsWith('Fecha;Hora;Nº Socio;Nombre'))
  assert.ok(fila.startsWith('08/10/2026;22:15;100;Ana Pérez;Verde'), fila)
})
caso('CSV escapa valores con ";" o comillas', () => {
  const csv = accesosACsv([acceso({ nombre: 'Pérez; "Ana"' })])
  assert.ok(csv.includes('"Pérez; ""Ana"""'))
})
caso('CSV arranca con BOM para que Excel lea UTF-8', () => {
  assert.ok(accesosACsv([]).startsWith('﻿'))
})

console.log(`\n${casos} casos ok`)
