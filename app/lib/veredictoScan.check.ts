// Verificación autocontenida de veredictoScan.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/veredictoScan.check.ts

import assert from 'node:assert/strict'
import { resultadoErrorRed, tituloVeredicto, veredicto, motivoVeredicto, type ScanResult } from './veredictoScan'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const alDia: ScanResult = { valido: true, estado: 'activo', semaforo: 'verde', nombre: 'Ana' }

caso('al día → PUEDE PASAR', () => {
  assert.equal(veredicto(alDia), 'pasa')
  assert.equal(tituloVeredicto(alDia), 'PUEDE PASAR')
})

caso('moroso pasa, pero con aviso (antes: rojo como un rechazo)', () => {
  const r: ScanResult = { ...alDia, semaforo: 'rojo' }
  assert.equal(veredicto(r), 'pasa_aviso')
  assert.equal(tituloVeredicto(r), 'PASA · CON AVISO')
  assert.match(motivoVeredicto(r)!, /Secretaría/)
})

caso('sin reserva en modo informativo pasa con aviso', () => {
  const r: ScanResult = { ...alDia, turno: { modo: 'informativo', estado: 'sin_reserva', franja: null, reserva_id: null, ocupados: null, capacidad: null, bloquear: false, mensaje: 'No reservaste este horario' } }
  assert.equal(veredicto(r), 'pasa_aviso')
  assert.equal(motivoVeredicto(r), 'No reservaste este horario')
})

caso('inactivo nunca pasa aunque una function vieja diga valido:true', () => {
  assert.equal(veredicto({ ...alDia, estado: 'inactivo' }), 'no_pasa')
})

caso('sin servicio → NO PUEDE PASAR con el motivo del server (no "QR NO VÁLIDO")', () => {
  const r: ScanResult = { valido: false, motivo: 'No tenés el servicio de Gimnasio contratado. Consultá con Secretaría.' }
  assert.equal(veredicto(r), 'no_pasa')
  assert.equal(tituloVeredicto(r), 'NO PUEDE PASAR')
  assert.equal(motivoVeredicto(r), r.motivo)
})

caso('"QR NO VÁLIDO" sólo para código inválido o formato', () => {
  assert.equal(tituloVeredicto({ valido: false, motivo: 'Código QR inválido o expirado' }), 'QR NO VÁLIDO')
  assert.equal(tituloVeredicto({ valido: false, motivo: 'Formato de QR no reconocido' }), 'QR NO VÁLIDO')
})

caso('error de red → SIN CONEXIÓN; 401 → sesión vencida', () => {
  const red = resultadoErrorRed(undefined)
  assert.equal(veredicto(red), 'sin_conexion')
  assert.equal(tituloVeredicto(red), 'SIN CONEXIÓN')
  assert.match(red.motivo!, /sin conexión/)
  assert.match(resultadoErrorRed(401).motivo!, /sesión de esta tablet venció/)
  assert.match(resultadoErrorRed(500).motivo!, /No se pudo verificar/)
})

console.log(`\n${casos} casos ok`)
