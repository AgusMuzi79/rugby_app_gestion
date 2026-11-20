// Verificación autocontenida de servicio-por-rol.ts (no hay runner de tests).
//   npx --yes tsx@4.20.6 supabase/functions/socios-qr/servicio-por-rol.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { servicioRequeridoPorRol, pasaPorCategoria } from './servicio-por-rol.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

caso('Gimnasio (porteria) exige un servicio con "gimnasio" en el nombre', () => {
  const s = servicioRequeridoPorRol('porteria')
  assert.equal(s?.patron, '%gimnasio%')
  assert.equal(s?.motivo, 'No tenés el servicio de Gimnasio contratado. Consultá con Secretaría.')
  assert.equal(s?.errorConsulta, 'No se pudo verificar el servicio de Gimnasio. Probá de nuevo.')
})

caso('Pileta exige un servicio con "pileta" en el nombre, con mensajes propios', () => {
  const s = servicioRequeridoPorRol('pileta')
  assert.equal(s?.patron, '%pileta%')
  assert.equal(s?.motivo, 'No tenés la temporada de Pileta habilitada. Consultá en Secretaría.')
  assert.equal(s?.errorConsulta, 'No se pudo verificar el servicio de Pileta. Probá de nuevo.')
})

caso('Canchero, Buffet y el staff no exigen servicio', () => {
  for (const rol of ['canchero', 'buffet', 'secretaria', 'admin', 'subcomision']) {
    assert.equal(servicioRequeridoPorRol(rol), null, rol)
  }
})

caso('Cliente Gimnasio pasa el gate del gimnasio sin fila en socio_servicios', () => {
  assert.equal(pasaPorCategoria(servicioRequeridoPorRol('porteria')!, 'Cliente Gimnasio'), true)
})

caso('Cliente Gimnasio NO pasa el gate de la pileta por su categoría', () => {
  assert.equal(pasaPorCategoria(servicioRequeridoPorRol('pileta')!, 'Cliente Gimnasio'), false)
})

caso('una categoría común no pasa ningún gate por sí sola', () => {
  assert.equal(pasaPorCategoria(servicioRequeridoPorRol('porteria')!, 'Activo'), false)
  assert.equal(pasaPorCategoria(servicioRequeridoPorRol('pileta')!, null), false)
})

console.log(`\n${casos} casos ok`)
