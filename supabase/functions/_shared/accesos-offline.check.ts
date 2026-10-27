// Verificación autocontenida de accesos-offline.ts (no hay runner de tests en el repo).
//   npx --yes tsx supabase/functions/_shared/accesos-offline.check.ts

import assert from 'node:assert/strict'
import { MAX_LOTE_OFFLINE, leerItemOffline, leerLoteOffline } from './accesos-offline.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const ahora = Date.UTC(2026, 9, 27, 15, 0, 0)
const haceUnaHora = new Date(ahora - 60 * 60 * 1000).toISOString()
const DIA = 24 * 60 * 60 * 1000

caso('un QR encolado se lee con su número de socio, código y hora', () => {
  const r = leerItemOffline({ id_cola: 'mh1-abc123', escaneado_en: haceUnaHora, tipo: 'qr', qr: '1234:045123' }, ahora)
  assert.deepEqual(r, { ok: true, item: { id_cola: 'mh1-abc123', escaneado_en: haceUnaHora, instante: ahora - 60 * 60 * 1000, tipo: 'qr', numero_socio: '1234', code: '045123' } })
})

caso('un DNI encolado se normaliza (sólo dígitos)', () => {
  const r = leerItemOffline({ id_cola: 'x1', escaneado_en: haceUnaHora, tipo: 'dni', dni: '30.123.456' }, ahora)
  assert.equal(r.ok && r.item.tipo === 'dni' && r.item.dni, '30123456')
})

caso('una hora en el futuro se rechaza (más allá de 5 minutos de desfase de reloj)', () => {
  const futuro = new Date(ahora + 10 * 60 * 1000).toISOString()
  const r = leerItemOffline({ id_cola: 'x2', escaneado_en: futuro, tipo: 'dni', dni: '30123456' }, ahora)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /futuro/)
  const casiAhora = new Date(ahora + 2 * 60 * 1000).toISOString()
  assert.equal(leerItemOffline({ id_cola: 'x3', escaneado_en: casiAhora, tipo: 'dni', dni: '30123456' }, ahora).ok, true)
})

caso('un escaneo de hace más de 7 días se rechaza; de 6 días, no', () => {
  const viejo = new Date(ahora - 8 * DIA).toISOString()
  const r = leerItemOffline({ id_cola: 'x4', escaneado_en: viejo, tipo: 'dni', dni: '30123456' }, ahora)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /7 días/)
  const seisDias = new Date(ahora - 6 * DIA).toISOString()
  assert.equal(leerItemOffline({ id_cola: 'x5', escaneado_en: seisDias, tipo: 'dni', dni: '30123456' }, ahora).ok, true)
})

caso('formas inválidas: sin id, id raro, fecha ilegible, QR mal formado, DNI vacío, tipo desconocido', () => {
  const base = { escaneado_en: haceUnaHora }
  assert.equal(leerItemOffline({ ...base, tipo: 'dni', dni: '30123456' }, ahora).ok, false)
  assert.equal(leerItemOffline({ ...base, id_cola: 'con espacios', tipo: 'dni', dni: '30123456' }, ahora).ok, false)
  assert.equal(leerItemOffline({ ...base, id_cola: 'a'.repeat(65), tipo: 'dni', dni: '30123456' }, ahora).ok, false)
  assert.equal(leerItemOffline({ id_cola: 'x6', escaneado_en: 'ayer', tipo: 'dni', dni: '30123456' }, ahora).ok, false)
  assert.equal(leerItemOffline({ ...base, id_cola: 'x7', tipo: 'qr', qr: '1234:12' }, ahora).ok, false)
  assert.equal(leerItemOffline({ ...base, id_cola: 'x8', tipo: 'dni', dni: 'abc' }, ahora).ok, false)
  assert.equal(leerItemOffline({ ...base, id_cola: 'x9', tipo: 'otro' }, ahora).ok, false)
  assert.equal(leerItemOffline(null, ahora).ok, false)
})

caso('un ítem inválido igual devuelve su id (para que la tablet lo saque de la cola)', () => {
  const r = leerItemOffline({ id_cola: 'x10', escaneado_en: 'ayer', tipo: 'dni', dni: '1' }, ahora)
  assert.equal(!r.ok && r.id_cola, 'x10')
})

caso('el lote tiene que ser una lista de 1 a MAX_LOTE_OFFLINE ítems', () => {
  assert.equal(leerLoteOffline([{}]).ok, true)
  assert.equal(leerLoteOffline([]).ok, false)
  assert.equal(leerLoteOffline('x').ok, false)
  assert.equal(leerLoteOffline(Array.from({ length: MAX_LOTE_OFFLINE + 1 }, () => ({}))).ok, false)
})

console.log(`\n${casos} casos ok`)
