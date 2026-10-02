// Deja la contraseña de Auth de un socio igual a su DNI actual (socios.dni).
//
// Por qué: la carga masiva creó cada cuenta con password = DNI del CSV (o `SD{cod}` si no tenía).
// Si el DNI se corrigió después, la contraseña quedó vieja y el login por DNI falla con
// "Credenciales incorrectas". Ver auditar-dni-vs-carga.mjs. El Dashboard de Supabase sólo manda
// link por mail, y para quien tiene mail sintético (@uncas.local) ese link no llega a ningún lado.
//
// Uso (desde scripts/):
//   SUPABASE_SERVICE_ROLE_KEY=... node resetear-password-a-dni.mjs                      # dry-run, los 6 por defecto
//   SUPABASE_SERVICE_ROLE_KEY=... node resetear-password-a-dni.mjs 16340 7269           # dry-run, sólo esos
//   SUPABASE_SERVICE_ROLE_KEY=... node resetear-password-a-dni.mjs --commit             # aplica
//
// Sin --commit no escribe nada. Nunca imprime contraseñas. Saltea DNI sintéticos (`SD...`):
// no son un DNI real y no sirven como contraseña de login. No toca profiles ni socios.

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')

// Tillet (DNI corregido real→real) + 5 que tenían DNI sintético en la carga y hoy tienen el real.
const POR_DEFECTO = ['16340', '17988', '16072', '7110', '16557', '7269']
const numeros = args.filter((a) => !a.startsWith('--'))
const objetivo = numeros.length ? numeros : POR_DEFECTO

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const MIN_PASSWORD = 6 // mínimo por defecto de Supabase Auth

const { data: socios, error } = await supabase
  .from('socios')
  .select('numero_socio, dni, profile_id')
  .in('numero_socio', objetivo)
if (error) { console.error(`Error leyendo socios: ${error.message}`); process.exit(1) }

const porNumero = new Map(socios.map((s) => [String(s.numero_socio), s]))
const aplicables = []

console.log(COMMIT ? 'MODO COMMIT\n' : 'Dry-run (no se escribe nada)\n')
for (const n of objetivo) {
  const s = porNumero.get(n)
  if (!s) { console.log(`${n}\tSALTEADO: no existe en socios`); continue }
  if (/^SD/i.test(s.dni)) { console.log(`${n}\tSALTEADO: DNI sintético (${s.dni})`); continue }
  if (String(s.dni).length < MIN_PASSWORD) { console.log(`${n}\tSALTEADO: DNI de ${String(s.dni).length} dígitos, menor al mínimo de contraseña (${MIN_PASSWORD})`); continue }

  const { data: u, error: uErr } = await supabase.auth.admin.getUserById(s.profile_id)
  if (uErr || !u?.user) { console.log(`${n}\tSALTEADO: sin usuario de Auth (${uErr?.message ?? 'no encontrado'})`); continue }

  console.log(`${n}\tDNI ${s.dni}\tauth=${u.user.email}\tlast_sign_in=${u.user.last_sign_in_at ?? 'nunca'}`)
  aplicables.push({ numero: n, profile_id: s.profile_id, dni: s.dni, ya_ingreso: !!u.user.last_sign_in_at })
}

const yaIngresaron = aplicables.filter((a) => a.ya_ingreso)
if (yaIngresaron.length) {
  console.log(`\n[atención] ${yaIngresaron.length} ya iniciaron sesión alguna vez (${yaIngresaron.map((a) => a.numero).join(', ')}): pueden haber cambiado su contraseña a propósito.`)
}

console.log(`\nAplicables: ${aplicables.length} de ${objetivo.length}`)
if (!COMMIT) {
  console.log('Dry-run: no se escribió nada. Corré con --commit para aplicar.')
  process.exit(0)
}

const errores = []
for (const a of aplicables) {
  const { error: updErr } = await supabase.auth.admin.updateUserById(a.profile_id, { password: a.dni })
  if (updErr) errores.push({ numero: a.numero, error: updErr.message })
  else console.log(`${a.numero}\tcontraseña actualizada`)
}
if (errores.length) {
  console.error(`\n${errores.length} errores:\n${JSON.stringify(errores, null, 2)}`)
  process.exitCode = 1
} else {
  console.log('\nListo, sin errores.')
}
