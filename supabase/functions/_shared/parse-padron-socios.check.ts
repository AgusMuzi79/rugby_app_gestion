// Verificación autocontenida de parse-padron-socios.ts (Padrón Extendido de NUVIX);
// no hay runner de tests en el repo. Desde la raíz:
//   npx --yes tsx supabase/functions/_shared/parse-padron-socios.check.ts
// Sale con código distinto de 0 si algo falla. Fixture sintético (sin datos reales).

import assert from 'node:assert/strict'
import { parsePadronSocios, parseSexo } from './parse-padron-socios.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HEADER = ['Cód. Cliente', 'Razón Social', 'Estado', 'Categoría', 'Número Documento', 'Mail1', 'FechaNacimiento', 'Edad', 'Socio Cabecera', 'Vendedor', 'Sexo']

function fila(cod: string, sexo: unknown): unknown[] {
  return [cod, `PERSONA ${cod}`, 'SOCIO', 'ACTIVO MAYOR', `3000000${cod}`, '', '1/2/90', '36', '', 'CLUB', sexo]
}

caso('parseSexo normaliza M/F y descarta el resto', () => {
  assert.equal(parseSexo('M'), 'M')
  assert.equal(parseSexo('F'), 'F')
  assert.equal(parseSexo(' f '), 'F')
  assert.equal(parseSexo('m'), 'M')
  assert.equal(parseSexo(''), null)
  assert.equal(parseSexo(null), null)
  assert.equal(parseSexo(undefined), null)
  assert.equal(parseSexo('X'), null)
  assert.equal(parseSexo('Masculino'), null)
})

caso('parsePadronSocios expone sexo por fila', () => {
  const out = parsePadronSocios([HEADER, fila('1', 'M'), fila('2', 'F'), fila('3', 'f'), fila('4', ''), fila('5', '??')])
  assert.deepEqual(out.map(s => [s.numeroSocio, s.sexo]), [['1', 'M'], ['2', 'F'], ['3', 'F'], ['4', null], ['5', null]])
})

caso('sin columna Sexo → sexo null (no rompe el resto)', () => {
  const out = parsePadronSocios([HEADER.slice(0, -1), fila('1', 'M').slice(0, -1)])
  assert.equal(out.length, 1)
  assert.equal(out[0].sexo, null)
  assert.equal(out[0].dni, '30000001')
})

console.log(`\n${casos} casos OK`)
