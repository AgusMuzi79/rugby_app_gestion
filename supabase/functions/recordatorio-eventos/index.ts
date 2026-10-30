// Edge Function: recordatorio-eventos
//
// Cron cada 5 minutos (pg_cron, ver migración 20261026000000_recordatorio_eventos.sql): manda un
// push ~30 minutos antes de cada entrenamiento y actividad. Los partidos no se recuerdan.
//
// 1. reclamar_recordatorios_eventos() marca de forma atómica los eventos que arrancan en los
//    próximos 30 minutos (hora de Argentina) y los devuelve con sus destinatarios: los socios
//    jugadores de la división que pasan la regla de la Agenda (servicio del deporte o beca) y los
//    entrenadores y colaboradores con la división asignada (colaboradores desde la migración
//    20261106000000; vienen en entrenador_profile_ids). Un evento reclamado no se vuelve a reclamar salvo que
//    cambien su fecha u hora, así que dos corridas superpuestas nunca avisan dos veces.
// 2. Cada socio suma su profile y los de sus tutores (igual que el push de cancelación).
// 3. La misma sesión cargada en varias divisiones (p. ej. "Gimnasio 20:30" para M19…Mayores) sale
//    como UN push por persona, con las divisiones que le tocan en el cuerpo
//    (_shared/recordatorio-eventos.ts).
// Si el envío falla después del reclamo, ese recordatorio se pierde: mejor que avisar dos veces.
//
// Deploy: supabase functions deploy recordatorio-eventos --no-verify-jwt
//   (lo dispara pg_cron sin JWT de usuario, mismo patrón que recordatorio-deuda)
//
// Secrets requeridos: CRON_SECRET.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { tutoresPorSocio } from '../_shared/tutores.ts'
import { enviarPush, trocear } from '../_shared/expoPush.ts'
import {
  mensajesRecordatorios,
  parsearReclamados,
  planificarRecordatorios,
} from '../_shared/recordatorio-eventos.ts'

const LOTE_IN = 100

/** socio_id -> profiles que reciben por ese socio: su propio profile y los de sus tutores activos. */
async function profilesPorSocio(socioIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  const agregar = (socioId: string, profileId: string) => {
    const lista = mapa.get(socioId) ?? []
    if (!lista.includes(profileId)) lista.push(profileId)
    mapa.set(socioId, lista)
  }
  for (const lote of trocear(socioIds, LOTE_IN)) {
    const { data, error } = await supabaseAdmin
      .from('socios')
      .select('id, profile_id')
      .in('id', lote)
      .not('profile_id', 'is', null)
    if (error) throw new Error(`Error leyendo socios: ${error.message}`)
    for (const s of data ?? []) agregar(s.id as string, s.profile_id as string)
  }
  // Una falla leyendo tutores se loguea en tutoresPorSocio y no frena el aviso a los jugadores.
  for (const [socioId, tutores] of await tutoresPorSocio(socioIds)) {
    for (const t of tutores) agregar(socioId, t)
  }
  return mapa
}

async function tokensPorProfile(profileIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  for (const lote of trocear(profileIds, LOTE_IN)) {
    const { data, error } = await supabaseAdmin.from('push_tokens').select('usuario_id, token').in('usuario_id', lote)
    if (error) {
      console.error(`Error leyendo push_tokens (lote de ${lote.length}):`, error.message)
      continue
    }
    for (const r of data ?? []) {
      const id = r.usuario_id as string
      mapa.set(id, [...(mapa.get(id) ?? []), r.token as string])
    }
  }
  return mapa
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return jsonError(401, 'Sin autorización')
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('reclamar_recordatorios_eventos')
    if (error) throw new Error(`Error reclamando recordatorios: ${error.message}`)
    const eventos = parsearReclamados(data)
    if (!eventos.length) return jsonOk({ eventos: 0, pushes: 0 })

    const socioIds = [...new Set(eventos.flatMap((e) => e.socio_ids))]
    const plan = planificarRecordatorios(eventos, await profilesPorSocio(socioIds))
    const tokens = await tokensPorProfile([...new Set(plan.map((r) => r.profileId))])
    const items = mensajesRecordatorios(plan, tokens)
    // Los errores de Expo (tickets rechazados, chunks fallidos) se juntan para el registro.
    const errores: string[] = []
    const { entregados, fallidos } = await enviarPush(items, {
      log: (...args: unknown[]) => {
        console.error(...args)
        errores.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '))
      },
    })

    const resumen = {
      eventos: eventos.length,
      destinatarios: plan.length,
      pushes: entregados.size,
      sin_token: plan.length - new Set(items.map((i) => i.clave)).size,
      fallidos,
    }
    console.log('recordatorio-eventos:', JSON.stringify(resumen))

    // Registro de la corrida (migración 20261027000000). Si falla, sólo se loguea.
    const detalle = plan.map((r) => ({
      titulo: r.title,
      cuerpo: r.body,
      profile_id: r.profileId,
      tokens: (tokens.get(r.profileId) ?? []).length,
      entregado: entregados.has(`${r.sesion}#${r.profileId}`),
    }))
    const { error: errLog } = await supabaseAdmin
      .from('recordatorio_eventos_envios')
      .insert({ ...resumen, detalle, errores })
    if (errLog) console.error('recordatorio-eventos: no se pudo registrar la corrida:', errLog.message)

    return jsonOk(resumen)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('recordatorio-eventos:', motivo)
    return jsonError(500, motivo)
  }
})
