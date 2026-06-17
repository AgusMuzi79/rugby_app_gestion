import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

type RolCreable = 'coordinador' | 'entrenador' | 'manager' | 'secretaria' | 'porteria' | 'subcomision'

const ROLES_POR_CALLER: Record<string, RolCreable[]> = {
  subcomision: ['coordinador', 'entrenador', 'manager', 'subcomision'],
  admin:       ['coordinador', 'entrenador', 'manager', 'secretaria', 'porteria', 'subcomision'],
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ─── Verificar JWT y rol del caller ───────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'Sin autorización')

  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.rol !== 'subcomision' && callerProfile?.rol !== 'admin') {
    return jsonError(403, 'Solo la Subcomisión puede gestionar usuarios')
  }

  // ─── Routing por action ───────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }

  const { action } = body

  if (action === 'create') return handleCreate(body, callerProfile.rol)
  if (action === 'assign-role') return handleAssignRole(body, callerProfile.rol)
  if (action === 'deactivate') return handleDesactivar(body)
  if (action === 'reactivate') return handleReactivar(body)
  if (action === 'delete') return handleEliminar(body)
  if (action === 'getUser') return handleGetUser(body)

  return jsonError(400, `Acción desconocida: ${action}`)
})

// ─── Crear usuario ────────────────────────────────────────────────────────────

async function handleCreate(body: Record<string, unknown>, callerRol: string): Promise<Response> {
  const nombre     = (body.nombre as string | undefined)?.trim()
  const email      = (body.email  as string | undefined)?.trim().toLowerCase()
  const dni        = (body.dni    as string | undefined)?.trim()
  const rol        = body.rol as RolCreable | undefined
  const divisiones = body.divisiones as string[] | undefined

  if (!nombre) return jsonError(400, 'El nombre es requerido')
  if (!email)  return jsonError(400, 'El email es requerido')
  if (!dni)    return jsonError(400, 'El DNI es requerido')

  const rolesPermitidos = ROLES_POR_CALLER[callerRol] ?? []
  if (!rol || !rolesPermitidos.includes(rol)) {
    return jsonError(403, `No tenés permiso para crear usuarios con rol "${rol}"`)
  }

  // Crear usuario con DNI como contraseña inicial (sin email de confirmación)
  const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password:      dni,
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

  // Insertar perfil
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id:         userId,
      nombre,
      rol,
      divisiones: divisiones && divisiones.length > 0 ? divisiones : null,
    })

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return jsonError(500, 'Error al crear el perfil: ' + profileErr.message)
  }

  // Email de bienvenida — fire and forget, no falla si Resend no está configurado
  EdgeRuntime.waitUntil(enviarEmailBienvenida(nombre, email))

  return jsonOk({ id: userId, email, nombre, rol })
}

// ─── Asignar rol de staff a socio existente ───────────────────────────────────

async function handleAssignRole(body: Record<string, unknown>, callerRol: string): Promise<Response> {
  const socioId    = body.socioId  as string | undefined
  const nuevoRol   = body.nuevoRol as RolCreable | undefined
  const divisiones = body.divisiones as string[] | undefined

  if (!socioId) return jsonError(400, 'socioId es requerido')

  const rolesPermitidos = ROLES_POR_CALLER[callerRol] ?? []
  if (!nuevoRol || !rolesPermitidos.includes(nuevoRol)) {
    return jsonError(403, `No tenés permiso para asignar el rol "${nuevoRol}"`)
  }

  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select('id, nombre, email, dni, profile_id')
    .eq('id', socioId)
    .single()

  if (socioErr || !socio) return jsonError(404, 'Socio no encontrado')
  if (!socio.email) return jsonError(400, 'El socio no tiene email registrado')
  if (!socio.dni)   return jsonError(400, 'El socio no tiene DNI registrado')

  const divisionesVal = divisiones && divisiones.length > 0 ? divisiones : null

  if (socio.profile_id) {
    // Perfil existente — agregar rol al array
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('roles')
      .eq('id', socio.profile_id)
      .single()

    const rolesActuales = (profile?.roles as string[]) ?? []
    if (rolesActuales.includes(nuevoRol)) {
      return jsonError(409, 'El socio ya tiene ese rol asignado')
    }

    // 'socio' siempre en el array — assign-role opera sobre un registro de socios
    const rolesNuevos = [...new Set(['socio', ...rolesActuales, nuevoRol])]

    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        roles:      rolesNuevos,
        rol:        nuevoRol,
        divisiones: divisionesVal,
      })
      .eq('id', socio.profile_id)

    if (updateErr) return jsonError(500, 'Error al actualizar perfil: ' + updateErr.message)
    return jsonOk({ ok: true, profileId: socio.profile_id, nombre: socio.nombre })
  }

  // Sin perfil — crear auth user con DNI como contraseña inicial
  const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email:         socio.email,
    password:      socio.dni,
    email_confirm: true,
    user_metadata: { nombre: socio.nombre },
  })

  if (createErr || !userData.user) {
    const msg = createErr?.message ?? 'Error al crear el usuario'
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      return jsonError(409, 'Ya existe un usuario con ese email')
    }
    return jsonError(500, msg)
  }

  const userId = userData.user.id

  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id:         userId,
      nombre:     socio.nombre,
      rol:        nuevoRol,
      roles:      ['socio', nuevoRol],
      divisiones: divisionesVal,
    })

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return jsonError(500, 'Error al crear perfil: ' + profileErr.message)
  }

  await supabaseAdmin.from('socios').update({ profile_id: userId }).eq('id', socioId)

  EdgeRuntime.waitUntil(enviarEmailBienvenida(socio.nombre, socio.email))
  return jsonOk({ ok: true, profileId: userId, nombre: socio.nombre })
}

// ─── Email de bienvenida ──────────────────────────────────────────────────────

async function enviarEmailBienvenida(nombre: string, email: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from      = Deno.env.get('CLUB_EMAIL_FROM') ?? 'UNCAS Rugby Club <no-reply@uncasrugby.com>'
  if (!resendKey) return

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#15110A;padding:32px 24px;text-align:center">
        <h1 style="color:#F5B41C;font-size:22px;margin:0;letter-spacing:2px">UNCAS RUGBY CLUB</h1>
      </div>
      <div style="padding:32px 24px;background:#ffffff">
        <p style="font-size:16px">Hola <strong>${nombre}</strong>,</p>
        <p style="font-size:15px;line-height:1.6">
          Fuiste invitado a formar parte de la app de gestión de <strong>UNCAS Rugby Club</strong>.
        </p>
        <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px">Tus datos de acceso</p>
          <p style="margin:4px 0;font-size:15px"><strong>Email:</strong> ${email}</p>
          <p style="margin:4px 0;font-size:15px"><strong>Contraseña inicial:</strong> tu número de DNI</p>
        </div>
        <p style="font-size:15px;line-height:1.6">
          Descargá la app desde la <strong>Play Store</strong> o <strong>App Store</strong>
          buscando <em>"UNCAS Rugby"</em> e ingresá con estos datos.
        </p>
        <p style="font-size:13px;color:#888;margin-top:32px">
          Si tenés alguna consulta, contactá a la secretaría del club.
        </p>
      </div>
      <div style="background:#15110A;padding:16px 24px;text-align:center">
        <p style="color:#8E8574;font-size:12px;margin:0">UNCAS Rugby Club · Gestión Operativa</p>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to:      [email],
      subject: 'Bienvenido a la app de UNCAS Rugby Club',
      html,
    }),
  }).catch(err => console.error('Error al enviar email de bienvenida:', err))
}

// ─── Desactivar usuario ───────────────────────────────────────────────────────

async function handleDesactivar(body: Record<string, unknown>): Promise<Response> {
  const userId = body.userId as string | undefined
  if (!userId) return jsonError(400, 'userId es requerido')

  const [banRes, profileRes] = await Promise.all([
    // ban_duration '876000h' ≈ 100 años — efectivamente permanente
    supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' }),
    supabaseAdmin.from('profiles').update({ activo: false }).eq('id', userId),
  ])

  if (banRes.error) return jsonError(500, 'Error al banear: ' + banRes.error.message)
  if (profileRes.error) return jsonError(500, 'Error al actualizar perfil: ' + profileRes.error.message)

  return jsonOk({ ok: true })
}

// ─── Eliminar usuario ─────────────────────────────────────────────────────────

async function handleEliminar(body: Record<string, unknown>): Promise<Response> {
  const userId = body.userId as string | undefined
  if (!userId) return jsonError(400, 'userId es requerido')

  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteErr) return jsonError(500, 'Error al eliminar: ' + deleteErr.message)

  return jsonOk({ ok: true })
}

// ─── Obtener datos de usuario ─────────────────────────────────────────────────

async function handleGetUser(body: Record<string, unknown>): Promise<Response> {
  const userId = body.userId as string | undefined
  if (!userId) return jsonError(400, 'userId es requerido')

  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) return jsonError(500, error?.message ?? 'Usuario no encontrado')

  return jsonOk({ email: user.email ?? '' })
}

// ─── Reactivar usuario ────────────────────────────────────────────────────────

async function handleReactivar(body: Record<string, unknown>): Promise<Response> {
  const userId = body.userId as string | undefined
  if (!userId) return jsonError(400, 'userId es requerido')

  const [unbanRes, profileRes] = await Promise.all([
    supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' }),
    supabaseAdmin.from('profiles').update({ activo: true }).eq('id', userId),
  ])

  if (unbanRes.error) return jsonError(500, 'Error al reactivar: ' + unbanRes.error.message)
  if (profileRes.error) return jsonError(500, 'Error al actualizar perfil: ' + profileRes.error.message)

  return jsonOk({ ok: true })
}
