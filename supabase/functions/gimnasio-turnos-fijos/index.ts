// Edge Function: gimnasio-turnos-fijos
//
// Cron cada 15 minutos (pg_cron, ver migración 20261007000000_gimnasio_turnos_fijos_auto.sql: el
// bloque del cron está COMENTADO y no se registra sin OK de Agus). Hace, en orden:
//   1. Materializa los turnos fijos: RPC gimnasio_materializar_fijos (reservas 'fijo' de las próximas
//      `semanas_fijos` semanas; idempotente, no depende del interruptor de faltas).
//   2. Procesa faltas: RPC gimnasio_procesar_faltas (evalúa asistencia, cuenta rachas, registra avisos
//      y bajas). Con gimnasio_config.faltas_activas = false no hace nada.
//   3. Manda push SÓLO por lo que esa RPC acaba de registrar (avisos de racha y bajas del horario) al
//      perfil propio del socio (sin fallback al titular: 13+ tienen perfil propio).
//
// Body: { dry_run?: boolean } (o ?dry_run=true). Con dry_run no se escribe ni se envía nada: las dos
// RPC corren con p_aplicar=false (calculan y deshacen) y la respuesta trae lo que se habría hecho
// (`a_enviar` en lugar de `enviados`). PRIMER USO: SIEMPRE con dry_run.
//
// Deploy: supabase functions deploy gimnasio-turnos-fijos --no-verify-jwt
//   (lo dispara pg_cron sin JWT de usuario). Secrets requeridos: CRON_SECRET.
//
// Orden y modo de falla (importante): los eventos de aviso/baja los escribe la RPC ANTES de que
// existan los tokens ni el envío. Por eso:
//   · Si falla leer los tokens (500) los eventos YA quedaron registrados pero los push no salieron;
//     la respuesta lo dice (`eventos_registrados`). No se reenvían solos: los avisos dedupean por racha
//     y las bajas se ven igual en la app (la reserva fija desaparece). Es el costo aceptado de tener la
//     deduplicación en la base. La materialización ya se commiteó antes (es idempotente).
//   · Un push que Expo no entrega (ticket con error, timeout) no es un 500: se cuenta en `fallidos`.
//
// Contrato de errores: 401 sin x-cron-secret válido (se evalúa primero); errores reales de DB => 500.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  enviarPush,
  esTokenExpo,
  mensajeAviso,
  mensajeBaja,
  type DatosFranjaFalta,
  type PushItem,
} from '../_shared/expoPush.ts'

const ID_CHUNK_SIZE = 100

interface ItemFalta extends DatosFranjaFalta {
  socio_id: string
  profile_id: string | null
  franja_id: string
}

interface ResultadoFaltas {
  ok: boolean
  activo: boolean
  aplicado?: boolean
  evaluadas?: number
  asistio?: number
  falto?: number
  avisos?: ItemFalta[]
  bajas?: ItemFalta[]
}

function errorDb(contexto: string, err: unknown): Response {
  console.error(`gimnasio-turnos-fijos: ${contexto}`, err)
  return jsonError(500, 'Error interno')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return jsonError(401, 'Sin autorización')
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vacío: se usan defaults */ }
  const dryRun = body.dry_run === true || new URL(req.url).searchParams.get('dry_run') === 'true'

  // 1. Materialización de turnos fijos.
  const { data: mat, error: matErr } = await supabaseAdmin.rpc('gimnasio_materializar_fijos', {
    p_aplicar: !dryRun,
  })
  if (matErr || !mat) return errorDb('gimnasio_materializar_fijos', matErr)
  const errores = (mat.errores ?? []) as unknown[]
  if (errores.length > 0) console.error('gimnasio-turnos-fijos: turnos fijos con error:', JSON.stringify(errores))

  // 2. Proceso de faltas.
  const { data: faltasRaw, error: faltasErr } = await supabaseAdmin.rpc('gimnasio_procesar_faltas', {
    p_aplicar: !dryRun,
  })
  if (faltasErr || !faltasRaw) return errorDb('gimnasio_procesar_faltas', faltasErr)
  const faltas = faltasRaw as ResultadoFaltas
  const avisos = faltas.avisos ?? []
  const bajas = faltas.bajas ?? []

  const respuesta = {
    ok: true,
    dry_run: dryRun,
    materializacion: {
      fijos_procesados: mat.fijos_procesados,
      creadas: mat.creadas,
      omitidas: mat.omitidas,
      errores,
    },
    faltas: {
      activo: faltas.activo,
      evaluadas: faltas.evaluadas ?? 0,
      asistio: faltas.asistio ?? 0,
      falto: faltas.falto ?? 0,
      avisos: avisos.length,
      bajas: bajas.length,
    },
  }

  if (avisos.length === 0 && bajas.length === 0) {
    return jsonOk({ ...respuesta, enviados: 0, fallidos: 0, sin_token: 0, ...(dryRun ? { a_enviar: 0 } : {}) })
  }

  // 3. Tokens de push del perfil propio de cada socio a notificar.
  const profileIds = [...new Set([...avisos, ...bajas].map((i) => i.profile_id).filter((p): p is string => !!p))]
  const tokensPorPerfil = await leerTokensPorPerfil(profileIds)
  if (tokensPorPerfil === null) {
    console.error('gimnasio-turnos-fijos: no se pudieron leer los push_tokens; avisos NO enviados')
    return new Response(
      JSON.stringify({
        error: 'Error interno',
        detalle: 'Los eventos de faltas ya quedaron registrados pero los avisos no se enviaron.',
        eventos_registrados: dryRun ? 0 : avisos.length + bajas.length,
        avisos_no_enviados: avisos.length + bajas.length,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const items: PushItem[] = []
  const conToken = new Set<string>()
  let sinToken = 0
  const armar = (lista: ItemFalta[], tipo: 'aviso' | 'baja') => {
    for (const it of lista) {
      const clave = `${tipo}:${it.socio_id}:${it.franja_id}`
      const tokens = it.profile_id ? tokensPorPerfil.get(it.profile_id) ?? [] : []
      if (tokens.length === 0) { sinToken++; continue }
      conToken.add(clave)
      for (const to of tokens) {
        items.push({
          clave,
          msg: tipo === 'aviso' ? mensajeAviso(it, to, it.franja_id) : mensajeBaja(it, to, it.franja_id),
        })
      }
    }
  }
  armar(avisos, 'aviso')
  armar(bajas, 'baja')

  if (dryRun) {
    return jsonOk({ ...respuesta, enviados: 0, fallidos: 0, sin_token: sinToken, a_enviar: conToken.size })
  }

  const { entregados, fallidos } = await enviarPush(items)
  return jsonOk({ ...respuesta, enviados: entregados.size, fallidos, sin_token: sinToken })
})

// profile_id -> tokens Expo válidos. Devuelve null si falla la lectura: el caller NO debe tomarlo
// como "sin tokens" (sería no avisar a nadie en silencio).
async function leerTokensPorPerfil(profileIds: string[]): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>()
  for (let i = 0; i < profileIds.length; i += ID_CHUNK_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('push_tokens')
      .select('usuario_id, token')
      .in('usuario_id', profileIds.slice(i, i + ID_CHUNK_SIZE))
    if (error) { console.error('gimnasio-turnos-fijos: push_tokens:', error.message); return null }
    for (const row of data ?? []) {
      if (!esTokenExpo(row.token)) continue
      const arr = out.get(row.usuario_id as string) ?? []
      arr.push(row.token)
      out.set(row.usuario_id as string, arr)
    }
  }
  return out
}
