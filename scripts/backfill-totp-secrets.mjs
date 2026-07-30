// Backfill de socios_secrets (TOTP) para socios que no tienen secreto todavía.
// Necesario después de la carga masiva: admin-socios genera el secreto al alta
// individual, pero el import masivo no pasa por esa Edge Function.
//
// Uso: SUPABASE_SERVICE_ROLE_KEY=... node backfill-totp-secrets.mjs [--commit]

import { createClient } from '@supabase/supabase-js'

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

// Mismo algoritmo que supabase/functions/_shared/totp.ts (20 bytes random, base32)
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function generateSecret() {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  let result = '', buf = 0, bits = 0
  for (const b of bytes) {
    buf = (buf << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += BASE32[(buf >> bits) & 31]
    }
  }
  if (bits > 0) result += BASE32[(buf << (5 - bits)) & 31]
  return result
}

async function selectAll(table, columns) {
  const pageSize = 1000
  let all = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const socios = await selectAll('socios', 'id')
  const secretos = await selectAll('socios_secrets', 'socio_id')
  const tieneSecreto = new Set(secretos.map((s) => s.socio_id))

  const faltantes = socios.filter((s) => !tieneSecreto.has(s.id))
  console.log(`Socios totales: ${socios.length}`)
  console.log(`Con secreto ya: ${tieneSecreto.size}`)
  console.log(`Sin secreto (a crear): ${faltantes.length}`)

  if (!COMMIT) {
    console.log('\nDry-run: no se escribió nada. Corré con --commit para aplicar.')
    return
  }

  const rows = faltantes.map((s) => ({ socio_id: s.id, totp_secret: generateSecret() }))
  const chunkSize = 500
  let creados = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('socios_secrets').insert(chunk)
    if (error) throw error
    creados += chunk.length
    console.log(`  insertados ${creados}/${rows.length}`)
  }

  console.log('\nListo.')
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
