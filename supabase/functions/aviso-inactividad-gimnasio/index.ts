// Edge Function: aviso-inactividad-gimnasio
//
// Cron semanal (pg_cron, ver migración 20261003000002_aviso_inactividad_gimnasio.sql,
// el bloque del cron está comentado): avisa por push a los socios activos con un
// servicio de Gimnasio que no registran ingresos al gimnasio hace más de 20 días,
// por si están pagando sin usarlo o quieren darlo de baja.
//
// PRIMER USO: SIEMPRE con dry_run. La primera corrida real avisaría a casi todos
// los socios con gimnasio sin ingresos recientes. Invocar con body
// {"dry_run": true} (o ?dry_run=true) — devuelve conteos y una muestra de
// numero_socio sin enviar nada ni tocar la base. Sólo después de revisarlo y
// con el OK de Agus, registrar el cron (que llama sin dry_run).
//
// Deploy: supabase functions deploy aviso-inactividad-gimnasio --no-verify-jwt
//   (lo dispara pg_cron sin JWT de usuario, mismo patrón que recordatorio-debito)
//
// Secrets requeridos: CRON_SECRET.
//
// Quién entra:
//   - socios `activo` con algún servicio de gimnasio activo (nombre ilike '%gimnasio%',
//     misma regla que tieneServicioGimnasio en socios-qr). Se excluyen las variantes
//     de $0 ('Cliente Gimnasio', 'Gimnasio Becado') y la categoría 'Cliente Gimnasio':
//     no pagan, no tiene sentido avisarles que pueden darlo de baja.
//   - cuyo último ingreso en `accesos` (punto='gimnasio') es de hace más de 20 días,
//     o que nunca ingresaron.
//   - a los que no se les avisó desde su último ingreso. Si nunca ingresaron, se
//     avisa como máximo una vez cada 60 días. Las filas de invitados (socio_id null)
//     no cuentan: sólo se miran accesos de los socios candidatos.
//
// Menores de 18: el aviso va al titular del grupo familiar (cabecera_id), nombrando
// al menor — mismo criterio que construirRecordatoriosDeuda en importar-deuda. Sin
// titular resuelto, se omite. Sólo push, sin mail (decisión 2026-08-26).

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_CHUNK_SIZE = 100
const PAGE_SIZE = 1000
const ID_CHUNK_SIZE = 100

const DIAS_INACTIVIDAD = 20
const DIAS_REAVISO_SIN_INGRESOS = 60
const MUESTRA_DRY_RUN = 20

// Variantes de gimnasio sin cargo: no corresponde avisarles de una posible baja.
const SERVICIOS_GRATIS = ['cliente gimnasio', 'gimnasio becado']
const CATEGORIA_EXCLUIDA = 'Cliente Gimnasio'

const MS_DIA = 24 * 60 * 60 * 1000

type SocioRow = {
  id: string
  numero_socio: string
  profile_id: string | null
  cabecera_id: string | null
  fecha_nacimiento: string | null
  aviso_inactividad_enviado_at: string | null
  categorias_socio: { nombre: string } | null
  profiles: { nombre: string } | null
}

type Destinatario = { profileId: string; socioIds: string[]; nombresMenores: string[]; incluyeAPropio: boolean }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return jsonError(401, 'Sin autorización')
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vacío: se usan defaults */ }
  const dryRun = body.dry_run === true || new URL(req.url).searchParams.get('dry_run') === 'true'

  const ahora = Date.now()

  // 1. Socios con un servicio de gimnasio pago.
  const conGimnasio = await socioIdsConGimnasioPago()
  if (conGimnasio === null) return jsonError(500, 'Error leyendo socio_servicios')

  // 2. De esos, los activos (sin la categoría Cliente Gimnasio).
  const socios = await fetchSocios([...conGimnasio])
  if (socios === null) return jsonError(500, 'Error leyendo socios')
  const activos = socios.filter(s => s.categorias_socio?.nombre !== CATEGORIA_EXCLUIDA)

  // 3. Último ingreso al gimnasio de cada uno.
  const ultimoIngreso = await fetchUltimoIngreso(activos.map(s => s.id))
  if (ultimoIngreso === null) return jsonError(500, 'Error leyendo accesos')

  const limiteInactividad = ahora - DIAS_INACTIVIDAD * MS_DIA
  const limiteReaviso     = ahora - DIAS_REAVISO_SIN_INGRESOS * MS_DIA

  const inactivos = activos.filter(s => {
    const ultimo = ultimoIngreso.get(s.id) ?? null
    if (ultimo !== null && ultimo > limiteInactividad) return false  // ingresó hace poco

    const avisado = s.aviso_inactividad_enviado_at ? new Date(s.aviso_inactividad_enviado_at).getTime() : null
    if (ultimo !== null) return avisado === null || avisado < ultimo // ya avisado desde su último ingreso
    return avisado === null || avisado < limiteReaviso               // nunca ingresó
  })

  // 4. Destinatarios: el propio socio, o el titular si es menor.
  const { destinatarios, sinTitular } = await resolverDestinatarios(inactivos)

  const profileIds = destinatarios.map(d => d.profileId)
  const tokensPorProfile = await fetchPushTokensPorProfile(profileIds)
  const conToken = destinatarios.filter(d => (tokensPorProfile.get(d.profileId) ?? []).length > 0)

  const resumen = {
    socios_con_gimnasio_pago: conGimnasio.size,
    socios_activos_candidatos: activos.length,
    inactivos: inactivos.length,
    destinatarios: destinatarios.length,
    destinatarios_con_token: conToken.length,
    menores_sin_titular: sinTitular,
  }

  if (dryRun) {
    const muestra = inactivos.slice(0, MUESTRA_DRY_RUN).map(s => s.numero_socio)
    return jsonOk({ dry_run: true, ...resumen, muestra_numero_socio: muestra })
  }

  // 5. Enviar y marcar sólo a quienes el push salió bien.
  const messages = conToken.flatMap(d =>
    (tokensPorProfile.get(d.profileId) ?? []).map(to => ({ profileId: d.profileId, msg: armarMensaje(d, to) }))
  )
  const { ok: okProfiles, fallidos } = await enviarPush(messages)

  const marcarIds = conToken.filter(d => okProfiles.has(d.profileId)).flatMap(d => d.socioIds)
  const marcados = await marcarAvisados(marcarIds)

  return jsonOk({ dry_run: false, ...resumen, push_ok: okProfiles.size, enviados: okProfiles.size, fallidos, socios_marcados: marcados })
})

// ─── Lecturas ────────────────────────────────────────────────────────────────

// Paginado: PostgREST devuelve máximo 1000 filas sin .range().
async function socioIdsConGimnasioPago(): Promise<Set<string> | null> {
  const ids = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('socio_servicios')
      .select('socio_id, servicios_opcionales!inner(nombre, activo)')
      .eq('servicios_opcionales.activo', true)
      .ilike('servicios_opcionales.nombre', '%gimnasio%')
      .order('socio_id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) { console.error('socio_servicios:', error.message); return null }

    for (const row of (data ?? []) as unknown as { socio_id: string; servicios_opcionales: { nombre: string } | null }[]) {
      const nombre = row.servicios_opcionales?.nombre?.trim().toLowerCase() ?? ''
      if (!SERVICIOS_GRATIS.includes(nombre)) ids.add(row.socio_id)
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return ids
}

const SOCIO_SELECT = 'id, numero_socio, profile_id, cabecera_id, fecha_nacimiento, aviso_inactividad_enviado_at, categorias_socio(nombre), profiles!socios_profile_id_fkey(nombre)'

async function fetchSocios(ids: string[]): Promise<SocioRow[] | null> {
  const out: SocioRow[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin
      .from('socios')
      .select(SOCIO_SELECT)
      .in('id', chunk)
      .eq('estado', 'activo')
    if (error) { console.error('socios:', error.message); return null }
    out.push(...((data ?? []) as unknown as SocioRow[]))
  }
  return out
}

// socio_id -> timestamp (ms) del último ingreso al gimnasio. Sólo se miran los
// socios candidatos, así las filas de invitados (socio_id null) no entran.
async function fetchUltimoIngreso(ids: string[]): Promise<Map<string, number> | null> {
  const ultimo = new Map<string, number>()
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE)
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from('accesos')
        .select('socio_id, creado_en')
        .eq('punto', 'gimnasio')
        .in('socio_id', chunk)
        .order('creado_en', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) { console.error('accesos:', error.message); return null }

      for (const row of (data ?? []) as { socio_id: string; creado_en: string }[]) {
        const t = new Date(row.creado_en).getTime()
        if (t > (ultimo.get(row.socio_id) ?? 0)) ultimo.set(row.socio_id, t)
      }
      if (!data || data.length < PAGE_SIZE) break
    }
  }
  return ultimo
}

// Mismo criterio que esMenorDeEdad en importar-deuda (mayoría de edad = 18).
function esMenorDeEdad(fechaNacimiento: string | null): boolean {
  if (!fechaNacimiento) return false
  const hace18 = new Date()
  hace18.setFullYear(hace18.getFullYear() - 18)
  return new Date(fechaNacimiento) > hace18
}

async function resolverDestinatarios(
  inactivos: SocioRow[],
): Promise<{ destinatarios: Destinatario[]; sinTitular: number }> {
  const cabeceraIds = [...new Set(
    inactivos
      .filter(s => esMenorDeEdad(s.fecha_nacimiento) && s.cabecera_id)
      .map(s => s.cabecera_id as string)
  )]

  const titulares = new Map<string, string>() // cabecera socio id -> profile_id
  for (let i = 0; i < cabeceraIds.length; i += ID_CHUNK_SIZE) {
    const chunk = cabeceraIds.slice(i, i + ID_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin.from('socios').select('id, profile_id').in('id', chunk)
    if (error) { console.error('titulares:', error.message); continue }
    for (const t of data ?? []) {
      if (t.profile_id) titulares.set(t.id as string, t.profile_id as string)
    }
  }

  const porProfile = new Map<string, Destinatario>()
  let sinTitular = 0

  for (const s of inactivos) {
    const menor = esMenorDeEdad(s.fecha_nacimiento)
    let profileId: string | null

    if (menor) {
      profileId = s.cabecera_id ? (titulares.get(s.cabecera_id) ?? null) : null
      if (!profileId) { sinTitular++; continue } // sin titular no hay fallback al menor
    } else {
      profileId = s.profile_id
      if (!profileId) continue
    }

    const dest = porProfile.get(profileId) ?? { profileId, socioIds: [], nombresMenores: [], incluyeAPropio: false }
    dest.socioIds.push(s.id)
    if (menor) dest.nombresMenores.push(s.profiles?.nombre ?? 'tu hijo/a')
    else dest.incluyeAPropio = true
    porProfile.set(profileId, dest)
  }

  return { destinatarios: [...porProfile.values()], sinTitular }
}

async function fetchPushTokensPorProfile(profileIds: string[]): Promise<Map<string, string[]>> {
  const porProfile = new Map<string, string[]>()
  for (let i = 0; i < profileIds.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = profileIds.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin.from('push_tokens').select('usuario_id, token').in('usuario_id', chunk)
    if (error) { console.error('Error trayendo push_tokens:', error.message); continue }
    for (const row of data ?? []) {
      const token = row.token as string
      if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) continue
      const arr = porProfile.get(row.usuario_id as string) ?? []
      arr.push(token)
      porProfile.set(row.usuario_id as string, arr)
    }
  }
  return porProfile
}

// ─── Envío ───────────────────────────────────────────────────────────────────

function unirNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

function armarMensaje(d: Destinatario, to: string) {
  const dias = DIAS_INACTIVIDAD
  const cierre = 'Si querés darlo de baja, o venías pagándolo sin darte cuenta, consultá con Secretaría.'

  let body: string
  if (d.nombresMenores.length === 0) {
    body = `Hace más de ${dias} días que no ingresás al gimnasio. ${cierre}`
  } else if (!d.incluyeAPropio) {
    body = `Hace más de ${dias} días que ${unirNombres(d.nombresMenores)} no ingresa al gimnasio. ${cierre}`
  } else {
    body = `Hace más de ${dias} días que ni vos ni ${unirNombres(d.nombresMenores)} ingresan al gimnasio. ${cierre}`
  }

  return {
    to,
    title: 'Tu servicio de Gimnasio',
    body,
    data:  { type: 'aviso_inactividad_gimnasio' },
    sound: 'default',
  }
}

// Expo responde 200 aunque algunos tickets fallen (p. ej. DeviceNotRegistered):
// `data` es un array de tickets en el mismo orden que los mensajes enviados.
// Un profile cuenta como entregado sólo si al menos uno de SUS tokens tuvo un
// ticket `ok`. Un body ausente o malformado se trata como no entregado.
async function enviarPush(
  messages: { profileId: string; msg: ReturnType<typeof armarMensaje> }[],
): Promise<{ ok: Set<string>; fallidos: number }> {
  const ok = new Set<string>()
  let fallidos = 0
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(chunk.map(c => c.msg)),
      })
      if (!res.ok) {
        console.error('Expo push falló:', res.status, await res.text())
        continue
      }

      const json = await res.json().catch(() => null) as { data?: unknown } | null
      const tickets = json?.data
      if (!Array.isArray(tickets) || tickets.length !== chunk.length) {
        console.error('Expo push: respuesta con formato inesperado, chunk tratado como no entregado')
        continue
      }

      tickets.forEach((t, idx) => {
        const status = (t as { status?: string } | null)?.status
        if (status === 'ok') ok.add(chunk[idx].profileId)
        else {
          fallidos++
          console.error('Expo push: ticket con error:', JSON.stringify(t))
        }
      })
    } catch (e) {
      console.error('Error enviando push:', e)
    }
  }
  return { ok, fallidos }
}

async function marcarAvisados(socioIds: string[]): Promise<number> {
  const ahora = new Date().toISOString()
  let marcados = 0
  for (let i = 0; i < socioIds.length; i += ID_CHUNK_SIZE) {
    const chunk = socioIds.slice(i, i + ID_CHUNK_SIZE)
    const { error } = await supabaseAdmin
      .from('socios')
      .update({ aviso_inactividad_enviado_at: ahora })
      .in('id', chunk)
    if (error) console.error('Error marcando aviso_inactividad_enviado_at:', error.message)
    else marcados += chunk.length
  }
  return marcados
}
