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
//   - el último reporte importado debe tener 2 días o menos, si no saltea
//     (mejor no avisar que avisar con datos viejos);
//   - una vez por mes, de forma atómica: antes de mandar inserta una fila
//     'enviando' con el mes (`mes`, 'YYYY-MM'); el índice único parcial de
//     recordatorios_deuda_envios (mes, estado IN ('enviando','enviado'))
//     hace que una segunda corrida del mismo mes falle con 23505 y saltee.
//     Al terminar, esa misma fila pasa a 'enviado' (llegó al menos un aviso)
//     o 'error' (no llegó ninguno, o falló algo): 'error' libera el mes para
//     reintentar.
// Si la actualización final falla, la fila queda 'enviando' y sigue
// bloqueando el mes: hay que corregirla a mano (UPDATE a 'enviado' o 'error'
// según lo que muestren los logs de la función).
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
  MOTIVO_MES_RESERVADO,
  construirRecordatoriosDeuda,
  decidirEnvio,
  enviarPushRecordatoriosDeuda,
  esViolacionUnica,
  estadoFinalEnvio,
  fechaArgentina,
  mesArgentina,
} from '../_shared/recordatorio-deuda.ts'

const TABLA = 'recordatorios_deuda_envios'

type Envio = {
  estado: 'enviando' | 'enviado' | 'salteado' | 'error'
  mes: string
  motivo: string | null
  fecha_corte: string | null
  destinatarios?: number
  enviados?: number
  sin_token?: number
}

type Cierre = Pick<Envio, 'motivo' | 'destinatarios' | 'enviados' | 'sin_token'> & { estado: 'enviado' | 'error' }

/** Fila de una corrida que no llegó a reservar el mes (salteada o con error previo). */
async function registrarEnvio(envio: Envio): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).insert(envio)
  if (error) console.error(`Error registrando la corrida en ${TABLA}:`, error.message)
}

/** Cierra la fila 'enviando' de esta corrida. Si falla, la fila queda 'enviando' y bloquea el mes. */
async function cerrarEnvio(id: string, cierre: Cierre): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLA).update(cierre).eq('id', id)
  if (error) {
    console.error(
      `ATENCIÓN: no se pudo cerrar la corrida ${id} de ${TABLA} como '${cierre.estado}' ` +
      `(${error.message}). Quedó 'enviando' y bloquea el aviso del mes: corregirla a mano.`,
      JSON.stringify(cierre),
    )
  }
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
  const mes = mesArgentina(hoy)

  let fechaCorte: string | null = null
  // id de la fila 'enviando' una vez reservado el mes.
  let reservaId: string | null = null
  try {
    const { data: ultima, error: ultimaErr } = await supabaseAdmin
      .from('importaciones_deuda')
      .select('fecha_corte')
      .order('fecha_corte', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultimaErr) throw new Error(`Error leyendo importaciones_deuda: ${ultimaErr.message}`)
    fechaCorte = (ultima?.fecha_corte as string | undefined) ?? null

    const decision = decidirEnvio({ hoy, forzar, ultimoCorte: fechaCorte })
    if (!decision.enviar) {
      await registrarEnvio({ estado: 'salteado', mes, motivo: decision.motivo, fecha_corte: fechaCorte })
      return jsonOk({ enviado: false, motivo: decision.motivo, fecha_corte: fechaCorte })
    }

    // Reserva atómica del mes: si ya hay una fila 'enviando' o 'enviado' de este mes, el índice
    // único rechaza el insert y esta corrida no manda nada.
    const { data: reserva, error: reservaErr } = await supabaseAdmin
      .from(TABLA)
      .insert({ estado: 'enviando', mes, motivo: null, fecha_corte: fechaCorte })
      .select('id')
      .single()
    if (reservaErr) {
      if (esViolacionUnica(reservaErr)) {
        await registrarEnvio({ estado: 'salteado', mes, motivo: MOTIVO_MES_RESERVADO, fecha_corte: fechaCorte })
        return jsonOk({ enviado: false, motivo: MOTIVO_MES_RESERVADO, fecha_corte: fechaCorte })
      }
      throw new Error(`Error reservando el envío del mes en ${TABLA}: ${reservaErr.message}`)
    }
    reservaId = reserva.id as string

    const recordatorios = await construirRecordatoriosDeuda(supabaseAdmin, ahora)
    const resumen = await enviarPushRecordatoriosDeuda(supabaseAdmin, recordatorios)
    console.log(
      `Recordatorios de deuda (push): ${resumen.enviados} enviados, ${resumen.sinToken} sin token, ` +
      `${resumen.fallidos} con error, de ${resumen.destinatarios} destinatarios.`,
    )

    const final = estadoFinalEnvio(resumen)
    await cerrarEnvio(reservaId, {
      estado: final.estado,
      motivo: final.motivo,
      destinatarios: resumen.destinatarios,
      enviados: resumen.enviados,
      sin_token: resumen.sinToken,
    })
    if (final.estado === 'error') return jsonError(500, final.motivo ?? 'No llegó ningún aviso.')
    return jsonOk({ enviado: true, fecha_corte: fechaCorte, ...resumen })
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('recordatorio-deuda:', motivo)
    // Si ya se había reservado el mes, se cierra esa fila como 'error' (libera el mes para
    // reintentar); si no, se registra una fila nueva.
    if (reservaId) await cerrarEnvio(reservaId, { estado: 'error', motivo })
    else await registrarEnvio({ estado: 'error', mes, motivo, fecha_corte: fechaCorte })
    return jsonError(500, motivo)
  }
})
