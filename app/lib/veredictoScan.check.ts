// Verificación autocontenida de veredictoScan.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/veredictoScan.check.ts

import assert from 'node:assert/strict'
import { anuncioVeredicto, cortadoTrasResultado, resolverReintento, resultadoErrorRed, tituloVeredicto, veredicto, motivoVeredicto, type EscaneoCortado, type ScanResult } from './veredictoScan'

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

caso('reintento del mismo QR tras un timeout: el ingreso ya quedó registrado → pasa con aviso', () => {
  const yaUsado: ScanResult = { valido: false, codigo_ya_usado: true, motivo: 'Este código ya se usó.' }
  const ahora = 1_000_000
  const r = resolverReintento(yaUsado, '123:456789', { raw: '123:456789', en: ahora - 30_000 }, ahora)
  assert.equal(veredicto(r), 'pasa_aviso')
  assert.match(motivoVeredicto(r)!, /ya quedó registrado/)
})

caso('"ya se usó" sin timeout previo de esta tablet (captura reenviada) sigue sin pasar', () => {
  const yaUsado: ScanResult = { valido: false, codigo_ya_usado: true, motivo: 'Este código ya se usó.' }
  const ahora = 1_000_000
  assert.equal(veredicto(resolverReintento(yaUsado, '123:456789', null, ahora)), 'no_pasa')
  assert.equal(veredicto(resolverReintento(yaUsado, '123:456789', { raw: '999:111111', en: ahora }, ahora)), 'no_pasa')
  assert.equal(veredicto(resolverReintento(yaUsado, '123:456789', { raw: '123:456789', en: ahora - 400_000 }, ahora)), 'no_pasa')
})

caso('el escaneo cortado sirve para UN reintento: la siguiente reutilización del mismo QR no pasa', () => {
  const yaUsado: ScanResult = { valido: false, codigo_ya_usado: true, motivo: 'Este código ya se usó.' }
  const ahora = 1_000_000
  let cortado: EscaneoCortado | null = { raw: '123:456789', en: ahora - 10_000 }
  const primero = resolverReintento(yaUsado, '123:456789', cortado, ahora)
  cortado = cortadoTrasResultado(primero, cortado)
  assert.equal(veredicto(primero), 'pasa_aviso')
  const segundo = resolverReintento(yaUsado, '123:456789', cortado, ahora + 5_000)
  assert.equal(veredicto(segundo), 'no_pasa')
})

caso('anuncio para lector de pantalla: veredicto, nombre y motivo en una frase', () => {
  assert.equal(anuncioVeredicto(alDia), 'PUEDE PASAR. Ana')
  assert.equal(anuncioVeredicto({ ...alDia, semaforo: 'rojo' }), 'PASA · CON AVISO. Ana. Cuota atrasada: avisale que pase por Secretaría.')
  assert.equal(anuncioVeredicto({ valido: false, motivo: 'Código QR inválido o expirado' }), 'QR NO VÁLIDO. Código QR inválido o expirado')
})

console.log(`\n${casos} casos ok`)
