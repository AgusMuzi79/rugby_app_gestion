// Mail a cada titular de grupo familiar con las cuentas disponibles de su
// grupo (la suya + la de cada dependiente) — mail de login + recordatorio
// de que la contraseña es el DNI de cada uno. Complementa el gate de
// "registrar mail real" que se agrega en la app (app/(auth)/registrar-mail.tsx):
// mientras la familia no registre un mail propio para cada dependiente, este
// mail les da el dato para poder loguearse como cualquiera de ellos.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... CLUB_EMAIL_FROM="..." node mail-directorio-familiar.mjs                 # dry-run (default)
//   SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... CLUB_EMAIL_FROM="..." node mail-directorio-familiar.mjs --commit        # manda de verdad

import { createClient } from '@supabase/supabase-js'

const COMMIT = process.argv.includes('--commit')
const SUPABASE_URL = 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const CLUB_EMAIL_FROM = process.env.CLUB_EMAIL_FROM

if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}
if (COMMIT && (!RESEND_API_KEY || !CLUB_EMAIL_FROM)) {
  console.error('Falta RESEND_API_KEY o CLUB_EMAIL_FROM en el entorno. No se puede correr --commit sin ellos.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function selectAll(table, columns, filterFn) {
  const pageSize = 1000
  let all = [], from = 0
  for (;;) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1)
    if (filterFn) query = filterFn(query)
    const { data, error } = await query
    if (error) throw error
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function emailTemplate(bodyHtml) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#15110A;padding:32px 24px;text-align:center">
        <h1 style="color:#F5B41C;font-size:22px;margin:0;letter-spacing:2px">UNCAS RUGBY CLUB</h1>
      </div>
      <div style="padding:32px 24px;background:#ffffff">${bodyHtml}</div>
      <div style="background:#15110A;padding:16px 24px;text-align:center">
        <p style="color:#8E8574;font-size:12px;margin:0">UNCAS Rugby Club · Gestión Operativa</p>
      </div>
    </div>
  `
}

async function enviarEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CLUB_EMAIL_FROM, to: [to], subject, html }),
  })
  if (!res.ok) {
    console.error(`  ERROR Resend (${res.status}): ${await res.text()}`)
    return false
  }
  return true
}

async function main() {
  const socios = await selectAll('socios', 'id, dni, cabecera_id, profile_id, estado',
    (q) => q.in('estado', ['activo', 'pendiente']))

  const perfiles = await selectAll('profiles', 'id, nombre')
  const nombrePorProfileId = new Map(perfiles.map((p) => [p.id, p.nombre]))

  // auth.users no es accesible vía .from() del cliente JS — hay que pedirlo
  // por usuario con getUserById. Se hace en batch chico por grupo, no para
  // los 1528 socios enteros.
  const socioPorId = new Map(socios.map((s) => [s.id, s]))
  const gruposPorTitular = new Map()
  for (const s of socios) {
    if (!s.cabecera_id) continue
    if (!gruposPorTitular.has(s.cabecera_id)) gruposPorTitular.set(s.cabecera_id, [])
    gruposPorTitular.get(s.cabecera_id).push(s)
  }

  console.log(`Titulares con al menos 1 dependiente: ${gruposPorTitular.size}`)

  let enviados = 0, omitidosSinMail = 0, errores = 0, procesados = 0

  for (const [titularId, dependientes] of gruposPorTitular) {
    const titular = socioPorId.get(titularId)
    if (!titular) { omitidosSinMail++; continue }

    const { data: { user: titularUser } } = await supabase.auth.admin.getUserById(titular.profile_id)
    const titularEmail = titularUser?.email ?? ''
    if (!titularEmail || titularEmail.endsWith('@uncas.local')) { omitidosSinMail++; continue }

    const filas = []
    filas.push({ nombre: nombrePorProfileId.get(titular.profile_id) ?? 'Vos', dni: titular.dni, email: titularEmail, propio: true })

    for (const dep of dependientes) {
      const { data: { user: depUser } } = await supabase.auth.admin.getUserById(dep.profile_id)
      filas.push({
        nombre: nombrePorProfileId.get(dep.profile_id) ?? 'Socio',
        dni: dep.dni,
        email: depUser?.email ?? '(sin cuenta)',
        propio: false,
      })
    }

    procesados++
    const titularNombre = nombrePorProfileId.get(titular.profile_id) ?? 'Socio'

    if (!COMMIT) {
      console.log(`  [dry-run] ${titularNombre} <${titularEmail}> — ${filas.length} cuenta(s) en el grupo`)
      continue
    }

    const filasHtml = filas.map((f) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${f.propio ? 'Vos' : f.nombre}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${f.email}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${f.dni}</td>
      </tr>
    `).join('')

    const html = emailTemplate(`
      <p style="font-size:15px">Hola ${titularNombre},</p>
      <p style="font-size:15px;line-height:1.6">
        Te compartimos las cuentas disponibles de tu grupo familiar en la app de UNCAS Rugby Club,
        para que puedas ingresar a la cuenta de cualquiera de tus dependientes cuando lo necesites
        (por ejemplo, para mostrar su carnet en portería).
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #15110A">Nombre</th>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #15110A">Mail para ingresar</th>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #15110A">DNI (contraseña)</th>
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>
      <p style="font-size:13px;color:#888;line-height:1.6">
        La contraseña de cada cuenta es el número de DNI de esa persona. Si alguno de los mails
        de la tabla es uno generado automáticamente (termina en @uncas.local), lo pueden usar
        igual para ingresar — y una vez adentro, la app va a ofrecer la opción de registrar un
        mail real para esa cuenta.
      </p>
    `)

    const ok = await enviarEmail({
      to: titularEmail,
      subject: 'Las cuentas de tu grupo familiar en la app de UNCAS Rugby Club',
      html,
    })
    if (ok) enviados++; else errores++
  }

  console.log(`\nProcesados: ${procesados}`)
  console.log(`Omitidos (titular sin mail propio válido): ${omitidosSinMail}`)
  if (COMMIT) {
    console.log(`Enviados: ${enviados}`)
    console.log(`Errores: ${errores}`)
  } else {
    console.log('\nDry-run: no se mandó nada. Corré con --commit para enviar de verdad.')
  }
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1) })
