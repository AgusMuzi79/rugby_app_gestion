// Import inicial de jugadores de hockey desde el Excel de las entrenadoras
// ("2026-Damas y caballeros.xlsx", una hoja por plantel).
//
// Uso:
//   cd scripts && npm install
//   node import-jugadores-hockey.mjs --solo-excel                                   # solo parsea el Excel, sin DB ni key
//   SUPABASE_SERVICE_ROLE_KEY=... node import-jugadores-hockey.mjs                  # dry-run contra la DB (default, no escribe)
//   SUPABASE_SERVICE_ROLE_KEY=... node import-jugadores-hockey.mjs --commit         # escribe en serio
//   node import-jugadores-hockey.mjs --file "C:\ruta\otro.xlsx" --temporada=2027   # overrides
//
// La service_role key se consigue en Supabase Dashboard → Project Settings → API → service_role (secret).
// Nunca se commitea ni se imprime en este script. Antes de --commit: node scripts/backup-supabase.mjs
//
// Decisiones aplicadas (ver odd/tasks/divisiones-por-edad.md):
//   - Cada hoja corresponde a una división de hockey (mapeo fijo en HOJAS). Si la división no
//     existe (match por deporte='hockey' + nombre, sin distinguir mayúsculas) se crea con su
//     rango de edad, línea y rama. Una hoja no vacía sin mapeo aborta el script.
//   - Edad = año de la temporada - año de nacimiento (misma regla que divisiones.edad_min/max).
//   - El jugador se vincula al socio por DNI normalizado (solo dígitos) contra TODOS los socios.
//     Sin socio se carga igual con socio_id null (no recibe push hasta vincularse).
//   - Filas sin DNI o con fecha inválida no se cargan (fecha_nacimiento es NOT NULL); se reportan.
//   - Las filas debajo de una fila "BAJA" / "BAJAS" son jugadoras que dejaron: no se cargan.
//   - Idempotente: si ya existe un jugador con el mismo DNI en la misma división, se saltea.
//     Si ese jugador existente no tiene socio_id y ahora hay match, se completa el socio_id.
//   - El reporte nunca imprime teléfonos ni direcciones (esas columnas no se leen).

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ─── Argumentos ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const SOLO_EXCEL = args.includes('--solo-excel')

function argValue(name) {
  const eq = args.find((a) => a.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const FILE_PATH = argValue('--file')
  || args.find((a) => !a.startsWith('--') && a !== argValue('--file') && a !== argValue('--temporada'))
  || path.join(os.homedir(), 'Downloads', '2026-Damas y caballeros.xlsx')

const TEMPORADA = Number(argValue('--temporada') || new Date().getFullYear())
if (!Number.isInteger(TEMPORADA) || TEMPORADA < 2000 || TEMPORADA > 2100) {
  console.error(`--temporada inválida: ${argValue('--temporada')}`)
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (SOLO_EXCEL && COMMIT) {
  console.error('--solo-excel y --commit son excluyentes.')
  process.exit(1)
}
if (!SOLO_EXCEL && !SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  console.error('  - Para revisar solo el Excel (sin DB):  node import-jugadores-hockey.mjs --solo-excel')
  console.error('  - Para el dry-run contra la DB:         SUPABASE_SERVICE_ROLE_KEY=... node import-jugadores-hockey.mjs')
  process.exit(1)
}
if (!fs.existsSync(FILE_PATH)) {
  console.error(`No se encontró el archivo: ${FILE_PATH}`)
  console.error('Pasá la ruta con --file "C:\\ruta\\archivo.xlsx".')
  process.exit(1)
}

// ─── Mapeo hoja → división (deporte = hockey) ──────────────────────────────────

const HOJAS = {
  'ESCUELITA':        { nombre: 'Escuelita',                  categoria: 'infantil', edad_min: 4,    edad_max: 6,    linea: null, rama: 'damas' },
  'SUB. 8':           { nombre: 'Sub 8',                      categoria: 'infantil', edad_min: 7,    edad_max: 8,    linea: null, rama: 'damas' },
  'SUB. 10':          { nombre: 'Sub 10',                     categoria: 'infantil', edad_min: 9,    edad_max: 10,   linea: null, rama: 'damas' },
  'SUB 12 OF.':       { nombre: 'Sub 12 A',                   categoria: 'infantil', edad_min: 11,   edad_max: 12,   linea: 'A',  rama: 'damas' },
  'SUB 12 INC.':      { nombre: 'Sub 12 B',                   categoria: 'infantil', edad_min: 11,   edad_max: 12,   linea: 'B',  rama: 'damas' },
  'SUB 14 OF.':       { nombre: 'Sub 14 A',                   categoria: 'juvenil',  edad_min: 13,   edad_max: 14,   linea: 'A',  rama: 'damas' },
  'SUB. 14 INC.':     { nombre: 'Sub 14 B',                   categoria: 'juvenil',  edad_min: 13,   edad_max: 14,   linea: 'B',  rama: 'damas' },
  'SUB 16 OF.':       { nombre: 'Sub 16 A',                   categoria: 'juvenil',  edad_min: 15,   edad_max: 16,   linea: 'A',  rama: 'damas' },
  'SUB 17 INC.':      { nombre: 'Sub 17 B',                   categoria: 'juvenil',  edad_min: 15,   edad_max: 16,   linea: 'B',  rama: 'damas' },
  'SUB 19':           { nombre: 'Sub 19',                     categoria: 'juvenil',  edad_min: 17,   edad_max: 19,   linea: null, rama: 'damas' },
  'INT. Y 1RA DAMAS': { nombre: 'Intermedia y Primera Damas', categoria: 'superior', edad_min: null, edad_max: null, linea: null, rama: 'damas' },
  'MASTERS':          { nombre: 'Masters',                    categoria: 'superior', edad_min: null, edad_max: null, linea: null, rama: 'damas' },
  'MAMIS':            { nombre: 'Mamis',                      categoria: 'superior', edad_min: null, edad_max: null, linea: null, rama: 'damas' },
  'VARONES MENORES':  { nombre: 'Caballeros Menores',         categoria: 'infantil', edad_min: 4,    edad_max: 12,   linea: null, rama: 'caballeros' },
  'SUB 1416 CAB.':    { nombre: 'Caballeros Sub 14/16',       categoria: 'juvenil',  edad_min: 13,   edad_max: 16,   linea: null, rama: 'caballeros' },
  '1RA. CAB.':        { nombre: 'Primera Caballeros',         categoria: 'superior', edad_min: null, edad_max: null, linea: null, rama: 'caballeros' },
}

// Hojas con fechas escritas como texto en formato US (m/d/aaaa). El resto es d/m/aaaa.
const HOJAS_FECHA_US = new Set(['MAMIS'])

const claveHoja = (nombre) => String(nombre).trim().toUpperCase().replace(/\s+/g, ' ')

// ─── Normalizaciones ───────────────────────────────────────────────────────────

const vacio = (v) => v === null || v === undefined || String(v).trim() === ''

// "D.N.I." → "DNI", "F. Nac" → "FNAC", "CATEGORÍA" → "CATEGORIA"
const claveHeader = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '')

const HEADERS = {
  nombre: new Set(['NOMBRE', 'APELLIDOYNOMBRE', 'NOMBREYAPELLIDO']),
  fecha: new Set(['FNAC', 'FECNAC', 'FECHANAC', 'FECHANACIMIENTO', 'FECHADENACIMIENTO']),
  dni: new Set(['DNI']),
  categoria: new Set(['CATEGORIA']),
}

// DNI: solo dígitos ("58,108,024" / "47.552.297" / 58108024 → "58108024").
// Los DNI sintéticos de socios ("SD{cod}") no son DNI reales y no se usan para matchear.
function normalizarDni(v) {
  if (vacio(v)) return null
  const s = String(v).trim()
  if (/^SD/i.test(s)) return null
  const digitos = s.replace(/\D/g, '').replace(/^0+/, '')
  return digitos || null
}

const nombreLimpio = (v) => vacio(v) ? null : String(v).trim().replace(/\s+/g, ' ')

const pad = (n) => String(n).padStart(2, '0')

function fechaValida(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1920 || y > TEMPORADA) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return { iso: `${y}-${pad(m)}-${pad(d)}`, anio: y }
}

// Devuelve { iso: 'YYYY-MM-DD', anio } o null si no se puede interpretar.
function parsearFecha(v, formatoUS, date1904) {
  if (vacio(v)) return null
  if (typeof v === 'number') {
    // Celda fecha real de Excel: número de serie. Se convierte sin pasar por Date
    // para no depender de la zona horaria de la máquina.
    if (v < 1 || v > 80000) return null
    const p = XLSX.SSF.parse_date_code(v, { date1904 })
    return p ? fechaValida(p.y, p.m, p.d) : null
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return fechaValida(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/)
  if (!m) return null
  let [a, b, y] = [+m[1], +m[2], +m[3]]
  if (m[3].length === 2) y = y <= 30 ? 2000 + y : 1900 + y
  return formatoUS ? fechaValida(y, a, b) : fechaValida(y, b, a)
}

// ─── Parseo del Excel ──────────────────────────────────────────────────────────

const wb = XLSX.readFile(FILE_PATH, { cellDates: false })
const date1904 = Boolean(wb.Workbook?.WBProps?.date1904)

const hojas = []          // { hoja, clave, division, filas: [...] }
const hojasIgnoradas = [] // vacías

for (const nombreHoja of wb.SheetNames) {
  const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: null, blankrows: false })
  const noVacia = matriz.some((r) => r.some((c) => !vacio(c)))
  if (!noVacia) { hojasIgnoradas.push(nombreHoja); continue }

  const clave = claveHoja(nombreHoja)
  const division = HOJAS[clave]
  if (!division) {
    console.error(`La hoja "${nombreHoja}" no está mapeada a ninguna división de hockey.`)
    console.error('Agregala a HOJAS en el script (o borrala del Excel) y volvé a correr.')
    process.exit(1)
  }

  // Header: primera fila (de las primeras 6) que tenga una celda NOMBRE y una DNI exactas.
  let headerIdx = -1
  let C = null
  for (let i = 0; i < Math.min(6, matriz.length); i++) {
    const claves = (matriz[i] || []).map(claveHeader)
    const buscar = (set) => claves.findIndex((k) => set.has(k))
    const c = { nombre: buscar(HEADERS.nombre), fecha: buscar(HEADERS.fecha), dni: buscar(HEADERS.dni), categoria: buscar(HEADERS.categoria) }
    if (c.nombre >= 0 && c.dni >= 0) { headerIdx = i; C = c; break }
  }
  if (headerIdx < 0 || C.fecha < 0) {
    console.error(`La hoja "${nombreHoja}" no tiene un header reconocible (NOMBRE, DNI y F.NAC) en las primeras filas.`)
    process.exit(1)
  }

  const formatoUS = HOJAS_FECHA_US.has(clave)
  const filas = []
  const bajas = []
  const dnisVistos = new Set()
  let enBajas = false

  matriz.slice(headerIdx + 1).forEach((r, offset) => {
    if (!r) return
    // Las entrenadoras listan al final, debajo de una fila "BAJA" / "BAJAS", a las jugadoras
    // que dejaron ("no inicia", "se cambió de club"). Esas filas no se importan.
    if (r.some((c) => typeof c === 'string' && /^\s*bajas?\s*$/i.test(c))) { enBajas = true; return }
    const nombre = nombreLimpio(r[C.nombre])
    const dniCrudo = r[C.dni]
    const dni = normalizarDni(dniCrudo)
    if (!nombre && vacio(dniCrudo)) return // fila de plantilla vacía
    if (enBajas) {
      bajas.push({ hoja: nombreHoja.trim(), filaExcel: headerIdx + 2 + offset, nombre: nombre || '(sin nombre)', dni, dniCrudo: vacio(dniCrudo) ? '' : String(dniCrudo).trim() })
      return
    }

    const fechaCruda = r[C.fecha]
    const fecha = parsearFecha(fechaCruda, formatoUS, date1904)
    const edad = fecha ? TEMPORADA - fecha.anio : null
    const problemas = []
    if (!dni) problemas.push('sin_dni')
    else if (dni.length < 7 || dni.length > 8) problemas.push('dni_largo_raro') // advertencia, se carga igual
    if (!fecha) problemas.push(vacio(fechaCruda) ? 'sin_fecha' : 'fecha_invalida')
    if (dni && dnisVistos.has(dni)) problemas.push('dni_duplicado_en_hoja')
    if (dni) dnisVistos.add(dni)

    const tieneRango = division.edad_min !== null
    const fueraDeRango = tieneRango && edad !== null && (edad < division.edad_min || edad > division.edad_max)

    filas.push({
      hoja: nombreHoja.trim(),
      filaExcel: headerIdx + 2 + offset,
      nombre: nombre || '(sin nombre)',
      dni,
      dniCrudo: vacio(dniCrudo) ? '' : String(dniCrudo).trim(),
      fechaCruda: vacio(fechaCruda) ? '' : String(fechaCruda).trim(),
      fecha: fecha?.iso ?? null,
      edad,
      categoriaExcel: C.categoria >= 0 ? nombreLimpio(r[C.categoria]) : null,
      problemas,
      fueraDeRango,
      // Solo se cargan filas con DNI + fecha válida y no repetidas en la hoja.
      cargable: Boolean(dni && fecha && !problemas.includes('dni_duplicado_en_hoja')),
    })
  })

  hojas.push({ hoja: nombreHoja.trim(), clave, division, filas, bajas })
}

// Hojas mapeadas que no aparecen en el Excel (aviso, no error).
const clavesPresentes = new Set(hojas.map((h) => h.clave))
const hojasFaltantes = Object.keys(HOJAS).filter((k) => !clavesPresentes.has(k))

// ─── Cliente y lectura de la DB ────────────────────────────────────────────────

const supabase = SOLO_EXCEL ? null : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// PostgREST devuelve máximo 1000 filas por default — paginar siempre.
async function selectAll(table, columns, filtro = (q) => q) {
  const pageSize = 1000
  let all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await filtro(supabase.from(table).select(columns)).order('id').range(from, from + pageSize - 1)
    if (error) throw new Error(`Leyendo ${table}: ${error.message}`)
    all = all.concat(data)
    if (data.length < pageSize) break
  }
  return all
}

async function cargarEstadoDb() {
  let divisionesHockey
  try {
    divisionesHockey = await selectAll('divisiones', 'id, nombre, categoria, deporte, activa, edad_min, edad_max, linea, rama', (q) => q.eq('deporte', 'hockey'))
  } catch (e) {
    if (/edad_min|linea|rama|column/i.test(e.message)) {
      throw new Error(`${e.message}\n¿Está aplicada la migración 20261013000000_divisiones_rango_edad.sql en la base?`)
    }
    throw e
  }
  const divisionPorNombre = new Map()
  for (const d of divisionesHockey) {
    const k = d.nombre.trim().toLowerCase()
    if (divisionPorNombre.has(k)) throw new Error(`Hay dos divisiones de hockey llamadas "${d.nombre}". Resolvelo a mano antes de importar.`)
    divisionPorNombre.set(k, d)
  }

  const socios = await selectAll('socios', 'id, dni')
  const socioPorDni = new Map()
  for (const s of socios) {
    const k = normalizarDni(s.dni)
    if (k && !socioPorDni.has(k)) socioPorDni.set(k, s.id)
  }

  const idsDivisiones = hojas.map((h) => divisionPorNombre.get(h.division.nombre.toLowerCase())?.id).filter(Boolean)
  const jugadores = idsDivisiones.length
    ? await selectAll('jugadores', 'id, dni, division_id, socio_id', (q) => q.in('division_id', idsDivisiones))
    : []

  return { divisionPorNombre, socioPorDni, jugadores, totalSocios: socios.length }
}

// ─── Plan ──────────────────────────────────────────────────────────────────────

function armarPlan(db) {
  const plan = { divisionesACrear: [], divisionesDistintas: [], insertar: [], backfill: [] }
  const existentes = new Set()
  if (db) {
    for (const j of db.jugadores) {
      const k = normalizarDni(j.dni)
      if (k) existentes.add(`${k}|${j.division_id}`)
      if (!j.socio_id && k && db.socioPorDni.has(k)) plan.backfill.push({ id: j.id, dni: k, socio_id: db.socioPorDni.get(k) })
    }
  }

  for (const h of hojas) {
    const existente = db?.divisionPorNombre.get(h.division.nombre.toLowerCase()) ?? null
    h.divisionId = existente?.id ?? null
    if (db && !existente) plan.divisionesACrear.push(h.division)
    if (existente) {
      const campos = ['categoria', 'edad_min', 'edad_max', 'linea', 'rama']
        .filter((c) => (existente[c] ?? null) !== (h.division[c] ?? null))
      if (campos.length) plan.divisionesDistintas.push({ nombre: existente.nombre, campos: campos.map((c) => `${c}: DB=${existente[c] ?? 'null'} / esperado=${h.division[c] ?? 'null'}`) })
    }

    for (const f of h.filas) {
      f.socioId = db ? (f.dni ? db.socioPorDni.get(f.dni) ?? null : null) : undefined
      if (!f.cargable) { f.estado = 'no_cargable'; continue }
      if (h.divisionId && existentes.has(`${f.dni}|${h.divisionId}`)) { f.estado = 'existente'; continue }
      f.estado = 'a_insertar'
      plan.insertar.push({ hoja: h, fila: f })
    }
  }
  return plan
}

// ─── Reporte ───────────────────────────────────────────────────────────────────

function rango(d) { return d.edad_min === null ? 'sin rango' : `${d.edad_min}..${d.edad_max}` }

function imprimirReporte(plan, db) {
  const linea = '='.repeat(100)
  console.log(linea)
  console.log(`Archivo:   ${FILE_PATH}`)
  console.log(`Modo:      ${SOLO_EXCEL ? 'SOLO EXCEL (sin DB)' : COMMIT ? 'COMMIT (escribe en la DB)' : 'DRY-RUN (lee la DB, no escribe)'}`)
  console.log(`Temporada: ${TEMPORADA}  (edad = ${TEMPORADA} - año de nacimiento)`)
  if (hojasIgnoradas.length) console.log(`Hojas vacías ignoradas: ${hojasIgnoradas.map((h) => `"${h}"`).join(', ')}`)
  if (hojasFaltantes.length) console.log(`AVISO: hojas del mapeo que no están en el Excel: ${hojasFaltantes.join(', ')}`)
  console.log(linea)

  const cols = SOLO_EXCEL
    ? ['Hoja', 'División', 'Rango', 'Filas', 'Cargables', 'Sin DNI', 'Fecha mal', 'Dup hoja', 'Fuera rango', 'Bajas']
    : ['Hoja', 'División', 'Rango', 'Filas', 'A insertar', 'Existentes', 'Sin DNI', 'Fecha mal', 'Dup hoja', 'Fuera rango', 'Sin socio', 'Bajas']
  const anchos = SOLO_EXCEL ? [18, 28, 10, 6, 10, 8, 10, 9, 12, 6] : [18, 28, 10, 6, 11, 11, 8, 10, 9, 12, 10, 6]
  const fmt = (vals) => vals.map((v, i) => String(v).padEnd(anchos[i])).join(' ')
  console.log('\n' + fmt(cols))
  console.log('-'.repeat(anchos.reduce((a, b) => a + b + 1, 0)))

  const tot = { filas: 0, cargables: 0, insertar: 0, existentes: 0, sinDni: 0, fechaMal: 0, dup: 0, fuera: 0, sinSocio: 0, bajas: 0 }
  for (const h of hojas) {
    const c = {
      filas: h.filas.length,
      cargables: h.filas.filter((f) => f.cargable).length,
      insertar: h.filas.filter((f) => f.estado === 'a_insertar').length,
      existentes: h.filas.filter((f) => f.estado === 'existente').length,
      sinDni: h.filas.filter((f) => f.problemas.includes('sin_dni')).length,
      fechaMal: h.filas.filter((f) => f.problemas.includes('fecha_invalida') || f.problemas.includes('sin_fecha')).length,
      dup: h.filas.filter((f) => f.problemas.includes('dni_duplicado_en_hoja')).length,
      fuera: h.filas.filter((f) => f.fueraDeRango).length,
      sinSocio: h.filas.filter((f) => f.cargable && f.socioId === null).length,
      bajas: h.bajas.length,
    }
    for (const k of Object.keys(tot)) tot[k] += c[k]
    const nombreDiv = h.division.nombre + (h.divisionId ? '' : SOLO_EXCEL ? '' : ' (nueva)')
    console.log(fmt(SOLO_EXCEL
      ? [h.hoja, nombreDiv, rango(h.division), c.filas, c.cargables, c.sinDni, c.fechaMal, c.dup, c.fuera, c.bajas]
      : [h.hoja, nombreDiv, rango(h.division), c.filas, c.insertar, c.existentes, c.sinDni, c.fechaMal, c.dup, c.fuera, c.sinSocio, c.bajas]))
  }
  console.log('-'.repeat(anchos.reduce((a, b) => a + b + 1, 0)))
  console.log(fmt(SOLO_EXCEL
    ? ['TOTAL', '', '', tot.filas, tot.cargables, tot.sinDni, tot.fechaMal, tot.dup, tot.fuera, tot.bajas]
    : ['TOTAL', '', '', tot.filas, tot.insertar, tot.existentes, tot.sinDni, tot.fechaMal, tot.dup, tot.fuera, tot.sinSocio, tot.bajas]))
  console.log('(Filas = jugadores activos de la hoja; Bajas = filas debajo de "BAJA/BAJAS", no se importan.)')

  const todas = hojas.flatMap((h) => h.filas.map((f) => ({ ...f, division: h.division })))

  const fuera = todas.filter((f) => f.fueraDeRango)
  console.log(`\n>>> EDADES FUERA DEL RANGO DE SU DIVISIÓN (${fuera.length}) — revisar con las entrenadoras:`)
  for (const f of fuera) {
    console.log(`  [${f.hoja}] ${f.nombre.padEnd(36)} DNI ${String(f.dni ?? '-').padEnd(9)} nac. ${f.fecha}  edad ${f.edad}  (rango ${rango(f.division)})`)
  }

  const conProblemas = todas.filter((f) => f.problemas.some((p) => p !== 'dni_largo_raro'))
  console.log(`\nFilas que NO se cargan (${conProblemas.length}):`)
  for (const f of conProblemas) {
    console.log(`  [${f.hoja} fila ${f.filaExcel}] ${f.nombre.padEnd(36)} DNI ${String(f.dniCrudo || '-').padEnd(12)} fecha "${f.fechaCruda}"  → ${f.problemas.join(', ')}`)
  }

  const bajas = hojas.flatMap((h) => h.bajas)
  console.log(`\nBajas (debajo de "BAJA/BAJAS", no se importan) (${bajas.length}):`)
  for (const b of bajas) console.log(`  [${b.hoja} fila ${b.filaExcel}] ${b.nombre.padEnd(36)} DNI ${b.dni ?? '-'}`)

  const dniRaro = todas.filter((f) => f.problemas.includes('dni_largo_raro'))
  if (dniRaro.length) {
    console.log(`\nDNI con largo inusual (se cargan igual, verificar) (${dniRaro.length}):`)
    for (const f of dniRaro) console.log(`  [${f.hoja} fila ${f.filaExcel}] ${f.nombre} → DNI ${f.dni} (original "${f.dniCrudo}")`)
  }

  // Columna CATEGORÍA (hojas de caballeros): "SUB N" debería cubrir edades N-1..N.
  const catInconsistente = todas.filter((f) => {
    const m = f.categoriaExcel?.match(/SUB\s*(\d+)/i)
    return m && f.edad !== null && (f.edad < +m[1] - 1 || f.edad > +m[1])
  })
  if (catInconsistente.length) {
    console.log(`\nCATEGORÍA del Excel que no coincide con la edad (${catInconsistente.length}):`)
    for (const f of catInconsistente) console.log(`  [${f.hoja}] ${f.nombre} DNI ${f.dni} nac. ${f.fecha} edad ${f.edad} → dice "${f.categoriaExcel}"`)
  }

  // Misma persona en más de una hoja: válido (p. ej. juega en dos planteles), solo informativo.
  const porDni = new Map()
  for (const f of todas.filter((x) => x.dni)) porDni.set(f.dni, [...(porDni.get(f.dni) || []), f])
  const multi = [...porDni.values()].filter((fs) => new Set(fs.map((f) => f.hoja)).size > 1)
  if (multi.length) {
    console.log(`\nDNI presentes en más de una hoja (${multi.length}) — se carga un jugador por división:`)
    for (const fs of multi) console.log(`  ${fs[0].dni} ${fs[0].nombre} → ${[...new Set(fs.map((f) => f.hoja))].join(' + ')}`)
  }

  if (db) {
    console.log(`\nSocios leídos de la DB: ${db.totalSocios}`)
    const sinSocio = new Map()
    for (const f of todas) if (f.cargable && f.socioId === null && !sinSocio.has(f.dni)) sinSocio.set(f.dni, f)
    console.log(`DNIs sin socio que matchee (${sinSocio.size}) — se cargan con socio_id null:`)
    for (const f of sinSocio.values()) console.log(`  [${f.hoja}] ${f.nombre.padEnd(36)} DNI ${f.dni}`)

    console.log(`\nDivisiones a crear (${plan.divisionesACrear.length}):`)
    for (const d of plan.divisionesACrear) {
      console.log(`  ${d.nombre.padEnd(28)} categoria=${d.categoria}  edad=${rango(d)}  linea=${d.linea ?? 'null'}  rama=${d.rama}`)
    }
    if (plan.divisionesDistintas.length) {
      console.log(`\nAVISO: divisiones existentes con campos distintos a los esperados (el script NO las modifica):`)
      for (const d of plan.divisionesDistintas) console.log(`  ${d.nombre}: ${d.campos.join(' | ')}`)
    }
    console.log(`\nJugadores a insertar: ${plan.insertar.length}`)
    console.log(`Jugadores existentes a completar socio_id: ${plan.backfill.length}`)
  } else {
    console.log('\n(Match contra socios y jugadores existentes: requiere la DB — correr sin --solo-excel con la key.)')
  }
  console.log('\n' + linea)
}

// ─── CSV de detalle ────────────────────────────────────────────────────────────

// scripts/salida/ no está en .gitignore → el CSV (con nombres y DNIs) va al directorio
// temporal del sistema para que nunca termine en el repo.
function escribirCsv() {
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const destino = path.join(os.tmpdir(), `import-jugadores-hockey-${sello}.csv`)
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['hoja', 'fila_excel', 'division', 'rango_edad', 'nombre', 'dni', 'dni_original', 'fecha_nacimiento', 'fecha_original', 'edad', 'fuera_de_rango', 'categoria_excel', 'estado', 'problemas', 'socio_match']
  const lineas = [header.join(',')]
  for (const h of hojas) {
    for (const f of h.filas) {
      const socio = f.socioId === undefined ? 'sin_verificar' : f.socioId ? 'si' : f.dni ? 'no' : ''
      lineas.push([h.hoja, f.filaExcel, h.division.nombre, rango(h.division), f.nombre, f.dni, f.dniCrudo, f.fecha, f.fechaCruda, f.edad,
        f.fueraDeRango ? 'si' : '', f.categoriaExcel, f.estado ?? (f.cargable ? 'cargable' : 'no_cargable'), f.problemas.join(' '), socio].map(esc).join(','))
    }
    for (const b of h.bajas) {
      lineas.push([h.hoja, b.filaExcel, h.division.nombre, rango(h.division), b.nombre, b.dni, b.dniCrudo, '', '', '', '', '', 'baja', '', ''].map(esc).join(','))
    }
  }
  fs.writeFileSync(destino, '\uFEFF' + lineas.join('\r\n'), 'utf8')
  return destino
}

// ─── Aplicar el plan (--commit) ────────────────────────────────────────────────

async function aplicar(plan) {
  const hecho = { divisiones: 0, insertados: 0, backfill: 0 }
  const fallar = (paso, msg) => {
    throw new Error(`${paso}: ${msg}\nAplicado antes del error → divisiones creadas: ${hecho.divisiones}, jugadores insertados: ${hecho.insertados}, socio_id completados: ${hecho.backfill}. El script es re-ejecutable.`)
  }

  // 1. Divisiones
  const idPorNombre = new Map(hojas.filter((h) => h.divisionId).map((h) => [h.division.nombre, h.divisionId]))
  for (const d of plan.divisionesACrear) {
    const { data, error } = await supabase.from('divisiones')
      .insert({ nombre: d.nombre, categoria: d.categoria, deporte: 'hockey', activa: true, edad_min: d.edad_min, edad_max: d.edad_max, linea: d.linea, rama: d.rama })
      .select('id').single()
    if (error) fallar(`Creando división "${d.nombre}"`, error.message)
    idPorNombre.set(d.nombre, data.id)
    hecho.divisiones++
    console.log(`  división creada: ${d.nombre}`)
  }

  // 2. Jugadores, en lotes (cada lote es un único INSERT atómico)
  const registros = plan.insertar.map(({ hoja, fila }) => ({
    nombre_completo: fila.nombre,
    dni: fila.dni,
    fecha_nacimiento: fila.fecha,
    division_id: idPorNombre.get(hoja.division.nombre),
    activo: true,
    socio_id: fila.socioId ?? null,
  }))
  const LOTE = 200
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    if (lote.some((r) => !r.division_id)) fallar('Insertando jugadores', 'falta division_id (división no resuelta)')
    const { error } = await supabase.from('jugadores').insert(lote)
    if (error) fallar(`Insertando jugadores (lote ${i / LOTE + 1})`, error.message)
    hecho.insertados += lote.length
    console.log(`  jugadores insertados: ${hecho.insertados}/${registros.length}`)
  }

  // 3. Backfill de socio_id en jugadores existentes
  for (const b of plan.backfill) {
    const { error } = await supabase.from('jugadores').update({ socio_id: b.socio_id }).eq('id', b.id).is('socio_id', null)
    if (error) fallar(`Completando socio_id del jugador DNI ${b.dni}`, error.message)
    hecho.backfill++
  }
  if (plan.backfill.length) console.log(`  socio_id completados: ${hecho.backfill}`)

  return hecho
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = SOLO_EXCEL ? null : await cargarEstadoDb()
  const plan = armarPlan(db)
  imprimirReporte(plan, db)
  console.log(`Detalle completo (CSV): ${escribirCsv()}`)

  if (!COMMIT) {
    console.log(SOLO_EXCEL
      ? '\nSolo Excel: no se consultó ni escribió la DB.'
      : '\nDry-run: no se escribió nada. Corré con --commit cuando esté confirmado (y después de un backup).')
    return
  }

  console.log('\nAplicando el plan contra Supabase...\n')
  const hecho = await aplicar(plan)
  console.log(`\nListo. Divisiones creadas: ${hecho.divisiones} | Jugadores insertados: ${hecho.insertados} | socio_id completados: ${hecho.backfill}`)
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`)
  process.exit(1)
})
