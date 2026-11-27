// Verificación autocontenida de tenis.ts (no hay runner de tests en app/).
//   npx tsx app/lib/tenis.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { tenis } from '../constants/theme'
import { CONTRASTE_TEXTO_AA, contraste } from './contraste'
import {
  AVISO_SANCIONES,
  CODIGOS_TENIS,
  CONFIG_DEFECTO,
  bloquesPorCancha,
  codigoErrorTenis,
  entradaJugadorExistente,
  esBloque,
  parsearAjustesCobro,
  parsearCheckin,
  textoDiferenciaCobro,
  parsearComprobantes,
  parsearItem,
  parsearMisReservas,
  diaSemanaIso,
  diasReservables,
  duracionTexto,
  esGestorTenis,
  esFechaValida,
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
  parsearDisponibilidad,
  parsearResultadoReserva,
  parsearSanciones,
  pasaOptimizador,
  posicionBloque,
  puedeCancelar,
  puedeEditar,
  jugadoresParaEditar,
  itemsSinReserva,
  resumenPrecio,
  validarInvitado,
  validarRangoHorario,
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
  tipo: 'reserva_web', titulo: null, recurrente: false, mio: false, ...p,
})

// ─── Tokens de color ──────────────────────────────────────────────────────────

caso('los 7 colores de la grilla están como tokens', () => {
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

caso('config: el optimizador es una regla fija, sin banderas en la config', () => {
  assert.equal('optimizador_activo' in CONFIG_DEFECTO, false)
  assert.equal('optimizador_libre_mismo_dia' in CONFIG_DEFECTO, false)
  const c = parsearConfig({ optimizador_activo: false, optimizador_libre_mismo_dia: false })
  assert.equal('optimizador_activo' in c, false)
  assert.equal('optimizador_libre_mismo_dia' in c, false)
})

// Optimizador (F9): entre la reserva nueva y lo ocupado de al lado (o la
// apertura / el cierre) no puede quedar un hueco de 1 a singles_min - 1 minutos.
caso('optimizador: hueco 0 o de al menos singles_min con lo de al lado', () => {
  const ayer = Date.parse('2026-11-20T12:00:00-03:00') // FECHA es otro día
  const at = (h: string) => Date.parse(`${FECHA}T${h}:00-03:00`)
  const ocupados = [item({})] // 18:00–19:00 en c1
  const pasa = (ini: string, fin: string, cfg = CONFIG_DEFECTO, ahora = ayer, items = ocupados) =>
    pasaOptimizador(items, 'c1', at(ini), at(fin), cfg, ahora)
  assert.equal(pasa('17:00', '18:00'), true)  // pegada a la siguiente
  assert.equal(pasa('19:00', '20:00'), true)  // pegada a la anterior
  assert.equal(pasa('16:30', '17:30'), false) // deja 30 min antes de las 18:00
  assert.equal(pasa('19:30', '20:30'), false) // deja 30 min después de las 19:00
  assert.equal(pasa('16:00', '17:00'), true)  // deja 1 h: se puede usar
  assert.equal(pasa('20:00', '21:00'), true)
  // Apertura y cierre cuentan como ocupados.
  assert.equal(pasa('08:00', '09:00', CONFIG_DEFECTO, ayer, []), true)
  assert.equal(pasa('08:30', '09:30', CONFIG_DEFECTO, ayer, []), false)
  assert.equal(pasa('21:00', '22:00', CONFIG_DEFECTO, ayer, []), true)
  assert.equal(pasa('20:30', '21:30', CONFIG_DEFECTO, ayer, []), false)
  // Dobles 90 min entre 19:00 y 22:00 deja 1 h 30 al final o pega.
  assert.equal(pasa('19:00', '20:30'), true)
  assert.equal(pasa('20:30', '22:00'), true)
  // Otra cancha no cuenta; un bloque de todas las canchas sí.
  assert.equal(pasaOptimizador(ocupados, 'c2', at('16:30'), at('17:30'), CONFIG_DEFECTO, ayer), true)
  const todas = [item({ cancha_id: null, tipo: 'clase' })]
  assert.equal(pasaOptimizador(todas, 'c2', at('16:30'), at('17:30'), CONFIG_DEFECTO, ayer), false)
  // Un hueco más largo que singles_min también vale (90 min).
  assert.equal(pasa('15:30', '16:30'), true)
})

caso('optimizador: el mismo día (Argentina) no filtra, siempre', () => {
  const at = (h: string) => Date.parse(`${FECHA}T${h}:00-03:00`)
  const ocupados = [item({})]
  const mismoDia = at('07:00')
  assert.equal(pasaOptimizador(ocupados, 'c1', at('16:30'), at('17:30'), CONFIG_DEFECTO, mismoDia), true)
  // Hoy en Argentina aunque en UTC ya sea mañana (23:30 del día anterior → otro día).
  const nocheAnterior = Date.parse('2026-11-21T02:30:00Z') // 20/11 23:30 en Argentina
  assert.equal(pasaOptimizador(ocupados, 'c1', at('16:30'), at('17:30'), CONFIG_DEFECTO, nocheAnterior), false)
  // Ninguna config lo apaga.
  const conBanderas = { ...CONFIG_DEFECTO, optimizador_activo: false } as typeof CONFIG_DEFECTO
  assert.equal(pasaOptimizador(ocupados, 'c1', at('16:30'), at('17:30'), conBanderas, nocheAnterior), false)
})

caso('horarios libres: el socio sólo ve los que pasan el optimizador, el staff todos', () => {
  const ayer = Date.parse('2026-11-20T12:00:00-03:00')
  const ocupados = [item({})] // 18:00–19:00
  const socio = iniciosLibres(ocupados, 'c1', FECHA, 'singles', CONFIG_DEFECTO, ayer, { optimizador: true })
  assert.deepEqual(socio, ['08:00', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00',
    '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '17:00', '19:00', '20:00', '21:00'])
  const staff = iniciosLibres(ocupados, 'c1', FECHA, 'singles', CONFIG_DEFECTO, ayer)
  assert.ok(staff.includes('16:30'))
  assert.ok(staff.includes('08:30'))
  // El mismo día el socio ve todo lo libre.
  const hoy = Date.parse(`${FECHA}T07:00:00-03:00`)
  assert.deepEqual(iniciosLibres(ocupados, 'c1', FECHA, 'singles', CONFIG_DEFECTO, hoy, { optimizador: true }), staff)
})

// ─── Colores y etiquetas por tipo ─────────────────────────────────────────────

caso('estilo por tipo de ítem (tipos de tenis_disponibilidad / tenis_grilla)', () => {
  assert.equal(estiloItem(item({ tipo: 'reserva_web' })).fondo, tenis.web.fondo)
  assert.equal(estiloItem(item({ tipo: 'reserva_web' })).etiqueta, 'Reserva web')
  const inv = estiloItem(item({ tipo: 'reserva_invitado' }))
  assert.equal(inv.fondo, tenis.web.fondo)
  assert.equal(inv.etiqueta, 'Invitado')
  assert.equal(estiloItem(item({ tipo: 'extension' })).etiqueta, 'Extensión')
  assert.equal(estiloItem(item({ tipo: 'reserva_telefonica' })).fondo, tenis.telefonica.fondo)
  assert.equal(esBloque(item({ tipo: 'reserva_web' })), false)
  assert.equal(esBloque(item({ tipo: 'clase' })), true)
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

caso('bloques: día ISO, fechas y rangos horarios', () => {
  assert.equal(diaSemanaIso('2026-11-23'), 1) // lunes
  assert.equal(diaSemanaIso('2026-11-22'), 7) // domingo
  assert.equal(esFechaValida('2026-12-31'), true)
  assert.equal(esFechaValida('2026-02-30'), false)
  assert.equal(esFechaValida('31/12/2026'), false)
  assert.equal(validarRangoHorario('18:00', '20:30'), null)
  assert.equal(validarRangoHorario('20:00', '18:00'), 'La hora de fin tiene que ser posterior a la de inicio.')
  assert.equal(validarRangoHorario('8:00', '10:00'), 'Usá horas con formato HH:MM (por ejemplo 18:30).')
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

// Header de supabase/migrations/20261112000000_reservas_tenis.sql + códigos de las Edge Functions.
const CODIGOS_CONTRATO = [
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
  // 20261126000000_tenis_editar_reserva.
  'reserva_no_editable',
  // 20261127000000_tenis_detalles_edicion.
  'reintentar',
  'limitado', 'jugador_sin_nombre', 'comprobante_invalido', 'comprobante_no_subido',
  // 20261128000000_tenis_paridad_ondepor + tenis-gestion.
  'fuera_de_vista', 'comentario_largo', 'motivo_cancelacion', 'novedad_invalida', 'novedad_inexistente',
  'novedad_ya_enviada', 'novedad_en_curso', 'reporte_invalido', 'rango_invalido',
]

caso('cada código de la base y de las funciones tiene mensaje propio', () => {
  assert.deepEqual([...CODIGOS_TENIS].sort(), [...CODIGOS_CONTRATO].sort())
  for (const c of CODIGOS_TENIS) {
    assert.notEqual(mensajeErrorTenis({ code: 'P0001', message: c }, 'GENERICO'), 'GENERICO', c)
    // Las Edge Functions devuelven { ok:false, codigo }.
    assert.notEqual(mensajeErrorTenis({ codigo: c }, 'GENERICO'), 'GENERICO', c)
  }
  assert.ok(CODIGOS_TENIS.includes('jugador_no_habilitado'))
  assert.ok(CODIGOS_TENIS.includes('limitado'))
})

caso('mensaje en castellano por código', () => {
  assert.equal(mensajeErrorTenis({ code: 'P0001', message: 'limite_dia' }, 'x'), 'Ya tenés una reserva ese día.')
  assert.equal(mensajeErrorTenis({ code: 'P0001', message: 'turno_ocupado' }, 'x'), 'Ese horario ya está ocupado. Elegí otro.')
  assert.match(mensajeErrorTenis({ code: 'P0001', message: 'hueco_invalido' }, 'x'), /media hora libre/)
  // Código desconocido o error técnico: el por defecto, nunca el texto crudo.
  assert.equal(mensajeErrorTenis({ code: 'P0001', message: 'codigo_raro' }, 'Por defecto'), 'Por defecto')
  assert.equal(mensajeErrorTenis({ code: '42501', message: 'permission denied' }, 'Por defecto'), 'No tenés permiso para hacer esto.')
  assert.equal(mensajeErrorTenis({ message: 'Network request failed' }, 'Por defecto'), 'No hay conexión. Revisá internet y volvé a intentar.')
})

// ─── Respuestas de las RPC (shapes de la migración 20261112000000) ────────────

const R1 = '11111111-1111-4111-8111-111111111111'
const J1 = '22222222-2222-4222-8222-222222222222'
const S1 = '33333333-3333-4333-8333-333333333333'
const I1 = '44444444-4444-4444-8444-444444444444'

// tenis_reserva_resumen(id, true): lo que traen grilla, check-in y comprobantes.
const resumenStaff = {
  reserva_id: R1, cancha_id: 'c1', cancha_nombre: '03', inicio: `${FECHA}T18:00:00-03:00`, fin: `${FECHA}T19:00:00-03:00`,
  modalidad: 'singles', origen: 'invitado', estado: 'pendiente_comprobante', comprobante_estado: 'pendiente',
  comprobante_vence_at: `${FECHA}T15:00:00-03:00`,
  jugadores: [
    { jugador_id: J1, socio_id: null, invitado_id: I1, nombre: 'Ana Paz', es_titular: true, cargo: 16000, motivo: 'no_socio', cobrado: false, check_in_at: null, numero_socio: null, dni: '30111777' },
    { jugador_id: 'j2', socio_id: S1, invitado_id: null, nombre: 'Pérez Juan', es_titular: false, cargo: 0, motivo: 'carnet_gratis', cobrado: false, check_in_at: null, numero_socio: '1001', dni: null },
  ],
  total: 16000, total_cobrado: 0,
}

caso('grilla: reserva con jugadores (jugador_id, dni) y bloque con su vigencia', () => {
  const r = parsearItem({ ...resumenStaff, tipo: 'reserva_invitado', titulo: 'Ana Paz', recurrente: false, mio: false })
  assert.ok(r)
  assert.equal(r.reserva_id, R1)
  assert.equal(r.jugadores?.[0].id, J1)
  assert.equal(r.jugadores?.[0].dni, '30111777')
  assert.equal(r.jugadores?.[1].numero_socio, '1001')
  const b = parsearItem({
    cancha_id: 'c2', inicio: `${FECHA}T09:00:00-03:00`, fin: `${FECHA}T12:00:00-03:00`, tipo: 'clase', titulo: 'Escuelita',
    recurrente: true, mio: false, bloque_id: 'b1', bloque_cancha_id: null, dia_semana: 6, vigente_desde: '2026-11-01', vigente_hasta: null,
  })
  assert.ok(b)
  assert.equal(b.bloque_todas, true)
  assert.equal(b.dia_semana, 6)
  assert.equal(b.vigente_desde, '2026-11-01')
  const b2 = parsearItem({ cancha_id: 'c2', inicio: `${FECHA}T09:00:00-03:00`, fin: `${FECHA}T12:00:00-03:00`, tipo: 'clase', bloque_cancha_id: 'c2' })
  assert.equal(b2?.bloque_todas, false)
})

caso('mis reservas: resumen + es_titular, mi_cargo y puede_cancelar del servidor', () => {
  const [m] = parsearMisReservas([{
    ...resumenStaff, estado: 'confirmada', origen: 'socio',
    es_titular: false, mi_cargo: 0, mi_motivo: 'carnet_gratis', mi_cobrado: false,
    cancelable_hasta: `${FECHA}T15:00:00-03:00`, puede_cancelar: false,
  }])
  assert.equal(m.id, R1)
  assert.equal(m.cancha, '03')
  assert.equal(m.es_titular, false)
  assert.equal(m.puede_cancelar, false)
  assert.equal(m.mi_cargo, 0)
  assert.equal(m.mi_motivo, 'carnet_gratis')
  assert.equal(m.total, 16000)
  assert.equal(parsearMisReservas([{ ...resumenStaff, es_titular: true, puede_cancelar: true }])[0].puede_cancelar, true)
})

caso('mis reservas: cancha_id, origen y personas (para editar)', () => {
  const [m] = parsearMisReservas([{ ...resumenStaff, es_titular: false, puede_cancelar: false }])
  assert.equal(m.cancha_id, 'c1')
  assert.equal(m.origen, 'invitado')
  assert.deepEqual(m.personas, [
    { socio_id: null, invitado_id: I1, nombre: 'Ana Paz', es_titular: true },
    { socio_id: S1, invitado_id: null, nombre: 'Pérez Juan', es_titular: false },
  ])
})

caso('editar: sólo el titular, reserva propia confirmada y hasta 3 h antes', () => {
  const inicio = `${FECHA}T18:00:00-03:00`
  const base = { es_titular: true, estado: 'confirmada', origen: 'socio', inicio }
  const antes = Date.parse(`${FECHA}T15:00:00-03:00`)
  assert.equal(puedeEditar(base, antes), true)
  assert.equal(puedeEditar(base, antes + 60_000), false)
  assert.equal(puedeEditar({ ...base, es_titular: false }, antes), false)
  assert.equal(puedeEditar({ ...base, origen: 'telefonica' }, antes), false)
  assert.equal(puedeEditar({ ...base, origen: null }, antes), false)
  assert.equal(puedeEditar({ ...base, estado: 'pendiente_comprobante' }, antes), false)
})

caso('editar: los otros jugadores precargados (socio por socio_id, invitado por invitado_id)', () => {
  const personas = [
    { socio_id: S1, invitado_id: null, nombre: 'Titular', es_titular: true },
    { socio_id: 'sx', invitado_id: null, nombre: 'Gómez Ana', es_titular: false },
    { socio_id: null, invitado_id: I1, nombre: 'Ana Paz', es_titular: false },
    { socio_id: null, invitado_id: null, nombre: '—', es_titular: false },
  ]
  assert.deepEqual(jugadoresParaEditar({ personas }), [
    { clave: 'sx', nombre: 'Gómez Ana', entrada: { socio_id: 'sx' } },
    { clave: `inv:${I1}`, nombre: 'Ana Paz', entrada: { invitado_id: I1 } },
  ])
})

caso('editar: la reserva editada no ocupa su propio turno en la grilla', () => {
  const propia = item({ reserva_id: R1, mio: true })
  const otra = item({ reserva_id: null, inicio: `${FECHA}T10:00:00-03:00`, fin: `${FECHA}T11:00:00-03:00` })
  assert.deepEqual(itemsSinReserva([propia, otra], R1), [otra])
  assert.deepEqual(itemsSinReserva([propia, otra], null), [propia, otra])
  const ahora = Date.parse(`${FECHA}T08:00:00-03:00`)
  assert.equal(iniciosLibres([propia, otra], 'c1', FECHA, 'singles', CONFIG_DEFECTO, ahora).includes('18:00'), false)
  assert.equal(iniciosLibres(itemsSinReserva([propia, otra], R1), 'c1', FECHA, 'singles', CONFIG_DEFECTO, ahora).includes('18:00'), true)
})

caso('comprobantes pendientes: resumen + titular {nombre, dni, email}', () => {
  const [c] = parsearComprobantes([{
    ...resumenStaff, comprobante_path: `${R1}/x.jpg`,
    titular: { invitado_id: I1, nombre: 'Ana Paz', dni: '30111777', email: 'ana@mail.com' },
  }])
  assert.equal(c.reserva_id, R1)
  assert.equal(c.cancha, '03')
  assert.equal(c.titular, 'Ana Paz')
  assert.equal(c.dni, '30111777')
  assert.equal(c.email, 'ana@mail.com')
  assert.equal(c.total, 16000)
  assert.equal(c.vence_at, `${FECHA}T15:00:00-03:00`)
})

caso('check-in: jugador.jugador_id y reserva como resumen staff', () => {
  const c = parsearCheckin({
    persona: { tipo: 'socio', socio_id: S1, nombre: 'Pérez Juan', numero_socio: '1001', semaforo: 'verde' },
    reserva: resumenStaff,
    jugador: { jugador_id: 'j2', cargo: 0, motivo: 'carnet_gratis', cobrado: false, check_in_at: null },
    suspendido: false,
    resultado: 'ok',
  })
  assert.equal(c.jugador?.id, 'j2')
  assert.equal(c.reserva?.id, R1)
  assert.equal(c.reserva?.cancha, '03')
  assert.equal(c.persona?.nombre, 'Pérez Juan')
  const sin = parsearCheckin({ persona: null, reserva: null, jugador: null, suspendido: false, resultado: 'sin_reserva' })
  assert.equal(sin.reserva, null)
  assert.equal(sin.jugador, null)
})

caso('corregir jugadores: socio por socio_id, invitado que sigue por dni (nunca invitado_id)', () => {
  const r = parsearItem({ ...resumenStaff, tipo: 'reserva_invitado' })!
  const otros = (r.jugadores ?? []).filter(j => !j.es_titular).map(entradaJugadorExistente)
  assert.deepEqual(otros, [{ socio_id: S1 }])
  const titularInv = (r.jugadores ?? []).filter(j => j.es_titular).map(entradaJugadorExistente)
  assert.deepEqual(titularInv, [{ dni: '30111777' }])
})

caso('corregir jugadores: "a designar" e invitado sin DNI se conservan', () => {
  const r = parsearItem({
    ...resumenStaff,
    jugadores: [
      { jugador_id: 'j1', socio_id: S1, nombre: 'Pérez Juan', es_titular: true },
      { jugador_id: 'j2', socio_id: null, invitado_id: null, a_designar: true, nombre: 'Socio a designar' },
      { jugador_id: 'j3', socio_id: null, invitado_id: I1, dni: null, nombre: 'Ana Paz' },
    ],
  })!
  const otros = (r.jugadores ?? []).filter(j => !j.es_titular).map(entradaJugadorExistente)
  assert.deepEqual(otros, [{ a_designar: true }, { invitado_id: I1 }])
  assert.equal(r.jugadores?.[1].a_designar, true)
})

caso('grilla: comentario, no-show y config con horarios por día', () => {
  const r = parsearItem({
    ...resumenStaff, comentario: 'Traen pelotas',
    jugadores: [{ jugador_id: 'j1', socio_id: S1, nombre: 'Pérez Juan', cargo_no_show: 9000, cargo_no_show_cobrado: true, monto_cobrado: 9000 }],
  })!
  assert.equal(r.comentario, 'Traen pelotas')
  assert.equal(r.jugadores?.[0].cargo_no_show, 9000)
  assert.equal(r.jugadores?.[0].cargo_no_show_cobrado, true)
  assert.equal(r.jugadores?.[0].monto_cobrado, 9000)
  const c = parsearConfig({
    dias_vista: 10,
    horarios: [
      { dia_semana: 7, hora_desde: '10:00', hora_hasta: '17:00', activo: false },
      { dia_semana: 1, hora_desde: '08:00:00', hora_hasta: '22:00:00', activo: true },
      { dia_semana: 9, hora_desde: '08:00', hora_hasta: '22:00' }, { dia_semana: 2, hora_desde: '22:00', hora_hasta: '08:00' }, 'x',
    ],
  })
  assert.equal(c.dias_vista, 10)
  assert.deepEqual(c.horarios, [
    { dia_semana: 1, hora_desde: '08:00', hora_hasta: '22:00', activo: true },
    { dia_semana: 7, hora_desde: '10:00', hora_hasta: '17:00', activo: false },
  ])
  assert.deepEqual(parsearConfig({}).horarios, [])
})

caso('check-in del titular: "a designar" con su pendiente', () => {
  const c = parsearCheckin({
    persona: { tipo: 'socio', nombre: 'Pérez Juan' }, reserva: resumenStaff, resultado: 'ok', suspendido: false,
    jugador: {
      jugador_id: 'j1', cargo: 9000, cobrado: false, pendiente: 18000, pendiente_propio: 9000,
      a_designar: [{ jugador_id: 'j2', cargo: 9000, cobrado: false, pendiente: 9000 }, { cargo: 1 }],
    },
  })
  assert.equal(c.jugador?.pendiente, 18000)
  assert.equal(c.jugador?.pendiente_propio, 9000)
  assert.deepEqual(c.jugador?.a_designar, [{ jugador_id: 'j2', cargo: 9000, cobrado: false, pendiente: 9000 }])
  const viejo = parsearCheckin({ jugador: { jugador_id: 'j1', cargo: 9000, cobrado: false } })
  assert.equal(viejo.jugador?.pendiente_propio, 9000)
  assert.deepEqual(viejo.jugador?.a_designar, [])
})

caso('disponibilidad: config, canchas válidas e ítems; basura da vacío', () => {
  const d = parsearDisponibilidad({
    config: { hora_desde: '09:00:00' },
    canchas: [{ id: 'c1', nombre: '01' }, { nombre: 'sin id' }, 'x'],
    items: [{ cancha_id: 'c1', inicio: `${FECHA}T18:00:00-03:00`, fin: `${FECHA}T19:00:00-03:00`, tipo: 'reserva_web', mio: true }, { inicio: 'sin fin' }],
  })
  assert.equal(d.config.hora_desde, '09:00')
  assert.deepEqual(d.canchas, [{ id: 'c1', nombre: '01' }])
  assert.equal(d.items.length, 1)
  assert.equal(d.items[0].mio, true)
  const vacio = parsearDisponibilidad(null)
  assert.deepEqual(vacio.canchas, [])
  assert.deepEqual(vacio.items, [])
  assert.deepEqual(vacio.config, CONFIG_DEFECTO)
})

caso('resultado de reservar: reserva_id obligatorio, cargos y total', () => {
  const r = parsearResultadoReserva({
    reserva_id: R1, total: '9000',
    jugadores: [{ nombre: 'Agus', cargo: 0, motivo: 'carnet_gratis' }, { nombre: 'Juan', cargo: 9000, motivo_cargo: 'socio' }],
  })
  assert.ok(r)
  assert.equal(r.total, 9000)
  assert.deepEqual(r.jugadores[1], { nombre: 'Juan', cargo: 9000, motivo: 'socio' })
  assert.equal(parsearResultadoReserva({ total: 1 }), null)
  assert.equal(parsearResultadoReserva('x'), null)
})

caso('mis reservas: filas sin id o sin horario se descartan; dobles y total null', () => {
  const lista = parsearMisReservas([
    { ...resumenStaff, modalidad: 'dobles', total: null },
    { reserva_id: 'r2', inicio: `${FECHA}T10:00:00-03:00` },
    null,
  ])
  assert.equal(lista.length, 1)
  assert.equal(lista[0].modalidad, 'dobles')
  assert.equal(lista[0].total, null)
  assert.equal(lista[0].puede_cancelar, false)
  assert.deepEqual(parsearMisReservas({ no: 'lista' }), [])
})

caso('comprobantes y check-in: tolerantes a basura', () => {
  assert.deepEqual(parsearComprobantes(null), [])
  const [c] = parsearComprobantes([{ reserva_id: R1, inicio: `${FECHA}T18:00:00-03:00` }])
  assert.equal(c.titular, '—')
  assert.equal(c.fin, c.inicio)
  const vacio = parsearCheckin('x')
  assert.equal(vacio.resultado, 'sin_reserva')
  assert.equal(vacio.persona, null)
  assert.equal(vacio.suspendido, false)
  const susp = parsearCheckin({ persona: { tipo: 'invitado', nombre: 'Ana' }, suspendido: true, resultado: 'suspendido' })
  assert.equal(susp.persona?.tipo, 'invitado')
  assert.equal(susp.suspendido, true)
})

caso('sanciones: infracciones (automática si creado_por es null) y suspensiones', () => {
  const s = parsearSanciones({
    infracciones: [
      { id: 'i1', socio_id: S1, invitado_id: null, nombre: 'Pérez Juan', tipo: 'no_show', nota: null, perdonada: false, creado_por: null, created_at: '2026-11-20T10:00:00Z' },
      { id: 'i2', socio_id: S1, nombre: 'Pérez Juan', tipo: 'otra', nota: 'llegó tarde', perdonada: true, creado_por: 'u1' },
      { sin: 'id' },
    ],
    suspensiones: [{ id: 's1', invitado_id: I1, nombre: 'Ana Paz', desde: '2026-11-20', hasta: '2026-11-27', motivo: 'no_show' }],
  })
  assert.equal(s.infracciones.length, 2)
  assert.equal(s.infracciones[0].automatica, true)
  assert.equal(s.infracciones[1].automatica, false)
  assert.equal(s.infracciones[1].perdonada, true)
  assert.equal(s.suspensiones[0].invitado_id, I1)
  assert.equal(s.suspensiones[0].hasta, '2026-11-27')
  // Una lista suelta se toma como infracciones.
  assert.equal(parsearSanciones([{ id: 'i3' }]).infracciones[0].tipo, 'otra')
  assert.deepEqual(parsearSanciones(null), { infracciones: [], suspensiones: [] })
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

caso('AVISO_SANCIONES: avisa de sanciones, suspensión y que paga el titular', () => {
  assert.equal(AVISO_SANCIONES.titulo, 'Antes de confirmar')
  assert.match(AVISO_SANCIONES.texto, /sanciones/)
  assert.match(AVISO_SANCIONES.texto, /suspendido/)
  assert.match(AVISO_SANCIONES.texto, /titular/)
})

caso('cobro después de editar: monto cobrado y diferencia del resumen', () => {
  const r = parsearItem({
    ...resumenStaff, tipo: 'reserva_web', jugadores: [
      { jugador_id: 'j1', nombre: 'Gómez Ana', es_titular: false, cargo: 10000, cobrado: true, monto_cobrado: 9000, diferencia: 1000 },
      { jugador_id: 'j2', nombre: 'Díaz Sofía', es_titular: false, cargo: 9000, cobrado: true, monto_cobrado: 10000, diferencia: -1000 },
      { jugador_id: 'j3', nombre: 'Viejo', es_titular: false, cargo: 9000, cobrado: true },
    ],
  })
  const [a, b, c] = r?.jugadores ?? []
  assert.equal(a.monto_cobrado, 9000)
  assert.equal(a.diferencia, 1000)
  assert.equal(b.diferencia, -1000)
  // Servidor anterior (sin los campos): cobrado = el cargo, sin diferencia.
  assert.equal(c.monto_cobrado, null)
  assert.equal(c.diferencia, 0)
  assert.equal(textoDiferenciaCobro(a), 'Pagó $ 9.000 · falta cobrar $ 1.000')
  assert.equal(textoDiferenciaCobro(b), 'Pagó $ 10.000 · hay que devolver $ 1.000')
  assert.equal(textoDiferenciaCobro(c), null)
  assert.equal(textoDiferenciaCobro({ cobrado: false, monto_cobrado: null, diferencia: 0 }), null)
})

caso('ajustes de cobro: devolver o cobrar, tolerante a basura', () => {
  const lista = parsearAjustesCobro([
    { id: 'a1', reserva_id: R1, nombre: 'Gómez Ana', numero_socio: '1002', dni: null, monto: 10000, motivo: 'jugador_quitado',
      created_at: `${FECHA}T10:00:00-03:00`, cancha_nombre: '03', inicio: `${FECHA}T12:00:00-03:00`, estado: 'confirmada' },
    { id: 'a2', reserva_id: R1, nombre: 'Ana Paz', dni: '30111777', monto: -1000, motivo: 'cambio_turno', inicio: `${FECHA}T12:00:00-03:00` },
    { id: 'a3', reserva_id: R1, monto: 0, motivo: 'jugador_quitado', inicio: `${FECHA}T12:00:00-03:00` },
    { reserva_id: R1, monto: 5, motivo: 'jugador_quitado' },
    'basura', null,
  ])
  assert.equal(lista.length, 2)
  assert.deepEqual(lista[0], {
    id: 'a1', reserva_id: R1, nombre: 'Gómez Ana', numero_socio: '1002', dni: null, monto: 10000, motivo: 'jugador_quitado',
    cancha: '03', inicio: `${FECHA}T12:00:00-03:00`,
  })
  assert.equal(lista[1].motivo, 'cambio_turno')
  assert.equal(lista[1].monto, -1000)
  assert.deepEqual(parsearAjustesCobro(null), [])
})

caso('reintentar: la reserva cambió mientras se editaba', () => {
  assert.match(mensajeErrorTenis({ code: 'P0001', message: 'reintentar' }, 'x'), /Probá de nuevo/)
})

console.log(`\n${casos} casos ok`)
