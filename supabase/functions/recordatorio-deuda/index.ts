// Edge Function: recordatorio-deuda
//
// Cron mensual (pg_cron, día 22 a las 10:00 de Argentina — ver migración
// 20261010000001_recordatorios_deuda_envios.sql): manda el push "Cuotas
// pendientes" a los socios con semáforo amarillo/rojo según el último reporte
// NUVIX importado. Reemplaza al push que salía en cada import (importar-deuda)
// desde 2026-10-07: el día 22 el débito automático ya se cobró, así que el
// aviso le llega sólo a quien de verdad sigue debiendo.
//
// Reglas (lógica pura en _shared/recordatorio-deuda.ts):
//   - sólo el día 22 en Argentina, salvo `forzar` (pruebas manuales);
//   - una vez por mes: si ya hay una corrida 'enviado' este mes, saltea;
//   - el último reporte importado debe tener 2 días o menos, si no saltea
//     (mejor no avisar que avisar con datos viejos).
// Cada corrida queda registrada en recordatorios_deuda_envios (la ve
// Secretaría en /secretaria/deuda).
//
// Deploy: supabase functions deploy recordatorio-deuda --no-verify-jwt
//   (lo dispara pg_cron sin JWT de usuario, mismo patrón que recordatorio-debito)
//
// Secrets requeridos: CRON_SECRET.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  construirRecordatoriosDeuda,
  decidirEnvio,
  enviarPushRecordatoriosDeuda,
  fechaArgentina,
  inicioMesArgentina,
} from '../_shared/recordatorio-deuda.ts'

type Envio = {
  estado: 'enviado' | 'salteado' | 'error'
  motivo: string | null
  fecha_corte: string | null
  destinatarios?: number
  enviados?: number
  sin_token?: number
}

async function registrarEnvio(envio: Envio): Promise<void> {
  const { error } = await supabaseAdmin.from('recordatorios_deuda_envios').insert(envio)
  if (error) console.error('Error registrando la corrida en recordatorios_deuda_envios:', error.message)
}

async function leerForzar(req: Request): Promise<boolean> {
  if (new URL(req.url).searchParams.get('forzar') === 'true') return true
  try {
    const body = await req.json()
    return body?.forzar === true
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
    return jsonError(401, 'Sin autorización')
  }

  const forzar = await leerForzar(req)
  const ahora = new Date()
  const hoy = fechaArgentina(ahora)

  let fechaCorte: string | null = null
  try {
    const { data: ultima, error: ultimaErr } = await supabaseAdmin
      .from('importaciones_deuda')
      .select('fecha_corte')
      .order('fecha_corte', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultimaErr) throw new Error(`Error leyendo importaciones_deuda: ${ultimaErr.message}`)
    fechaCorte = (ultima?.fecha_corte as string | undefined) ?? null

    const { data: envioDelMes, error: envioErr } = await supabaseAdmin
      .from('recordatorios_deuda_envios')
      .select('id')
      .eq('estado', 'enviado')
      .gte('ejecutado_at', inicioMesArgentina(hoy))
      .limit(1)
    if (envioErr) throw new Error(`Error leyendo recordatorios_deuda_envios: ${envioErr.message}`)

    const decision = decidirEnvio({
      hoy,
      forzar,
      ultimoCorte: fechaCorte,
      yaEnviadoEsteMes: (envioDelMes ?? []).length > 0,
    })

    if (!decision.enviar) {
      await registrarEnvio({ estado: 'salteado', motivo: decision.motivo, fecha_corte: fechaCorte })
      return jsonOk({ enviado: false, motivo: decision.motivo, fecha_corte: fechaCorte })
    }

    const recordatorios = await construirRecordatoriosDeuda(supabaseAdmin, ahora)
    const resumen = await enviarPushRecordatoriosDeuda(supabaseAdmin, recordatorios)
    console.log(
      `Recordatorios de deuda (push): ${resumen.enviados} enviados, ${resumen.sinToken} sin token, ` +
      `${resumen.fallidos} con error, de ${resumen.destinatarios} destinatarios.`,
    )

    await registrarEnvio({
      estado: 'enviado',
      motivo: resumen.fallidos > 0 ? `${resumen.fallidos} destinatario(s) con error de envío.` : null,
      fecha_corte: fechaCorte,
      destinatarios: resumen.destinatarios,
      enviados: resumen.enviados,
      sin_token: resumen.sinToken,
    })
    return jsonOk({ enviado: true, fecha_corte: fechaCorte, ...resumen })
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('recordatorio-deuda:', motivo)
    await registrarEnvio({ estado: 'error', motivo, fecha_corte: fechaCorte })
    return jsonError(500, motivo)
  }
})
