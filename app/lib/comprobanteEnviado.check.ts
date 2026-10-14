// Verificación autocontenida de comprobanteEnviado.ts (no hay runner de tests en app/).
//   npx tsx app/lib/comprobanteEnviado.check.ts
// Sale con código distinto de 0 si algo falla.
// Las fechas se arman en hora local (new Date(y, m, d, h)) para que el
// resultado no dependa de la zona horaria de la máquina.

import assert from 'node:assert/strict'
import {
  claveComprobante,
  comprobanteParaPeriodos,
  estadoComprobante,
  parseEntradaComprobante,
  periodoCuotaVirtual,
  periodosEnGracia,
  prefijoComprobantes,
  sigueAdeudado,
  type ComprobanteEnviado,
} from './comprobanteEnviado'
import { contarPendientes } from './deudaSocio'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).toISOString()

// ─── Estado (gracia de 2 días) ────────────────────────────────────────────────

caso('estado: sin fecha de corte → ENVIADO', () => {
  assert.equal(estadoComprobante(local(2026, 10, 10), null, true), 'ENVIADO')
  assert.equal(estadoComprobante(local(2026, 10, 10), null, false), 'ENVIADO')
})

caso('estado: corte anterior al envío → ENVIADO', () => {
  assert.equal(estadoComprobante(local(2026, 10, 10), '2026-10-05', false), 'ENVIADO')
})

caso('estado: corte dentro de los 2 días → ENVIADO aunque ya no adeude', () => {
  assert.equal(estadoComprobante(local(2026, 10, 10), '2026-10-11', false), 'ENVIADO')
  assert.equal(estadoComprobante(local(2026, 10, 10), '2026-10-11', true), 'ENVIADO')
})

caso('estado: corte exactamente a +2 días ya sale de la gracia', () => {
  assert.equal(estadoComprobante(local(2026, 10, 10), '2026-10-12', false), 'REGISTRADO')
  assert.equal(estadoComprobante(local(2026, 10, 10), '2026-10-12', true), 'NO_REGISTRADO')
})

caso('estado: enviado a la tarde, corte a +2 días calendario (medianoche) todavía es gracia', () => {
  assert.equal(estadoComprobante(local(2026, 10, 10, 15), '2026-10-12', false), 'ENVIADO')
  assert.equal(estadoComprobante(local(2026, 10, 10, 15), '2026-10-13', false), 'REGISTRADO')
})

caso('estado: fecha de corte como timestamp completo', () => {
  assert.equal(estadoComprobante(local(2026, 10, 10), local(2026, 10, 12, 9), true), 'NO_REGISTRADO')
})

caso('estado: enviadoAt inválido → ENVIADO (no inventa un resultado)', () => {
  assert.equal(estadoComprobante('basura', '2026-10-20', false), 'ENVIADO')
})

// ─── Claves de AsyncStorage ───────────────────────────────────────────────────

caso('clave: socio propio usa "yo", tutor usa el id del menor', () => {
  assert.equal(claveComprobante(undefined, '2026-09'), 'comprobante:yo:2026-09')
  assert.equal(claveComprobante(null, '2026-09'), 'comprobante:yo:2026-09')
  assert.equal(claveComprobante('abc-123', '2026-09'), 'comprobante:abc-123:2026-09')
  assert.equal(prefijoComprobantes(undefined), 'comprobante:yo:')
  assert.equal(prefijoComprobantes('abc-123'), 'comprobante:abc-123:')
})

caso('periodo de la cuota virtual: conjunto ordenado y sin repetidos', () => {
  assert.equal(periodoCuotaVirtual(['2026-10', '2026-08', '2026-09', '2026-08']), '2026-08+2026-09+2026-10')
  assert.equal(periodoCuotaVirtual(['2026-09']), '2026-09')
  assert.equal(
    claveComprobante(undefined, periodoCuotaVirtual(['2026-09', '2026-08'])),
    claveComprobante(undefined, periodoCuotaVirtual(['2026-08', '2026-09'])),
  )
})

caso('periodo de la cuota virtual: sólo saldo anterior', () => {
  assert.equal(periodoCuotaVirtual([]), 'saldo-anterior')
})

// ─── Lectura de lo guardado ───────────────────────────────────────────────────

caso('parseEntrada: válida', () => {
  assert.deepEqual(
    parseEntradaComprobante('comprobante:yo:2026-09', JSON.stringify({ enviadoAt: '2026-10-10T12:00:00.000Z', periodos: ['2026-09'] })),
    { clave: 'comprobante:yo:2026-09', enviadoAt: '2026-10-10T12:00:00.000Z', periodos: ['2026-09'] },
  )
})

caso('parseEntrada: basura, JSON roto o sin enviadoAt → null', () => {
  assert.equal(parseEntradaComprobante('k', null), null)
  assert.equal(parseEntradaComprobante('k', '{roto'), null)
  assert.equal(parseEntradaComprobante('k', JSON.stringify({ periodos: [] })), null)
  assert.equal(parseEntradaComprobante('k', JSON.stringify({ enviadoAt: 'x', periodos: 'no' })), null)
})

// ─── Reconciliación con NUVIX ─────────────────────────────────────────────────

caso('sigueAdeudado: algún período cubierto sigue en NUVIX', () => {
  assert.equal(sigueAdeudado(['2026-08', '2026-09'], ['2026-09', '2026-10'], true), true)
  assert.equal(sigueAdeudado(['2026-08', '2026-09'], ['2026-10'], true), false)
})

caso('sigueAdeudado: sólo saldo anterior depende de si hay deuda', () => {
  assert.equal(sigueAdeudado([], [], true), true)
  assert.equal(sigueAdeudado([], [], false), false)
})

caso('sigueAdeudado: deuda sin período (saldo anterior o importación sin filas) no confirma el pago', () => {
  // cuota real 2026-09 que ya no figura como período, pero el socio sigue con
  // deuda que NUVIX no asigna a ningún período: puede estar ahí adentro
  assert.equal(sigueAdeudado(['2026-09'], [], true, true), true)
  assert.equal(sigueAdeudado(['2026-09'], ['2026-10'], true, true), true)
  // sin deuda sin período, el período que ya no figura sí quedó registrado
  assert.equal(sigueAdeudado(['2026-09'], ['2026-10'], true, false), false)
})

const e = (clave: string, enviadoAt: string, periodos: string[]): ComprobanteEnviado => ({ clave, enviadoAt, periodos })

caso('comprobanteParaPeriodos: el más reciente que se solapa', () => {
  const viejo = e('comprobante:yo:2026-08+2026-09', local(2026, 10, 1), ['2026-08', '2026-09'])
  const nuevo = e('comprobante:yo:2026-09+2026-10', local(2026, 10, 11), ['2026-09', '2026-10'])
  const otro  = e('comprobante:yo:2026-05', local(2026, 10, 12), ['2026-05'])
  assert.equal(comprobanteParaPeriodos([viejo, nuevo, otro], ['2026-09', '2026-10']), nuevo)
  assert.equal(comprobanteParaPeriodos([viejo, otro], ['2026-10']), null)
})

caso('comprobanteParaPeriodos: deuda sólo de saldo anterior matchea la entrada sin períodos', () => {
  const saldo = e('comprobante:yo:saldo-anterior', local(2026, 10, 1), [])
  assert.equal(comprobanteParaPeriodos([saldo], []), saldo)
  assert.equal(comprobanteParaPeriodos([saldo], ['2026-10']), null)
})

caso('periodosEnGracia: sólo los ENVIADO', () => {
  const r = periodosEnGracia([
    { periodos: ['2026-08', '2026-09'], estado: 'ENVIADO' },
    { periodos: ['2026-05'], estado: 'NO_REGISTRADO' },
    { periodos: [], estado: 'ENVIADO' },
  ])
  assert.deepEqual(r, [['2026-08', '2026-09'], []])
})

// ─── Banner de pendientes con comprobantes en gracia ──────────────────────────

caso('contarPendientes: los períodos ENVIADO en gracia no cuentan', () => {
  assert.equal(contarPendientes({
    periodosPendientes: [],
    periodosNuvix: ['2026-08', '2026-09', '2026-10'],
    enviadosEnGracia: [['2026-08', '2026-09']],
  }), 1)
  assert.equal(contarPendientes({
    periodosPendientes: [],
    periodosNuvix: ['2026-08', '2026-09'],
    enviadosEnGracia: [['2026-08', '2026-09']],
  }), 0)
})

caso('contarPendientes: saldo anterior enviado no cuenta', () => {
  assert.equal(contarPendientes({ periodosPendientes: [], periodosNuvix: [], enviadosEnGracia: [[]] }), 0)
  assert.equal(contarPendientes({ periodosPendientes: [], periodosNuvix: [], enviadosEnGracia: [['2026-01']] }), 1)
})

console.log(`\n${casos} casos OK`)
