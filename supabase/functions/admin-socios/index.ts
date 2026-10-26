// Edge Function: admin-socios
// Gestión de socios del club para Secretaría y Admin.
//
// Actions:
//   create         — 410: el alta manual se sacó (2026-10-26); todo socio entra por el
//                    import del padrón NUVIX (importar-socios)
//   deactivate     — estado → 'inactivo' + ban auth
//   reactivate     — estado → 'activo'   + unban auth
//   validate-photo — AWS Rekognition DetectFaces → actualiza foto_validada + estado
//
// Callers permitidos:
//   deactivate / reactivate          → secretaria, admin, subcomision
//   validate-photo                   → secretaria, admin, subcomision, socio (la propia)

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { RekognitionClient, DetectFacesCommand } from 'npm:@aws-sdk/client-rekognition@3'

const STAFF_ROLES = ['secretaria', 'admin', 'subcomision']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ─── Verificar JWT ────────────────────────────────────────────────────────────
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

  // ─── Routing ──────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonError(400, 'Body inválido') }

  const { action } = body

  if (!STAFF_ROLES.includes(callerRol) && callerRol !== 'socio') {
    return jsonError(403, 'Sin permiso')
  }

  // Un socio creado a mano no tenía el Nº de socio de NUVIX: el import siguiente
  // lo daba de baja y lo recreaba con mail sintético. Todo alta entra por el padrón.
  if (action === 'create') {
    return jsonError(410, 'El alta manual de socios ya no existe: los socios entran con el import del padrón de NUVIX.')
  }
  if (action === 'deactivate')      return handleDeactivate(body, callerRol)
  if (action === 'reactivate')      return handleReactivate(body, callerRol)
  if (action === 'validate-photo')  return handleValidatePhoto(body, callerRol, caller.id)

  return jsonError(400, `Acción desconocida: ${action}`)
})

// ─── Desactivar socio ─────────────────────────────────────────────────────────

async function handleDeactivate(body: Record<string, unknown>, callerRol: string): Promise<Response> {
  if (!STAFF_ROLES.includes(callerRol)) return jsonError(403, 'Sin permiso')

  const socioId = body.socio_id as string | undefined
  if (!socioId) return jsonError(400, 'socio_id es requerido')

  const { data: socio, error: fetchErr } = await supabaseAdmin
    .from('socios')
    .select('profile_id')
    .eq('id', socioId)
    .single()

  if (fetchErr || !socio) return jsonError(404, 'Socio no encontrado')

  const [banRes, socioRes] = await Promise.all([
    supabaseAdmin.auth.admin.updateUserById(socio.profile_id, { ban_duration: '876000h' }),
    supabaseAdmin.from('socios').update({ estado: 'inactivo' }).eq('id', socioId),
  ])

  if (banRes.error) return jsonError(500, 'Error al banear: ' + banRes.error.message)
  if (socioRes.error) return jsonError(500, 'Error al actualizar socio: ' + socioRes.error.message)

  return jsonOk({ ok: true })
}

// ─── Reactivar socio ──────────────────────────────────────────────────────────

async function handleReactivate(body: Record<string, unknown>, callerRol: string): Promise<Response> {
  if (!STAFF_ROLES.includes(callerRol)) return jsonError(403, 'Sin permiso')

  const socioId = body.socio_id as string | undefined
  if (!socioId) return jsonError(400, 'socio_id es requerido')

  const { data: socio, error: fetchErr } = await supabaseAdmin
    .from('socios')
    .select('profile_id, foto_validada')
    .eq('id', socioId)
    .single()

  if (fetchErr || !socio) return jsonError(404, 'Socio no encontrado')

  // Solo pasa a 'activo' si tiene foto validada; si no, vuelve a 'pendiente'
  const nuevoEstado = socio.foto_validada ? 'activo' : 'pendiente'

  const [unbanRes, socioRes] = await Promise.all([
    supabaseAdmin.auth.admin.updateUserById(socio.profile_id, { ban_duration: 'none' }),
    supabaseAdmin.from('socios').update({ estado: nuevoEstado }).eq('id', socioId),
  ])

  if (unbanRes.error) return jsonError(500, 'Error al reactivar: ' + unbanRes.error.message)
  if (socioRes.error) return jsonError(500, 'Error al actualizar socio: ' + socioRes.error.message)

  return jsonOk({ ok: true, estado: nuevoEstado })
}

// ─── Validar foto con AWS Rekognition ─────────────────────────────────────────

async function handleValidatePhoto(
  body: Record<string, unknown>,
  callerRol: string,
  callerId: string
): Promise<Response> {
  let socioId: string | undefined

  if (callerRol === 'socio') {
    // El socio valida su propia foto — ignorar socio_id del body
    const { data: socio } = await supabaseAdmin
      .from('socios')
      .select('id')
      .eq('profile_id', callerId)
      .single()
    socioId = socio?.id
  } else if (STAFF_ROLES.includes(callerRol)) {
    socioId = body.socio_id as string | undefined
  } else {
    return jsonError(403, 'Sin permiso para validar fotos')
  }

  if (!socioId) return jsonError(400, 'socio_id no encontrado')

  // Obtener foto_path del socio
  const { data: socio, error: fetchErr } = await supabaseAdmin
    .from('socios')
    .select('foto_path, estado')
    .eq('id', socioId)
    .single()

  if (fetchErr || !socio) return jsonError(404, 'Socio no encontrado')
  if (!socio.foto_path)   return jsonError(400, 'El socio no tiene foto cargada')

  // Sin AWS configurado: validación manual directa. Antes se negaba a auto-aprobar
  // al propio socio (hallazgo #2/#3 de la auditoría pre-producción); revertido
  // 2026-08-24 — el onboarding instruye a los socios a subir una foto de cara,
  // así que el propio socio recibe el mismo trato que Secretaría/admin acá.
  const awsKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
  if (!awsKeyId) {
    const nuevoEstado = socio.estado === 'pendiente' ? 'activo' : socio.estado
    const { error: updateErr } = await supabaseAdmin
      .from('socios')
      .update({ foto_validada: true, estado: nuevoEstado })
      .eq('id', socioId)
    if (updateErr) return jsonError(500, 'Error al actualizar: ' + updateErr.message)
    return jsonOk({ validada: true, estado: nuevoEstado })
  }

  // Descargar imagen desde Storage
  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from('socios-fotos')
    .download(socio.foto_path)

  if (dlErr || !fileData) return jsonError(500, 'Error al descargar la imagen')

  const imageBytes = new Uint8Array(await fileData.arrayBuffer())

  // Llamar a AWS Rekognition
  const awsRegion = Deno.env.get('AWS_REGION') ?? 'us-east-1'
  const rekognition = new RekognitionClient({
    region: awsRegion,
    credentials: {
      accessKeyId:     Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  })

  const rekResult = await rekognition.send(
    new DetectFacesCommand({ Image: { Bytes: imageBytes }, Attributes: ['DEFAULT'] })
  )

  const faces = rekResult.FaceDetails ?? []

  if (faces.length === 0) {
    return jsonOk({ validada: false, mensaje: 'No se detectó ningún rostro en la imagen.' })
  }
  if (faces.length > 1) {
    return jsonOk({ validada: false, mensaje: 'La imagen debe mostrar un solo rostro.' })
  }
  if ((faces[0].Confidence ?? 0) < 90) {
    return jsonOk({ validada: false, mensaje: 'La imagen no es suficientemente clara.' })
  }

  // Validación exitosa — actualizar socio
  const nuevoEstado = socio.estado === 'pendiente' ? 'activo' : socio.estado
  const { error: updateErr } = await supabaseAdmin
    .from('socios')
    .update({ foto_validada: true, estado: nuevoEstado })
    .eq('id', socioId)

  if (updateErr) return jsonError(500, 'Error al actualizar: ' + updateErr.message)

  return jsonOk({ validada: true, estado: nuevoEstado })
}
