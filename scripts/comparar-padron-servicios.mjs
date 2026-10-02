// Reconcilia socio_servicios contra el Padrón de Servicios por Socio/Frecuencia de NUVIX (xls).
//
// Uso (desde scripts/):
//   SUPABASE_SERVICE_ROLE_KEY=... node comparar-padron-servicios.mjs                       # dry-run (default)
//   SUPABASE_SERVICE_ROLE_KEY=... node comparar-padron-servicios.mjs --excluir=17717,123    # excluye socios
//   SUPABASE_SERVICE_ROLE_KEY=... node comparar-padron-servicios.mjs --commit               # aplica
//   Un 2º argumento posicional (sin --) cambia el archivo: node comparar-padron-servicios.mjs "otro.xls"
//
// Sin --commit es 100% de sólo lectura. Matchea por socios.numero_socio, nunca crea ni borra socios.
//   - Agrega los vínculos que están en el padrón y no en la base, con el importe vigente de esa variante
//     (el importe uniforme que ya tienen los demás vínculos de la base con la misma variante).
//   - Borra los vínculos que están en la base y no en el padrón. Los vínculos sin variante_nuvix
//     (cargados a mano, no vienen de NUVIX) nunca se borran: se listan aparte.
//   - Un socio que el padrón lista en dos variantes del mismo servicio se saltea y se reporta.

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const EXCLUIR = new Set(
  args.filter((a) => a.startsWith('--excluir=')).flatMap((a) => a.slice('--excluir='.length).split(',')).map((s) => s.trim()).filter(Boolean)
)
const file = args.find((a) => !a.startsWith('--')) || 'padron servicio socio.xls'
const XLS_PATH = path.join(__dirname, '..', 'data', 'import', file)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// variante NUVIX (mayúsculas) → servicio del catálogo. El resto de los servicios del padrón
// (cuotas de categoría, Cliente Gym, Gym Alícuota, Activo Unquitas) no son vínculos en socio_servicios.
const VARIANTE_A_SERVICIO = {
  'GYM MAYOR': 'Gimnasio',
  'GYM MENOR': 'Gimnasio',
  'GYM BECADO': 'Gimnasio',
  'HOCKEY CUOTA DEPORTIVA': 'Hockey',
  'RUGBY CUOTA DEPORTIVA': 'Rugby',
  'CARNET TENIS': 'Carnet Tenis',
  'HOCKEY INCLUSIVO': 'Hockey Inclusivo',
  'RUGBY INCLUSIVO': 'Rugby Inclusivo',
}

function leerPadron() {
  const wb = XLSX.readFile(XLS_PATH)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  const filas = []
  let varianteOriginal = null
  for (const r of rows) {
    if (r[0] === 'Servicio:') { varianteOriginal = String(r[1]).trim(); continue }
    if (r[0] === 'Frecuencia:') continue
    const cod = String(r[0]).trim()
    if (varianteOriginal && /^\d+$/.test(cod)) {
      filas.push({ numero_socio: cod, nombre: String(r[1]).trim(), variante: varianteOriginal.toUpperCase(), varianteOriginal })
    }
  }
  return filas
}

async function selectAll(table, columns) {
  const pageSize = 1000
  let all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw new Error(`selectAll(${table}): ${error.message}`)
    all = all.concat(data)
    if (data.length < pageSize) break
  }
  return all
}

async function pool(items, worker, concurrency = 5) {
  let i = 0
  async function next() {
    while (i < items.length) await worker(items[i++])
  }
  await Promise.all(Array.from({ length: concurrency }, next))
}

async function main() {
  const padron = leerPadron()
  const relevantes = padron.filter((f) => VARIANTE_A_SERVICIO[f.variante])
  console.log(`Padrón: ${padron.length} filas, ${relevantes.length} de servicios relevantes.`)
  if (EXCLUIR.size) console.log(`Excluidos por pedido: ${[...EXCLUIR].join(', ')}`)

  const [socios, servicios, vinculos] = await Promise.all([
    selectAll('socios', 'id, numero_socio'),
    selectAll('servicios_opcionales', 'id, nombre'),
    selectAll('socio_servicios', 'id, socio_id, servicio_id, importe, variante_nuvix'),
  ])
  console.log(`Base: ${socios.length} socios, ${vinculos.length} vínculos.`)

  const socioByNumero = new Map(socios.map((s) => [String(s.numero_socio), s]))
  const socioById = new Map(socios.map((s) => [s.id, s]))
  const servicioNombreById = new Map(servicios.map((s) => [s.id, s.nombre]))
  const servicioIdByNombre = new Map(servicios.map((s) => [s.nombre, s.id]))
  const nombresRelevantes = new Set(Object.values(VARIANTE_A_SERVICIO))

  // Importe vigente por variante = el que ya tienen los vínculos de la base. Si una variante tiene
  // más de un importe distinto no hay valor único: se aborta antes de escribir nada.
  const importesPorVariante = new Map()
  for (const v of vinculos) {
    if (!v.variante_nuvix || v.importe == null) continue
    const k = v.variante_nuvix.toUpperCase()
    if (!importesPorVariante.has(k)) importesPorVariante.set(k, new Set())
    importesPorVariante.get(k).add(Number(v.importe))
  }
  const importeDe = (variante) => {
    const set = importesPorVariante.get(variante)
    return set && set.size === 1 ? [...set][0] : null
  }

  // Objetivo (padrón): "numero_socio|Servicio" → filas (más de una = socio en dos variantes)
  const objetivoMulti = new Map()
  const sinMatch = []
  for (const f of relevantes) {
    if (!socioByNumero.has(f.numero_socio)) { sinMatch.push(f); continue }
    const k = `${f.numero_socio}|${VARIANTE_A_SERVICIO[f.variante]}`
    if (!objetivoMulti.has(k)) objetivoMulti.set(k, [])
    objetivoMulti.get(k).push(f)
  }
  const objetivo = new Map()
  const conflictoVariantes = []
  for (const [k, filas] of objetivoMulti) {
    if (new Set(filas.map((f) => f.variante)).size > 1) { conflictoVariantes.push({ k, filas }); continue }
    objetivo.set(k, filas[0])
  }
  const conflictoKeys = new Set(conflictoVariantes.map((c) => c.k))

  // Actual (base), sólo los servicios relevantes
  const actual = new Map()
  for (const v of vinculos) {
    const nombre = servicioNombreById.get(v.servicio_id)
    const socio = socioById.get(v.socio_id)
    if (!nombresRelevantes.has(nombre) || !socio) continue
    actual.set(`${socio.numero_socio}|${nombre}`, { id: v.id, socio, servicio: nombre, variante: v.variante_nuvix })
  }

  const excluido = (numero) => EXCLUIR.has(String(numero))
  const agregar = [...objetivo].filter(([k, f]) => !actual.has(k) && !excluido(f.numero_socio)).map(([k, f]) => ({ k, ...f }))
  const sobranTodos = [...actual].filter(([k]) => !objetivo.has(k) && !conflictoKeys.has(k)).map(([k, a]) => ({ k, ...a }))
  const sobran = sobranTodos.filter((a) => !excluido(a.socio.numero_socio) && a.variante)
  const manualesSinVariante = sobranTodos.filter((a) => !excluido(a.socio.numero_socio) && !a.variante)
  const variantesDistintas = [...objetivo]
    .filter(([k, f]) => actual.has(k) && actual.get(k).variante && actual.get(k).variante.toUpperCase() !== f.variante && !excluido(f.numero_socio))
    .map(([k, f]) => ({ numero_socio: f.numero_socio, nombre: f.nombre, padron: f.variante, base: actual.get(k).variante }))
  const conflictosVisibles = conflictoVariantes.filter((c) => !excluido(c.filas[0].numero_socio))

  console.log('\n─── Resumen ───')
  console.log(`A agregar (en padrón, no en base): ${agregar.length}`)
  console.log(`A borrar (en base, no en padrón): ${sobran.length}`)
  console.log(`Manuales sin variante_nuvix (no se borran): ${manualesSinVariante.length}`)
  console.log(`Variante distinta (no se toca): ${variantesDistintas.length}`)
  console.log(`Socios en 2 variantes del mismo servicio (se saltean): ${conflictosVisibles.length}`)
  console.log(`Códigos del padrón sin socio en la base: ${sinMatch.length}`)

  const agregarPorVariante = {}
  for (const f of agregar) agregarPorVariante[f.variante] = (agregarPorVariante[f.variante] || 0) + 1
  console.log('A agregar por variante:', agregarPorVariante)
  const sobranPorServicio = {}
  for (const a of sobran) sobranPorServicio[`${a.servicio} / ${a.variante}`] = (sobranPorServicio[`${a.servicio} / ${a.variante}`] || 0) + 1
  console.log('A borrar por servicio/variante:', sobranPorServicio)

  const sinImporte = [...new Set(agregar.map((f) => f.variante))].filter((v) => importeDe(v) == null)
  if (sinImporte.length) {
    console.error(`\nNo hay un importe único en la base para: ${sinImporte.join(', ')} — no se puede agregar. Abortando.`)
    process.exit(1)
  }

  console.log('\n─── A AGREGAR ───')
  for (const f of agregar) console.log(`${f.numero_socio}\t${f.nombre}\t${f.varianteOriginal}\t$${importeDe(f.variante)}`)
  console.log('\n─── A BORRAR ───')
  for (const a of sobran) console.log(`${a.socio.numero_socio}\t${a.servicio}\t${a.variante}`)
  console.log('\n─── MANUALES SIN VARIANTE (no se borran) ───')
  for (const a of manualesSinVariante) console.log(`${a.socio.numero_socio}\t${a.servicio}`)
  console.log('\n─── VARIANTE DISTINTA (no se toca) ───')
  for (const v of variantesDistintas) console.log(`${v.numero_socio}\t${v.nombre}\tpadrón=${v.padron}\tbase=${v.base}`)
  console.log('\n─── EN 2 VARIANTES (se saltean) ───')
  for (const c of conflictosVisibles) console.log(`${c.filas[0].numero_socio}\t${c.filas[0].nombre}\t${c.filas.map((f) => f.varianteOriginal).join(' + ')}`)
  console.log('\n─── SIN SOCIO EN LA BASE ───')
  for (const f of sinMatch) console.log(`${f.numero_socio}\t${f.nombre}\t${f.variante}`)

  if (!COMMIT) {
    console.log('\nDry-run: no se escribió nada. Corré con --commit para aplicar.')
    return
  }

  console.log('\nAplicando...')
  const errores = []
  await pool(sobran, async (a) => {
    const { error } = await supabase.from('socio_servicios').delete().eq('id', a.id)
    if (error) errores.push({ tipo: 'borrar', numero_socio: a.socio.numero_socio, servicio: a.servicio, error: error.message })
  })
  await pool(agregar, async (f) => {
    const servicioId = servicioIdByNombre.get(VARIANTE_A_SERVICIO[f.variante])
    const { error } = await supabase.from('socio_servicios').insert({
      socio_id: socioByNumero.get(f.numero_socio).id,
      servicio_id: servicioId,
      importe: importeDe(f.variante),
      variante_nuvix: f.varianteOriginal,
    })
    if (error) errores.push({ tipo: 'agregar', numero_socio: f.numero_socio, variante: f.variante, error: error.message })
  })

  const resumen = {
    origen: 'comparar-padron-servicios', archivo: file, excluidos: [...EXCLUIR],
    agregados: agregar.length, borrados: sobran.length, errores,
  }
  const { error: logError } = await supabase.from('reconciliaciones_socios').insert({ dry_run: false, resumen })
  if (logError) console.error(`  [warn] no se pudo guardar el registro de auditoría: ${logError.message}`)

  if (errores.length) {
    console.error(`\n${errores.length} errores:\n${JSON.stringify(errores, null, 2)}`)
    process.exitCode = 1
  } else {
    console.log(`\nListo, sin errores: +${agregar.length} / -${sobran.length}.`)
  }
}

main().catch((err) => {
  console.error('\nError fatal:', err.message)
  process.exit(1)
})
