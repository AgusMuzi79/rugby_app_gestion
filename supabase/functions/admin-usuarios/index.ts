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

  // generateLink crea el usuario y devuelve el action_link SIN enviar email de Supabase
  // — nosotros enviamos el email personalizado con los dos botones
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data:       { nombre },
      redirectTo: 'uncasrugby://reset-password',
    },
  })

  if (linkErr || !linkData.user) {
    const msg = linkErr?.message ?? 'Error al crear el usuario'
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      return jsonError(409, 'Ya existe un usuario con ese email')
    }
    return jsonError(500, msg)
  }

  const inviteLink = linkData.properties.action_link

  // Insertar perfil
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id:         linkData.user.id,
      nombre,
      rol,
      divisiones: divisiones && divisiones.length > 0 ? divisiones : null,
    })

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(linkData.user.id)
    return jsonError(500, 'Error al crear el perfil: ' + profileErr.message)
  }

  // Email de bienvenida con los dos botones (requiere RESEND_API_KEY en secrets)
  void enviarEmailBienvenida({ nombre, email, rol, inviteLink })

  return jsonOk({ id: linkData.user.id, email, nombre, rol })
}

const APK_URL = 'https://expo.dev/accounts/noisydev/projects/uncas-rugby-app/builds/9300fef2-f771-4c25-a9bb-4373192df903'

const ROL_LABEL: Record<string, string> = {
  coordinador: 'Coordinador',
  entrenador:  'Entrenador',
  manager:     'Manager',
}

async function enviarEmailBienvenida({
  nombre,
  email,
  rol,
  inviteLink,
}: { nombre: string; email: string; rol: string; inviteLink: string }): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('RESEND_API_KEY no configurada — email de bienvenida no enviado')
    return
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'La Bitácora <noreply@uncas.club>',
      to:      [email],
      subject: 'Bienvenido a La Bitácora — Uncas Rugby Club',
      html: `
        <div style="font-family: Georgia,serif; max-width:540px; margin:0 auto;
                    padding:48px 36px; background:#F6F1E4; color:#0E0E0E;">

          <!-- Encabezado -->
          <p style="margin:0 0 6px; font-size:10px; letter-spacing:3px;
                    color:#E8B53C; font-family:Arial,sans-serif;">
            UNCAS RUGBY CLUB · EST. 1836
          </p>
          <h1 style="margin:0 0 6px; font-size:40px; font-style:italic;
                     font-weight:900; color:#0E0E0E;">
            La Bitácora
          </h1>
          <hr style="border:none; border-top:1px solid #E5E0D0; margin:16px 0 24px;" />

          <!-- Cuerpo -->
          <p style="font-size:16px; line-height:1.7; margin:0 0 12px;">
            Hola <strong>${nombre}</strong>,
          </p>
          <p style="font-size:15px; line-height:1.7; margin:0 0 24px;">
            Fuiste dado de alta como <strong>${ROL_LABEL[rol] ?? rol}</strong>
            en el sistema operativo del cuerpo técnico de Uncas Rugby Club.
          </p>

          <!-- Instrucción clara -->
          <div style="background:#0E0E0E; border-radius:6px; padding:20px 24px; margin:0 0 32px;">
            <p style="color:#E8B53C; font-size:11px; letter-spacing:2px;
                      font-family:Arial,sans-serif; margin:0 0 8px;">
              PASOS PARA INGRESAR
            </p>
            <p style="color:#F6F1E4; font-size:14px; line-height:1.7; margin:0;">
              <strong>1.</strong> Instalá la app en tu celular.<br/>
              <strong>2.</strong> Tocá el botón "Crear mi contraseña" para activar tu cuenta.<br/>
              <strong>3.</strong> Ingresá a la app con tu email y la contraseña que elegiste.
            </p>
          </div>

          <!-- Botón 1: descargar app -->
          <p style="font-size:13px; font-style:italic; color:#7C7267; margin:0 0 10px;">
            Paso 1 — Instalá la app:
          </p>
          <div style="margin:0 0 28px;">
            <a href="${APK_URL}"
               style="display:inline-block; background:#0E0E0E; color:#E8B53C;
                      text-decoration:none; padding:14px 28px; font-size:11px;
                      letter-spacing:2px; font-family:Arial,sans-serif;
                      border-radius:4px;">
              DESCARGAR LA APP →
            </a>
          </div>

          <!-- Botón 2: crear contraseña -->
          <p style="font-size:13px; font-style:italic; color:#7C7267; margin:0 0 10px;">
            Paso 2 — Activá tu cuenta:
          </p>
          <div style="margin:0 0 40px;">
            <a href="${inviteLink}"
               style="display:inline-block; background:#E8B53C; color:#0E0E0E;
                      text-decoration:none; padding:14px 28px; font-size:11px;
                      letter-spacing:2px; font-family:Arial,sans-serif;
                      border-radius:4px; font-weight:bold;">
              CREAR MI CONTRASEÑA →
            </a>
          </div>

          <hr style="border:none; border-top:1px solid #E5E0D0; margin:0 0 20px;" />
          <p style="font-size:11px; color:#9B9A8F; font-style:italic; margin:0;">
            Uso exclusivo del cuerpo técnico y directivo de Uncas Rugby Club.
          </p>
        </div>
      `,
    }),
  })
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
