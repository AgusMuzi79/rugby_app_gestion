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

  // cobro-mensual lo dispara pg_cron con x-cron-secret (no hay usuario JWT)
  // El cron lo manda como query param: ?action=cobro-mensual
  if (action === 'cobro-mensual') {
    const cronSecret = req.headers.get('x-cron-secret')
    if (!cronSecret || cronSecret !== Deno.env.get('CRON_SECRET')) {
      return jsonError(401, 'Sin autorización para cobro-mensual')
    }
    return handleCobroMensual()
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

  if (bodyAction === 'checkout')        return handleCheckout(body, callerRol, caller.id)
  if (bodyAction === 'manual')          return handleManual(body, callerRol, caller.id)
  if (bodyAction === 'associate-card')  return handleAssociateCard(body, callerRol, caller.id)
  if (bodyAction === 'remove-card')     return handleRemoveCard(body, callerRol, caller.id)
  if (bodyAction === 'charge-card')     return handleChargeCard(body, callerRol, caller.id)

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

  // Sumar servicios opcionales activos
  const { data: serviciosActivos } = await supabaseAdmin
    .from('socio_servicios')
    .select('servicios_opcionales ( monto_mensual )')
    .eq('socio_id', socio.id)

  const montoServicios = (serviciosActivos ?? []).reduce((sum, s) => {
    const srv = s.servicios_opcionales as { monto_mensual: number } | null
    return sum + (srv?.monto_mensual ?? 0)
  }, 0)

  const montoTotal = categoria.monto_mensual + montoServicios

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
        monto:    montoTotal,
        estado:   'pendiente',
      })
      .select('id')
      .single()

    if (cuotaErr || !nuevaCuota) return jsonError(500, 'Error al crear cuota: ' + cuotaErr?.message)
    cuotaId = nuevaCuota.id
  }

  const monto = montoTotal
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

// ─── Helpers compartidos ──────────────────────────────────────────────────────

async function resolverCuota(
  socioId: string,
  periodo: string,
  monto:   number,
): Promise<{ cuotaId: string } | { error: string }> {
  const { data: existente } = await supabaseAdmin
    .from('cuotas')
    .select('id, estado')
    .eq('socio_id', socioId)
    .eq('periodo', periodo)
    .single()

  if (existente?.estado === 'pagado') return { error: `La cuota de ${periodo} ya está pagada` }

  if (existente) {
    await supabaseAdmin.from('cuotas').update({ estado: 'pagado' }).eq('id', existente.id)
    return { cuotaId: existente.id }
  }

  const { data: nueva, error } = await supabaseAdmin
    .from('cuotas')
    .insert({ socio_id: socioId, periodo, monto, estado: 'pagado' })
    .select('id')
    .single()

  if (error || !nueva) return { error: error?.message ?? 'Error al crear cuota' }
  return { cuotaId: nueva.id }
}

async function calcularMontoSocio(socioId: string, categoriaMontoMensual: number): Promise<number> {
  const { data: serviciosActivos } = await supabaseAdmin
    .from('socio_servicios')
    .select('servicios_opcionales ( monto_mensual )')
    .eq('socio_id', socioId)

  const montoServicios = (serviciosActivos ?? []).reduce((sum, s) => {
    const srv = s.servicios_opcionales as { monto_mensual: number } | null
    return sum + (srv?.monto_mensual ?? 0)
  }, 0)

  return categoriaMontoMensual + montoServicios
}

async function cobrarTarjetaGuardada(
  socio: {
    id:            string
    numero_socio:  string
    mp_customer_id: string
    mp_card_id:    string
    categorias_socio: { monto_mensual: number } | null
  },
  periodo:     string,
  accessToken: string,
): Promise<{ success: true; paymentId: string } | { success: false; error: string }> {
  if (!socio.categorias_socio) return { success: false, error: 'Categoría no encontrada' }

  const monto = await calcularMontoSocio(socio.id, socio.categorias_socio.monto_mensual)

  // Token sin CVV desde tarjeta guardada
  const tokenRes = await fetch(`${MP_API}/v1/card_tokens`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ customer_id: socio.mp_customer_id, card_id: socio.mp_card_id }),
  })

  if (!tokenRes.ok) return { success: false, error: 'Error al generar token de cobro' }
  const { id: tokenId } = await tokenRes.json()

  // Ejecutar pago
  const payRes = await fetch(`${MP_API}/v1/payments`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaction_amount: monto,
      token:              tokenId,
      description:        `Cuota ${periodo} — Socio ${socio.numero_socio}`,
      installments:       1,
      payer:              { type: 'customer', id: socio.mp_customer_id },
    }),
  })

  const payment = await payRes.json()
  if (!payRes.ok || payment.status === 'rejected') {
    return { success: false, error: payment.status_detail ?? 'Pago rechazado' }
  }

  // Registrar cuota + pago
  const cuotaResult = await resolverCuota(socio.id, periodo, monto)
  if ('error' in cuotaResult) return { success: false, error: cuotaResult.error }

  await supabaseAdmin.from('pagos_socios').insert({
    socio_id:      socio.id,
    cuota_id:      cuotaResult.cuotaId,
    monto,
    forma_pago:    'tarjeta',
    estado:        'aprobado',
    mp_payment_id: String(payment.id),
  })

  // Resetear reintentos
  await supabaseAdmin.from('socios')
    .update({ mp_card_retries: 0, mp_card_retry_at: null })
    .eq('id', socio.id)

  EdgeRuntime.waitUntil(
    generarYEnviarComprobante(socio.id, cuotaResult.cuotaId, periodo, monto, 'Tarjeta')
  )

  return { success: true, paymentId: String(payment.id) }
}

async function notificarSecretaria(titulo: string, cuerpo: string): Promise<void> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .in('rol', ['secretaria', 'admin', 'subcomision'])

  if (!profiles?.length) return
  const profileIds = profiles.map(p => p.id)

  const { data: tokens } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .in('usuario_id', profileIds)

  const expoPushTokens = (tokens ?? [])
    .map(t => t.token)
    .filter(t => t.startsWith('ExponentPushToken'))

  if (!expoPushTokens.length) return

  await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expoPushTokens.map(token => ({
      to: token, title: titulo, body: cuerpo, sound: 'default', priority: 'high',
    }))),
  })
}

// ─── Asociar tarjeta (secretaría o el propio socio) ──────────────────────────

async function handleAssociateCard(
  body:      Record<string, unknown>,
  callerRol: string,
  callerId:  string,
): Promise<Response> {
  const isSecretaria = ['secretaria', 'admin', 'subcomision'].includes(callerRol)
  const isSocio      = callerRol === 'socio'
  if (!isSecretaria && !isSocio) return jsonError(403, 'Sin permiso para asociar tarjeta')

  const cardNumber     = (body.card_number as string | undefined)?.replace(/\s/g, '')
  const expMonth       = body.expiration_month as number | undefined
  const expYear        = body.expiration_year  as number | undefined
  const securityCode   = body.security_code    as string | undefined
  const cardholderName = (body.cardholder_name as string | undefined)?.trim()

  if (!cardNumber || cardNumber.length < 13)
    return jsonError(400, 'Número de tarjeta inválido')
  if (!expMonth || expMonth < 1 || expMonth > 12)
    return jsonError(400, 'Mes de vencimiento inválido')
  if (!expYear || expYear < new Date().getFullYear())
    return jsonError(400, 'Año de vencimiento inválido')
  if (!securityCode)
    return jsonError(400, 'CVV requerido')
  if (!cardholderName)
    return jsonError(400, 'Nombre del titular requerido')

  // Obtener socio
  const query = supabaseAdmin
    .from('socios')
    .select('id, dni, mp_customer_id, mp_card_id, profile_id')

  const { data: socio } = isSecretaria
    ? await query.eq('id', body.socio_id as string).single()
    : await query.eq('profile_id', callerId).single()

  if (!socio) return jsonError(404, 'Socio no encontrado')
  if (isSecretaria && !body.socio_id) return jsonError(400, 'socio_id requerido')

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  if (!accessToken) return jsonError(503, 'MERCADOPAGO_ACCESS_TOKEN no configurado')

  // Email del socio para crear customer en MP
  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(socio.profile_id)
  const email = user?.email
  if (!email) return jsonError(500, 'No se pudo obtener el email del socio')

  // 1. Buscar o crear customer en MP
  let mpCustomerId = socio.mp_customer_id
  if (!mpCustomerId) {
    const searchRes  = await fetch(`${MP_API}/v1/customers/search?email=${encodeURIComponent(email)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const searchData = await searchRes.json()

    if (searchData.results?.length > 0) {
      mpCustomerId = searchData.results[0].id
    } else {
      const createRes = await fetch(`${MP_API}/v1/customers`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      if (!createRes.ok) return jsonError(502, 'Error al crear customer en MP')
      const { id } = await createRes.json()
      mpCustomerId = id
    }
  }

  // 2. Tokenizar tarjeta (con CVV — solo en la asociación inicial)
  const tokenRes = await fetch(`${MP_API}/v1/card_tokens`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number:       cardNumber,
      expiration_month:  expMonth,
      expiration_year:   expYear,
      security_code:     securityCode,
      cardholder: {
        name:           cardholderName.toUpperCase(),
        identification: { type: 'DNI', number: socio.dni },
      },
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json()
    return jsonError(422, err.message ?? 'Datos de tarjeta inválidos')
  }
  const { id: cardTokenId } = await tokenRes.json()

  // 3. Eliminar tarjeta anterior si existe
  if (socio.mp_card_id && socio.mp_customer_id) {
    await fetch(`${MP_API}/v1/customers/${socio.mp_customer_id}/cards/${socio.mp_card_id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
  }

  // 4. Guardar tarjeta en el customer de MP
  const saveRes = await fetch(`${MP_API}/v1/customers/${mpCustomerId}/cards`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token: cardTokenId }),
  })

  if (!saveRes.ok) {
    const err = await saveRes.json()
    return jsonError(502, 'Error al guardar tarjeta: ' + (err.message ?? ''))
  }
  const cardData = await saveRes.json()

  // 5. Actualizar socios
  await supabaseAdmin.from('socios').update({
    mp_customer_id:    mpCustomerId,
    mp_card_id:        cardData.id,
    mp_card_last_four: cardData.last_four_digits,
    mp_card_brand:     cardData.payment_method?.id ?? null,
    mp_card_retries:   0,
    mp_card_retry_at:  null,
  }).eq('id', socio.id)

  return jsonOk({
    ok:        true,
    last_four: cardData.last_four_digits,
    brand:     cardData.payment_method?.id ?? null,
  })
}

// ─── Quitar tarjeta ───────────────────────────────────────────────────────────

async function handleRemoveCard(
  body:      Record<string, unknown>,
  callerRol: string,
  callerId:  string,
): Promise<Response> {
  const isSecretaria = ['secretaria', 'admin', 'subcomision'].includes(callerRol)
  const isSocio      = callerRol === 'socio'
  if (!isSecretaria && !isSocio) return jsonError(403, 'Sin permiso')

  const query = supabaseAdmin
    .from('socios')
    .select('id, mp_customer_id, mp_card_id')

  const { data: socio } = isSecretaria
    ? await query.eq('id', body.socio_id as string).single()
    : await query.eq('profile_id', callerId).single()

  if (!socio)           return jsonError(404, 'Socio no encontrado')
  if (!socio.mp_card_id) return jsonError(400, 'El socio no tiene tarjeta asociada')

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  if (!accessToken) return jsonError(503, 'MERCADOPAGO_ACCESS_TOKEN no configurado')

  await fetch(`${MP_API}/v1/customers/${socio.mp_customer_id}/cards/${socio.mp_card_id}`, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  await supabaseAdmin.from('socios').update({
    mp_customer_id:    null,
    mp_card_id:        null,
    mp_card_last_four: null,
    mp_card_brand:     null,
    mp_card_retries:   0,
    mp_card_retry_at:  null,
  }).eq('id', socio.id)

  return jsonOk({ ok: true })
}

// ─── Cobro manual con tarjeta guardada (secretaría) ──────────────────────────

async function handleChargeCard(
  body:      Record<string, unknown>,
  callerRol: string,
  _callerId: string,
): Promise<Response> {
  if (!['secretaria', 'admin', 'subcomision'].includes(callerRol)) {
    return jsonError(403, 'Solo Secretaría puede disparar cobros manuales')
  }

  const socioId = body.socio_id as string | undefined
  const periodo = (body.periodo as string | undefined)?.trim()
  if (!socioId)  return jsonError(400, 'socio_id requerido')
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return jsonError(400, 'periodo inválido')

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  if (!accessToken) return jsonError(503, 'MERCADOPAGO_ACCESS_TOKEN no configurado')

  const { data: socio } = await supabaseAdmin
    .from('socios')
    .select('id, numero_socio, estado, mp_customer_id, mp_card_id, categorias_socio ( monto_mensual )')
    .eq('id', socioId)
    .single()

  if (!socio)              return jsonError(404, 'Socio no encontrado')
  if (!socio.mp_card_id)   return jsonError(400, 'El socio no tiene tarjeta asociada')
  if (socio.estado === 'inactivo') return jsonError(403, 'Socio inactivo')

  const result = await cobrarTarjetaGuardada(
    socio as Parameters<typeof cobrarTarjetaGuardada>[0],
    periodo,
    accessToken,
  )

  if (!result.success) return jsonError(422, result.error)
  return jsonOk({ ok: true, payment_id: result.paymentId })
}

// ─── Cobro mensual automático (cron diario a las 9am) ────────────────────────

async function handleCobroMensual(): Promise<Response> {
  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  if (!accessToken) return jsonError(503, 'MERCADOPAGO_ACCESS_TOKEN no configurado')

  const hoy    = new Date()
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  const { data: socios } = await supabaseAdmin
    .from('socios')
    .select('id, numero_socio, estado, mp_customer_id, mp_card_id, mp_card_retries, mp_card_retry_at, categorias_socio ( monto_mensual )')
    .not('mp_card_id', 'is', null)
    .neq('estado', 'inactivo')
    .lt('mp_card_retries', 4)

  const cobrados: string[] = []
  const fallidos: { socio_id: string; error: string }[] = []
  const omitidos: string[] = []

  for (const socio of (socios ?? [])) {
    // Respetar retry_at si está programado para más adelante
    if (socio.mp_card_retry_at && new Date(socio.mp_card_retry_at) > hoy) {
      omitidos.push(socio.id)
      continue
    }

    // Saltar si ya está pagado el período
    const { data: cuotaExistente } = await supabaseAdmin
      .from('cuotas')
      .select('estado')
      .eq('socio_id', socio.id)
      .eq('periodo', periodo)
      .single()

    if (cuotaExistente?.estado === 'pagado') {
      omitidos.push(socio.id)
      continue
    }

    const result = await cobrarTarjetaGuardada(
      socio as Parameters<typeof cobrarTarjetaGuardada>[0],
      periodo,
      accessToken,
    )

    if (result.success) {
      cobrados.push(socio.id)
      continue
    }

    fallidos.push({ socio_id: socio.id, error: result.error })

    const retries = socio.mp_card_retries + 1
    // Días de espera hasta el siguiente intento: +1, +2, +3
    const delayDias = [1, 2, 3][socio.mp_card_retries] ?? null

    if (retries >= 4 || delayDias === null) {
      // Agotados los reintentos: marcar moroso + notificar
      await supabaseAdmin.from('socios').update({
        mp_card_retries:  retries,
        mp_card_retry_at: null,
        estado:           'moroso',
      }).eq('id', socio.id)

      EdgeRuntime.waitUntil(
        notificarSecretaria(
          `Cobro fallido — Socio ${socio.numero_socio}`,
          `No se pudo cobrar la cuota ${periodo} después de 4 intentos. Verificar tarjeta del socio.`,
        )
      )
    } else {
      const retryAt = new Date(hoy)
      retryAt.setDate(retryAt.getDate() + delayDias)
      await supabaseAdmin.from('socios').update({
        mp_card_retries:  retries,
        mp_card_retry_at: retryAt.toISOString(),
      }).eq('id', socio.id)
    }
  }

  return jsonOk({
    periodo,
    cobrados:         cobrados.length,
    fallidos:         fallidos.length,
    omitidos:         omitidos.length,
    detalle_fallidos: fallidos,
  })
}
