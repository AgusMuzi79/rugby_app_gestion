// Verificación autocontenida de carnetOffline.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/carnetOffline.check.ts

import assert from 'node:assert/strict'
import { carnetLocal, claveCacheCarnet, etiquetaSinConexion, parsearCache, serializarCache, trasFalloDeRed, type CarnetBase } from './carnetOffline'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// RFC 4226 (apéndice D): secreto "12345678901234567890" en base32.
const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

const base: CarnetBase = {
  numero_socio: '16823',
  nombre:       'Ana Pérez',
  estado:       'activo',
  semaforo:     'verde',
  categoria:    'Activo',
  fotoUrl:      null,
  roles:        ['socio'],
  division:     null,
  deporte:      null,
}

caso('con datos y secreto guardados, el código se genera sin red y rota cada minuto', () => {
  const minuto0 = carnetLocal(base, SECRETO_RFC, 59_000)!
  const minuto1 = carnetLocal(base, SECRETO_RFC, 60_000)!
  assert.equal(minuto0.code, '755224') // HOTP contador 0 (RFC 4226)
  assert.equal(minuto1.code, '287082') // contador 1: el minuto siguiente
  assert.equal(minuto1.qrContent, '16823:287082')
  assert.equal(minuto1.estado, 'activo')
})

caso('sin datos o sin secreto no hay carnet local', () => {
  assert.equal(carnetLocal(null, SECRETO_RFC, 0), null)
  assert.equal(carnetLocal(base, null, 0), null)
})

caso('una falla de red con un carnet en pantalla avisa; nunca lo reemplaza por un error', () => {
  assert.equal(trasFalloDeRed(true), 'aviso')
  assert.equal(trasFalloDeRed(false), 'error')
})

caso('"Sin conexión · estado al HH:MM" (con fecha si no es de hoy)', () => {
  const guardado = new Date(2026, 9, 27, 9, 5).getTime()
  assert.equal(etiquetaSinConexion(guardado, new Date(2026, 9, 27, 18, 0).getTime()), 'Sin conexión · estado al 09:05')
  assert.equal(etiquetaSinConexion(guardado, new Date(2026, 9, 29, 8, 0).getTime()), 'Sin conexión · estado al 27/10 09:05')
})

caso('la caché ida y vuelta conserva los datos y la hora', () => {
  const leida = parsearCache(serializarCache(base, 1234))
  assert.deepEqual(leida, { base, guardadoEn: 1234 })
})

caso('caché vacía, rota o de otra forma → null (se ignora)', () => {
  assert.equal(parsearCache(null), null)
  assert.equal(parsearCache('{no es json'), null)
  assert.equal(parsearCache(JSON.stringify({ base: { nombre: 'x' }, guardadoEn: 1 })), null)
  assert.equal(parsearCache(JSON.stringify({ base, guardadoEn: 'ayer' })), null)
})

caso('clave por usuario y por carnet mirado (propio o de un menor)', () => {
  assert.equal(claveCacheCarnet('u1'), 'carnet_cache_u1')
  assert.equal(claveCacheCarnet('u1', 's9'), 'carnet_cache_u1_s9')
  assert.notEqual(claveCacheCarnet('u1'), claveCacheCarnet('u2'))
})

console.log(`\n${casos} casos ok`)
