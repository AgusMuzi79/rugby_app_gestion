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
//   bloqueo-puntual      — { cancha_id: uuid|null (null = todas), desde, hasta (ISO), tipo, titulo }.
//                          RPC tenis_bloqueo_puntual (cancela las reservas que pisa) y avisa: push a los
//                          socios jugadores (y sus tutores), mail a los invitados. Sólo gestor.
//   ver-comprobante      — { reserva_id } URL firmada de lectura del comprobante, 5 minutos.
//                          Gestor o canchero.
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
  motivoTenis,
} from '../_shared/tenisReglas.ts'
import { cargarConfig, cargarInvitados, cargarReservas, mailAInvitado, pushASocios, type AvisoPush } from '../_shared/tenisNotificar.ts'

const TIPOS_BLOQUE = ['clase', 'entrenamiento', 'torneo', 'no_disponible', 'en_suspenso']
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

  const necesita = body.action === 'bloqueo-puntual' ? permiso.gestor : permiso.gestor || permiso.canchero
  if (!necesita) return jsonError(403, motivoTenis('no_autorizado'), { codigo: 'no_autorizado' })

  try {
    switch (body.action) {
      case 'resolver-comprobante': return await handleResolver(jwt, body)
      case 'bloqueo-puntual':      return await handleBloqueo(jwt, body)
      case 'ver-comprobante':      return await handleVerComprobante(body)
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
  const canchaId = body.cancha_id ?? null
  if (canchaId !== null && (typeof canchaId !== 'string' || !UUID_RE.test(canchaId))) return rechazo('parametros')
  const desde = new Date(typeof body.desde === 'string' ? body.desde : '')
  const hasta = new Date(typeof body.hasta === 'string' ? body.hasta : '')
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta <= desde) return rechazo('parametros')
  if (typeof body.tipo !== 'string' || !TIPOS_BLOQUE.includes(body.tipo)) return rechazo('parametros')
  const titulo = typeof body.titulo === 'string' ? body.titulo.trim().slice(0, 80) : ''
  if (!titulo) return rechazo('parametros')

  const { data, error } = await clienteUsuario(jwt).rpc('tenis_bloqueo_puntual', {
    p_cancha_id: canchaId,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
    p_tipo: body.tipo,
    p_titulo: titulo,
  })
  if (error) return errorRpc('tenis_bloqueo_puntual', error)
  const r = (data ?? {}) as { bloque_id?: string; reservas_canceladas?: unknown }
  const canceladas = Array.isArray(r.reservas_canceladas)
    ? r.reservas_canceladas.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
    : []

  let avisos = { push: 0, emails: 0 }
  try {
    avisos = await avisarCancelacion(canceladas, titulo)
  } catch (e) {
    console.error('tenis-gestion: avisos del bloqueo:', e instanceof Error ? e.message : String(e))
  }
  return jsonOk({ ok: true, bloque_id: r.bloque_id ?? null, reservas_canceladas: canceladas, avisos })
}

async function avisarCancelacion(reservaIds: string[], titulo: string): Promise<{ push: number; emails: number }> {
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
        clave: `${r.id}:bloqueo`,
        socioId,
        title: 'Tenis: se canceló tu reserva',
        body: `${turno}: ${titulo}. Perdón por el cambio, podés reservar otro horario.`,
        data: { type: 'tenis_reserva_cancelada', reserva_id: r.id },
      })
    }
    const conMail = new Set([r.titular_invitado_id, ...r.jugadores.map((j) => j.invitado_id)].filter((x): x is string => !!x))
    for (const invitadoId of conMail) {
      const invitado = invitados.get(invitadoId)
      const ok = await mailAInvitado(invitado, 'Se canceló tu reserva de tenis — UNCAS', `
        <p style="font-size:16px">Hola ${escapeHtml(invitado?.nombre ?? '')},</p>
        <p style="font-size:16px">Tuvimos que cancelar tu reserva del <strong>${escapeHtml(turno)}</strong>: ${escapeHtml(titulo)}.</p>
        <p style="font-size:16px">Si ya pagaste, la administración del club te devuelve el importe. Podés reservar otro horario en uncasapp.com/tenis/reservar.</p>
      `)
      if (ok) emails++
    }
  }
  const { entregados } = await pushASocios(pushes)
  return { push: entregados, emails }
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
