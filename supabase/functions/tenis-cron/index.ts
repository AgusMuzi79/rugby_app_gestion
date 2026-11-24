// Edge Function: tenis-cron
//
// Cron cada 5 minutos (pg_cron con x-cron-secret, feature reservas-tenis): llama a tenis_procesar(),
// que en la base
//   - vence los turnos de invitados no confirmados por mail ('vencida', sin aviso: nunca confirmaron),
//   - cancela los 'pendiente_comprobante' que no subieron el comprobante a tiempo,
//   - cierra los 'confirmada' cuyo turno terminó: 'jugada' si hubo check-in, si no 'no_show' (cargo
//     completo al titular + infracción automática; la primera de una persona queda como advertencia),
//   - borra los intentos del rate limit de la web de más de 24 h,
// y devuelve el resumen con el aviso de cada reserva (tenis_aviso: turno + titular con socio_id o
// mail; ver parsearResumenProcesar en _shared/tenisReglas.ts). Acá sólo se avisa:
//   - cancelada sin comprobante: mail al invitado titular y push a los socios jugadores,
//   - no_show: push (socio) o mail (invitado) al titular con el cargo; si es su primera infracción,
//     además el aviso de advertencia.
// Si un aviso falla queda en el log: el estado ya cambió en la base y no se reintenta.
//
// Deploy: supabase functions deploy tenis-cron --no-verify-jwt
// Secrets requeridos: CRON_SECRET.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  TENIS_CONFIG_DEFAULT,
  describirTurno,
  escapeHtml,
  formatoPesos,
  parsearResumenProcesar,
  type AvisoReserva,
  type TenisConfig,
} from '../_shared/tenisReglas.ts'
import { cargarConfig, cargarReservas, mailAInvitado, pushASocios, type AvisoPush } from '../_shared/tenisNotificar.ts'

const TEXTO_ADVERTENCIA = 'Es tu primera infracción en las reservas de tenis y esta vez queda como advertencia. ' +
  'Desde la próxima, la subcomisión puede suspenderte para reservar.'

function turnoDe(a: AvisoReserva, cfg: TenisConfig): string {
  return a.inicio ? describirTurno(new Date(a.inicio), a.cancha_nombre, cfg) : `cancha ${a.cancha_nombre ?? ''}`.trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) return jsonError(401, 'Sin autorización')

  try {
    const { data, error } = await supabaseAdmin.rpc('tenis_procesar')
    if (error) throw new Error(`Error en tenis_procesar: ${error.message}`)
    const resumen = parsearResumenProcesar(data)

    const avisos = { push: 0, emails: 0, push_fallidos: 0 }
    const hayAvisos = resumen.comprobantes_vencidos.length || resumen.no_shows.length
    if (hayAvisos) {
      const cfg = await cargarConfig().catch(() => TENIS_CONFIG_DEFAULT)
      const pushes: AvisoPush[] = []
      const mail = async (a: AvisoReserva, asunto: string, html: string) => {
        if (!a.titular.email) return
        const invitado = { id: a.titular.invitado_id ?? '', email: a.titular.email, nombre: a.titular.nombre, apellido: null }
        const cuerpo = `<p style="font-size:16px">Hola ${escapeHtml(a.titular.nombre ?? '')},</p>${html}`
        if (await mailAInvitado(invitado, asunto, cuerpo)) avisos.emails++
      }

      // Canceladas por no subir el comprobante: el titular es un invitado (mail); a los socios
      // que estaban anotados como jugadores se les avisa por push.
      const jugadoresPorReserva = new Map(
        (await cargarReservas(resumen.comprobantes_vencidos.map((a) => a.reserva_id)).catch((e) => {
          console.error('tenis-cron: jugadores de las canceladas:', e instanceof Error ? e.message : String(e))
          return []
        })).map((r) => [r.id, r.jugadores]),
      )
      for (const a of resumen.comprobantes_vencidos) {
        const turno = turnoDe(a, cfg)
        await mail(a, 'Se canceló tu reserva de tenis — UNCAS', `
          <p style="font-size:16px">Cancelamos tu reserva del <strong>${escapeHtml(turno)}</strong> porque no recibimos el comprobante de pago a tiempo.</p>
          <p style="font-size:16px">Si querés jugar, podés reservar otro horario en uncasapp.com/tenis/reservar.</p>
        `)
        const socios = new Set((jugadoresPorReserva.get(a.reserva_id) ?? []).map((j) => j.socio_id).filter((x): x is string => !!x))
        for (const socioId of socios) {
          pushes.push({
            clave: `${a.reserva_id}:sin_comprobante`,
            socioId,
            title: 'Tenis: se canceló una reserva',
            body: `${turno}: el invitado que reservó no pagó a tiempo y la reserva se canceló.`,
            data: { type: 'tenis_reserva_cancelada', reserva_id: a.reserva_id },
          })
        }
      }

      // No-shows: el titular responde por toda la reserva.
      for (const a of resumen.no_shows) {
        const turno = turnoDe(a, cfg)
        const texto = `No registramos ingreso a tu turno del ${turno}. Como titular, se te cargó la reserva completa: ${formatoPesos(a.cargo_titular)}.`
        if (a.titular.socio_id) {
          pushes.push({
            clave: `${a.reserva_id}:no_show`,
            socioId: a.titular.socio_id,
            title: 'Tenis: no se presentaron al turno',
            body: texto,
            data: { type: 'tenis_no_show', reserva_id: a.reserva_id },
          })
          if (a.advertencia) {
            pushes.push({
              clave: `${a.reserva_id}:advertencia`,
              socioId: a.titular.socio_id,
              title: 'Tenis: advertencia',
              body: TEXTO_ADVERTENCIA,
              data: { type: 'tenis_advertencia', reserva_id: a.reserva_id },
            })
          }
        }
        await mail(a, 'No se presentaron a tu turno de tenis — UNCAS', `
          <p style="font-size:16px">${escapeHtml(texto)}</p>
          ${a.advertencia ? `<p style="font-size:16px">${TEXTO_ADVERTENCIA}</p>` : ''}
          <p style="font-size:16px">Si hubo un error, escribile a la subcomisión de tenis.</p>
        `)
      }

      const { entregados, fallidos } = await pushASocios(pushes)
      avisos.push = entregados
      avisos.push_fallidos = fallidos
    }

    const salida = {
      holds_vencidos: resumen.holds_vencidos.length,
      comprobantes_vencidos: resumen.comprobantes_vencidos.length,
      jugadas: resumen.jugadas.length,
      no_shows: resumen.no_shows.length,
      advertencias: resumen.no_shows.filter((a) => a.advertencia).length,
      ...avisos,
    }
    if (hayAvisos || resumen.holds_vencidos.length || resumen.jugadas.length) console.log('tenis-cron:', JSON.stringify(salida))
    return jsonOk(salida)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('tenis-cron:', motivo)
    return jsonError(500, motivo)
  }
})
