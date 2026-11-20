// Verificación autocontenida de tenis.ts (no hay runner de tests en app/).
//   npx tsx app/lib/tenis.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { tenis } from '../constants/theme'
import { CONTRASTE_TEXTO_AA, contraste } from './contraste'
import {
  CONFIG_DEFECTO,
  bloquesPorCancha,
  codigoErrorTenis,
  diasReservables,
  duracionTexto,
  esGestorTenis,
  estiloItem,
  fechaArgentina,
  filasGrilla,
  horaArgentina,
  inicioReal,
  iniciosLibres,
  isoArgentina,
  jugadoresRequeridos,
  mensajeErrorTenis,
  parsearConfig,
  posicionBloque,
  puedeCancelar,
  resumenPrecio,
  validarInvitado,
  verTabAgenda,
  type ItemGrilla,
} from './tenis'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const FECHA = '2026-11-21'
const item = (p: Partial<ItemGrilla>): ItemGrilla => ({
  cancha_id: 'c1', inicio: `${FECHA}T18:00:00-03:00`, fin: `${FECHA}T19:00:00-03:00`,
  tipo: 'socio', titulo: null, recurrente: false, mio: false, ...p,
})

// ─── Tokens de color ──────────────────────────────────────────────────────────

caso('los 7 colores de OnDepor están como tokens', () => {
  assert.equal(tenis.web.fondo, '#10577D')
  assert.equal(tenis.telefonica.fondo, '#4094C4')
  assert.equal(tenis.torneo.fondo, '#F06B3A')
  assert.equal(tenis.clase.fondo, '#499A6B')
  assert.equal(tenis.entrenamiento.fondo, '#F5D580')
  assert.equal(tenis.noDisponible.fondo, '#BABFC2')
  assert.equal(tenis.enSuspenso.fondo, '#ACD2E7')
})

caso('el texto de cada color cumple AA (4.5:1)', () => {
  for (const [nombre, t] of Object.entries(tenis)) {
    const r = contraste(t.fondo, t.texto)
    assert.ok(r >= CONTRASTE_TEXTO_AA, `${nombre}: ${r.toFixed(2)}`)
  }
})

// ─── Config y grilla ──────────────────────────────────────────────────────────

caso('config: completa lo que falta con los valores por defecto', () => {
  const c = parsearConfig({ hora_desde: '09:00:00', precio_socio_single: 9500, basura: 1 })
  assert.equal(c.hora_desde, '09:00')
  assert.equal(c.precio_socio_single, 9500)
  assert.equal(c.hora_hasta, '22:00')
  assert.deepEqual(parsearConfig(null), CONFIG_DEFECTO)
})

caso('filas de 30 minutos de 08:00 a 22:00', () => {
  const filas = filasGrilla(CONFIG_DEFECTO)
  assert.equal(filas.length, 28)
  assert.equal(filas[0], '08:00')
  assert.equal(filas[1], '08:30')
  assert.equal(filas[27], '21:30')
})

caso('hora y fecha en Argentina desde un timestamptz en UTC', () => {
  assert.equal(horaArgentina('2026-11-21T21:00:00+00:00'), '18:00')
  assert.equal(fechaArgentina('2026-11-22T01:30:00Z'), '2026-11-21')
  assert.equal(isoArgentina('2026-11-21', '18:30'), '2026-11-21T18:30:00-03:00')
})

caso('inicio real con 5 minutos de barrido', () => {
  assert.equal(inicioReal(`${FECHA}T18:00:00-03:00`), '18:05')
  assert.equal(inicioReal('21:30', 5), '21:35')
  assert.equal(inicioReal('09:55', 10), '10:05')
})

caso('posición de un bloque en la grilla', () => {
  assert.deepEqual(posicionBloque(item({}), FECHA, CONFIG_DEFECTO), { fila: 20, filas: 2 })
  // Dobles de 1 h 30 a las 08:00.
  assert.deepEqual(
    posicionBloque(item({ inicio: `${FECHA}T08:00:00-03:00`, fin: `${FECHA}T09:30:00-03:00` }), FECHA, CONFIG_DEFECTO),
    { fila: 0, filas: 3 },
  )
  // Se recorta al horario de la grilla.
  assert.deepEqual(
    posicionBloque(item({ inicio: `${FECHA}T07:00:00-03:00`, fin: `${FECHA}T09:00:00-03:00` }), FECHA, CONFIG_DEFECTO),
    { fila: 0, filas: 2 },
  )
  // Otro día o fuera de horario: no se dibuja.
  assert.equal(posicionBloque(item({ inicio: '2026-11-22T18:00:00-03:00', fin: '2026-11-22T19:00:00-03:00' }), FECHA, CONFIG_DEFECTO), null)
  assert.equal(posicionBloque(item({ inicio: `${FECHA}T22:00:00-03:00`, fin: `${FECHA}T23:00:00-03:00` }), FECHA, CONFIG_DEFECTO), null)
})

caso('bloques por cancha: cancha null va a todas', () => {
  const canchas = [{ id: 'c1' }, { id: 'c2' }]
  const r = bloquesPorCancha([item({}), item({ cancha_id: null, tipo: 'no_disponible', titulo: 'Lluvia' })], canchas, FECHA, CONFIG_DEFECTO)
  assert.equal(r.c1.length, 2)
  assert.equal(r.c2.length, 1)
  assert.equal(r.c2[0].titulo, 'Lluvia')
})

caso('horarios libres según la modalidad', () => {
  const ahora = Date.parse(`${FECHA}T07:00:00-03:00`)
  const ocupados = [item({})] // 18:00–19:00
  const singles = iniciosLibres(ocupados, 'c1', FECHA, 'singles', CONFIG_DEFECTO, ahora)
  assert.ok(singles.includes('17:00'))
  assert.ok(!singles.includes('17:30')) // pisaría las 18:00
  assert.ok(!singles.includes('18:00'))
  assert.ok(singles.includes('19:00'))
  assert.equal(singles[singles.length - 1], '21:00') // termina a las 22:00
  const dobles = iniciosLibres(ocupados, 'c1', FECHA, 'dobles', CONFIG_DEFECTO, ahora)
  assert.ok(dobles.includes('16:30'))
  assert.ok(!dobles.includes('17:00'))
  assert.equal(dobles[dobles.length - 1], '20:30')
  // Otra cancha no se ve afectada; un bloque de todas las canchas sí.
  assert.ok(iniciosLibres(ocupados, 'c2', FECHA, 'singles', CONFIG_DEFECTO, ahora).includes('18:00'))
  const todas = [item({ cancha_id: null, tipo: 'clase' })]
  assert.ok(!iniciosLibres(todas, 'c2', FECHA, 'singles', CONFIG_DEFECTO, ahora).includes('18:00'))
  // Lo que ya pasó no se ofrece.
  const tarde = Date.parse(`${FECHA}T20:10:00-03:00`)
  assert.deepEqual(iniciosLibres([], 'c1', FECHA, 'singles', CONFIG_DEFECTO, tarde), ['20:30', '21:00'])
})

// ─── Colores y etiquetas por tipo ─────────────────────────────────────────────

caso('estilo por tipo de ítem', () => {
  assert.equal(estiloItem(item({ tipo: 'socio' })).fondo, tenis.web.fondo)
  assert.equal(estiloItem(item({ tipo: 'socio' })).etiqueta, 'Reserva web')
  const inv = estiloItem(item({ tipo: 'invitado' }))
  assert.equal(inv.fondo, tenis.web.fondo)
  assert.equal(inv.etiqueta, 'Invitado')
  assert.equal(estiloItem(item({ tipo: 'telefonica' })).fondo, tenis.telefonica.fondo)
  assert.equal(estiloItem(item({ tipo: 'torneo' })).fondo, tenis.torneo.fondo)
  assert.equal(estiloItem(item({ tipo: 'clase' })).etiqueta, 'Clase / Escuelita')
  assert.equal(estiloItem(item({ tipo: 'entrenamiento' })).texto, tenis.entrenamiento.texto)
  assert.equal(estiloItem(item({ tipo: 'no_disponible' })).fondo, tenis.noDisponible.fondo)
  assert.equal(estiloItem(item({ tipo: 'en_suspenso' })).fondo, tenis.enSuspenso.fondo)
  // Un tipo que la app no conoce se ve como "No disponible", sin romper.
  assert.equal(estiloItem(item({ tipo: 'algo_nuevo' })).fondo, tenis.noDisponible.fondo)
})

// ─── Reglas de la reserva ─────────────────────────────────────────────────────

caso('jugadores requeridos además del titular', () => {
  assert.equal(jugadoresRequeridos('singles'), 1)
  assert.equal(jugadoresRequeridos('dobles'), 3)
})

caso('duración legible de cada modalidad', () => {
  assert.equal(duracionTexto(60), '1 h')
  assert.equal(duracionTexto(90), '1 h 30')
  assert.equal(duracionTexto(45), '45 min')
})

caso('cancelar sólo hasta 3 h antes', () => {
  const inicio = `${FECHA}T18:00:00-03:00`
  assert.equal(puedeCancelar(inicio, Date.parse(`${FECHA}T14:59:00-03:00`)), true)
  assert.equal(puedeCancelar(inicio, Date.parse(`${FECHA}T15:00:00-03:00`)), true)
  assert.equal(puedeCancelar(inicio, Date.parse(`${FECHA}T15:01:00-03:00`)), false)
  assert.equal(puedeCancelar(inicio, Date.parse(`${FECHA}T10:01:00-03:00`), 8), false)
})

caso('días reservables: hoy + 2 en fecha de Argentina', () => {
  // 23:30 del 20/11 en Argentina = 02:30 UTC del 21/11.
  const dias = diasReservables(Date.parse('2026-11-21T02:30:00Z'))
  assert.deepEqual(dias.map(d => d.fecha), ['2026-11-20', '2026-11-21', '2026-11-22'])
  assert.deepEqual(dias.map(d => d.etiqueta), ['HOY', 'MAÑANA', 'DOM 22/11'])
  assert.equal(diasReservables(Date.parse('2026-11-21T12:00:00Z'), 0).length, 1)
})

caso('invitado: DNI, nombre y apellido obligatorios', () => {
  assert.equal(validarInvitado({ dni: '12.345.678', nombre: 'Ana', apellido: 'Paz' }), null)
  assert.equal(validarInvitado({ dni: '123', nombre: 'Ana', apellido: 'Paz' }), 'Revisá el DNI del invitado.')
  assert.equal(validarInvitado({ dni: '12345678', nombre: ' ', apellido: 'Paz' }), 'Completá nombre y apellido del invitado.')
})

caso('resumen de precio en pesos', () => {
  const r = resumenPrecio({
    jugadores: [
      { nombre: 'Agus', cargo: 0, motivo: 'carnet_gratis' },
      { nombre: 'Juan', cargo: 9000, motivo: 'socio' },
      { nombre: 'Ana Paz', cargo: 16000, motivo: 'no_socio' },
    ],
    total: 25000,
  })
  assert.deepEqual(r.lineas[0], { nombre: 'Agus', monto: 'Sin cargo', detalle: 'Primer turno del día con Carnet Tenis' })
  assert.deepEqual(r.lineas[1], { nombre: 'Juan', monto: '$ 9.000', detalle: 'Socio' })
  assert.equal(r.lineas[2].detalle, 'No socio')
  assert.equal(r.total, '$ 25.000')
})

// ─── Errores ──────────────────────────────────────────────────────────────────

caso('código estable de un error del RPC', () => {
  assert.equal(codigoErrorTenis({ code: 'P0001', message: 'limite_dia' }), 'limite_dia')
  assert.equal(codigoErrorTenis({ code: '42501', message: 'permission denied' }), null)
  assert.equal(codigoErrorTenis(null), null)
})

caso('mensaje en castellano por código', () => {
  assert.equal(mensajeErrorTenis({ code: 'P0001', message: 'limite_dia' }, 'x'), 'Ya tenés una reserva ese día.')
  assert.equal(mensajeErrorTenis({ code: 'P0001', message: 'superpuesta' }, 'x'), 'Ese horario ya está ocupado. Elegí otro.')
  // Código desconocido o error técnico: el por defecto, nunca el texto crudo.
  assert.equal(mensajeErrorTenis({ code: 'P0001', message: 'codigo_raro' }, 'Por defecto'), 'Por defecto')
  assert.equal(mensajeErrorTenis({ code: '42501', message: 'permission denied' }, 'Por defecto'), 'No tenés permiso para hacer esto.')
  assert.equal(mensajeErrorTenis({ message: 'Network request failed' }, 'Por defecto'), 'No hay conexión. Revisá internet y volvé a intentar.')
})

// ─── Visibilidad ──────────────────────────────────────────────────────────────

caso('pestaña Agenda: con tenis encendido la ve todo socio', () => {
  assert.equal(verTabAgenda(false, false), false)
  assert.equal(verTabAgenda(false, true), true)
  assert.equal(verTabAgenda(true, false), true)
})

caso('gestor de tenis: admin o subcomisión con deporte tenis', () => {
  assert.equal(esGestorTenis({ roles: ['admin'], deporte: null }), true)
  assert.equal(esGestorTenis({ roles: ['subcomision'], deporte: 'tenis' }), true)
  assert.equal(esGestorTenis({ roles: ['subcomision'], deporte: 'rugby' }), false)
  assert.equal(esGestorTenis({ roles: ['canchero'], deporte: 'tenis' }), false)
})

console.log(`\n${casos} casos ok`)
