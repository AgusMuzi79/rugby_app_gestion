// Push único (no notificación) recordándole a todos los socios reales que su
// foto de perfil debe mostrarles la cara con claridad — Portería la usa para
// validar identidad visualmente contra el carnet al escanear el QR en la
// puerta del club. Pensado para mandarse una sola vez, cuando Agus decida
// (probablemente coordinado con el lanzamiento de la app).
//
// A propósito NO escribe en `notificaciones`/`notificaciones_destinatarios`
// ni en `noticias` — sólo un POST directo a Expo, mismo patrón que
// notificarPushAprobacionComprobante/notificarPushRechazoComprobante en
// supabase/functions/socios-pagos/index.ts. No aparece en el feed de
// Noticias ni en el historial de "Notificaciones" de subcomisión.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=... node push-recordatorio-foto.mjs             # dry-run (default, no manda nada)
//   SUPABASE_SERVICE_ROLE_KEY=... node push-recordatorio-foto.mjs --commit    # manda de verdad
//
// La service_role key se consigue en Supabase Dashboard → Project Settings → API → service_role (secret).
// Nunca se commitea ni se imprime en este script.

import { createClient } from '@supabase/supabase-js'

const COMMIT = process.argv.includes('--commit')
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Mensaje ────────────────────────────────────────────────────────────────

const PUSH_TITULO = 'Actualizá tu foto de perfil'
const PUSH_MENSAJE = 'Para validar tu identidad en la puerta necesitamos que tu foto te muestre la cara con claridad. Podés cambiarla desde Mi Perfil.'

// ─── Constantes Expo ────────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_CHUNK_SIZE = 100

// PostgREST devuelve máximo 1000 filas por default sin .range() — con 1500+
// socios hay que paginar (mismo bug ya documentado en el proyecto).
const PAGE_SIZE = 1000

// PostgREST arma la URL del filtro .in() con todos los ids en la query
// string — con muchos socios esa URL se vuelve gigante y el request falla.
// Se trae en lotes chicos, mismo patrón que fetchPushTokens() en
// supabase/functions/notifications/index.ts.
const PUSH_TOKENS_IN_CHUNK_SIZE = 100

// ─── Destinatarios ──────────────────────────────────────────────────────────

// Mismo filtro que getDestinatariosSocio() en supabase/functions/notifications/index.ts:
// busca por el array roles[] (no por rol activo), así llega a socios cuyo rol
// activo hoy es staff (entrenador, coordinador, etc.).
async function fetchSocioProfileIds() {
  let profiles = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .contains('roles', ['socio'])
      .eq('activo', true)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    profiles = profiles.concat(data ?? [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return profiles.map((p) => p.id)
}

async function fetchPushTokens(usuarioIds) {
  const tokens = []
  for (let i = 0; i < usuarioIds.length; i += PUSH_TOKENS_IN_CHUNK_SIZE) {
    const chunk = usuarioIds.slice(i, i + PUSH_TOKENS_IN_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('usuario_id', chunk)
    if (error) {
      console.error(`  ERROR trayendo push_tokens (lote de ${chunk.length}): ${error.message}`)
      continue
    }
    tokens.push(...(data ?? []).map((r) => r.token))
  }
  return tokens
}

// ─── Expo Push ──────────────────────────────────────────────────────────────

async function enviarExpoPush(tokens) {
  const validos = tokens.filter((t) =>
    t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))

  console.log(`Tokens válidos de Expo: ${validos.length} (de ${tokens.length} totales)`)
  if (validos.length === 0) return

  const messages = validos.map((to) => ({
    to,
    title: PUSH_TITULO,
    body:  PUSH_MENSAJE,
    sound: 'default',
    data:  { type: 'recordatorio_foto' },
  }))

  let ok = 0
  const errores = []

  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error(`  ERROR HTTP ${res.status}: ${text}`)
        errores.push({ error: `http_${res.status}`, message: text })
        continue
      }

      // Expo devuelve 200 general aunque un mensaje puntual haya fallado —
      // el detalle real está en cada "ticket" del array `data`.
      const json = await res.json().catch(() => null)
      const tickets = json?.data
      if (!tickets) {
        console.error('  ERROR: respuesta de Expo sin `data`:', JSON.stringify(json))
        errores.push({ error: 'sin_data', message: JSON.stringify(json) })
        continue
      }
      tickets.forEach((t, idx) => {
        const to = chunk[idx]?.to ?? '?'
        if (t.status === 'error') {
          errores.push({ to, error: t.details?.error, message: t.message })
        } else {
          ok++
        }
      })
    } catch (e) {
      console.error('  ERROR de red enviando push a Expo:', e.message)
      errores.push({ error: 'network', message: e.message })
    }
  }

  console.log(`\nTickets OK: ${ok}`)
  console.log(`Tickets con error: ${errores.length}`)
  if (errores.length > 0) console.log(JSON.stringify(errores, null, 2))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(COMMIT ? '=== MODO COMMIT — se va a mandar el push de verdad ===\n' : '=== DRY-RUN (default) — no se manda nada ===\n')

  const profileIds = await fetchSocioProfileIds()
  console.log(`Socios reales (roles contiene 'socio', activo=true): ${profileIds.length}`)

  const tokens = await fetchPushTokens(profileIds)
  console.log(`Push tokens encontrados: ${tokens.length}`)

  console.log(`\nTítulo:  ${PUSH_TITULO}`)
  console.log(`Mensaje: ${PUSH_MENSAJE}`)

  if (!COMMIT) {
    console.log('\nDry-run — no se mandó nada. Corré con --commit para mandar de verdad.')
    return
  }

  console.log('')
  await enviarExpoPush(tokens)
}

main().catch((e) => {
  console.error('Error fatal:', e)
  process.exit(1)
})
