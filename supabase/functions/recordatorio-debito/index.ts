// Edge Function: recordatorio-debito
//
// Cron diario (pg_cron, ver migración 20260826000000_debito_automatico_recordatorio.sql):
// revisa si mañana hay una fecha de débito automático cargada por Secretaría
// (tabla fechas_debito_automatico, panel web /secretaria/debito-automatico)
// y, si la hay y todavía no se avisó, manda push + mail a todos los socios
// que pagan con tarjeta (socios.cobro_con_tarjeta — Vendedor='VISA' en el
// padrón NUVIX, débito o crédito, ambas se cobran el mismo día) para que
// tengan fondos disponibles.
//
// Deploy: supabase functions deploy recordatorio-debito --no-verify-jwt
//   (lo dispara pg_cron sin JWT de usuario, mismo patrón que socios-pagos?action=cobro-mensual)
//
// Secrets requeridos: CRON_SECRET, RESEND_API_KEY, CLUB_EMAIL_FROM (mail se
// omite en silencio si faltan los últimos dos, ver _shared/email.ts).

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { enviarEmail, emailTemplate } from '../_shared/email.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_CHUNK_SIZE = 100
const PAGE_SIZE = 1000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return jsonError(401, 'Sin autorización')
  }

  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: fecha, error: fechaErr } = await supabaseAdmin
    .from('fechas_debito_automatico')
    .select('id, fecha')
    .eq('fecha', manana)
    .eq('aviso_enviado', false)
    .maybeSingle()

  if (fechaErr) return jsonError(500, `Error leyendo fechas_debito_automatico: ${fechaErr.message}`)
  if (!fecha) return jsonOk({ enviado: false, motivo: 'sin fecha de débito para mañana (o ya avisada)' })

  // Socios con cobro por tarjeta, activos o pendientes de validar foto —
  // paginado porque PostgREST devuelve máximo 1000 filas sin .range() (mismo
  // bug ya conocido en este proyecto, ver notifications/index.ts).
  let socios: { profile_id: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('socios')
      .select('profile_id')
      .eq('cobro_con_tarjeta', true)
      .in('estado', ['activo', 'pendiente'])
      .range(from, from + PAGE_SIZE - 1)
    if (error) return jsonError(500, `Error leyendo socios: ${error.message}`)
    socios = socios.concat(data ?? [])
    if (!data || data.length < PAGE_SIZE) break
  }

  const profileIds = socios.map(s => s.profile_id).filter((id): id is string => !!id)

  const fechaLabel = formatFechaLabel(fecha.fecha)
  const [pushResumen, mailResumen] = await Promise.all([
    enviarPush(profileIds, fechaLabel),
    enviarMails(profileIds, fechaLabel),
  ])

  await supabaseAdmin
    .from('fechas_debito_automatico')
    .update({ aviso_enviado: true, aviso_enviado_at: new Date().toISOString() })
    .eq('id', fecha.id)

  return jsonOk({ enviado: true, socios: profileIds.length, push: pushResumen, mails: mailResumen })
})

function formatFechaLabel(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

async function fetchPushTokens(usuarioIds: string[]): Promise<string[]> {
  const tokens: string[] = []
  for (let i = 0; i < usuarioIds.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = usuarioIds.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin.from('push_tokens').select('token').in('usuario_id', chunk)
    if (error) { console.error('Error trayendo push_tokens:', error.message); continue }
    tokens.push(...(data ?? []).map(r => r.token))
  }
  return tokens
}

async function enviarPush(profileIds: string[], fechaLabel: string): Promise<{ tokensValidos: number; ok: number }> {
  const tokens = (await fetchPushTokens(profileIds))
    .filter(t => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
  const resumen = { tokensValidos: tokens.length, ok: 0 }
  if (!tokens.length) return resumen

  const messages = tokens.map(to => ({
    to,
    title: 'Débito automático mañana',
    body:  `Mañana ${fechaLabel} se debita el pago de tu cuota. Asegurate de tener fondos en la cuenta/tarjeta adherida.`,
    data:  { type: 'recordatorio_debito' },
    sound: 'default',
  }))

  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(chunk),
      })
      if (res.ok) resumen.ok += chunk.length
      else console.error('Expo push falló:', res.status, await res.text())
    } catch (e) {
      console.error('Error enviando push:', e)
    }
  }
  return resumen
}

async function enviarMails(profileIds: string[], fechaLabel: string): Promise<{ enviados: number; omitidos: number }> {
  let enviados = 0, omitidos = 0
  for (const profileId of profileIds) {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(profileId)
    const email = user?.email ?? ''
    if (!email || email.endsWith('@uncas.local')) { omitidos++; continue }

    const html = emailTemplate(`
      <p style="font-size:15px">Hola,</p>
      <p style="font-size:15px;line-height:1.6">Te avisamos que <strong>mañana ${fechaLabel}</strong> se realiza el débito automático del pago de tu cuota.</p>
      <p style="font-size:15px;line-height:1.6">Por favor asegurate de contar con fondos suficientes en la cuenta/tarjeta adherida para evitar inconvenientes.</p>
    `)
    const ok = await enviarEmail({ to: email, subject: 'Recordatorio: mañana se debita tu cuota — UNCAS Rugby Club', html })
    ok ? enviados++ : omitidos++
  }
  return { enviados, omitidos }
}
