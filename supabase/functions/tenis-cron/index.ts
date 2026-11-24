// Edge Function: tenis-cron
//
// Cron cada 5 minutos (pg_cron con x-cron-secret, feature reservas-tenis): llama a tenis_procesar(),
// que en la base
//   - vence los turnos de invitados no confirmados por mail ('vencida', sin aviso: nunca confirmaron),
//   - cancela los 'pendiente_comprobante' que no subieron el comprobante a tiempo,
//   - cierra los 'confirmada' cuyo turno terminó: 'jugada' si hubo check-in, si no 'no_show' (cargo
//     completo al titular + infracción automática; la primera de una persona queda como advertencia),
// y devuelve el resumen (ver parsearResumenProcesar en _shared/tenisReglas.ts). Acá sólo se avisa:
//   - cancelada sin comprobante: mail al invitado titular y push a los socios jugadores,
//   - no_show: push (socio) o mail (invitado) al titular con el cargo,
//   - advertencia: push o mail a la persona.
// Si un aviso falla queda en el log: el estado ya cambió en la base y no se reintenta.
//
// Deploy: supabase functions deploy tenis-cron --no-verify-jwt
// Secrets requeridos: CRON_SECRET.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { describirTurno, escapeHtml, formatoPesos, parsearResumenProcesar } from '../_shared/tenisReglas.ts'
import { cargarConfig, cargarInvitados, cargarReservas, mailAInvitado, pushASocios, type AvisoPush } from '../tenis-gestion/notificar.ts'

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
    const hayAvisos = resumen.canceladas.length || resumen.no_shows.length || resumen.advertencias.length
    if (hayAvisos) {
      const cfg = await cargarConfig()
      const reservas = await cargarReservas([
        ...resumen.canceladas,
        ...resumen.no_shows,
        ...resumen.advertencias.map((a) => a.reserva_id).filter((x): x is string => !!x),
      ])
      const porId = new Map(reservas.map((r) => [r.id, r]))
      const invitados = await cargarInvitados([
        ...reservas.flatMap((r) => [r.titular_invitado_id, ...r.jugadores.map((j) => j.invitado_id)]),
        ...resumen.advertencias.map((a) => a.invitado_id),
      ].filter((x): x is string => !!x))

      const pushes: AvisoPush[] = []
      const mail = async (invitadoId: string | null, asunto: string, html: string) => {
        if (!invitadoId) return
        const invitado = invitados.get(invitadoId)
        const cuerpo = `<p style="font-size:16px">Hola ${escapeHtml(invitado?.nombre ?? '')},</p>${html}`
        if (await mailAInvitado(invitado, asunto, cuerpo)) avisos.emails++
      }

      // Canceladas por no subir el comprobante.
      for (const id of resumen.canceladas) {
        const r = porId.get(id)
        if (!r) continue
        const turno = describirTurno(r.inicio, r.cancha, cfg)
        await mail(r.titular_invitado_id, 'Se canceló tu reserva de tenis — UNCAS', `
          <p style="font-size:16px">Cancelamos tu reserva del <strong>${escapeHtml(turno)}</strong> porque no recibimos el comprobante de pago a tiempo.</p>
          <p style="font-size:16px">Si querés jugar, podés reservar otro horario en uncasapp.com/tenis/reservar.</p>
        `)
        for (const socioId of new Set(r.jugadores.map((j) => j.socio_id).filter((x): x is string => !!x))) {
          pushes.push({
            clave: `${r.id}:sin_comprobante`,
            socioId,
            title: 'Tenis: se canceló una reserva',
            body: `${turno}: el invitado que reservó no pagó a tiempo y la reserva se canceló.`,
            data: { type: 'tenis_reserva_cancelada', reserva_id: r.id },
          })
        }
      }

      // No-shows: el titular responde por toda la reserva.
      for (const id of resumen.no_shows) {
        const r = porId.get(id)
        if (!r) continue
        const turno = describirTurno(r.inicio, r.cancha, cfg)
        const fila = r.jugadores.find((j) => j.es_titular)
        const cargo = fila && fila.cargo > 0 ? fila.cargo : r.jugadores.reduce((s, j) => s + j.cargo, 0)
        const texto = `No registramos ingreso a tu turno del ${turno}. Como titular, se te cargó la reserva completa: ${formatoPesos(cargo)}.`
        if (r.titular_socio_id) {
          pushes.push({
            clave: `${r.id}:no_show`,
            socioId: r.titular_socio_id,
            title: 'Tenis: no se presentaron al turno',
            body: texto,
            data: { type: 'tenis_no_show', reserva_id: r.id },
          })
        }
        await mail(r.titular_invitado_id, 'No se presentaron a tu turno de tenis — UNCAS', `
          <p style="font-size:16px">${escapeHtml(texto)}</p>
          <p style="font-size:16px">Si hubo un error, escribile a la subcomisión de tenis.</p>
        `)
      }

      // Primera infracción: advertencia.
      const textoAdvertencia = 'Es tu primera infracción en las reservas de tenis y esta vez queda como advertencia. ' +
        'Desde la próxima, la subcomisión puede suspenderte para reservar.'
      for (const a of resumen.advertencias) {
        if (a.socio_id) {
          pushes.push({
            clave: `${a.reserva_id ?? 'sin_reserva'}:advertencia`,
            socioId: a.socio_id,
            title: 'Tenis: advertencia',
            body: textoAdvertencia,
            data: { type: 'tenis_advertencia', reserva_id: a.reserva_id },
          })
        }
        await mail(a.invitado_id, 'Advertencia en tus reservas de tenis — UNCAS', `<p style="font-size:16px">${textoAdvertencia}</p>`)
      }

      const { entregados, fallidos } = await pushASocios(pushes)
      avisos.push = entregados
      avisos.push_fallidos = fallidos
    }

    const salida = {
      vencidas: resumen.vencidas.length,
      canceladas: resumen.canceladas.length,
      no_shows: resumen.no_shows.length,
      advertencias: resumen.advertencias.length,
      ...avisos,
    }
    if (hayAvisos || resumen.vencidas.length) console.log('tenis-cron:', JSON.stringify(salida))
    return jsonOk(salida)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('tenis-cron:', motivo)
    return jsonError(500, motivo)
  }
})
