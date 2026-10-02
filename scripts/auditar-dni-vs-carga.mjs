// Auditoría de sólo lectura: socios cuyo DNI actual en la base difiere del DNI del CSV de la
// carga masiva original (socios_activos_maestra.csv).
//
// Por qué importa: la carga masiva creó cada cuenta de Auth con password = DNI del CSV. Si el DNI
// se corrigió después en socios/profiles, la contraseña de Auth sigue siendo la vieja y el login por
// DNI falla con "Credenciales incorrectas" (caso Tillet, socio 16340, 2026-09-30).
//
// Uso (desde scripts/):
//   SUPABASE_SERVICE_ROLE_KEY=... node auditar-dni-vs-carga.mjs
//
// No escribe nada y no toca auth.users. Sólo lee socios.

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

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

const wb = XLSX.readFile(path.join(__dirname, '..', 'data', 'import', 'socios_activos_maestra.csv'), { raw: true })
const csv = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false })

const socios = await selectAll('socios', 'numero_socio, dni')
const byNumero = new Map(socios.map((s) => [String(s.numero_socio), s]))

const norm = (v) => String(v ?? '').trim()
let comparados = 0
const distintos = []
for (const r of csv) {
  const s = byNumero.get(norm(r.nuvix_cod_cliente))
  if (!s) continue
  comparados++
  if (norm(r.documento) !== norm(s.dni)) {
    distintos.push({ numero_socio: norm(r.nuvix_cod_cliente), nombre: norm(r.nombre), csv: norm(r.documento), base: norm(s.dni) })
  }
}

console.log(`CSV: ${csv.length} filas. Comparadas contra la base: ${comparados}.`)
console.log(`DNI distinto entre el CSV original y la base: ${distintos.length}\n`)
for (const d of distintos) console.log(`${d.numero_socio}\t${d.nombre}\tcsv=${d.csv}\tbase=${d.base}`)
console.log('\nSólo lectura: no se escribió nada.')
