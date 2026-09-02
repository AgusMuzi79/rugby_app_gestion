// Edge Function: socios-qr
// Gestión del carnet digital QR TOTP.
//
// Actions:
//   get-secret     — Entrega el TOTP secret al dispositivo del socio (una vez por sesión/dispositivo).
//                    El secret se almacena en expo-secure-store y genera el QR localmente.
//   validate       — Lector escanea el QR y recibe estado del socio + foto.
//   validate-dni   — Fallback sin QR (socio sin el celular encima): busca directo por DNI,
//                    sin código TOTP. Misma respuesta que validate.
//   listar-accesos — Panel web de Lector: historial de ingresos de un día (tabla `accesos`).
//
// Seguridad:
//   get-secret:   JWT requerido, rol='socio', retorna su propio secret.
//   validate(-dni)/listar-accesos: JWT requerido, rol='porteria' (o secretaria/admin/subcomision).
//                   El caller NUNCA recibe el secret — solo info del socio.
//                   validate-dni no tiene el TOTP como segundo factor — confía en que el
//                   dispositivo ya está autenticado como Lector (mismo trust boundary que
//                   validate); el DNI no es secreto, así que cualquiera que lo sepa puede
//                   disparar la consulta desde la tablet — trade-off aceptado a cambio de
//                   tener un fallback cuando el socio no lleva el teléfono.
//
// Cada validate/validate-dni exitoso llamado por una cuenta Lector (rol='porteria')
// deja un registro en `accesos` (ver 20260902000000_accesos_gimnasio.sql) — es lo
// que alimenta listar-accesos. Un caller secretaria/admin/subcomision (ej. probando
// un QR) no genera registro — no representa un ingreso real al gimnasio.

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

  if (action === 'get-secret')     return handleGetSecret(callerRol, caller.id)
  if (action === 'validate')       return handleValidate(body, callerRol)
  if (action === 'validate-dni')   return handleValidateDni(body, callerRol)
  if (action === 'listar-accesos') return handleListarAccesos(body, callerRol)

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

const SOCIO_SELECT = `
  id,
  numero_socio,
  estado,
  semaforo,
  foto_path,
  foto_validada,
  categorias_socio ( nombre ),
  profiles!socios_profile_id_fkey ( nombre )
`

type SocioRow = {
  id: string
  numero_socio: string
  estado: string
  semaforo: string | null
  foto_path: string | null
  foto_validada: boolean
  categorias_socio: { nombre: string } | null
  profiles: { nombre: string } | null
}

function socioResponse(socio: SocioRow) {
  return {
    valido:        true,
    nombre:        socio.profiles?.nombre ?? '—',
    numero_socio:  socio.numero_socio,
    estado:        socio.estado,
    semaforo:      socio.semaforo,
    foto_path:     socio.foto_path,
    foto_validada: socio.foto_validada,
    categoria:     socio.categorias_socio?.nombre ?? '—',
  }
}

// Deja registro en `accesos` sólo cuando el que escanea es una cuenta Lector real
// — un secretaria/admin/subcomision probando un QR no representa un ingreso.
// Falla en silencio (fire & forget): un problema acá no puede tumbar el escaneo,
// que ya le mostró el resultado al socio.
async function registrarAcceso(socioId: string, semaforo: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('accesos')
    .insert({ socio_id: socioId, semaforo })
  if (error) console.error('registrarAcceso:', error.message)
}

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
    .select(SOCIO_SELECT)
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

  const row = socio as unknown as SocioRow
  if (callerRol === 'porteria') await registrarAcceso(row.id, row.semaforo)

  return jsonOk(socioResponse(row))
}

// ─── Fallback sin QR: buscar directo por DNI ──────────────────────────────────
//
// Para cuando el socio no lleva el celular encima. Sin TOTP de por medio — el
// DNI no es secreto, así que esto confía en que sólo cuentas Lector/staff ya
// autenticadas pueden llamar la función (mismo chequeo de rol que validate).

async function handleValidateDni(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para validar carnets')

  const dni = (body.dni as string | undefined)?.trim()
  if (!dni) return jsonError(400, 'dni es requerido')

  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select(SOCIO_SELECT)
    .eq('dni', dni)
    .single()

  if (socioErr || !socio) {
    return jsonOk({ valido: false, motivo: 'No se encontró ningún socio con ese DNI' })
  }

  const row = socio as unknown as SocioRow
  if (callerRol === 'porteria') await registrarAcceso(row.id, row.semaforo)

  return jsonOk(socioResponse(row))
}

// ─── Panel web de Lector: historial de accesos de un día ─────────────────────
//
// `fecha` en formato YYYY-MM-DD, interpretada en horario de Argentina
// (UTC-3 fijo, sin horario de verano) — no en UTC, para que "hoy" en el
// panel coincida con el día real del club, no con el de UTC.

async function handleListarAccesos(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para ver el historial de accesos')

  const fecha = (body.fecha as string | undefined)?.trim() || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return jsonError(400, 'fecha debe tener formato YYYY-MM-DD')

  const inicio = new Date(`${fecha}T00:00:00-03:00`)
  const fin    = new Date(inicio.getTime() + 24 * 60 * 60 * 1000)

  const { data, error } = await supabaseAdmin
    .from('accesos')
    .select(`
      creado_en,
      punto,
      semaforo,
      socios ( numero_socio, profiles!socios_profile_id_fkey ( nombre ) )
    `)
    .gte('creado_en', inicio.toISOString())
    .lt('creado_en', fin.toISOString())
    .order('creado_en', { ascending: true })

  if (error) return jsonError(500, error.message)

  type AccesoRow = {
    creado_en: string
    punto: string
    semaforo: string | null
    socios: { numero_socio: string; profiles: { nombre: string } | null } | null
  }

  const accesos = (data as unknown as AccesoRow[]).map(a => ({
    creado_en:    a.creado_en,
    punto:        a.punto,
    semaforo:     a.semaforo,
    numero_socio: a.socios?.numero_socio ?? '—',
    nombre:       a.socios?.profiles?.nombre ?? '—',
  }))

  return jsonOk({ fecha, accesos })
}
