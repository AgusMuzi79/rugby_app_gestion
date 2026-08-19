// Aplica los mails recuperables desde la UAR (hoja "Listos para aplicar" de
// data/import/mails_recuperables_uar.xlsx) a los socios que todavía tienen
// mail sintético (socio-{cod}@uncas.local). Idempotente: si el socio ya tiene
// el mail correcto, lo salta.
//
// Uso: SUPABASE_SERVICE_ROLE_KEY=... node aplicar-mails-recuperables.mjs [--commit]

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMMIT = process.argv.includes('--commit')
const SUPABASE_URL = 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function leerListaAplicar() {
  const path = join(__dirname, '..', 'data', 'import', 'mails_recuperables_uar.xlsx')
  const wb = XLSX.readFile(path)
  const sheet = wb.Sheets['Listos para aplicar']
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  return rows.slice(4)
    .filter((r) => r.length && r[0])
    .map((r) => ({ codCliente: String(r[0]), nombre: r[1], dni: String(r[2]), mailUar: String(r[3]).trim().toLowerCase() }))
}

async function main() {
  const lista = leerListaAplicar()
  console.log(`Filas en "Listos para aplicar": ${lista.length}`)

  const dnis = lista.map((r) => r.dni)
  const { data: socios, error: sociosErr } = await supabase
    .from('socios')
    .select('id, dni, profile_id')
    .in('dni', dnis)
  if (sociosErr) throw sociosErr
  const socioPorDni = new Map(socios.map((s) => [s.dni, s]))

  const paraAplicar = []
  const yaAplicados = []
  const sinSocio = []
  const conflictos = []

  for (const fila of lista) {
    const socio = socioPorDni.get(fila.dni)
    if (!socio) { sinSocio.push(fila); continue }

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(socio.profile_id)
    if (userErr || !userData?.user) { sinSocio.push(fila); continue }

    const emailActual = (userData.user.email ?? '').toLowerCase()
    if (emailActual === fila.mailUar) { yaAplicados.push(fila); continue }
    if (!emailActual.endsWith('@uncas.local')) { conflictos.push({ ...fila, emailActual }); continue }

    paraAplicar.push({ ...fila, profileId: socio.profile_id, emailActual })
  }

  console.log(`Ya aplicados (sin cambios): ${yaAplicados.length}`)
  console.log(`Sin socio/usuario encontrado: ${sinSocio.length}`)
  console.log(`Con mail propio distinto (no sintético — se saltean, requieren revisión manual): ${conflictos.length}`)
  if (conflictos.length) conflictos.forEach((c) => console.log(`  - ${c.nombre} (DNI ${c.dni}): tiene "${c.emailActual}", se esperaba "${c.mailUar}"`))
  console.log(`Pendientes de aplicar: ${paraAplicar.length}`)
  paraAplicar.forEach((p) => console.log(`  - ${p.nombre} (DNI ${p.dni}): ${p.emailActual} -> ${p.mailUar}`))

  if (!COMMIT) {
    console.log('\nDry-run: no se escribió nada. Corré con --commit para aplicar.')
    return
  }

  let aplicados = 0
  for (const p of paraAplicar) {
    const { error } = await supabase.auth.admin.updateUserById(p.profileId, { email: p.mailUar, email_confirm: true })
    if (error) {
      console.error(`  ERROR aplicando ${p.nombre} (DNI ${p.dni}): ${error.message}`)
      continue
    }
    aplicados++
    console.log(`  aplicado ${aplicados}/${paraAplicar.length}: ${p.nombre}`)
  }

  console.log(`\nListo. ${aplicados}/${paraAplicar.length} mails aplicados.`)
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
