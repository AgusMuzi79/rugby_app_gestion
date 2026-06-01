// Edge Function: socios-pagos
// Gestión de pagos de cuotas — Mercado Pago + pagos manuales + generación de PDF.
//
// Actions:
//   checkout  — Crea una preferencia de pago en Mercado Pago (llamada por el socio)
//   webhook   — Webhook de Mercado Pago al confirmar pago (sin JWT — MP lo llama directamente)
//   manual    — Registro de pago en ventanilla por Secretaría
//
// Deploy: supabase functions deploy socios-pagos --no-verify-jwt
//   (necesario para que el webhook de MP funcione sin JWT)
//
// Secrets requeridos:
//   MERCADOPAGO_ACCESS_TOKEN
//   RESEND_API_KEY
//
// Env vars para nombres:
//   CLUB_EMAIL_FROM (ej: pagos@uncasrugby.com)

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

const MP_API = 'https://api.mercadopago.com'
const RESEND_API = 'https://api.resend.com/emails'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url    = new URL(req.url)
  const action = url.searchParams.get('action') ?? ''

  // webhook de MP llega sin JWT → manejarlo primero
  if (action === 'webhook' || req.method === 'POST' && url.pathname.endsWith('webhook')) {
    return handleWebhook(req)
  }

  // Para el resto, verificar JWT manualmente
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()

  const callerRol = callerProfile?.rol ?? ''

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonError(400, 'Body inválido') }

  const bodyAction = body.action as string | undefined

  if (bodyAction === 'checkout') return handleCheckout(body, callerRol, caller.id)
  if (bodyAction === 'manual')   return handleManual(body, callerRol, caller.id)

  return jsonError(400, `Acción desconocida: ${bodyAction}`)
})

// ─── Crear preferencia de Mercado Pago ───────────────────────────────────────

async function handleCheckout(
  body: Record<string, unknown>,
  callerRol: string,
  callerId: string
): Promise<Response> {
  if (callerRol !== 'socio') return jsonError(403, 'Solo el socio puede iniciar el pago')

  const periodo = (body.periodo as string | undefined)?.trim()
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return jsonError(400, 'periodo inválido. Formato: YYYY-MM')
  }

  // Obtener datos del socio + categoría
  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select('id, numero_socio, estado, categorias_socio ( monto_mensual )')
    .eq('profile_id', callerId)
    .single()

  if (socioErr || !socio)       return jsonError(404, 'Socio no encontrado')
  if (socio.estado === 'inactivo') return jsonError(403, 'Socio inactivo')

  const categoria = socio.categorias_socio as { monto_mensual: number } | null
  if (!categoria) return jsonError(500, 'Categoría no encontrada')

  // Verificar que no esté ya pagado
  const { data: cuotaExistente } = await supabaseAdmin
    .from('cuotas')
    .select('id, estado')
    .eq('socio_id', socio.id)
    .eq('periodo', periodo)
    .single()

  if (cuotaExistente?.estado === 'pagado') {
    return jsonError(409, `La cuota de ${periodo} ya está pagada`)
  }

  // Crear o reusar cuota
  let cuotaId: string
  if (cuotaExistente) {
    cuotaId = cuotaExistente.id
  } else {
    const { data: nuevaCuota, error: cuotaErr } = await supabaseAdmin
      .from('cuotas')
      .insert({
        socio_id: socio.id,
        periodo,
        monto:    categoria.monto_mensual,
        estado:   'pendiente',
      })
      .select('id')
      .single()

    if (cuotaErr || !nuevaCuota) return jsonError(500, 'Error al crear cuota: ' + cuotaErr?.message)
    cuotaId = nuevaCuota.id
  }

  const monto = categoria.monto_mensual
  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Crear preferencia en Mercado Pago
  const mpRes = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      items: [{
        title:      `Cuota ${periodo} — Socio ${socio.numero_socio}`,
        quantity:   1,
        unit_price: monto,
        currency_id: 'ARS',
      }],
      external_reference:  cuotaId,
      notification_url:    `${supabaseUrl}/functions/v1/socios-pagos?action=webhook`,
      back_urls: {
        success: 'uncasrugby://pago-exitoso',
        failure: 'uncasrugby://pago-fallido',
        pending: 'uncasrugby://pago-pendiente',
      },
      auto_return: 'approved',
    }),
  })

  if (!mpRes.ok) {
    const errBody = await mpRes.text()
    console.error('MP error:', errBody)
    return jsonError(502, 'Error al crear la preferencia de pago')
  }

  const mpData = await mpRes.json()
  return jsonOk({ checkout_url: mpData.init_point, cuota_id: cuotaId })
}

// ─── Webhook de Mercado Pago ──────────────────────────────────────────────────

async function handleWebhook(req: Request): Promise<Response> {
  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return new Response('ok', { status: 200 }) }

  // MP envía notificaciones de distintos tipos — solo procesar payment.updated
  if (payload.type !== 'payment') return new Response('ok', { status: 200 })

  const paymentId = (payload.data as { id?: string } | undefined)?.id
  if (!paymentId) return new Response('ok', { status: 200 })

  // Obtener detalle del pago desde MP
  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!
  const mpRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!mpRes.ok) return new Response('ok', { status: 200 })

  const payment = await mpRes.json()
  if (payment.status !== 'approved') return new Response('ok', { status: 200 })

  const cuotaId = payment.external_reference as string | undefined
  if (!cuotaId) return new Response('ok', { status: 200 })

  // Verificar que no esté ya procesado (deduplicación por mp_payment_id)
  const { data: pagoExistente } = await supabaseAdmin
    .from('pagos_socios')
    .select('id')
    .eq('mp_payment_id', String(paymentId))
    .single()

  if (pagoExistente) return new Response('ok', { status: 200 }) // ya procesado

  // Obtener cuota
  const { data: cuota } = await supabaseAdmin
    .from('cuotas')
    .select('id, socio_id, periodo, monto, estado')
    .eq('id', cuotaId)
    .single()

  if (!cuota || cuota.estado === 'pagado') return new Response('ok', { status: 200 })

  // Actualizar cuota + insertar pago en paralelo
  const [cuotaRes, pagoRes] = await Promise.all([
    supabaseAdmin.from('cuotas').update({ estado: 'pagado' }).eq('id', cuotaId),
    supabaseAdmin.from('pagos_socios').insert({
      socio_id:      cuota.socio_id,
      cuota_id:      cuotaId,
      monto:         cuota.monto,
      forma_pago:    'mercadopago',
      estado:        'aprobado',
      mp_payment_id: String(paymentId),
    }).select('id').single(),
  ])

  if (cuotaRes.error) console.error('Error actualizando cuota:', cuotaRes.error.message)

  const pagoId = (pagoRes.data as { id: string } | null)?.id

  // Generar PDF y enviar email en background (no bloquear respuesta a MP)
  if (pagoId) {
    EdgeRuntime.waitUntil(
      generarYEnviarComprobante(cuota.socio_id, pagoId, cuota.periodo, cuota.monto, 'Mercado Pago')
    )
  }

  return new Response('ok', { status: 200 })
}

// ─── Pago manual en ventanilla (Secretaría) ───────────────────────────────────

async function handleManual(
  body: Record<string, unknown>,
  callerRol: string,
  callerId: string
): Promise<Response> {
  if (!['secretaria', 'admin', 'subcomision'].includes(callerRol)) {
    return jsonError(403, 'Solo Secretaría puede registrar pagos manuales')
  }

  const socio_id   = body.socio_id   as string | undefined
  const periodo    = (body.periodo   as string | undefined)?.trim()
  const monto      = body.monto      as number | undefined
  const forma_pago = body.forma_pago as string | undefined

  if (!socio_id)   return jsonError(400, 'socio_id es requerido')
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return jsonError(400, 'periodo inválido')
  if (!monto || monto <= 0) return jsonError(400, 'monto inválido')
  if (!['efectivo', 'transferencia'].includes(forma_pago ?? '')) {
    return jsonError(400, 'forma_pago debe ser efectivo o transferencia')
  }

  // Verificar que no esté ya pagado
  const { data: cuotaExistente } = await supabaseAdmin
    .from('cuotas')
    .select('id, estado')
    .eq('socio_id', socio_id)
    .eq('periodo', periodo)
    .single()

  if (cuotaExistente?.estado === 'pagado') {
    return jsonError(409, `La cuota de ${periodo} ya está pagada`)
  }

  // Crear o reusar cuota
  let cuotaId: string
  if (cuotaExistente) {
    cuotaId = cuotaExistente.id
  } else {
    const { data: nuevaCuota, error: cuotaErr } = await supabaseAdmin
      .from('cuotas')
      .insert({ socio_id, periodo, monto, estado: 'pendiente' })
      .select('id')
      .single()
    if (cuotaErr || !nuevaCuota) return jsonError(500, 'Error al crear cuota: ' + cuotaErr?.message)
    cuotaId = nuevaCuota.id
  }

  // Actualizar cuota + insertar pago
  const [cuotaRes, pagoRes] = await Promise.all([
    supabaseAdmin.from('cuotas').update({ estado: 'pagado' }).eq('id', cuotaId),
    supabaseAdmin.from('pagos_socios').insert({
      socio_id,
      cuota_id:       cuotaId,
      monto,
      forma_pago,
      estado:         'aprobado',
      registrado_por: callerId,
    }).select('id').single(),
  ])

  if (cuotaRes.error) return jsonError(500, 'Error al actualizar cuota: ' + cuotaRes.error.message)

  const pagoId = (pagoRes.data as { id: string } | null)?.id

  if (pagoId) {
    EdgeRuntime.waitUntil(
      generarYEnviarComprobante(socio_id, pagoId, periodo, monto, forma_pago!)
    )
  }

  return jsonOk({ ok: true, cuota_id: cuotaId, pago_id: pagoId })
}

// ─── Generar PDF comprobante y enviar por email ───────────────────────────────

async function generarYEnviarComprobante(
  socioId: string,
  pagoId: string,
  periodo: string,
  monto: number,
  formaPago: string
): Promise<void> {
  try {
    // Obtener datos del socio + email
    const { data: socio } = await supabaseAdmin
      .from('socios')
      .select('numero_socio, profile_id, categorias_socio ( nombre )')
      .eq('id', socioId)
      .single()

    if (!socio) return

    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(socio.profile_id)
    const { data: profile  } = await supabaseAdmin
      .from('profiles')
      .select('nombre')
      .eq('id', socio.profile_id)
      .single()

    const email    = user?.email ?? ''
    const nombre   = profile?.nombre ?? 'Socio'
    const categoria = (socio.categorias_socio as { nombre: string } | null)?.nombre ?? '—'

    // ── Generar PDF ──────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create()
    const page   = pdfDoc.addPage([595, 842]) // A4
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const { width, height } = page.getSize()

    const margen = 60
    const col    = width / 2

    const draw = (text: string, x: number, y: number, size = 12, bold = false, color = rgb(0, 0, 0)) => {
      page.drawText(text, { x, y, size, font: bold ? fontB : font, color })
    }

    // Cabecera
    draw('UNCAS RUGBY CLUB', margen, height - 70, 20, true, rgb(0.06, 0.06, 0.06))
    draw('EST. 1836', margen, height - 92, 10, false, rgb(0.4, 0.4, 0.4))

    // Línea separadora
    page.drawLine({
      start: { x: margen, y: height - 108 },
      end:   { x: width - margen, y: height - 108 },
      thickness: 1, color: rgb(0.8, 0.8, 0.8),
    })

    // Título
    draw('COMPROBANTE DE PAGO', col - 80, height - 140, 16, true)

    // Datos del socio
    draw('DATOS DEL SOCIO', margen, height - 190, 10, true, rgb(0.5, 0.5, 0.5))
    draw(`Nombre:`,      margen, height - 212, 11, true)
    draw(nombre,         margen + 90, height - 212, 11)
    draw(`Nro. Socio:`,  margen, height - 232, 11, true)
    draw(socio.numero_socio, margen + 90, height - 232, 11)
    draw(`Categoría:`,   margen, height - 252, 11, true)
    draw(categoria,      margen + 90, height - 252, 11)

    // Línea separadora
    page.drawLine({
      start: { x: margen, y: height - 270 },
      end:   { x: width - margen, y: height - 270 },
      thickness: 0.5, color: rgb(0.9, 0.9, 0.9),
    })

    // Datos del pago
    draw('DETALLE DEL PAGO', margen, height - 295, 10, true, rgb(0.5, 0.5, 0.5))

    const [anio, mes] = periodo.split('-')
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    const periodoLabel = `${meses[parseInt(mes)]} ${anio}`

    draw('Período:',      margen, height - 317, 11, true)
    draw(periodoLabel,    margen + 90, height - 317, 11)
    draw('Monto:',        margen, height - 337, 11, true)
    draw(`$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, margen + 90, height - 337, 14, true)
    draw('Forma de pago:', margen, height - 360, 11, true)
    draw(formaPago.charAt(0).toUpperCase() + formaPago.slice(1), margen + 110, height - 360, 11)
    draw('Fecha:',        margen, height - 380, 11, true)
    draw(new Date().toLocaleDateString('es-AR'), margen + 90, height - 380, 11)

    // Pie
    page.drawLine({
      start: { x: margen, y: 80 },
      end:   { x: width - margen, y: 80 },
      thickness: 0.5, color: rgb(0.9, 0.9, 0.9),
    })
    draw('Comprobante generado automáticamente · UNCAS Rugby Club', margen, 60, 8, false, rgb(0.6, 0.6, 0.6))

    const pdfBytes = await pdfDoc.save()

    // ── Subir PDF a Storage ──────────────────────────────────────────────────
    const storagePath = `${socioId}/${pagoId}.pdf`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('comprobantes')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (!uploadErr) {
      await supabaseAdmin
        .from('pagos_socios')
        .update({ comprobante_path: storagePath })
        .eq('id', pagoId)
    }

    // ── Enviar email con PDF adjunto ─────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey || !email) return

    // Convertir Uint8Array a base64 sin spread (evita stack overflow en PDFs grandes)
    let binary = ''
    for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i])
    const base64Pdf = btoa(binary)

    await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    Deno.env.get('CLUB_EMAIL_FROM') ?? 'pagos@uncasrugby.com',
        to:      [email],
        subject: `Comprobante de pago — Cuota ${periodoLabel}`,
        html: `
          <p>Hola ${nombre},</p>
          <p>Adjuntamos tu comprobante de pago de la cuota correspondiente a <strong>${periodoLabel}</strong>.</p>
          <p><strong>Monto:</strong> $${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
          <p>¡Gracias!</p>
          <p><em>UNCAS Rugby Club</em></p>
        `,
        attachments: [{
          filename: `comprobante-${periodo}.pdf`,
          content:  base64Pdf,
        }],
      }),
    })
  } catch (err) {
    console.error('Error generando comprobante:', err)
  }
}
