// Edge Function: admin-socios
// Gestión de socios del club para Secretaría y Admin.
//
// Actions:
//   create         — Alta de socio: invite email + profile + socio + TOTP secret
//   deactivate     — estado → 'inactivo' + ban auth
//   reactivate     — estado → 'activo'   + unban auth
//   validate-photo — AWS Rekognition DetectFaces → actualiza foto_validada + estado
//
// Callers permitidos:
//   create / deactivate / reactivate → secretaria, admin, subcomision
//   validate-photo                   → secretaria, admin, subcomision, socio (la propia)

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { generateSecret } from '../_shared/totp.ts'
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

  if (action === 'create')          return handleCreate(body, callerRol)
  if (action === 'deactivate')      return handleDeactivate(body, callerRol)
  if (action === 'reactivate')      return handleReactivate(body, callerRol)
  if (action === 'validate-photo')  return handleValidatePhoto(body, callerRol, caller.id)

  return jsonError(400, `Acción desconocida: ${action}`)
})

// ─── Crear socio ──────────────────────────────────────────────────────────────

async function handleCreate(body: Record<string, unknown>, callerRol: string): Promise<Response> {
  if (!STAFF_ROLES.includes(callerRol)) return jsonError(403, 'Solo Secretaría puede crear socios')

  const email           = (body.email as string | undefined)?.trim().toLowerCase()
  const nombre          = (body.nombre as string | undefined)?.trim()
  const dni             = (body.dni as string | undefined)?.trim()
  const categoria_id    = body.categoria_id as string | undefined
  const fecha_nacimiento = body.fecha_nacimiento as string | undefined

  if (!email)        return jsonError(400, 'email es requerido')
  if (!nombre)       return jsonError(400, 'nombre es requerido')
  if (!dni)          return jsonError(400, 'dni es requerido')
  if (!categoria_id) return jsonError(400, 'categoria_id es requerido')

  // 1. Crear usuario con DNI como contraseña inicial (sin email de confirmación)
  const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: dni,
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (createErr || !userData.user) {
    const msg = createErr?.message ?? 'Error al crear el usuario'
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      return jsonError(409, 'Ya existe un usuario con ese email')
    }
    return jsonError(500, msg)
  }

  const userId = userData.user.id

  // 2. Crear profile con rol='socio'
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({ id: userId, nombre, rol: 'socio', divisiones: null })

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return jsonError(500, 'Error al crear perfil: ' + profileErr.message)
  }

  // 3. Crear registro de socio
  const socioPayload: Record<string, unknown> = {
    profile_id:   userId,
    dni,
    categoria_id,
    estado:        'pendiente',
    foto_validada: false,
  }
  if (fecha_nacimiento) socioPayload.fecha_nacimiento = fecha_nacimiento

  const { data: socioData, error: socioErr } = await supabaseAdmin
    .from('socios')
    .insert(socioPayload)
    .select('id, numero_socio')
    .single()

  if (socioErr || !socioData) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return jsonError(500, 'Error al crear socio: ' + (socioErr?.message ?? 'unknown'))
  }

  // 4. Vincular jugadores con el mismo DNI (si los hay)
  const { error: jugadorErr } = await supabaseAdmin
    .from('jugadores')
    .update({ socio_id: socioData.id })
    .eq('dni', dni)
    .is('socio_id', null)

  if (jugadorErr) {
    console.error('Error al vincular jugadores por DNI:', jugadorErr.message)
  }

  // 5. Generar y guardar TOTP secret (en socios_secrets — sin RLS, solo service role)
  const totpSecret = generateSecret()
  const { error: secretErr } = await supabaseAdmin
    .from('socios_secrets')
    .insert({ socio_id: socioData.id, totp_secret: totpSecret })

  if (secretErr) {
    // No es un error fatal — el carnet no funcionará hasta que se genere manualmente
    console.error('Error al guardar TOTP secret:', secretErr.message)
  }

  return jsonOk({ socio_id: socioData.id, numero_socio: socioData.numero_socio, email, nombre })
}

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

  // Sin AWS configurado: validación manual directa
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
