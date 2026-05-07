import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

type RolCreable = 'coordinador' | 'entrenador' | 'manager'

const ROLES_VALIDOS: RolCreable[] = ['coordinador', 'entrenador', 'manager']

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

  if (action === 'create') return handleCreate(body)
  if (action === 'deactivate') return handleDesactivar(body)
  if (action === 'reactivate') return handleReactivar(body)

  return jsonError(400, `Acción desconocida: ${action}`)
})

// ─── Crear usuario ────────────────────────────────────────────────────────────

async function handleCreate(body: Record<string, unknown>): Promise<Response> {
  const nombre     = (body.nombre as string | undefined)?.trim()
  const email      = (body.email  as string | undefined)?.trim().toLowerCase()
  const rol        = body.rol as RolCreable | undefined
  const divisiones = body.divisiones as string[] | undefined

  if (!nombre)                  return jsonError(400, 'El nombre es requerido')
  if (!email)                   return jsonError(400, 'El email es requerido')
  if (!rol || !ROLES_VALIDOS.includes(rol)) {
    return jsonError(400, 'Rol inválido. Debe ser coordinador, entrenador o manager')
  }

  // Crear usuario via invite — el usuario recibirá email para setear su contraseña
  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { data: { nombre } },
  )

  if (inviteErr || !inviteData.user) {
    const msg = inviteErr?.message ?? 'Error al crear el usuario'
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      return jsonError(409, 'Ya existe un usuario con ese email')
    }
    return jsonError(500, msg)
  }

  // Insertar perfil
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id:        inviteData.user.id,
      nombre,
      rol,
      divisiones: divisiones && divisiones.length > 0 ? divisiones : null,
    })

  if (profileErr) {
    // Intento de limpieza: eliminar el usuario de auth si el perfil falló
    await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
    return jsonError(500, 'Error al crear el perfil: ' + profileErr.message)
  }

  return jsonOk({ id: inviteData.user.id, email, nombre, rol })
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
