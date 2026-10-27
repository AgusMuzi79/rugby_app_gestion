// Verificación autocontenida de busquedaSocios.ts (no hay runner de tests en el repo).
//   npx --yes tsx web/lib/busquedaSocios.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import {
  coincideBusqueda,
  filtrarDeudas,
  mensajeVacioDeudas,
  resumenDeudaNuvix,
  nombresSocio,
} from './busquedaSocios'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const garcia = { nombre: 'GARCÍA, JUAN PABLO', nombreApp: 'Juampi', dni: '30111222', numero_socio: '16823' }

caso('busca por nombre del padrón sin importar tildes ni mayúsculas', () => {
  assert.equal(coincideBusqueda('garcia', garcia), true)
  assert.equal(coincideBusqueda('García', garcia), true)
})

caso('busca por el nombre que el socio puso en la app', () => {
  assert.equal(coincideBusqueda('juampi', garcia), true)
})

caso('las palabras pueden venir en cualquier orden', () => {
  assert.equal(coincideBusqueda('juan garcia', garcia), true)
  assert.equal(coincideBusqueda('juan perez', garcia), false)
})

caso('busca por DNI y por Nº de socio', () => {
  assert.equal(coincideBusqueda('30111', garcia), true)
  assert.equal(coincideBusqueda('16823', garcia), true)
})

caso('búsqueda vacía coincide con todos', () => {
  assert.equal(coincideBusqueda('   ', garcia), true)
})

caso('nombresSocio: el nombre del padrón manda y el de la app queda aparte', () => {
  assert.deepEqual(nombresSocio('GARCÍA, JUAN', { nombre: 'Juampi' }), { nombre: 'GARCÍA, JUAN', nombreApp: 'Juampi' })
  assert.deepEqual(nombresSocio(null, { nombre: 'Juampi' }), { nombre: 'Juampi', nombreApp: 'Juampi' })
  assert.deepEqual(nombresSocio('  ', null), { nombre: '—', nombreApp: '' })
})

const deudas = [
  { ...garcia, semaforo: 'verde' as const, serviciosOpcionales: ['Rugby'] },
  { nombre: 'LÓPEZ, ANA', nombreApp: '', dni: '1', numero_socio: '200', semaforo: 'rojo' as const, serviciosOpcionales: ['Hockey'] },
]

caso('sin búsqueda, el filtro de semáforo se aplica', () => {
  const r = filtrarDeudas(deudas, { filtro: 'rojo', filtroServicio: 'todos', busqueda: '' })
  assert.deepEqual(r.map(s => s.numero_socio), ['200'])
})

caso('con búsqueda, el filtro de semáforo se ignora (el socio que pagó y pasó a verde aparece)', () => {
  const r = filtrarDeudas(deudas, { filtro: 'rojo', filtroServicio: 'todos', busqueda: 'garcia' })
  assert.deepEqual(r.map(s => s.numero_socio), ['16823'])
})

caso('el filtro de servicio se sigue aplicando con búsqueda', () => {
  const r = filtrarDeudas(deudas, { filtro: 'todos', filtroServicio: 'Hockey', busqueda: 'garcia' })
  assert.equal(r.length, 0)
})

caso('el vacío nombra el filtro activo', () => {
  assert.equal(mensajeVacioDeudas({ filtro: 'rojo', filtroServicio: 'todos', busqueda: '' }), 'NO HAY SOCIOS EN ROJO')
  assert.equal(mensajeVacioDeudas({ filtro: 'todos', filtroServicio: 'todos', busqueda: '' }), 'NO HAY SOCIOS CON DATOS DE DEUDA')
  assert.equal(
    mensajeVacioDeudas({ filtro: 'amarillo', filtroServicio: 'Rugby', busqueda: '' }),
    'NO HAY SOCIOS EN AMARILLO CON RUGBY',
  )
  assert.equal(
    mensajeVacioDeudas({ filtro: 'rojo', filtroServicio: 'todos', busqueda: 'xx' }),
    'NINGÚN SOCIO CON ESE NOMBRE, DNI O Nº (SE BUSCÓ EN TODOS LOS COLORES)',
  )
  assert.equal(
    mensajeVacioDeudas({ filtro: 'rojo', filtroServicio: 'Rugby', busqueda: 'xx' }),
    'NINGÚN SOCIO CON ESE NOMBRE, DNI O Nº CON RUGBY (SE BUSCÓ EN TODOS LOS COLORES)',
  )
})

caso('resumen de deuda NUVIX con semáforo', () => {
  assert.equal(
    resumenDeudaNuvix({ semaforo: 'rojo', deuda_vencida: 15000, meses_impagos: 2 }, '2026-10-25'),
    'Rojo · $15.000,00 vencido · 2 meses impagos · reporte del 25/10/2026',
  )
  assert.equal(
    resumenDeudaNuvix({ semaforo: 'verde', deuda_vencida: 0, meses_impagos: 1 }, null),
    'Verde · $0,00 vencido · 1 mes impago',
  )
})

caso('sin semáforo no inventa un "al día"', () => {
  assert.equal(
    resumenDeudaNuvix({ semaforo: null, deuda_vencida: 0, meses_impagos: 0 }, '2026-10-25'),
    'Sin dato en el último reporte de NUVIX',
  )
})

console.log(`\n${casos} casos ok`)
