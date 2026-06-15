// Edge Function: socios-qr
// Gestión del carnet digital QR TOTP.
//
// Actions:
//   get-secret — Entrega el TOTP secret al dispositivo del socio (una vez por sesión/dispositivo).
//                El secret se almacena en expo-secure-store y genera el QR localmente.
//   validate   — Portería escanea el QR y recibe estado del socio + foto.
//
// Seguridad:
//   get-secret: JWT requerido, rol='socio', retorna su propio secret.
//   validate:   JWT requerido, rol='porteria' (o secretaria/admin para testing).
//               Portería NO recibe el secret — solo valida el código y recibe info del socio.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { verifyTOTP } from '../_shared/totp.ts'

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

  if (action === 'get-secret') return handleGetSecret(callerRol, caller.id)
  if (action === 'validate')   return handleValidate(body, callerRol)

  return jsonError(400, `Acción desconocida: ${action}`)
})

// ─── Entregar TOTP secret al dispositivo del socio ────────────────────────────
//
// El socio llama esto en su primer login (o tras reinstalar la app).
// El secret viaja sobre HTTPS y se guarda en expo-secure-store.
// NO se regenera el secret en cada llamada — siempre es el mismo.

async function handleGetSecret(callerRol: string, callerId: string): Promise<Response> {
  if (callerRol !== 'socio') return jsonError(403, 'Solo los socios pueden obtener su secret')

  // Buscar socio_id del caller
  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select('id, estado')
    .eq('profile_id', callerId)
    .single()

  if (socioErr || !socio) return jsonError(404, 'Registro de socio no encontrado')
  if (socio.estado === 'inactivo') return jsonError(403, 'Socio inactivo')

  // Leer secret de socios_secrets (sin RLS → service role lo puede leer)
  const { data: secretData, error: secretErr } = await supabaseAdmin
    .from('socios_secrets')
    .select('totp_secret')
    .eq('socio_id', socio.id)
    .single()

  if (secretErr || !secretData) {
    return jsonError(500, 'Secret TOTP no encontrado. Contactá a Secretaría.')
  }

  return jsonOk({ secret: secretData.totp_secret })
}

// ─── Validar QR en portería ───────────────────────────────────────────────────
//
// La app de portería escanea el QR del socio.
// Formato del QR: "{numero_socio}:{totp_code_6_digits}"
// La app envía numero_socio y code separados (el parseo lo hace la app).
//
// Respuesta exitosa: nombre, foto_path (para mostrar la cara), categoria, estado.
// Portería NUNCA recibe el totp_secret — solo validamos server-side.

async function handleValidate(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para validar carnets')

  const numero_socio = (body.numero_socio as string | undefined)?.trim()
  const code         = (body.code as string | undefined)?.trim()

  if (!numero_socio) return jsonError(400, 'numero_socio es requerido')
  if (!code)         return jsonError(400, 'code es requerido')
  if (!/^\d{6}$/.test(code)) return jsonError(400, 'code debe tener 6 dígitos')

  // Buscar socio por numero_socio con join a categorias y secret
  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select(`
      id,
      numero_socio,
      estado,
      foto_path,
      foto_validada,
      categorias_socio ( nombre ),
      profiles!socios_profile_id_fkey ( nombre )
    `)
    .eq('numero_socio', numero_socio)
    .single()

  if (socioErr || !socio) {
    return jsonOk({ valido: false, motivo: 'Socio no encontrado' })
  }

  // Leer TOTP secret
  const { data: secretData } = await supabaseAdmin
    .from('socios_secrets')
    .select('totp_secret')
    .eq('socio_id', socio.id)
    .single()

  if (!secretData) {
    return jsonOk({ valido: false, motivo: 'Carnet no configurado. Contactar Secretaría.' })
  }

  // Verificar código TOTP (drift ±1 step = ±30s de tolerancia)
  const esValido = await verifyTOTP(secretData.totp_secret, code)

  if (!esValido) {
    return jsonOk({ valido: false, motivo: 'Código QR inválido o expirado' })
  }

  // Código válido — retornar info del socio (sin el secret)
  const categoria = (socio.categorias_socio as { nombre: string } | null)?.nombre ?? '—'
  const nombre    = (socio.profiles as { nombre: string } | null)?.nombre ?? '—'

  return jsonOk({
    valido:        true,
    nombre,
    numero_socio:  socio.numero_socio,
    estado:        socio.estado,
    foto_path:     socio.foto_path,
    foto_validada: socio.foto_validada,
    categoria,
  })
}
