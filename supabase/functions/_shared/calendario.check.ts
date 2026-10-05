// Verificación autocontenida de calendario.ts (validación de `franjas-importar`); no hay runner
// de tests en el repo ni Deno local. Desde la raíz del repo:
//   npx --yes tsx supabase/functions/_shared/calendario.check.ts
// (el parser del lado web se corre con `cd web && npm run test:calendario`).
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { IMPORT_MAX_FILAS, validarImportacion, type ValidacionImportacion } from './calendario.ts'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

const HASH = '0123456789abcdef0123456789abcdef'
const FILA = { dia_semana: 1, hora_desde: '09:00', hora_hasta: '10:00', cupo: 10, profesor: 'Ana' }

function body(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { modo: 'agregar', solo_vista_previa: true, filas: [FILA], ...extra }
}

function rechazado(v: ValidacionImportacion) {
  assert.equal(v.ok, false, 'se esperaba un rechazo')
  if (v.ok) throw new Error('inalcanzable')
  return v
}
function aceptado(v: ValidacionImportacion) {
  if (!v.ok) assert.fail(`se esperaba aceptar, pero: ${JSON.stringify(v)}`)
  return v
}
// Errores de una sola fila inválida, como lista de motivos.
function motivos(fila: unknown): string[] {
  const v = rechazado(validarImportacion(body({ filas: [fila] })))
  assert.equal(v.codigo, 'errores')
  return (v.errores ?? []).map((e) => `${e.fila}:${e.motivo}`)
}

// ─── Filas válidas ────────────────────────────────────────────────────────────

caso('fila válida en vista previa', () => {
  const v = aceptado(validarImportacion(body()))
  assert.equal(v.modo, 'agregar')
  assert.equal(v.soloVistaPrevia, true)
  assert.equal(v.planHash, null)
  assert.deepEqual(v.filas, [FILA])
})

caso('modo reemplazar y varias filas conservan el orden', () => {
  const filas = [FILA, { ...FILA, dia_semana: 2, cupo: 5, profesor: null }, { ...FILA, hora_desde: '10:00', hora_hasta: '11:00' }]
  const v = aceptado(validarImportacion(body({ modo: 'reemplazar', filas })))
  assert.equal(v.modo, 'reemplazar')
  assert.deepEqual(v.filas.map((f) => `${f.dia_semana} ${f.hora_desde}`), ['1 09:00', '2 09:00', '1 10:00'])
})

caso('profesor ausente, null, vacío o en blanco => null; se recorta', () => {
  const sin = { dia_semana: 3, hora_desde: '08:00', hora_hasta: '09:00', cupo: 1 }
  const filas = [sin, { ...sin, profesor: null }, { ...sin, profesor: '' }, { ...sin, profesor: '   ' }, { ...sin, profesor: '  Marta ' }]
  const v = aceptado(validarImportacion(body({ filas })))
  assert.deepEqual(v.filas.map((f) => f.profesor), [null, null, null, null, 'Marta'])
})

caso('profesor de exactamente 80 caracteres se acepta; 81 se rechaza', () => {
  aceptado(validarImportacion(body({ filas: [{ ...FILA, profesor: 'x'.repeat(80) }] })))
  assert.deepEqual(motivos({ ...FILA, profesor: 'x'.repeat(81) }), ['1:El profesor no puede superar 80 caracteres.'])
})

caso('HH:MM:SS (con :00) se recorta a HH:MM', () => {
  const v = aceptado(validarImportacion(body({ filas: [{ ...FILA, hora_desde: '09:00:00', hora_hasta: '10:30:00' }] })))
  assert.equal(v.filas[0].hora_desde, '09:00')
  assert.equal(v.filas[0].hora_hasta, '10:30')
})

caso('los campos que no son del contrato se descartan', () => {
  const v = aceptado(validarImportacion(body({ filas: [{ ...FILA, linea: 7, id: 'x', activa: false, extra: { a: 1 } }] })))
  assert.deepEqual(Object.keys(v.filas[0]).sort(), ['cupo', 'dia_semana', 'hora_desde', 'hora_hasta', 'profesor'])
  assert.deepEqual(v.filas, [FILA])
})

caso('límites válidos: día 1 y 7, cupo 1 y 500, 00:00 a 23:59', () => {
  const filas = [
    { dia_semana: 1, hora_desde: '00:00', hora_hasta: '23:59', cupo: 1 },
    { dia_semana: 7, hora_desde: '06:00', hora_hasta: '07:00', cupo: 500 },
  ]
  assert.equal(aceptado(validarImportacion(body({ filas }))).filas.length, 2)
})

// ─── Campos inválidos de una fila ─────────────────────────────────────────────

caso('día inválido: 0, 8, decimal, texto, null y ausente', () => {
  const m = 'El día debe ser de 1 (lunes) a 7 (domingo).'
  for (const dia of [0, 8, 1.5, '1', null, undefined, NaN]) {
    assert.deepEqual(motivos({ ...FILA, dia_semana: dia }), [`1:${m}`], `dia_semana=${String(dia)}`)
  }
})

caso('hora de inicio inválida: formato, 24:00, minutos, segundos distintos de 00, tipo y ausente', () => {
  const m = 'La hora de inicio debe tener formato HH:MM.'
  for (const h of ['9:00', '24:00', '09:60', '09:00:30', '09-00', 900, null, undefined, '']) {
    assert.deepEqual(motivos({ ...FILA, hora_desde: h }), [`1:${m}`], `hora_desde=${String(h)}`)
  }
})

caso('hora de fin inválida', () => {
  const m = 'La hora de fin debe tener formato HH:MM.'
  for (const h of ['25:00', '10', 1000, null, undefined]) {
    assert.deepEqual(motivos({ ...FILA, hora_hasta: h }), [`1:${m}`], `hora_hasta=${String(h)}`)
  }
})

caso('inicio igual o posterior al fin', () => {
  const m = 'La hora de inicio debe ser anterior a la de fin.'
  assert.deepEqual(motivos({ ...FILA, hora_desde: '10:00', hora_hasta: '10:00' }), [`1:${m}`])
  assert.deepEqual(motivos({ ...FILA, hora_desde: '11:00', hora_hasta: '10:00' }), [`1:${m}`])
  // 09:00 vs 09:00:00 es el mismo instante.
  assert.deepEqual(motivos({ ...FILA, hora_desde: '09:00:00', hora_hasta: '09:00' }), [`1:${m}`])
})

caso('cupo inválido: 0, 501, decimal, texto, null y ausente', () => {
  const m = 'El cupo debe ser un número entero entre 1 y 500.'
  for (const c of [0, 501, 2.5, '5', null, undefined, -1]) {
    assert.deepEqual(motivos({ ...FILA, cupo: c }), [`1:${m}`], `cupo=${String(c)}`)
  }
})

caso('profesor que no es texto', () => {
  for (const p of [5, true, {}, []]) {
    assert.deepEqual(motivos({ ...FILA, profesor: p }), ['1:El profesor debe ser un texto.'])
  }
})

caso('fila que no es un objeto: número, texto, null, lista', () => {
  for (const f of [1, 'x', null, [FILA]]) {
    assert.deepEqual(motivos(f), ['1:La fila no es válida.'])
  }
})

caso('varios errores en la misma fila se reportan juntos', () => {
  assert.deepEqual(motivos({ dia_semana: 9, hora_desde: 'x', hora_hasta: '10:00', cupo: 0, profesor: 3 }), [
    '1:El día debe ser de 1 (lunes) a 7 (domingo).',
    '1:La hora de inicio debe tener formato HH:MM.',
    '1:El cupo debe ser un número entero entre 1 y 500.',
    '1:El profesor debe ser un texto.',
  ])
})

// ─── Numeración de filas ──────────────────────────────────────────────────────

caso('la numeración de errores es 1-based sobre las filas ENVIADAS (incluye las válidas)', () => {
  const filas = [FILA, { ...FILA, cupo: 0 }, FILA, 'x', { ...FILA, dia_semana: 0 }]
  const v = rechazado(validarImportacion(body({ filas })))
  assert.deepEqual(v.errores?.map((e) => e.fila), [2, 4, 5])
  assert.equal(v.motivo, 'El calendario tiene errores; no se importó nada.')
})

// ─── Límite de filas ──────────────────────────────────────────────────────────

caso('300 filas se aceptan', () => {
  const filas = Array.from({ length: IMPORT_MAX_FILAS }, () => FILA)
  assert.equal(IMPORT_MAX_FILAS, 300)
  assert.equal(aceptado(validarImportacion(body({ filas }))).filas.length, 300)
})

caso('301 filas se rechazan (sin mirar el contenido)', () => {
  const filas = Array.from({ length: 301 }, () => 'basura')
  const v = rechazado(validarImportacion(body({ filas })))
  assert.equal(v.motivo, 'El calendario no puede tener más de 300 filas.')
  assert.equal(v.errores, undefined)
})

caso('sin filas: vacío, ausente, objeto o texto', () => {
  for (const filas of [[], undefined, null, {}, 'x']) {
    assert.equal(rechazado(validarImportacion(body({ filas }))).motivo, 'El calendario no tiene filas.')
  }
})

// ─── Modo y solo_vista_previa ─────────────────────────────────────────────────

caso('modo inválido', () => {
  for (const modo of ['otro', '', null, undefined, 1]) {
    assert.equal(rechazado(validarImportacion(body({ modo }))).motivo, 'El modo debe ser "agregar" o "reemplazar".')
  }
})

caso('solo_vista_previa que no es booleano', () => {
  for (const sv of ['true', 1, null]) {
    assert.equal(rechazado(validarImportacion(body({ solo_vista_previa: sv }))).motivo, 'El campo "solo_vista_previa" es inválido.')
  }
})

// ─── plan_hash ────────────────────────────────────────────────────────────────

caso('aplicar con plan_hash válido lo pasa tal cual', () => {
  const v = aceptado(validarImportacion(body({ solo_vista_previa: false, plan_hash: HASH })))
  assert.equal(v.soloVistaPrevia, false)
  assert.equal(v.planHash, HASH)
})

caso('solo_vista_previa ausente equivale a aplicar: exige plan_hash', () => {
  const sinFlag = { modo: 'agregar', filas: [FILA] }
  assert.equal(rechazado(validarImportacion(sinFlag)).codigo, 'plan_hash')
  assert.equal(aceptado(validarImportacion({ ...sinFlag, plan_hash: HASH })).planHash, HASH)
})

caso('aplicar sin plan_hash, o con uno vacío, mal formado o de otro tipo: rechazado', () => {
  for (const ph of [undefined, null, '', 'abc', HASH.toUpperCase(), HASH + '0', 'g'.repeat(32), 123, {}]) {
    const v = rechazado(validarImportacion(body({ solo_vista_previa: false, plan_hash: ph })))
    assert.equal(v.codigo, 'plan_hash', `plan_hash=${JSON.stringify(ph)}`)
    assert.ok(v.motivo.length > 0)
  }
})

caso('la vista previa no acepta plan_hash (ni vacío)', () => {
  for (const ph of [HASH, '', 'abc', 0]) {
    const v = rechazado(validarImportacion(body({ solo_vista_previa: true, plan_hash: ph })))
    assert.equal(v.codigo, 'plan_hash', `plan_hash=${JSON.stringify(ph)}`)
  }
  // null o ausente en la vista previa está bien.
  assert.equal(aceptado(validarImportacion(body({ plan_hash: null }))).planHash, null)
})

caso('el plan_hash se valida antes que las filas', () => {
  const v = rechazado(validarImportacion(body({ solo_vista_previa: false, filas: [{ ...FILA, cupo: 0 }] })))
  assert.equal(v.codigo, 'plan_hash')
})

console.log(`\n${casos} casos OK`)
