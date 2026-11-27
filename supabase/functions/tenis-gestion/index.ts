// Edge Function: tenis-gestion
//
// Acciones de la gestora de tenis y del canchero que, además de la RPC, necesitan mandar un mail,
// un push o firmar un archivo (feature reservas-tenis, migración 20261112000000). Todo lo demás la
// app lo llama directo como RPC.
//
// Actions (body.action):
//   resolver-comprobante — { reserva_id, aprobado: boolean, motivo? } (motivo obligatorio al rechazar).
//                          RPC tenis_comprobante_resolver y mail al invitado con el resultado.
//                          Gestor o canchero (la RPC decide quién puede).
//   bloqueo-puntual      — { id?, cancha_id: uuid|null (null = todas), desde, hasta (ISO), tipo, titulo }.
//                          Sin id: RPC tenis_bloqueo_puntual (crea el bloque). Con id: RPC
//                          tenis_bloqueo_puntual_editar (migración 20261203000000, edita ese bloque
//                          puntual). Las dos cancelan las reservas que pisa el bloque y avisan: push a
//                          los socios jugadores (y sus tutores), mail a los invitados. Sólo gestor.
//   ver-comprobante      — { reserva_id } URL firmada de lectura del comprobante, 5 minutos.
//                          Gestor o canchero.
//   cancelar             — { reserva_id, motivo? }. RPC tenis_cancelar con el JWT del usuario (la base
//                          vuelve a decidir con es_canchero(), que incluye a la gestora) y los mismos avisos que cancelar-varias para esa
//                          reserva, con el motivo si lo hay. => { reserva_id, avisos }. Gestor o canchero.
//   cancelar-varias      — { reserva_ids: uuid[] (1..100), motivo }. RPC tenis_cancelar_varias
//                          (migración 20261128000000) y los mismos avisos que bloqueo-puntual para
//                          cada reserva cancelada. => { canceladas, omitidas:[{reserva_id, codigo,
//                          motivo}], avisos }. Sólo gestor.
//   publicar-novedad     — { novedad_id } manda una novedad de la cartelera (tenis_novedades): push a
//                          la audiencia de tenis_audiencia_novedades() (socios y sus tutores) y mail a
//                          los que tienen un mail real. Se reclama con tenis_novedad_reclamar, así que
//                          sale una sola vez; cada etapa (push, mails) queda registrada al terminar. Un
//                          envío cortado se puede reintentar a los 15 minutos sin repetir el push.
//                          => { enviada_at, destinatarios, push_enviados, mails_enviados, reintento }.
//                          Sólo gestor.
//
// Seguridad: JWT requerido. El rol sale de profiles (nunca del body): gestor = admin, o
// subcomision con deporte 'tenis'; canchero = rol canchero. Las RPC se llaman con el JWT del
// usuario (cliente anon + Authorization), así es_gestor_tenis()/es_canchero() vuelven a decidir
// en la base; la service role sólo lee lo necesario para los avisos y firma URLs.
//
// Contrato de errores: negocio => HTTP 200 { ok:false, codigo, motivo }; sin permiso => 403;
// errores reales => 500.
//
// Deploy: supabase functions deploy tenis-gestion

import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  COMPROBANTE_BUCKET,
  UUID_RE,
  codigoDeError,
  describirTurno,
  escapeHtml,
  horaInicioReal,
  horaLocal,
  fechaLocal,
  htmlNovedad,
  motivoTenis,
  parsearBloqueoPuntual,
  parsearCancelarUna,
  parsearCancelarVarias,
  parsearIdsReserva,
  parsearReclamoNovedad,
  parsearSocioIds,
  htmlMailCancelacion,
  textoPushCancelacion,
  textoPushNovedad,
} from '../_shared/tenisReglas.ts'
import {
  cargarConfig,
  cargarInvitados,
  cargarReservas,
  enviarMailsEnLote,
  mailAInvitado,
  mailsDeProfiles,
  profilesPorSocio,
  pushASocios,
  type AvisoPush,
} from '../_shared/tenisNotificar.ts'

// Acciones que sólo puede hacer la gestora; el resto, gestora o canchero.
const SOLO_GESTOR = new Set(['bloqueo-puntual', 'cancelar-varias', 'publicar-novedad'])
const URL_FIRMADA_SEG = 300

type Permiso = { gestor: boolean; canchero: boolean }

function rechazo(codigo: string, extra: Record<string, unknown> = {}): Response {
  return jsonOk({ ok: false, codigo, motivo: motivoTenis(codigo), ...extra })
}

function errorInterno(contexto: string, err: unknown): Response {
  const detalle = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : String(err)
  console.error(`tenis-gestion: ${contexto}:`, detalle)
  return jsonError(500, 'Error interno')
}

function errorRpc(contexto: string, err: { code?: string; message?: string }): Response {
  const codigo = codigoDeError(err)
  return codigo ? rechazo(codigo) : errorInterno(contexto, err)
}

function clienteUsuario(jwt: string) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !user) return jsonError(401, 'Token inválido')

  const { data: perfil, error: errPerfil } = await supabaseAdmin
    .from('profiles')
    .select('rol, roles, deporte, activo')
    .eq('id', user.id)
    .single()
  if (errPerfil || !perfil) return errorInterno('profiles', errPerfil)
  if (perfil.activo === false) return jsonError(403, 'Cuenta inactiva', { codigo: 'no_autorizado' })

  // Mismo criterio que es_gestor_tenis()/es_canchero(): rol activo o roles[].
  const roles = new Set([perfil.rol as string, ...((perfil.roles as string[] | null) ?? [])])
  const permiso: Permiso = {
    gestor: roles.has('admin') || (roles.has('subcomision') && perfil.deporte === 'tenis'),
    canchero: roles.has('canchero'),
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }

  const necesita = SOLO_GESTOR.has(String(body.action)) ? permiso.gestor : permiso.gestor || permiso.canchero
  if (!necesita) return jsonError(403, motivoTenis('no_autorizado'), { codigo: 'no_autorizado' })

  try {
    switch (body.action) {
      case 'resolver-comprobante': return await handleResolver(jwt, body)
      case 'bloqueo-puntual':      return await handleBloqueo(jwt, body)
      case 'ver-comprobante':      return await handleVerComprobante(body)
      case 'cancelar':             return await handleCancelar(jwt, body)
      case 'cancelar-varias':      return await handleCancelarVarias(jwt, body)
      case 'publicar-novedad':     return await handlePublicarNovedad(user.id, body)
      default:                     return jsonError(400, 'Acción desconocida')
    }
  } catch (e) {
    return errorInterno(String(body.action), e)
  }
})

// ─── resolver-comprobante ─────────────────────────────────────────────────────

async function handleResolver(jwt: string, body: Record<string, unknown>): Promise<Response> {
  const reservaId = body.reserva_id
  if (typeof reservaId !== 'string' || !UUID_RE.test(reservaId)) return rechazo('parametros')
  if (typeof body.aprobado !== 'boolean') return rechazo('parametros')
  const aprobado = body.aprobado
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 300) : ''
  if (!aprobado && !motivo) return rechazo('motivo_requerido')

  const { error } = await clienteUsuario(jwt).rpc('tenis_comprobante_resolver', {
    p_reserva_id: reservaId,
    p_aprobado: aprobado,
    p_motivo: motivo || null,
  })
  if (error) return errorRpc('tenis_comprobante_resolver', error)

  // El aviso no frena la respuesta: la decisión ya quedó guardada.
  let emailEnviado = false
  let estado: string | null = null
  try {
    const [reserva] = await cargarReservas([reservaId])
    estado = reserva?.estado ?? null
    if (reserva?.titular_invitado_id) {
      const cfg = await cargarConfig()
      const invitados = await cargarInvitados([reserva.titular_invitado_id])
      const invitado = invitados.get(reserva.titular_invitado_id)
      const turno = escapeHtml(describirTurno(reserva.inicio, reserva.cancha, cfg))
      const saludo = `<p style="font-size:16px">Hola ${escapeHtml(invitado?.nombre ?? '')},</p>`
      // Comprobante revisado después del turno (la base deja la reserva jugada si se aprueba).
      const terminado = reserva.fin.getTime() <= Date.now()
      if (aprobado && terminado) {
        emailEnviado = await mailAInvitado(invitado, 'Recibimos tu pago de tenis — UNCAS', `
          ${saludo}
          <p style="font-size:16px">Recibimos tu pago de la reserva del <strong>${turno}</strong>. ¡Gracias!</p>
        `)
      } else if (aprobado) {
        emailEnviado = await mailAInvitado(invitado, 'Tu reserva de tenis está confirmada — UNCAS', `
          ${saludo}
          <p style="font-size:16px">Recibimos tu pago. Tu reserva del <strong>${turno}</strong> está confirmada.</p>
          <p style="font-size:16px">El turno arranca a las <strong>${horaInicioReal(reserva.inicio, cfg)}</strong>.
            Al llegar, cada jugador da su DNI al canchero.</p>
        `)
      } else {
        const vence = reserva.comprobante_vence_at ? new Date(reserva.comprobante_vence_at) : null
        const puedeReintentar = reserva.estado === 'pendiente_comprobante' && vence !== null && vence.getTime() > Date.now()
        const siguiente = puedeReintentar
          ? `Podés subir otro comprobante desde el link del mail de confirmación hasta el ${fechaLocal(vence).split('-').reverse().slice(0, 2).join('/')} a las ${horaLocal(vence)}. Si no, la reserva se cancela.`
          : terminado
            ? 'Si creés que es un error, escribile a la subcomisión de tenis.'
            : 'La reserva quedó cancelada.'
        emailEnviado = await mailAInvitado(invitado, 'No pudimos validar tu comprobante — UNCAS', `
          ${saludo}
          <p style="font-size:16px">No pudimos validar el comprobante de tu reserva del <strong>${turno}</strong>.</p>
          <p style="font-size:16px">Motivo: ${escapeHtml(motivo)}</p>
          <p style="font-size:16px">${siguiente}</p>
        `)
      }
    }
  } catch (e) {
    console.error('tenis-gestion: aviso de comprobante:', e instanceof Error ? e.message : String(e))
  }

  return jsonOk({ ok: true, estado, email_enviado: emailEnviado })
}

// ─── bloqueo-puntual ──────────────────────────────────────────────────────────

async function handleBloqueo(jwt: string, body: Record<string, unknown>): Promise<Response> {
  const b = parsearBloqueoPuntual(body)
  if (!b) return rechazo('parametros')
  const { titulo } = b

  // Con id se edita ese bloque puntual; en los dos casos la RPC cancela, en la misma
  // transacción, las reservas que pisa el bloque.
  const rpc = b.id ? 'tenis_bloqueo_puntual_editar' : 'tenis_bloqueo_puntual'
  const { data, error } = await clienteUsuario(jwt).rpc(rpc, {
    ...(b.id ? { p_id: b.id } : {}),
    p_cancha_id: b.canchaId,
    p_desde: b.desde.toISOString(),
    p_hasta: b.hasta.toISOString(),
    p_tipo: b.tipo,
    p_titulo: titulo,
  })
  if (error) return errorRpc(rpc, error)
  const r = (data ?? {}) as { bloque_id?: string; reservas_canceladas?: unknown }
  const canceladas = Array.isArray(r.reservas_canceladas)
    ? r.reservas_canceladas.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
    : []

  let avisos = { push: 0, emails: 0 }
  try {
    avisos = await avisarCancelacion(canceladas, titulo, 'bloqueo')
  } catch (e) {
    console.error('tenis-gestion: avisos del bloqueo:', e instanceof Error ? e.message : String(e))
  }
  return jsonOk({ ok: true, bloque_id: r.bloque_id ?? null, reservas_canceladas: canceladas, avisos })
}

/** Push a los socios jugadores (y sus tutores) y mail a los invitados de cada reserva cancelada. */
async function avisarCancelacion(reservaIds: string[], motivo: string | null, motivoClave: string): Promise<{ push: number; emails: number }> {
  if (!reservaIds.length) return { push: 0, emails: 0 }
  const cfg = await cargarConfig()
  const reservas = await cargarReservas(reservaIds)
  const invitados = await cargarInvitados(
    reservas.flatMap((r) => [r.titular_invitado_id, ...r.jugadores.map((j) => j.invitado_id)]).filter((x): x is string => !!x),
  )

  const pushes: AvisoPush[] = []
  let emails = 0
  for (const r of reservas) {
    const turno = describirTurno(r.inicio, r.cancha, cfg)
    const socios = new Set([r.titular_socio_id, ...r.jugadores.map((j) => j.socio_id)].filter((x): x is string => !!x))
    for (const socioId of socios) {
      pushes.push({
        clave: `${r.id}:${motivoClave}`,
        socioId,
        ...textoPushCancelacion(turno, motivo),
        data: { type: 'tenis_reserva_cancelada', reserva_id: r.id },
      })
    }
    const conMail = new Set([r.titular_invitado_id, ...r.jugadores.map((j) => j.invitado_id)].filter((x): x is string => !!x))
    for (const invitadoId of conMail) {
      const invitado = invitados.get(invitadoId)
      const ok = await mailAInvitado(invitado, 'Se canceló tu reserva de tenis — UNCAS', htmlMailCancelacion(invitado?.nombre ?? '', turno, motivo))
      if (ok) emails++
    }
  }
  const { entregados } = await pushASocios(pushes)
  return { push: entregados, emails }
}

// ─── cancelar (una, staff) ────────────────────────────────────────────────────

async function handleCancelar(jwt: string, body: Record<string, unknown>): Promise<Response> {
  const reservaId = body.reserva_id
  if (typeof reservaId !== 'string' || !UUID_RE.test(reservaId)) return rechazo('parametros', { campo: 'reserva_id' })
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 300) : ''

  const { data, error } = await clienteUsuario(jwt).rpc('tenis_cancelar', { p_reserva_id: reservaId, p_motivo: motivo || null })
  if (error) return errorRpc('tenis_cancelar', error)
  const cancelada = parsearCancelarUna(data) ?? reservaId

  // El aviso no frena la respuesta: la cancelación ya quedó guardada. Mismo aviso que cancelar-varias.
  let avisos = { push: 0, emails: 0 }
  try {
    avisos = await avisarCancelacion([cancelada], motivo || null, 'cancelada_gestor')
  } catch (e) {
    console.error('tenis-gestion: avisos de cancelar:', e instanceof Error ? e.message : String(e))
  }
  return jsonOk({ ok: true, reserva_id: cancelada, avisos })
}

// ─── cancelar-varias ──────────────────────────────────────────────────────────

async function handleCancelarVarias(jwt: string, body: Record<string, unknown>): Promise<Response> {
  const ids = parsearIdsReserva(body.reserva_ids)
  if (!ids) return rechazo('parametros', { campo: 'reserva_ids' })
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 300) : ''
  if (!motivo) return rechazo('motivo_cancelacion')

  const { data, error } = await clienteUsuario(jwt).rpc('tenis_cancelar_varias', { p_ids: ids, p_motivo: motivo })
  if (error) return errorRpc('tenis_cancelar_varias', error)
  const { canceladas, omitidas } = parsearCancelarVarias(data)

  // Los avisos no frenan la respuesta: las cancelaciones ya quedaron guardadas.
  let avisos = { push: 0, emails: 0 }
  try {
    avisos = await avisarCancelacion(canceladas, motivo, 'cancelada_gestor')
  } catch (e) {
    console.error('tenis-gestion: avisos de cancelar-varias:', e instanceof Error ? e.message : String(e))
  }
  return jsonOk({
    ok: true,
    canceladas,
    omitidas: omitidas.map((o) => ({ ...o, motivo: motivoTenis(o.codigo) })),
    avisos,
  })
}

// ─── publicar-novedad ─────────────────────────────────────────────────────────

async function handlePublicarNovedad(userId: string, body: Record<string, unknown>): Promise<Response> {
  const novedadId = body.novedad_id
  if (typeof novedadId !== 'string' || !UUID_RE.test(novedadId)) return rechazo('parametros')

  // La audiencia se lee antes de reclamar: si falla, no queda nada marcado.
  const { data: audiencia, error: errAudiencia } = await supabaseAdmin.rpc('tenis_audiencia_novedades')
  if (errAudiencia) return errorInterno('tenis_audiencia_novedades', errAudiencia)
  const socios = parsearSocioIds(audiencia)

  // Reclamo atómico (tenis_novedad_reclamar): sale una sola vez (doble toque o dos gestoras a la
  // vez => novedad_en_curso). Si un envío anterior se cortó (límite de tiempo de la función) y
  // pasaron 15 minutos, se reclama de nuevo: el push que ya salió no se repite; los mails sí se
  // vuelven a mandar enteros (no se sabe cuáles llegaron).
  const { data: rec, error: errReclamo } = await supabaseAdmin.rpc('tenis_novedad_reclamar', { p_id: novedadId })
  if (errReclamo) return errorInterno('tenis_novedad_reclamar', errReclamo)
  const reclamo = parsearReclamoNovedad(rec)
  if (reclamo.estado === 'inexistente') return rechazo('novedad_inexistente')
  if (reclamo.estado === 'ya_enviada') return rechazo('novedad_ya_enviada')
  if (reclamo.estado !== 'reclamada') return rechazo('novedad_en_curso')
  const novedad = { titulo: reclamo.titulo, texto: reclamo.texto }
  console.info(`tenis-gestion: publicar-novedad ${novedadId} por ${userId}${reclamo.push_hecho ? ' (reintento, sin push)' : ''}`)

  // Cada etapa queda registrada apenas termina (tenis_novedad_marcar_enviada). Si push o mail
  // fallan, el otro sale igual y la etapa queda hecha con lo que se entregó.
  const marcar = async (push: number | null, mails: number | null) => {
    const { data, error } = await supabaseAdmin.rpc('tenis_novedad_marcar_enviada', { p_id: novedadId, p_push: push, p_mails: mails })
    if (error) console.error('tenis-gestion: no se guardó la etapa de la novedad:', error.message)
    return data
  }

  let pushEnviados = reclamo.push_enviados
  if (!reclamo.push_hecho) {
    pushEnviados = 0
    const { title, body: texto } = textoPushNovedad(novedad)
    try {
      const { entregados } = await pushASocios(socios.map((socioId) => ({
        clave: `novedad:${novedadId}`,
        socioId,
        title,
        body: texto,
        data: { type: 'tenis_novedad', novedad_id: novedadId },
      })))
      pushEnviados = entregados
    } catch (e) {
      console.error('tenis-gestion: push de la novedad:', e instanceof Error ? e.message : String(e))
    }
    await marcar(pushEnviados, null)
  }

  let mailsEnviados = 0
  try {
    // Cuentas de los socios y de sus tutores; los mails sintéticos del padrón quedan afuera.
    const perfiles = await profilesPorSocio(socios)
    const mails = await mailsDeProfiles([...perfiles.values()].flat())
    const { enviados } = await enviarMailsEnLote(mails, `${novedad.titulo.trim()} — Tenis UNCAS`, htmlNovedad(novedad))
    mailsEnviados = enviados
  } catch (e) {
    console.error('tenis-gestion: mails de la novedad:', e instanceof Error ? e.message : String(e))
  }
  const marcada = await marcar(null, mailsEnviados)
  const enviadaFinal = marcada && typeof marcada === 'object' && typeof (marcada as Record<string, unknown>).enviada_at === 'string'
    ? (marcada as Record<string, unknown>).enviada_at as string
    : reclamo.enviada_at

  return jsonOk({
    ok: true,
    enviada_at: enviadaFinal,
    destinatarios: socios.length,
    push_enviados: pushEnviados,
    mails_enviados: mailsEnviados,
    reintento: reclamo.push_hecho,
  })
}

// ─── ver-comprobante ──────────────────────────────────────────────────────────

async function handleVerComprobante(body: Record<string, unknown>): Promise<Response> {
  const reservaId = body.reserva_id
  if (typeof reservaId !== 'string' || !UUID_RE.test(reservaId)) return rechazo('parametros')
  const { data, error } = await supabaseAdmin
    .from('tenis_reservas')
    .select('comprobante_path')
    .eq('id', reservaId)
    .maybeSingle()
  if (error) return errorInterno('tenis_reservas', error)
  if (!data) return rechazo('reserva_inexistente')
  if (!data.comprobante_path) return rechazo('comprobante_no_subido')

  const path = data.comprobante_path as string
  const { data: firmada, error: errFirma } = await supabaseAdmin.storage
    .from(COMPROBANTE_BUCKET)
    .createSignedUrl(path, URL_FIRMADA_SEG)
  if (errFirma || !firmada) return errorInterno('createSignedUrl', errFirma)

  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return jsonOk({ ok: true, url: firmada.signedUrl, expira_en: URL_FIRMADA_SEG, tipo: ext === 'pdf' ? 'pdf' : 'imagen' })
}
