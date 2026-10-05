// Verificación autocontenida de parse-padron-servicios.ts (importador del Padrón de
// Servicios de NUVIX); no hay runner de tests en el repo ni Deno local. Desde la raíz:
//   npx --yes tsx supabase/functions/_shared/parse-padron-servicios.check.ts
// Sale con código distinto de 0 si algo falla. El fixture es sintético (sin datos reales):
// imita la forma del reporte Crystal Reports con bandas "Servicio:" / "Frecuencia:" / "Casos:".

import assert from 'node:assert/strict'
import {
  parsePadronServicios,
  calcularDiffServicios,
  omitirBajas,
  normalizarConcepto,
  claveVinculo,
  SERVICIOS_MAPEADOS,
  type SocioRef,
  type VinculoActual,
  type DiffServicios,
} from './parse-padron-servicios.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

// Encabezado como lo devuelve sheet_to_json con raw:true (fecha como serial numérico)
// — no debe contarse como fila de socio aunque la columna 0 sea un número.
function encabezado(): unknown[][] {
  return [
    ['', '', '', '', ''],
    [46295, 0.43, 'Página ', 1, 1],
    ['CLUB UNCAS', '', '', '', ''],
    ['', 'Padrón de Servicios por Socio/Frecuencia', '', '', ''],
    ['Código', 'Razón Social', '', '', ''],
    ['', '', '', '', ''],
  ]
}

function banda(concepto: string, socios: [string | number, string][]): unknown[][] {
  return [
    ['Servicio:', concepto, '', '', ''],
    ['', '', '', '', ''],
    ['Frecuencia:', '01 - MENSUAL', '', '', ''],
    ...socios.map(([cod, nombre]) => [cod, nombre, '', '', '']),
    ['Casos:', String(socios.length), '', '', ''],
    ['', '', '', '', ''],
  ]
}

const ROWS: unknown[][] = [
  ...encabezado(),
  ...banda('CUOTA ACTIVO MAYOR', [['100', 'PEREZ JUAN'], ['101', 'GOMEZ ANA']]),
  ...banda('GYM Mayor', [['100', 'PEREZ JUAN'], [102, 'LOPEZ LUIS'], ['105', 'DIAZ EVA']]),
  ...banda('GYM  menor ', [['103', 'RUIZ SOL'], ['105', 'DIAZ EVA']]),
  ...banda('GYM Becado', [['104', 'SOSA LIA']]),
  ...banda('RUGBY CUOTA DEPORTIVA', [['100', 'PEREZ JUAN'], ['100', 'PEREZ JUAN'], ['999', 'NADIE NN']]),
  ...banda('HOCKEY CUOTA DEPORTIVA', [['101', 'GOMEZ ANA']]),
  ...banda('PADEL NUEVO', [['101', 'GOMEZ ANA']]),
  ...banda('CLIENTE GYM', [['106', 'VEGA TOM']]),
]

const SOCIOS = new Map<string, SocioRef>([
  ['100', { id: 's100', nombre: 'Juan Pérez',  excluirDeImport: false }],
  ['101', { id: 's101', nombre: 'Ana Gómez',   excluirDeImport: false }],
  ['102', { id: 's102', nombre: 'Luis López',  excluirDeImport: false }],
  ['103', { id: 's103', nombre: 'Sol Ruiz',    excluirDeImport: false }],
  ['104', { id: 's104', nombre: 'Lía Sosa',    excluirDeImport: false }],
  ['105', { id: 's105', nombre: 'Eva Díaz',    excluirDeImport: false }],
  ['106', { id: 's106', nombre: 'Tom Vega',    excluirDeImport: false }],
  ['107', { id: 's107', nombre: 'Leo Paz',     excluirDeImport: false }],
  ['108', { id: 's108', nombre: 'Demo',        excluirDeImport: true  }],
])

const PRECIOS = new Map<string, number>([
  ['Gimnasio', 25000], ['Gimnasio Menor', 18750], ['Gimnasio Becado', 0],
  ['Rugby', 25000], ['Hockey', 31250], ['Carnet Tenis', 60000],
  ['Rugby Inclusivo', 18750], ['Hockey Inclusivo', 18750],
])

const VINCULOS: VinculoActual[] = [
  // sin cambio
  { id: 'v1', numeroSocio: '100', servicio: 'Gimnasio', importe: 25000, varianteNuvix: 'GYM Mayor' },
  // importe viejo → actualizar
  { id: 'v2', numeroSocio: '100', servicio: 'Rugby', importe: 20000, varianteNuvix: 'RUGBY CUOTA DEPORTIVA' },
  // manual (sin variante) de un socio que no está en el padrón para ese servicio → baja
  { id: 'v3', numeroSocio: '107', servicio: 'Gimnasio', importe: null, varianteNuvix: null },
  // de NUVIX que ya no figura → baja
  { id: 'v4', numeroSocio: '101', servicio: 'Rugby', importe: 25000, varianteNuvix: 'RUGBY CUOTA DEPORTIVA' },
  // servicio no mapeado → nunca se toca
  { id: 'v5', numeroSocio: '107', servicio: 'Tenis', importe: 1000, varianteNuvix: null },
  // socio excluido del import → nunca se toca
  { id: 'v6', numeroSocio: '108', servicio: 'Hockey', importe: 31250, varianteNuvix: null },
  // socio en conflicto (GYM Mayor + GYM Menor) → no se toca aunque difiera
  { id: 'v7', numeroSocio: '105', servicio: 'Gimnasio', importe: 1, varianteNuvix: 'GYM Mayor' },
  // manual sin variante de un socio que SÍ figura → se actualiza la variante/importe
  { id: 'v8', numeroSocio: '101', servicio: 'Hockey', importe: 31250, varianteNuvix: null },
]

function diffBase(): DiffServicios {
  return calcularDiffServicios({
    padron: parsePadronServicios(ROWS),
    socios: SOCIOS,
    precios: PRECIOS,
    vinculos: VINCULOS,
  })
}

const claves = (xs: { numeroSocio: string; servicio: string }[]) =>
  xs.map((x) => claveVinculo(x.numeroSocio, x.servicio)).sort()

// ─── Parser ───────────────────────────────────────────────────────────────────

caso('normaliza mayúsculas, espacios y tildes del concepto', () => {
  assert.equal(normalizarConcepto('  GYM  menor '), 'GYM MENOR')
  assert.equal(normalizarConcepto('Gym Alícuota'), 'GYM ALICUOTA')
})

caso('parsea bandas, ignora encabezado, frecuencia, casos y duplica una sola vez', () => {
  const p = parsePadronServicios(ROWS)
  assert.deepEqual(p.conceptos, [
    'CUOTA ACTIVO MAYOR', 'GYM Mayor', 'GYM  menor ', 'GYM Becado', 'RUGBY CUOTA DEPORTIVA',
    'HOCKEY CUOTA DEPORTIVA', 'PADEL NUEVO', 'CLIENTE GYM',
  ].map((c) => c.trim()))
  // 2 + 3 + 2 + 1 + 2 (100 duplicado se cuenta una vez) + 1 + 1 + 1
  assert.equal(p.filas.length, 13)
  assert.ok(!p.filas.some((f) => f.numeroSocio === '46295'), 'el serial de fecha no es un socio')
  const lopez = p.filas.find((f) => f.numeroSocio === '102')
  assert.deepEqual(lopez, { numeroSocio: '102', nombre: 'LOPEZ LUIS', concepto: 'GYM Mayor' })
})

caso('un archivo sin bandas devuelve cero filas y cero conceptos', () => {
  const p = parsePadronServicios([['Código', 'Nombre'], ['100', 'PEREZ JUAN']])
  assert.equal(p.filas.length, 0)
  assert.equal(p.conceptos.length, 0)
})

caso('los servicios mapeados son exactamente los seis del catálogo', () => {
  assert.deepEqual([...SERVICIOS_MAPEADOS].sort(),
    ['Carnet Tenis', 'Gimnasio', 'Hockey', 'Hockey Inclusivo', 'Rugby', 'Rugby Inclusivo'])
})

// ─── Diff ─────────────────────────────────────────────────────────────────────

caso('agrega lo que falta con el precio del catálogo de la variante', () => {
  const d = diffBase()
  assert.deepEqual(claves(d.agregados), ['102|Gimnasio', '103|Gimnasio', '104|Gimnasio'])
  const ruiz = d.agregados.find((a) => a.numeroSocio === '103')!
  assert.equal(ruiz.importe, 18750)
  assert.equal(ruiz.varianteNuvix, 'GYM  menor '.trim())
  assert.equal(ruiz.socioId, 's103')
  assert.equal(d.agregados.find((a) => a.numeroSocio === '104')!.importe, 0)
})

caso('actualiza importe o variante distintos, incluso filas manuales sin variante', () => {
  const d = diffBase()
  assert.deepEqual(claves(d.actualizados), ['100|Rugby', '101|Hockey'])
  const rugby = d.actualizados.find((a) => a.vinculoId === 'v2')!
  assert.equal(rugby.importeAnterior, 20000)
  assert.equal(rugby.importe, 25000)
  const hockey = d.actualizados.find((a) => a.vinculoId === 'v8')!
  assert.equal(hockey.varianteAnterior, null)
  assert.equal(hockey.varianteNuvix, 'HOCKEY CUOTA DEPORTIVA')
})

caso('elimina vínculos mapeados ausentes del padrón, incluidos los manuales', () => {
  const d = diffBase()
  assert.deepEqual(d.eliminados.map((e) => e.vinculoId).sort(), ['v3', 'v4'])
  const manual = d.eliminados.find((e) => e.vinculoId === 'v3')!
  assert.equal(manual.nombre, 'Leo Paz')
  assert.equal(manual.varianteNuvix, null)
})

caso('nunca toca servicios no mapeados ni socios excluidos', () => {
  const d = diffBase()
  const tocados = [...d.actualizados.map((a) => a.vinculoId), ...d.eliminados.map((e) => e.vinculoId)]
  assert.ok(!tocados.includes('v5'))
  assert.ok(!tocados.includes('v6'))
})

caso('socio en dos variantes del mismo servicio es conflicto y no se toca', () => {
  const d = diffBase()
  assert.equal(d.conflictos.length, 1)
  assert.equal(d.conflictos[0].numeroSocio, '105')
  assert.equal(d.conflictos[0].servicio, 'Gimnasio')
  assert.deepEqual(d.conflictos[0].conceptos, ['GYM Mayor', 'GYM  menor '.trim()])
  const tocados = [...d.agregados, ...d.actualizados, ...d.eliminados].map((x) => x.numeroSocio)
  assert.ok(!tocados.includes('105'))
})

caso('reporta socios sin match y conceptos desconocidos', () => {
  const d = diffBase()
  assert.deepEqual(d.sinMatch, [{ numeroSocio: '999', nombre: 'NADIE NN', conceptos: ['RUGBY CUOTA DEPORTIVA'] }])
  assert.deepEqual(d.conceptosDesconocidos, [{ concepto: 'PADEL NUEVO', casos: 1 }])
})

caso('cuenta sin cambio', () => {
  assert.equal(diffBase().sinCambio, 1)
})

caso('falta de precio en el catálogo es error y no se aplica', () => {
  const precios = new Map(PRECIOS)
  precios.delete('Gimnasio Becado')
  const d = calcularDiffServicios({ padron: parsePadronServicios(ROWS), socios: SOCIOS, precios, vinculos: VINCULOS })
  assert.ok(!d.agregados.some((a) => a.numeroSocio === '104'))
  assert.equal(d.errores.length, 1)
  assert.equal(d.errores[0].numeroSocio, '104')
  assert.match(d.errores[0].motivo, /Gimnasio Becado/)
})

caso('omitirBajas saca sólo las claves pedidas y cuenta las omitidas', () => {
  const { diff, omitidos } = omitirBajas(diffBase(), new Set(['107|Gimnasio', '1|Nada']))
  assert.equal(omitidos, 1)
  assert.deepEqual(diff.eliminados.map((e) => e.vinculoId), ['v4'])
})

caso('aplicar el diff y recalcular da cero cambios (idempotente)', () => {
  const d = diffBase()
  const porClave = new Map(VINCULOS.map((v) => [claveVinculo(v.numeroSocio, v.servicio), { ...v }]))
  for (const e of d.eliminados) porClave.delete(claveVinculo(e.numeroSocio, e.servicio))
  for (const a of d.actualizados) {
    const v = porClave.get(claveVinculo(a.numeroSocio, a.servicio))!
    v.importe = a.importe
    v.varianteNuvix = a.varianteNuvix
  }
  for (const a of d.agregados) {
    porClave.set(claveVinculo(a.numeroSocio, a.servicio), {
      id: `n-${a.numeroSocio}`, numeroSocio: a.numeroSocio, servicio: a.servicio,
      importe: a.importe, varianteNuvix: a.varianteNuvix,
    })
  }
  const d2 = calcularDiffServicios({
    padron: parsePadronServicios(ROWS), socios: SOCIOS, precios: PRECIOS, vinculos: [...porClave.values()],
  })
  assert.equal(d2.agregados.length, 0)
  assert.equal(d2.actualizados.length, 0)
  assert.equal(d2.eliminados.length, 0)
  assert.equal(d2.sinCambio, 6)
})

caso('importe como texto numérico de PostgREST se compara por valor', () => {
  const vinculos: VinculoActual[] = [
    { id: 'x', numeroSocio: '102', servicio: 'Gimnasio', importe: '25000.00', varianteNuvix: 'GYM Mayor' },
  ]
  const d = calcularDiffServicios({ padron: parsePadronServicios(ROWS), socios: SOCIOS, precios: PRECIOS, vinculos })
  assert.ok(!d.actualizados.some((a) => a.vinculoId === 'x'))
})

console.log(`\n${casos} casos ok`)
