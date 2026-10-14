// Verificación autocontenida de solicitudBaja.ts (no hay runner de tests en app/).
//   npx tsx app/lib/solicitudBaja.check.ts
// Sale con código distinto de 0 si algo falla.
// Las fechas se arman en hora local (new Date(y, m, d, h)) para que el
// resultado no dependa de la zona horaria de la máquina.

import assert from 'node:assert/strict'
import {
  esSolicitudDuplicada,
  fechaDiaMes,
  mensajeConfirmacionBaja,
  vistaSolicitudBaja,
} from './solicitudBaja'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).toISOString()

// ─── Copy de la confirmación ──────────────────────────────────────────────────

caso('confirmación: con registro de socio pide la baja como socio', () => {
  assert.equal(
    mensajeConfirmacionBaja(true),
    'Se le pide a Secretaría que te dé de baja como socio y se elimina tu acceso a la app. Secretaría te contacta para confirmarlo.',
  )
})

caso('confirmación: sin registro de socio (familiar/tutor) pide eliminar la cuenta', () => {
  assert.equal(
    mensajeConfirmacionBaja(false),
    'Se le pide a Secretaría que elimine tu cuenta y tu acceso a la app. Secretaría te contacta para confirmarlo.',
  )
})

// ─── Fecha dd/mm ──────────────────────────────────────────────────────────────

caso('fecha: dd/mm con ceros a la izquierda', () => {
  assert.equal(fechaDiaMes(local(2026, 3, 5, 10)), '05/03')
  assert.equal(fechaDiaMes(local(2026, 12, 31, 23)), '31/12')
})

caso('fecha: inválida → cadena vacía', () => {
  assert.equal(fechaDiaMes('no-es-fecha'), '')
})

// ─── Qué muestra la fila ──────────────────────────────────────────────────────

caso('vista: sin solicitud → botón', () => {
  assert.deepEqual(vistaSolicitudBaja(null), { mostrarBoton: true, texto: null })
})

caso('vista: pendiente → "Baja solicitada el dd/mm", sin botón', () => {
  assert.deepEqual(
    vistaSolicitudBaja({ estado: 'pendiente', created_at: local(2026, 10, 13, 9), procesada_at: null }),
    { mostrarBoton: false, texto: 'Baja solicitada el 13/10' },
  )
})

caso('vista: procesada → "Baja procesada el dd/mm", sin botón', () => {
  assert.deepEqual(
    vistaSolicitudBaja({ estado: 'procesada', created_at: local(2026, 10, 1), procesada_at: local(2026, 10, 4, 12) }),
    { mostrarBoton: false, texto: 'Baja procesada el 04/10' },
  )
})

caso('vista: procesada sin fecha de proceso → usa la de la solicitud', () => {
  assert.deepEqual(
    vistaSolicitudBaja({ estado: 'procesada', created_at: local(2026, 10, 1), procesada_at: null }),
    { mostrarBoton: false, texto: 'Baja procesada el 01/10' },
  )
})

caso('vista: rechazada → vuelve el botón', () => {
  assert.deepEqual(
    vistaSolicitudBaja({ estado: 'rechazada', created_at: local(2026, 10, 1), procesada_at: local(2026, 10, 2) }),
    { mostrarBoton: true, texto: null },
  )
})

// ─── Duplicado (índice único de una pendiente por perfil) ────────────────────

caso('duplicado: violación de unique (23505) → ya había una pendiente', () => {
  assert.equal(esSolicitudDuplicada({ code: '23505' }), true)
  assert.equal(esSolicitudDuplicada({ code: '42501' }), false)
  assert.equal(esSolicitudDuplicada(null), false)
})

console.log(`\n${casos} casos OK`)
