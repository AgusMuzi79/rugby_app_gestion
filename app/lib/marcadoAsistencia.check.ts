// Verificación autocontenida de marcadoAsistencia.ts (no hay runner de tests en app/).
//   npx --yes tsx app/lib/marcadoAsistencia.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { conteoMarcados, marcarTodosPresentes, nombresSinMarcar, textoSinMarcar } from './marcadoAsistencia'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

type J = { id: string; nombre_completo: string; estado: 'presente' | 'ausente' | 'justificado' | null }
const plantel = (n: number): J[] =>
  Array.from({ length: n }, (_, i) => ({ id: `j${i}`, nombre_completo: `Jugador ${i + 1}`, estado: null }))

caso('30 jugadores, 3 ausentes: TODOS PRESENTES + 3 marcas = todos marcados (antes 30 toques)', () => {
  let lista = marcarTodosPresentes(plantel(30))
  lista = lista.map(j => (['j3', 'j7', 'j20'].includes(j.id) ? { ...j, estado: 'ausente' as const } : j))
  assert.deepEqual(conteoMarcados(lista), { marcados: 30, total: 30 })
  assert.equal(lista.filter(j => j.estado === 'ausente').length, 3)
})

caso('TODOS PRESENTES no pisa a los ya marcados ausente o justificado', () => {
  const lista: J[] = [
    { id: 'a', nombre_completo: 'A', estado: 'ausente' },
    { id: 'b', nombre_completo: 'B', estado: 'justificado' },
    { id: 'c', nombre_completo: 'C', estado: null },
  ]
  assert.deepEqual(marcarTodosPresentes(lista).map(j => j.estado), ['ausente', 'justificado', 'presente'])
})

caso('TODOS PRESENTES no muta la lista original', () => {
  const lista = plantel(2)
  marcarTodosPresentes(lista)
  assert.equal(lista[0].estado, null)
})

caso('conteo marcados/total para el botón GUARDAR', () => {
  const lista = plantel(4)
  lista[0].estado = 'presente'
  assert.deepEqual(conteoMarcados(lista), { marcados: 1, total: 4 })
  assert.deepEqual(conteoMarcados([]), { marcados: 0, total: 0 })
})

caso('sin marcar: los nombres, en el orden de la lista', () => {
  const lista = plantel(3)
  lista[1].estado = 'ausente'
  assert.deepEqual(nombresSinMarcar(lista), ['Jugador 1', 'Jugador 3'])
})

caso('aviso al guardar: lista corta completa, larga resumida', () => {
  assert.equal(textoSinMarcar(['Ana']), 'Falta 1 sin marcar: Ana. No se guarda nada para ese jugador.')
  assert.equal(textoSinMarcar(['Ana', 'Beto']), 'Faltan 2 sin marcar: Ana y Beto. No se guarda nada para esos jugadores.')
  assert.equal(
    textoSinMarcar(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    'Faltan 7 sin marcar: A, B, C, D, E y 2 más. No se guarda nada para esos jugadores.',
  )
})

console.log(`\n${casos} casos ok`)
