// Verificación autocontenida de deudaSocio.ts (no hay runner de tests en app/).
//   npx tsx app/lib/deudaSocio.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { agruparDeuda, contarPendientes, deudaTotal } from './deudaSocio'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Agrupado de comprobantes_deuda ───────────────────────────────────────────

caso('agruparDeuda: sin filas → todo vacío', () => {
  assert.deepEqual(agruparDeuda([]), {
    periodos: [], regCesantesTotal: 0, proximosVencimientos: [], saldoAnterior: 0,
  })
})

caso('agruparDeuda: suma por período, orden desc, reg_cesantes y saldo anterior aparte', () => {
  const r = agruparDeuda([
    { id: 'a', periodo: '2026-08', concepto: 'cuota', vencido: 1000, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'b', periodo: '2026-09', concepto: 'cuota', vencido: '1500.50', a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'c', periodo: '2026-09', concepto: 'gimnasio', vencido: 500, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'd', periodo: null, concepto: 'reg_cesantes', vencido: 9000, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'e', periodo: null, concepto: 'cuota', vencido: 300, a_vencer: 0, vencimiento: null, es_saldo_anterior: true },
    { id: 'f', periodo: '2026-10', concepto: 'cuota', vencido: 0, a_vencer: 2000, vencimiento: '2026-10-20', es_saldo_anterior: false },
  ])
  assert.deepEqual(r.periodos.map(p => [p.periodo, p.vencido, p.comprobantes.length]), [
    ['2026-09', 2000.5, 2],
    ['2026-08', 1000, 1],
  ])
  assert.equal(r.regCesantesTotal, 9000)
  assert.equal(r.saldoAnterior, 300)
  assert.deepEqual(r.proximosVencimientos, [{ id: 'f', vencido: 0, a_vencer: 2000, vencimiento: '2026-10-20' }])
})

// ─── Total a transferir ───────────────────────────────────────────────────────

caso('deudaTotal: suma períodos + saldo anterior, sin el plan de regularización', () => {
  const d = agruparDeuda([
    { id: 'a', periodo: '2026-08', concepto: 'cuota', vencido: 1000, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'b', periodo: '2026-09', concepto: 'cuota', vencido: 1200, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'c', periodo: '2026-10', concepto: 'cuota', vencido: 1200, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'd', periodo: null, concepto: 'reg_cesantes', vencido: 50000, a_vencer: 0, vencimiento: null, es_saldo_anterior: false },
    { id: 'e', periodo: null, concepto: 'cuota', vencido: 250, a_vencer: 0, vencimiento: null, es_saldo_anterior: true },
  ])
  assert.equal(deudaTotal(d), 3650)
})

caso('deudaTotal: redondea a centavos', () => {
  assert.equal(deudaTotal({ periodos: [{ vencido: 0.1 }, { vencido: 0.2 }], saldoAnterior: 0 }), 0.3)
})

caso('deudaTotal: sin deuda → 0', () => {
  assert.equal(deudaTotal({ periodos: [], saldoAnterior: 0 }), 0)
})

// ─── Cantidad de cuotas pendientes (banner) ───────────────────────────────────

caso('contarPendientes: cuota virtual cuenta los períodos de NUVIX, no 1', () => {
  assert.equal(contarPendientes({ periodosPendientes: [], periodosNuvix: ['2026-08', '2026-09', '2026-10'] }), 3)
})

caso('contarPendientes: sin cuota virtual cuenta sólo las cuotas pendientes reales', () => {
  assert.equal(contarPendientes({ periodosPendientes: ['2026-07'], periodosNuvix: null }), 1)
  assert.equal(contarPendientes({ periodosPendientes: [], periodosNuvix: null }), 0)
})

caso('contarPendientes: un período en ambas fuentes cuenta una sola vez', () => {
  assert.equal(contarPendientes({ periodosPendientes: ['2026-09', '2026-06'], periodosNuvix: ['2026-09', '2026-10'] }), 3)
})

caso('contarPendientes: cuota virtual sólo con saldo anterior cuenta 1', () => {
  assert.equal(contarPendientes({ periodosPendientes: [], periodosNuvix: [] }), 1)
})

console.log(`\n${casos} casos OK`)
