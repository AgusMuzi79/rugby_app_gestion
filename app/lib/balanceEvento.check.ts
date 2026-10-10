// Verificación autocontenida de balanceEvento.ts (no hay runner de tests en app/).
//   npx tsx app/lib/balanceEvento.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  balanceDesdeResumen,
  balanceEvento,
  fechaHoyEgreso,
  parseFechaEgreso,
  validarEgreso,
} from './balanceEvento'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Balance ──────────────────────────────────────────────────────────────────

caso('sin cobranzas ni egresos todo da 0', () => {
  assert.deepEqual(balanceEvento([], []), { totalCobrado: 0, totalEgresos: 0, neto: 0 })
})

caso('sólo suma cobranzas pagadas', () => {
  const r = balanceEvento(
    [
      { estado: 'pagado', monto: 2500 },
      { estado: 'pendiente', monto: 2500 },
      { estado: 'pagado', monto: 1000 },
    ],
    [],
  )
  assert.equal(r.totalCobrado, 3500)
  assert.equal(r.neto, 3500)
})

caso('cobranza pagada sin monto cuenta 0', () => {
  assert.equal(balanceEvento([{ estado: 'pagado', monto: null }], []).totalCobrado, 0)
})

caso('neto = cobrado - egresos (puede ser negativo)', () => {
  const r = balanceEvento([{ estado: 'pagado', monto: 1000 }], [{ monto: 1500 }, { monto: 200 }])
  assert.deepEqual(r, { totalCobrado: 1000, totalEgresos: 1700, neto: -700 })
})

caso('montos numeric que llegan como string se suman', () => {
  const r = balanceEvento([{ estado: 'pagado', monto: '1000.50' }], [{ monto: '200.25' }])
  assert.deepEqual(r, { totalCobrado: 1000.5, totalEgresos: 200.25, neto: 800.25 })
})

caso('redondea a centavos (sin ruido de coma flotante)', () => {
  const r = balanceEvento([], [{ monto: 0.1 }, { monto: 0.2 }])
  assert.equal(r.totalEgresos, 0.3)
  assert.equal(r.neto, -0.3)
})

// ─── Resumen del evento completo (RPC resumen_egresos_evento) ─────────────────

caso('balanceDesdeResumen: sin fila (sin acceso o error) → todo 0', () => {
  assert.deepEqual(balanceDesdeResumen(null), { totalCobrado: 0, totalEgresos: 0, neto: 0 })
  assert.deepEqual(balanceDesdeResumen(undefined), { totalCobrado: 0, totalEgresos: 0, neto: 0 })
})

caso('balanceDesdeResumen: neto = cobrado - egresos', () => {
  assert.deepEqual(balanceDesdeResumen({ total_cobrado: 3500, total_egresos: 750.5 }), {
    totalCobrado: 3500, totalEgresos: 750.5, neto: 2749.5,
  })
})

caso('balanceDesdeResumen: numeric como string y neto negativo', () => {
  assert.deepEqual(balanceDesdeResumen({ total_cobrado: '100.10', total_egresos: '200.20' }), {
    totalCobrado: 100.1, totalEgresos: 200.2, neto: -100.1,
  })
})

// ─── Fecha ────────────────────────────────────────────────────────────────────

caso('parseFechaEgreso: DD/MM/AAAA → ISO', () => {
  assert.equal(parseFechaEgreso('9/10/2026'), '2026-10-09')
  assert.equal(parseFechaEgreso(' 09/10/2026 '), '2026-10-09')
})

caso('parseFechaEgreso: ISO se mantiene', () => {
  assert.equal(parseFechaEgreso('2026-10-09'), '2026-10-09')
})

caso('parseFechaEgreso: fechas inválidas → null', () => {
  assert.equal(parseFechaEgreso(''), null)
  assert.equal(parseFechaEgreso('31/02/2026'), null)
  assert.equal(parseFechaEgreso('10/13/2026'), null)
  assert.equal(parseFechaEgreso('ayer'), null)
})

caso('fechaHoyEgreso: ISO local (lo que usa DatePickerField)', () => {
  assert.equal(fechaHoyEgreso(new Date(2026, 9, 9)), '2026-10-09')
})

// ─── Validación del formulario ────────────────────────────────────────────────

caso('validarEgreso: datos válidos', () => {
  assert.deepEqual(validarEgreso({ concepto: '  Micro ', monto: '150.000', fecha: '09/10/2026' }), {
    ok: true,
    valor: { concepto: 'Micro', monto: 150000, fecha: '2026-10-09' },
  })
})

caso('validarEgreso: monto con decimales locales', () => {
  const r = validarEgreso({ concepto: 'Comida', monto: '2.500,50', fecha: '2026-10-09' })
  assert.equal(r.ok && r.valor.monto, 2500.5)
})

caso('validarEgreso: concepto vacío', () => {
  assert.deepEqual(validarEgreso({ concepto: '  ', monto: '100', fecha: '09/10/2026' }), {
    ok: false, error: 'Ingresá el concepto del egreso.',
  })
})

caso('validarEgreso: monto vacío, 0 o inválido', () => {
  for (const monto of ['', '0', 'abc', '-5']) {
    assert.deepEqual(validarEgreso({ concepto: 'Micro', monto, fecha: '09/10/2026' }), {
      ok: false, error: 'Ingresá un monto mayor a 0.',
    })
  }
})

caso('validarEgreso: fecha inválida', () => {
  assert.deepEqual(validarEgreso({ concepto: 'Micro', monto: '100', fecha: '32/01/2026' }), {
    ok: false, error: 'Elegí la fecha del egreso.',
  })
})

console.log(`\n${casos} casos OK`)
