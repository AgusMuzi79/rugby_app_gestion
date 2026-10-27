// Verificación autocontenida de secretariaNuvix.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/secretariaNuvix.check.ts

import assert from 'node:assert/strict'
import { montoServiciosSocio, montoServicio, textoUltimoReporte } from './secretariaNuvix'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const catalogo = [
  { id: 'gym',   monto_mensual: 20000 },
  { id: 'rugby', monto_mensual: 15000 },
  { id: 'tenis', monto_mensual: 9000 },
]

caso('el importe real del vínculo manda sobre el precio de catálogo', () => {
  const total = montoServiciosSocio(catalogo, [{ servicio_id: 'gym', importe: 18500 }])
  assert.equal(total, 18500)
})

caso('sin importe en el vínculo se usa el precio de catálogo', () => {
  const total = montoServiciosSocio(catalogo, [
    { servicio_id: 'gym', importe: 18500 },
    { servicio_id: 'rugby', importe: null },
  ])
  assert.equal(total, 33500)
})

caso('importe 0 es un importe real (no cae al catálogo)', () => {
  assert.equal(montoServiciosSocio(catalogo, [{ servicio_id: 'tenis', importe: 0 }]), 0)
})

caso('servicios no vinculados no suman; vínculos fuera del catálogo activo tampoco', () => {
  assert.equal(montoServiciosSocio(catalogo, []), 0)
  assert.equal(montoServiciosSocio(catalogo, [{ servicio_id: 'baja', importe: 5000 }]), 0)
})

caso('monto del chip: importe del vínculo o, si no está vinculado, el catálogo', () => {
  assert.equal(montoServicio(catalogo[0], { servicio_id: 'gym', importe: 18500 }), 18500)
  assert.equal(montoServicio(catalogo[0], undefined), 20000)
})

caso('último reporte: fecha de los datos y día en que se importó', () => {
  const t = textoUltimoReporte({ fecha_corte: '2026-10-20', created_at: '2026-10-22T13:05:00Z' })
  assert.equal(t, 'Datos al 20/10/2026 · importado el 22/10/2026')
})

caso('fecha de importación rota o vacía: no rompe la pantalla, sólo omite ese dato', () => {
  assert.equal(textoUltimoReporte({ fecha_corte: '2026-10-20', created_at: 'no-es-fecha' }), 'Datos al 20/10/2026')
  assert.equal(textoUltimoReporte({ fecha_corte: '2026-10-20', created_at: '' }), 'Datos al 20/10/2026')
})

caso('sin reportes importados', () => {
  assert.equal(textoUltimoReporte(null), 'Todavía no se importó ningún reporte de deuda.')
})

console.log(`\n${casos} casos ok`)
