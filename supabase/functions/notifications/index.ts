import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/expo-push-notification-service/push/send'

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

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'Sin autorización')

  const { error: authErr } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr) return jsonError(401, 'Token inválido')

  let body: { type: NotificationType; payload: NotifPayload | ManualPayload | NoticiaPayload }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }

  const { type, payload } = body

  try {
    if (type === 'manual') {
      const mp = payload as ManualPayload
      if (!mp?.titulo || !mp?.mensaje || !mp?.rolDestinatario) {
        return jsonError(400, 'Payload manual incompleto')
      }
      await notificarManual(mp)
    } else if (type === 'noticia_publicada') {
      const np = payload as NoticiaPayload
      if (!np?.titulo || !np?.noticiaId) {
        return jsonError(400, 'Payload noticia incompleto')
      }
      await notificarNoticiaPublicada(np)
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
    return jsonOk({ ok: true })
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

async function notificarNoticiaPublicada(p: NoticiaPayload): Promise<void> {
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

  await enviarExpoPush(tokens, 'Nueva Noticia', p.titulo, {
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
  const { data: pushRows } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .in('usuario_id', ids)

  return { ids, tokens: (pushRows ?? []).map(r => r.token) }
}

// Para noticias de audiencia 'todos': busca por el array roles[] en vez de rol activo,
// así llega a socios cuyo rol activo es staff (entrenador, coordinador, etc.)
async function getDestinatariosSocio(): Promise<{ ids: string[]; tokens: string[] }> {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .contains('roles', ['socio'])
    .eq('activo', true)

  if (!profiles?.length) return { ids: [], tokens: [] }

  const ids = profiles.map(p => p.id)
  const { data: pushRows } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .in('usuario_id', ids)

  return { ids, tokens: (pushRows ?? []).map(r => r.token) }
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

  const { data: pushRows } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .in('usuario_id', profileIds)

  return (pushRows ?? []).map(r => r.token)
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
  const { data: pushRows } = await supabaseAdmin
    .from('push_tokens')
    .select('token')
    .in('usuario_id', ids)

  return { ids, tokens: (pushRows ?? []).map(r => r.token) }
}

// ─── Expo Push ────────────────────────────────────────────────────────────────

async function enviarExpoPush(
  tokens:  string[],
  title:   string,
  body:    string,
  data?:   Record<string, unknown>,
): Promise<void> {
  // Solo tokens válidos de Expo
  const validos = tokens.filter(t =>
    t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['),
  )
  if (validos.length === 0) return

  const messages = validos.map(to => ({
    to,
    title,
    body,
    data:  data ?? {},
    sound: 'default',
  }))

  await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'Accept':          'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  })
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
