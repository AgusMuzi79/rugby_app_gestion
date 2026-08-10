// Combina N archivos del reporte NUVIX RPT_Vencimientos (mismo formato que
// espera supabase/functions/_shared/parse-deuda-nuvix.ts) en uno solo, para
// cuando el club exporta la deuda partida en varias piezas (ej. socios,
// cesantes, clientes del gimnasio) en vez de un único archivo.
//
// El importador de la app (importar-deuda) sólo acepta un archivo por corte
// y no acumula entre llamadas — importar las partes por separado pisa cada
// vez el resultado de la anterior. Este script arma un único archivo válido:
// una fila "Período Informado:", el cuerpo de las N partes concatenado, y
// una sola fila "Total General:" con la suma de los N totales originales.
//
// Uso:
//   node scripts/combinar-deuda-nuvix.mjs <salida.xls> <parte1.xls> <parte2.xls> [...]
//
// Valida que las N partes tengan la misma fecha de corte y que cada una
// reconcilie por sí sola antes de combinar, y vuelve a chequear el archivo
// final antes de escribirlo — si algo no cierra, no genera nada.

import XLSX from 'xlsx'
import fs from 'fs'

const [outPath, ...inPaths] = process.argv.slice(2)
if (!outPath || inPaths.length < 2) {
  console.error('Uso: node combinar-deuda-nuvix.mjs <salida.xls> <parte1.xls> <parte2.xls> [...]')
  process.exit(1)
}

function leerFilas(path) {
  const buf = fs.readFileSync(path)
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames.find(n => n.includes('RPT_Vencimientos')) ?? wb.SheetNames[0]
  if (!sheetName) throw new Error(`${path}: no se encontró ninguna hoja legible`)
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, cellDates: true, raw: true })
}

const esPeriodo      = row => row[0] === 'Período Informado:'
const esTotalGeneral = row => row[0] === 'Total General:'

function isEmpty(v)   { return v === undefined || v === null || v === '' }
function isNumeric(v) { return typeof v === 'number' && !Number.isNaN(v) }
function isDateCell(v) {
  if (v instanceof Date) return true
  if (typeof v === 'string') return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v.trim())
  return false
}
function clasificar(row) {
  if (esPeriodo(row)) return 'periodo'
  if (row[0] === 'Cta. Cte.:') return 'cabecera'
  if (row[5] === 'SALDO ANTERIOR') return 'saldo_anterior'
  if (esTotalGeneral(row)) return 'total_general'
  if (isDateCell(row[0]) && (row[1] === 'FAC' || row[1] === 'REC')) return 'detalle'
  if (isEmpty(row[0]) && isEmpty(row[1]) && isNumeric(row[2]) && isNumeric(row[3]) && isNumeric(row[4]) && isEmpty(row[5])) return 'subtotal'
  return 'ignorada'
}

// Mismo chequeo de reconciliación que usa el importador (parse-deuda-nuvix.ts)
function chequearReconciliacion(rows, etiqueta) {
  const suma = { vencido: 0, aVencer: 0, total: 0 }
  let totalGeneral = null
  for (const row of rows) {
    const t = clasificar(row)
    if (t === 'subtotal') {
      suma.vencido += Number(row[2]) || 0
      suma.aVencer += Number(row[3]) || 0
      suma.total   += Number(row[4]) || 0
    } else if (t === 'total_general') {
      totalGeneral = { vencido: Number(row[1]) || 0, aVencer: Number(row[2]) || 0, total: Number(row[3]) || 0 }
    }
  }
  if (!totalGeneral) throw new Error(`${etiqueta}: no se encontró la fila "Total General:"`)
  const eps = 0.01
  const desbalance = ['vencido', 'aVencer', 'total'].filter(k => Math.abs(suma[k] - totalGeneral[k]) >= eps)
  if (desbalance.length) {
    throw new Error(`${etiqueta}: no reconcilia (${desbalance.join(', ')}). suma subtotales=${JSON.stringify(suma)} vs Total General=${JSON.stringify(totalGeneral)}`)
  }
  return totalGeneral
}

const partes = inPaths.map(path => ({ path, rows: leerFilas(path) }))

// 1) Misma fecha de corte en todas las partes
const periodos = partes.map(({ path, rows }) => {
  const row = rows.find(esPeriodo)
  if (!row) throw new Error(`${path}: no tiene fila "Período Informado:"`)
  return { path, corte: row[4] }
})
const corteRef = +new Date(periodos[0].corte)
for (const p of periodos) {
  if (+new Date(p.corte) !== corteRef) {
    throw new Error(
      `Fecha de corte distinta entre partes — no se pueden combinar así:\n` +
      periodos.map(p => `  ${p.path}: ${p.corte}`).join('\n')
    )
  }
}

// 2) Cada parte reconcilia por sí sola
const totales = partes.map(({ path, rows }) => chequearReconciliacion(rows, path))

// 3) Armar el archivo combinado: 1 fila de período + cuerpo de las N partes + 1 Total General (suma)
const periodoRow = partes[0].rows.find(esPeriodo)
const cuerpo = partes.flatMap(({ rows }) => rows.filter(r => !esPeriodo(r) && !esTotalGeneral(r)))
const totalCombinado = totales.reduce(
  (acc, t) => ({ vencido: acc.vencido + t.vencido, aVencer: acc.aVencer + t.aVencer, total: acc.total + t.total }),
  { vencido: 0, aVencer: 0, total: 0 }
)
const totalGeneralRow = ['Total General:', totalCombinado.vencido, totalCombinado.aVencer, totalCombinado.total]
const filasFinal = [periodoRow, ...cuerpo, totalGeneralRow]

// 4) Self-check del combinado antes de escribir nada
chequearReconciliacion(filasFinal, '(archivo combinado)')

const sheet = XLSX.utils.aoa_to_sheet(filasFinal)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, sheet, 'RPT_Vencimientos.rpt')
XLSX.writeFile(wb, outPath, { bookType: 'biff8' })

const cuentas = cuerpo.filter(r => r[0] === 'Cta. Cte.:').length
console.log(`OK — ${outPath}`)
console.log(`Partes combinadas: ${partes.length} (${partes.map(p => p.path).join(', ')})`)
console.log(`Cuentas totales: ${cuentas}`)
console.log(`Total General combinado: vencido=${totalCombinado.vencido} a_vencer=${totalCombinado.aVencer} total=${totalCombinado.total}`)
