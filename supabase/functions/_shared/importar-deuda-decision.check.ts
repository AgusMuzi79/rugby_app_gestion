// Verificación autocontenida de importar-deuda-decision.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/importar-deuda-decision.check.ts

import assert from 'node:assert/strict'
import { decidirFechaCorte, leerForzar, mensajeDesbalance } from './importar-deuda-decision.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('sin importaciones previas se importa', () => {
  assert.deepEqual(decidirFechaCorte({ fechaCorte: '2026-10-20', ultimaFechaCorte: null, forzar: false }), { ok: true })
})

caso('un reporte más nuevo o del mismo día se importa (el del mismo día reemplaza al anterior)', () => {
  assert.deepEqual(decidirFechaCorte({ fechaCorte: '2026-10-21', ultimaFechaCorte: '2026-10-20', forzar: false }), { ok: true })
  assert.deepEqual(decidirFechaCorte({ fechaCorte: '2026-10-20', ultimaFechaCorte: '2026-10-20', forzar: false }), { ok: true })
})

caso('un reporte más viejo se rechaza con un mensaje con las dos fechas', () => {
  const r = decidirFechaCorte({ fechaCorte: '2026-10-19', ultimaFechaCorte: '2026-10-20', forzar: false })
  assert.equal(r.ok, false)
  assert.equal(
    !r.ok ? r.mensaje : '',
    'Este reporte es del 19/10, más viejo que el último importado (20/10). Importarlo recalcula el semáforo de todos los socios con datos viejos.',
  )
  assert.equal(!r.ok ? r.ultimaFechaCorte : '', '2026-10-20')
})

caso('un reporte más viejo de otro año muestra el año para no confundir', () => {
  const r = decidirFechaCorte({ fechaCorte: '2025-12-30', ultimaFechaCorte: '2026-01-02', forzar: false })
  assert.match(!r.ok ? r.mensaje : '', /del 30\/12\/2025, más viejo que el último importado \(02\/01\/2026\)/)
})

caso('con forzar, un reporte más viejo se importa igual', () => {
  assert.deepEqual(decidirFechaCorte({ fechaCorte: '2026-10-19', ultimaFechaCorte: '2026-10-20', forzar: true }), { ok: true })
})

caso('forzar sólo se activa con "1" o "true"', () => {
  assert.equal(leerForzar('1'), true)
  assert.equal(leerForzar('true'), true)
  assert.equal(leerForzar(' TRUE '), true)
  assert.equal(leerForzar('0'), false)
  assert.equal(leerForzar(''), false)
  assert.equal(leerForzar(null), false)
  assert.equal(leerForzar(undefined), false)
})

caso('el desbalance se explica en castellano, sin JSON, con montos en pesos', () => {
  const m = mensajeDesbalance([
    { campo: 'vencido', sumaSubtotales: 1234.5, totalGeneral: 1000, diferencia: 234.5 },
    { campo: 'total', sumaSubtotales: 2000, totalGeneral: 2100.25, diferencia: -100.25 },
  ])
  assert.ok(!m.includes('{') && !m.includes('sumaSubtotales'), 'no debe mostrar JSON crudo')
  assert.match(m, /^El archivo está incompleto o dañado: la suma de las cuentas no da el Total General\. No se importó nada\./)
  assert.match(m, /Vencido: suma de las cuentas \$1\.234,50 contra Total General \$1\.000,00 \(diferencia \$234,50\)/)
  assert.match(m, /Total: suma de las cuentas \$2\.000,00 contra Total General \$2\.100,25 \(diferencia -\$100,25\)/)
  assert.match(m, /Volvé a exportar el reporte RPT_Vencimientos completo desde NUVIX\.$/)
})

caso('a vencer se nombra "A vencer"', () => {
  const m = mensajeDesbalance([{ campo: 'a_vencer', sumaSubtotales: 10, totalGeneral: 0, diferencia: 10 }])
  assert.match(m, /A vencer: suma de las cuentas \$10,00/)
})

caso('sin detalle (no hay fila de Total General) igual da un mensaje legible', () => {
  const m = mensajeDesbalance([])
  assert.match(m, /No se encontró el Total General/)
})

console.log(`\n${casos} casos ok`)
