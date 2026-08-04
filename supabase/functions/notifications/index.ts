import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_CHUNK_SIZE = 100

type NotificationType = 'lesion' | 'fichaje' | 'ausencias_consecutivas' | 'manual' | 'noticia_publicada' | 'cancelacion_entrenamiento'
type TipoReferencia   = 'lesion' | 'fichaje' | 'asistencia'

interface NotifPayload {
  jugadorNombre:  string
  divisionNombre: string
  divisionId:     string
  jugadorId?:     string
  grado?:         number
}

interface ManualPayload {
  titulo:          string
  mensaje:         string
  rolDestinatario: 'coordinador' | 'entrenador' | 'manager' | 'todos'
}

interface NoticiaPayload {
  titulo:     string
  noticiaId:  string
  audiencia?: 'todos' | 'cuerpo_tecnico'
}

interface CancelacionPayload {
  divisionId:     string
  divisionNombre: string
  mensaje:        string
  fecha:          string
}

// ─── Caller autorizado por tipo de notificación ─────────────────────────────────
// 'admin' siempre puede todo (equivalente a subcomisión en el resto de las
// Edge Functions). 'manual' con rolDestinatario != 'todos' queda reservado
// a subcomisión/admin — manager/entrenador/coordinador (crónica) solo envían
// con 'todos'.

const ROLES_POR_TIPO: Record<NotificationType, string[]> = {
  lesion:                    ['entrenador'],
  fichaje:                   ['manager'],
  ausencias_consecutivas:    ['entrenador'],
  cancelacion_entrenamiento: ['coordinador'],
  noticia_publicada:         ['secretaria'],
  manual:                    ['subcomision', 'manager', 'entrenador', 'coordinador'],
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()

  const callerRol = callerProfile?.rol ?? ''

  let body: { type: NotificationType; payload: NotifPayload | ManualPayload | NoticiaPayload }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }

  const { type, payload } = body

  const rolesPermitidos = ROLES_POR_TIPO[type] ?? []
  if (callerRol !== 'admin' && !rolesPermitidos.includes(callerRol)) {
    return jsonError(403, `Sin permiso para enviar notificaciones de tipo "${type}"`)
  }

  try {
    let resumen: PushResumen | undefined
    if (type === 'manual') {
      const mp = payload as ManualPayload
      if (!mp?.titulo || !mp?.mensaje || !mp?.rolDestinatario) {
        return jsonError(400, 'Payload manual incompleto')
      }
      if (mp.rolDestinatario !== 'todos' && callerRol !== 'subcomision' && callerRol !== 'admin') {
        return jsonError(403, 'Solo Subcomisión puede elegir el destinatario')
      }
      await notificarManual(mp)
    } else if (type === 'noticia_publicada') {
      const np = payload as NoticiaPayload
      if (!np?.titulo || !np?.noticiaId) {
        return jsonError(400, 'Payload noticia incompleto')
      }
      resumen = await notificarNoticiaPublicada(np)
    } else if (type === 'cancelacion_entrenamiento') {
      const cp = payload as CancelacionPayload
      if (!cp?.divisionId || !cp?.mensaje) {
        return jsonError(400, 'Payload cancelacion incompleto')
      }
      await notificarCancelacion(cp)
    } else {
      const np = payload as NotifPayload
      if (!np?.jugadorNombre || !np?.divisionNombre || !np?.divisionId) {
        return jsonError(400, 'Payload incompleto')
      }
      if (type === 'lesion') {
        await notificarLesion(np)
      } else if (type === 'fichaje') {
        await notificarFichaje(np)
      } else if (type === 'ausencias_consecutivas') {
        await notificarAusencias(np)
      } else {
        return jsonError(400, `Tipo desconocido: ${type}`)
      }
    }
    return jsonOk({ ok: true, resumen })
  } catch (e) {
    return jsonError(500, (e as Error).message)
  }
})

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function notificarLesion(p: NotifPayload): Promise<void> {
  const titulo  = `Lesión Grado ${p.grado ?? '?'} — ${p.divisionNombre}`
  const mensaje = `${p.jugadorNombre} fue registrado con lesión de grado ${p.grado ?? '?'}.`
  const { ids, tokens } = await getDestinatariosRol('subcomision')
  await Promise.allSettled([
    enviarExpoPush(tokens, titulo, mensaje, { type: 'lesion', jugadorId: p.jugadorId }),
    guardarNotificacion(titulo, mensaje, ids, 'lesion', p.jugadorId),
  ])
}

async function notificarFichaje(p: NotifPayload): Promise<void> {
  const titulo  = `Nuevo Fichaje — ${p.divisionNombre}`
  const mensaje = `${p.jugadorNombre} fue dado de alta.`
  const { ids, tokens } = await getDestinatariosRol('subcomision')
  await Promise.allSettled([
    enviarExpoPush(tokens, titulo, mensaje, { type: 'fichaje', jugadorId: p.jugadorId }),
    guardarNotificacion(titulo, mensaje, ids, 'fichaje', p.jugadorId),
  ])
}

async function notificarManual(p: ManualPayload): Promise<void> {
  const roles = p.rolDestinatario === 'todos'
    ? ['coordinador', 'entrenador', 'manager']
    : [p.rolDestinatario]

  const allTokens: string[] = []
  for (const rol of roles) {
    const { tokens } = await getDestinatariosRol(rol)
    allTokens.push(...tokens)
  }

  await enviarExpoPush(allTokens, p.titulo, p.mensaje, { type: 'manual' })
}

async function notificarNoticiaPublicada(p: NoticiaPayload): Promise<PushResumen> {
  const audiencia = p.audiencia ?? 'todos'
  let tokens: string[]

  if (audiencia === 'cuerpo_tecnico') {
    // Solo staff: coordinador + entrenador + manager
    const roles = ['coordinador', 'entrenador', 'manager']
    const allTokens: string[] = []
    for (const rol of roles) {
      const { tokens: t } = await getDestinatariosRol(rol)
      allTokens.push(...t)
    }
    tokens = allTokens
  } else {
    // todos: cualquier usuario que tenga el rol 'socio' en su array de roles
    const { tokens: t } = await getDestinatariosSocio()
    tokens = t
  }

  return await enviarExpoPush(tokens, 'Nueva Noticia', p.titulo, {
    type: 'noticia_publicada',
    noticiaId: p.noticiaId,
  })
}

async function notificarCancelacion(p: CancelacionPayload): Promise<void> {
  const titulo  = `Entrenamiento cancelado — ${p.divisionNombre}`
  const mensaje = p.mensaje
  const tokens  = await getTokensJugadoresDivision(p.divisionId)
  await enviarExpoPush(tokens, titulo, mensaje, {
    type:       'cancelacion_entrenamiento',
    divisionId: p.divisionId,
  })
}

async function notificarAusencias(p: NotifPayload): Promise<void> {
  const titulo  = `Ausencias — ${p.divisionNombre}`
  const mensaje = `${p.jugadorNombre} acumula 4 ausencias consecutivas.`
  const { ids, tokens } = await getDestinatariosCoordinador(p.divisionId)
  await Promise.allSettled([
    enviarExpoPush(tokens, titulo, mensaje, { type: 'ausencias_consecutivas', jugadorId: p.jugadorId }),
    guardarNotificacion(titulo, mensaje, ids, 'asistencia', p.jugadorId),
  ])
}

// ─── Destinatarios ────────────────────────────────────────────────────────────

// PostgREST arma la URL del filtro .in() con todos los ids en la query string.
// Con 1528 socios activados (2026-08-04) esa URL supera los ~56.000 caracteres
// y el request vuelve "Bad Request" — el código no revisaba el `error` de la
// respuesta, así que devolvía silenciosamente cero tokens. Ningún push de
// audiencia 'todos' llegó a nadie desde entonces (probablemente desde antes)
// por este motivo. Fix: traer los tokens en lotes chicos.
const PUSH_TOKENS_IN_CHUNK_SIZE = 100

async function fetchPushTokens(usuarioIds: string[]): Promise<string[]> {
  const tokens: string[] = []
  for (let i = 0; i < usuarioIds.length; i += PUSH_TOKENS_IN_CHUNK_SIZE) {
    const chunk = usuarioIds.slice(i, i + PUSH_TOKENS_IN_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .in('usuario_id', chunk)
    if (error) {
      console.error(`Error trayendo push_tokens (lote de ${chunk.length}):`, error.message)
      continue
    }
    tokens.push(...(data ?? []).map(r => r.token))
  }
  return tokens
}

async function getDestinatariosRol(
  rol: string,
): Promise<{ ids: string[]; tokens: string[] }> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('rol', rol)
    .eq('activo', true)

  if (!profiles?.length) return { ids: [], tokens: [] }

  const ids = profiles.map(p => p.id)
  return { ids, tokens: await fetchPushTokens(ids) }
}

// Para noticias de audiencia 'todos': busca por el array roles[] en vez de rol activo,
// así llega a socios cuyo rol activo es staff (entrenador, coordinador, etc.)
async function getDestinatariosSocio(): Promise<{ ids: string[]; tokens: string[] }> {
  // PostgREST devuelve máximo 1000 filas por default — con 1500+ socios hay que paginar.
  let profiles: { id: string }[] = []
  let from = 0
  const pageSize = 1000
  for (;;) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .contains('roles', ['socio'])
      .eq('activo', true)
      .range(from, from + pageSize - 1)
    profiles = profiles.concat(data ?? [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  if (!profiles.length) return { ids: [], tokens: [] }

  const ids = profiles.map(p => p.id)
  return { ids, tokens: await fetchPushTokens(ids) }
}

async function getTokensJugadoresDivision(divisionId: string): Promise<string[]> {
  // Jugadores activos en la división que tienen socio vinculado
  const { data: jugadores } = await supabaseAdmin
    .from('jugadores')
    .select('socio_id')
    .eq('division_id', divisionId)
    .eq('activo', true)
    .not('socio_id', 'is', null)

  const socioIds = (jugadores ?? []).map(j => j.socio_id as string).filter(Boolean)
  if (!socioIds.length) return []

  // Profile ids de esos socios
  const { data: socios } = await supabaseAdmin
    .from('socios')
    .select('profile_id')
    .in('id', socioIds)
    .not('profile_id', 'is', null)

  const profileIds = (socios ?? []).map(s => s.profile_id as string).filter(Boolean)
  if (!profileIds.length) return []

  return await fetchPushTokens(profileIds)
}

async function getDestinatariosCoordinador(
  divisionId: string,
): Promise<{ ids: string[]; tokens: string[] }> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('rol', 'coordinador')
    .eq('activo', true)
    .contains('divisiones', [divisionId])

  if (!profiles?.length) return { ids: [], tokens: [] }

  const ids = profiles.map(p => p.id)
  const tokens = await fetchPushTokens(ids)

  return { ids, tokens }
}

// ─── Expo Push ────────────────────────────────────────────────────────────────

interface PushResumen {
  tokensValidos: number
  ok:            number
  errores:       { to: string; error?: string; message?: string }[]
}

async function enviarExpoPush(
  tokens:  string[],
  title:   string,
  body:    string,
  data?:   Record<string, unknown>,
): Promise<PushResumen> {
  // Solo tokens válidos de Expo
  const validos = tokens.filter(t =>
    t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['),
  )
  const resumen: PushResumen = { tokensValidos: validos.length, ok: 0, errores: [] }
  if (validos.length === 0) return resumen

  const messages = validos.map(to => ({
    to,
    title,
    body,
    data:  data ?? {},
    sound: 'default',
  }))

  // Expo rechaza requests con más de 100 mensajes
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'Accept':          'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error(`Expo push falló (${res.status}):`, text)
        resumen.errores.push({ to: 'batch', error: `http_${res.status}`, message: text })
        continue
      }

      // Expo devuelve 200 general aunque un mensaje puntual haya fallado —
      // el detalle real está en cada "ticket" del array `data`. Sin esto,
      // un token inválido (DeviceNotRegistered) o credenciales FCM mal
      // configuradas (InvalidCredentials) quedaban invisibles.
      const json = await res.json().catch(() => null)
      const tickets = json?.data as Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> | undefined
      if (!tickets) {
        console.error('Respuesta de Expo sin `data`:', JSON.stringify(json))
        resumen.errores.push({ to: 'batch', error: 'sin_data', message: JSON.stringify(json) })
        continue
      }
      tickets.forEach((t, idx) => {
        const to = chunk[idx]?.to ?? '?'
        if (t.status === 'error') {
          resumen.errores.push({ to, error: t.details?.error, message: t.message })
        } else {
          resumen.ok++
        }
      })
      if (resumen.errores.length > 0) {
        console.error(`Tickets con error:`, JSON.stringify(resumen.errores))
      } else {
        console.log(`${tickets.length} tickets OK`)
      }
    } catch (e) {
      console.error('Error de red enviando push a Expo:', (e as Error).message)
      resumen.errores.push({ to: 'batch', error: 'network', message: (e as Error).message })
    }
  }
  return resumen
}

// ─── Persistencia en DB ───────────────────────────────────────────────────────

async function guardarNotificacion(
  titulo:         string,
  mensaje:        string,
  destinatarios:  string[],
  tipoRef:        TipoReferencia,
  referenciaId?:  string,
): Promise<void> {
  if (destinatarios.length === 0) return

  const { data: notif } = await supabaseAdmin
    .from('notificaciones')
    .insert({
      tipo:                    'sistema',
      titulo,
      mensaje,
      evento_referencia_id:    referenciaId ?? null,
      evento_referencia_tipo:  tipoRef,
    })
    .select('id')
    .single()

  if (!notif) return

  await supabaseAdmin
    .from('notificaciones_destinatarios')
    .insert(destinatarios.map(usuario_id => ({
      notificacion_id: notif.id,
      usuario_id,
    })))
}
