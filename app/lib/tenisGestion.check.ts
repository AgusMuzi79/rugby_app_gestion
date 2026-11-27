// Verificación autocontenida de tenisGestion.ts (no hay runner de tests en app/).
//   npx tsx app/lib/tenisGestion.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  armarCsv,
  avisoExportacion,
  canchasDestino,
  estadoNovedad,
  columnasReporte,
  etiquetaAnticipacion,
  etiquetaColumna,
  lineaReserva,
  metricaReporte,
  nombreCancha,
  paginas,
  parsearCanceladas,
  parsearHistorial,
  parsearHorarios,
  parsearListado,
  parsearNovedades,
  resumenBloques,
  parsearReporte,
  rangoPorDefecto,
  sumarDias,
  validarHorarios,
  validarRango,
  horaSnapshot,
  REPORTES,
} from './tenisGestion'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  void nombre
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

caso('csv con BOM, separador ; y escapes', () => {
  const csv = armarCsv(['Nombre', 'Monto'], [['PÉREZ, Juan', 9000], ['Dice "hola"', null], ['a;b', -5]])
  assert.equal(csv, '﻿Nombre;Monto\r\n"PÉREZ, Juan";9000\r\n"Dice ""hola""";\r\n"a;b";-5')
})

caso('csv neutraliza fórmulas en textos (no en números)', () => {
  const csv = armarCsv(['x'], [['=HYPERLINK("a")'], ['+1'], ['@x'], ['-2']])
  assert.equal(csv.split('\r\n')[1], `"'=HYPERLINK(""a"")"`)
  assert.equal(csv.split('\r\n')[2], "'+1")
  assert.equal(csv.split('\r\n')[3], "'@x")
  assert.equal(csv.split('\r\n')[4], "'-2")
})

caso('csv con saltos de línea entre comillas', () => {
  assert.equal(armarCsv(['t'], [['a\nb']]).split('\r\n')[1], '"a\nb"')
})

// ─── Anticipación ─────────────────────────────────────────────────────────────

caso('anticipación de la cancelación', () => {
  assert.equal(etiquetaAnticipacion(null), '—')
  assert.equal(etiquetaAnticipacion(-15), 'Después del inicio')
  assert.equal(etiquetaAnticipacion(0), 'Al inicio')
  assert.equal(etiquetaAnticipacion(45), '45 min antes')
  assert.equal(etiquetaAnticipacion(180), '3 h antes')
  assert.equal(etiquetaAnticipacion(200), '3 h antes')
  assert.equal(etiquetaAnticipacion(1440), '1 día antes')
  assert.equal(etiquetaAnticipacion(3000), '2 días antes')
})

// ─── Fechas y rangos ──────────────────────────────────────────────────────────

caso('sumar días cruzando mes y año', () => {
  assert.equal(sumarDias('2026-11-28', 7), '2026-12-05')
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28')
})

caso('rango por defecto: hoy (Argentina) a +7', () => {
  // 2026-11-27 01:00 UTC = 2026-11-26 22:00 en Argentina.
  assert.deepEqual(rangoPorDefecto(Date.parse('2026-11-27T01:00:00Z')), { desde: '2026-11-26', hasta: '2026-12-03' })
  assert.deepEqual(rangoPorDefecto(Date.parse('2026-11-27T01:00:00Z'), -30), { desde: '2026-10-27', hasta: '2026-11-26' })
})

caso('validar rango', () => {
  assert.equal(validarRango('2026-11-26', '2026-12-03'), null)
  assert.equal(validarRango('2026-11-26', '2026-11-26'), null)
  assert.match(validarRango('2026-11-31', '2026-12-03') ?? '', /fecha/i)
  assert.match(validarRango('2026-12-03', '2026-11-26') ?? '', /antes/i)
  assert.match(validarRango('2025-01-01', '2026-12-03') ?? '', /año/i)
})

caso('páginas', () => {
  assert.equal(paginas(0, 50), 1)
  assert.equal(paginas(50, 50), 1)
  assert.equal(paginas(51, 50), 2)
})

// ─── Línea de una reserva ─────────────────────────────────────────────────────

caso('nombre de cancha con dos dígitos', () => {
  assert.equal(nombreCancha('2'), 'Cancha 02')
  assert.equal(nombreCancha('Central'), 'Cancha Central')
})

caso('línea de reserva del listado', () => {
  const r = parsearListado({
    total: 1,
    items: [{
      reserva_id: 'r1', cancha_nombre: '2', inicio: '2026-11-26T17:00:00Z', fin: '2026-11-26T18:30:00Z',
      modalidad: 'dobles', origen: 'telefonica', estado: 'confirmada', comentario: 'Traen pelotas',
      jugadores: [{ nombre: 'PÉREZ, JUAN', es_titular: true, dni: '30111222' }, { nombre: 'GÓMEZ, ANA' }],
      total: 40000,
    }],
  })
  assert.equal(r.total, 1)
  const it = r.items[0]
  assert.equal(it.comentario, 'Traen pelotas')
  assert.equal(it.origen, 'telefonica')
  assert.equal(lineaReserva(it), 'Cancha 02 · JUE 26/11 · 14:00–15:30 · PÉREZ, JUAN, GÓMEZ, ANA')
})

caso('listado tolera payload roto', () => {
  assert.deepEqual(parsearListado(null), { total: 0, items: [] })
  assert.deepEqual(parsearListado({ items: [{ sin: 'id' }, 3] }), { total: 0, items: [] })
})

// ─── Canceladas ───────────────────────────────────────────────────────────────

caso('canceladas', () => {
  const r = parsearCanceladas({
    total: 3,
    items: [{
      reserva_id: 'r2', cancha_nombre: '5', inicio: '2026-11-26T13:00:00Z', fin: '2026-11-26T14:00:00Z',
      jugadores: [], cancelacion_motivo: 'Lluvia', cancelado_por_nombre: 'Caro Demaría',
      cancelado_por_tipo: 'staff', cancelacion_anticipacion_min: 180,
    }],
  })
  assert.equal(r.total, 3)
  assert.equal(r.items[0].motivo, 'Lluvia')
  assert.equal(r.items[0].cancelado_por_tipo, 'staff')
  assert.equal(r.items[0].anticipacion_min, 180)
})

// ─── Historial ────────────────────────────────────────────────────────────────

caso('historial de una reserva', () => {
  const h = parsearHistorial({
    reserva: { tipo: 'reserva_web', creada_at: '2026-11-25T12:00:00Z', creada_por_nombre: 'PÉREZ, JUAN' },
    versiones: [
      { version: 1, accion: 'creada', hecho_por_nombre: 'PÉREZ, JUAN', hecho_at: '2026-11-25T12:00:00Z',
        snapshot: { fecha: '2026-11-26', inicio: '14:00:00', fin: '15:00', cancha: '2', modalidad: 'singles',
          estado: 'confirmada', comentario: null, jugadores: [{ nombre: 'PÉREZ, JUAN', cobrado: false }] } },
      { version: 2, accion: 'cancelada', hecho_por_nombre: null, hecho_at: '2026-11-25T13:00:00Z', snapshot: null },
    ],
  })
  assert.ok(h)
  assert.equal(h.tipo, 'reserva_web')
  assert.equal(h.versiones.length, 2)
  assert.equal(h.versiones[0].snapshot?.jugadores[0].nombre, 'PÉREZ, JUAN')
  assert.equal(h.versiones[1].snapshot, null)
  assert.equal(parsearHistorial('x'), null)
})

caso('hora de un snapshot: HH:MM o timestamptz', () => {
  assert.equal(horaSnapshot('14:00:00'), '14:00')
  assert.equal(horaSnapshot('2026-11-26T17:00:00Z'), '14:00')
  assert.equal(horaSnapshot(null), '—')
})

// ─── Reportes ─────────────────────────────────────────────────────────────────

caso('los 7 reportes', () => {
  assert.deepEqual(REPORTES.map(r => r.tipo), [
    'uso_mensual', 'uso_diario', 'uso_hora', 'uso_general', 'uso_tipo', 'ranking_reservas', 'ranking_cancelaciones',
  ])
})

caso('reporte: columnas en orden conocido y métrica para barras', () => {
  const r = parsearReporte({ tipo: 'ranking_reservas', filas: [
    { cumplimiento: 90, nombre: 'PÉREZ, JUAN', reservas: 10, extra: 'x', numero_socio: '123', cancelaciones: 1 },
  ] })
  assert.equal(r.tipo, 'ranking_reservas')
  assert.deepEqual(columnasReporte(r.filas), ['nombre', 'numero_socio', 'reservas', 'cancelaciones', 'cumplimiento', 'extra'])
  assert.equal(metricaReporte('ranking_reservas', r.filas), 'reservas')
  assert.equal(metricaReporte('uso_mensual', [{ mes: '2026-11', porcentaje: 40 }]), 'porcentaje')
  assert.equal(metricaReporte('uso_mensual', [{ mes: '2026-11' }]), null)
  assert.equal(etiquetaColumna('cumplimiento'), '% cumplimiento')
  assert.equal(etiquetaColumna('algo_raro'), 'Algo raro')
  assert.deepEqual(parsearReporte(null), { tipo: '', filas: [] })
})

// ─── Cartelera ────────────────────────────────────────────────────────────────

caso('novedades (array o {items})', () => {
  const n = parsearNovedades([{ id: 'n1', titulo: 'Torneo', texto: 'Inscripción abierta', destacada: true,
    created_at: '2026-11-26T12:00:00Z', enviada_at: null, push_enviados: 0, mails_enviados: 0 }, { titulo: 'sin id' }])
  assert.equal(n.length, 1)
  assert.equal(n[0].destacada, true)
  assert.equal(n[0].enviada_at, null)
  assert.equal(parsearNovedades({ items: [{ id: 'n2', titulo: 'x', texto: 'y' }] }).length, 1)
})

// ─── Horarios ─────────────────────────────────────────────────────────────────

caso('horarios: completa los 7 días con el horario por defecto', () => {
  const h = parsearHorarios([{ dia_semana: 6, hora_desde: '09:00:00', hora_hasta: '22:00:00', activo: true }], '08:00', '22:00')
  assert.equal(h.length, 7)
  assert.deepEqual(h[5], { dia_semana: 6, hora_desde: '09:00', hora_hasta: '22:00', activo: true })
  assert.deepEqual(h[0], { dia_semana: 1, hora_desde: '08:00', hora_hasta: '22:00', activo: true })
})

caso('validar horarios', () => {
  const base = parsearHorarios([], '08:00', '22:00')
  assert.equal(validarHorarios(base), null)
  const mal = base.map(x => x.dia_semana === 7 ? { ...x, hora_hasta: '07:00' } : x)
  assert.match(validarHorarios(mal) ?? '', /domingo/i)
  const cerrado = base.map(x => x.dia_semana === 7 ? { ...x, hora_hasta: 'xx', activo: false } : x)
  assert.equal(validarHorarios(cerrado), null)
})

caso('estado de una novedad (envío cortado se reintenta a los 15 min)', () => {
  const t = Date.parse('2026-11-26T12:00:00Z')
  assert.equal(estadoNovedad({ enviada_at: null, envio_completo: false }, t), 'sin_enviar')
  assert.equal(estadoNovedad({ enviada_at: '2026-11-26T12:00:00Z', envio_completo: true }, t), 'enviada')
  assert.equal(estadoNovedad({ enviada_at: '2026-11-26T11:50:00Z', envio_completo: false }, t), 'enviando')
  assert.equal(estadoNovedad({ enviada_at: '2026-11-26T11:45:00Z', envio_completo: false }, t), 'incompleta')
  assert.equal(parsearNovedades([{ id: 'a', enviada_at: '2026-11-26T12:00:00Z' }])[0].envio_completo, true)
  assert.equal(parsearNovedades([{ id: 'a', enviada_at: '2026-11-26T12:00:00Z', envio_completo: false }])[0].envio_completo, false)
  assert.equal(parsearNovedades([{ id: 'a', enviada_at: null }])[0].envio_completo, false)
})

caso('aviso de exportación truncada', () => {
  assert.equal(avisoExportacion(120, 120, 'reservas'), null)
  assert.equal(avisoExportacion(0, 0, 'reservas'), null)
  assert.match(avisoExportacion(2000, 2345, 'reservas') ?? '', /primeras 2000 de 2345 reservas/)
})

caso('bloques en varias canchas', () => {
  const canchas = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]
  assert.deepEqual(canchasDestino([], canchas), [null])
  assert.deepEqual(canchasDestino(['c3', 'c1'], canchas), ['c1', 'c3'])
  assert.deepEqual(canchasDestino(['c1', 'c2', 'c3'], canchas), [null])
  assert.deepEqual(canchasDestino(['zz'], canchas), [null])
  assert.equal(resumenBloques([{ cancha: '01', ok: true }, { cancha: '02', ok: true }]), null)
  const parte = resumenBloques([{ cancha: '01', ok: true }, { cancha: '02', ok: false, mensaje: 'Se superpone.' }])
  assert.equal(parte?.ninguno, false)
  assert.match(parte?.texto ?? '', /la cancha 01[\s\S]*Cancha 02: Se superpone\./)
  const nada = resumenBloques([{ cancha: '01', ok: false }])
  assert.equal(nada?.ninguno, true)
  assert.match(nada?.texto ?? '', /Cancha 01: no se pudo guardar/)
})

console.log(`tenisGestion.check.ts: ${casos} casos OK`)
