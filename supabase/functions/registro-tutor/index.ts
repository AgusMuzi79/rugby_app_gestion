// Edge Function: registro-tutor
//
// Self-service sign-up for the adult (mother, father, legal guardian) of a member under 13 who is
// NOT a club member themselves. See migration 20261009000000_tutor_menores and
// odd/tasks/tutor-menores.md.
//
// Proof of identity: the email typed by the adult must equal the email of the minor's own auth
// account (when the adult is not a member, the NUVIX padrón stores the adult's real email on the
// minor) and the adult must type back a 6-digit code sent to that email.
//
// Actions (JSON body `action`):
//   solicitar  { dni_menor, email, relacion, fecha_nacimiento }        -> { ok, motivo? }
//   verificar  { dni_menor, email, codigo, password, nombre? }         -> { ok, motivo? }
//
// On `verificar` success the minor's auth email moves to the synthetic socio-{numero}@uncas.local
// (the minor cannot use the app anyway and logs in by DNI), a new auth user is created with the
// adult's email + password, role 'tutor', and linked in `tutores_menores`. The app then signs in
// with email + password.
//
// Every business error returns 200 with { ok: false, motivo } — supabase.functions.invoke hides
// the body of a non-2xx response and the app needs `motivo` to pick the message. The stored email
// is never returned, and "DNI not found" is indistinguishable from "email mismatch".
//
// Deploy: supabase functions deploy registro-tutor --no-verify-jwt
// (called without a session — the adult has no account yet)

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { enviarEmail, emailTemplate } from '../_shared/email.ts'
import { esMailSintetico, esMenorDe13, mailSintetico, tieneAlMenosAnios } from '../_shared/tutores.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RELACIONES = ['madre', 'padre', 'tutor', 'otro'] as const
type Relacion = typeof RELACIONES[number]

const RELACION_LABEL: Record<Relacion, string> = {
  madre: 'Madre',
  padre: 'Padre',
  tutor: 'Tutor/a',
  otro:  'Familiar',
}

const CODIGO_VIGENCIA_MIN = 15
const MAX_SOLICITUDES_POR_HORA = 3
const MAX_INTENTOS = 5
const PASSWORD_MIN = 8
const EDAD_MINIMA_TUTOR = 18

type Motivo =
  | 'datos_invalidos'
  | 'no_coincide'
  | 'menor_de_edad'
  | 'demasiadas_solicitudes'
  | 'envio_fallido'
  | 'codigo_vencido'
  | 'codigo_invalido'
  | 'bloqueado'
  | 'password_corta'
  | 'cuenta_existente'
  | 'error_interno'

function falla(motivo: Motivo): Response {
  return jsonOk({ ok: false, motivo })
}

type SocioMenor = {
  id: string
  profile_id: string | null
  numero_socio: string
  fecha_nacimiento: string | null
  profiles: { nombre: string } | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }

  try {
    if (body.action === 'solicitar') return await handleSolicitar(body)
    if (body.action === 'verificar') return await handleVerificar(body)
    return jsonError(400, `Acción desconocida: ${body.action}`)
  } catch (err) {
    console.error('registro-tutor:', err instanceof Error ? err.message : String(err))
    return falla('error_interno')
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizarDni(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\D/g, '') : ''
}

function normalizarEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The hash is bound to the socio and email so a leaked hash cannot be replayed elsewhere.
function hashCodigo(socioId: string, email: string, codigo: string): Promise<string> {
  return sha256Hex(`${socioId}:${email}:${codigo}`)
}

// Uniform 6-digit code (rejection sampling avoids modulo bias).
function generarCodigo(): string {
  const buf = new Uint32Array(1)
  const limite = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limite) return String(buf[0] % 1_000_000).padStart(6, '0')
  }
}

function igualesTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Exactly one socio with that DNI, under 13. Anything else -> null (generic "no_coincide").
async function buscarMenor(dni: string): Promise<SocioMenor | null> {
  const { data, error } = await supabaseAdmin
    .from('socios')
    .select('id, profile_id, numero_socio, fecha_nacimiento, profiles!socios_profile_id_fkey(nombre)')
    .eq('dni', dni)
    .limit(2)
  if (error) throw new Error(`buscarMenor: ${error.message}`)
  if (!data || data.length !== 1) return null
  const socio = data[0] as unknown as SocioMenor
  if (!socio.profile_id || !esMenorDe13(socio.fecha_nacimiento)) return null
  return socio
}

async function emailDelMenor(profileId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(profileId)
  if (error || !data?.user?.email) return null
  return data.user.email.toLowerCase()
}

// ─── solicitar ───────────────────────────────────────────────────────────────

async function handleSolicitar(body: Record<string, unknown>): Promise<Response> {
  const dni = normalizarDni(body.dni_menor)
  const email = normalizarEmail(body.email)
  const relacion = body.relacion as Relacion
  const fechaNacimiento = typeof body.fecha_nacimiento === 'string' ? body.fecha_nacimiento.trim() : ''

  if (!dni || !EMAIL_RE.test(email) || !RELACIONES.includes(relacion) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) {
    return falla('datos_invalidos')
  }
  if (!tieneAlMenosAnios(fechaNacimiento, EDAD_MINIMA_TUTOR)) return falla('menor_de_edad')

  const menor = await buscarMenor(dni)
  if (!menor) return falla('no_coincide')

  const emailGuardado = await emailDelMenor(menor.profile_id!)
  if (!emailGuardado || esMailSintetico(emailGuardado) || emailGuardado !== email) {
    return falla('no_coincide')
  }

  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countErr } = await supabaseAdmin
    .from('tutor_verificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('socio_id', menor.id)
    .gte('created_at', haceUnaHora)
  if (countErr) throw new Error(`contar solicitudes: ${countErr.message}`)
  if ((count ?? 0) >= MAX_SOLICITUDES_POR_HORA) return falla('demasiadas_solicitudes')

  const codigo = generarCodigo()
  const { error: insErr } = await supabaseAdmin
    .from('tutor_verificaciones')
    .insert({
      socio_id:               menor.id,
      email,
      codigo_hash:            await hashCodigo(menor.id, email, codigo),
      relacion,
      fecha_nacimiento_tutor: fechaNacimiento,
      expires_at:             new Date(Date.now() + CODIGO_VIGENCIA_MIN * 60 * 1000).toISOString(),
    })
  if (insErr) throw new Error(`guardar verificación: ${insErr.message}`)

  const nombreMenor = menor.profiles?.nombre ?? 'tu hijo/a'
  const enviado = await enviarEmail({
    to: email,
    subject: 'Tu código de verificación — UNCAS Rugby Club',
    html: emailTemplate(`
      <p style="font-size:16px">Hola,</p>
      <p style="font-size:16px">Tu código para vincularte con <strong>${escapeHtml(nombreMenor)}</strong> en la app de UNCAS es:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;margin:24px 0">${codigo}</p>
      <p style="font-size:14px;color:#555">Vence en ${CODIGO_VIGENCIA_MIN} minutos. Si no lo pediste vos, ignorá este mail.</p>
    `),
  })
  if (!enviado) return falla('envio_fallido')

  return jsonOk({ ok: true })
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── verificar ───────────────────────────────────────────────────────────────

async function handleVerificar(body: Record<string, unknown>): Promise<Response> {
  const dni = normalizarDni(body.dni_menor)
  const email = normalizarEmail(body.email)
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const nombreIngresado = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 80) : ''

  if (!dni || !EMAIL_RE.test(email) || !/^\d{6}$/.test(codigo)) return falla('datos_invalidos')
  if (password.length < PASSWORD_MIN) return falla('password_corta')

  const menor = await buscarMenor(dni)
  if (!menor) return falla('no_coincide')

  const { data: verificacion, error: verErr } = await supabaseAdmin
    .from('tutor_verificaciones')
    .select('id, codigo_hash, relacion, intentos')
    .eq('socio_id', menor.id)
    .eq('email', email)
    .is('usado_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (verErr) throw new Error(`leer verificación: ${verErr.message}`)
  if (!verificacion) return falla('codigo_vencido')
  if (verificacion.intentos >= MAX_INTENTOS) return falla('bloqueado')

  // Consume the attempt atomically BEFORE comparing, so parallel guesses can't
  // all read the same stale counter and bypass the cap.
  const { data: intentos, error: intentoErr } = await supabaseAdmin.rpc(
    'tutor_verificacion_consumir_intento',
    { p_id: verificacion.id, p_max: MAX_INTENTOS },
  )
  if (intentoErr) throw new Error(`consumir intento: ${intentoErr.message}`)
  if (intentos === null || intentos === undefined) return falla('bloqueado')

  const hash = await hashCodigo(menor.id, email, codigo)
  if (!igualesTiempoConstante(hash, verificacion.codigo_hash as string)) {
    return falla((intentos as number) >= MAX_INTENTOS ? 'bloqueado' : 'codigo_invalido')
  }

  // Claim the code atomically: a concurrent second request with the same code finds usado_at set.
  const { data: reclamada, error: claimErr } = await supabaseAdmin
    .from('tutor_verificaciones')
    .update({ usado_at: new Date().toISOString() })
    .eq('id', verificacion.id)
    .is('usado_at', null)
    .select('id')
  if (claimErr) throw new Error(`marcar verificación: ${claimErr.message}`)
  if (!reclamada?.length) return falla('codigo_vencido')

  const liberarCodigo = () =>
    supabaseAdmin.from('tutor_verificaciones').update({ usado_at: null }).eq('id', verificacion.id)

  // Re-check: the minor's email must still be the one that received the code.
  const emailGuardado = await emailDelMenor(menor.profile_id!)
  if (emailGuardado !== email) {
    await liberarCodigo()
    return falla('no_coincide')
  }

  // 1. Free the email: the minor's account moves to its synthetic address.
  const { error: moverErr } = await supabaseAdmin.auth.admin.updateUserById(menor.profile_id!, {
    email: mailSintetico(menor.numero_socio),
    email_confirm: true,
  })
  if (moverErr) {
    await liberarCodigo()
    throw new Error(`mover mail del menor: ${moverErr.message}`)
  }

  const restaurarMailMenor = async () => {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(menor.profile_id!, {
      email,
      email_confirm: true,
    })
    if (error) console.error('registro-tutor: no se pudo restaurar el mail del menor', menor.id, error.message)
  }

  // 2. Create the adult's account with the freed email.
  const nombreMenor = menor.profiles?.nombre ?? 'socio'
  const relacion = verificacion.relacion as Relacion
  const nombre = nombreIngresado || `${RELACION_LABEL[relacion] ?? 'Familiar'} de ${nombreMenor}`

  const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (createErr || !userData?.user) {
    await restaurarMailMenor()
    await liberarCodigo()
    const msg = createErr?.message?.toLowerCase() ?? ''
    if (msg.includes('already') || msg.includes('exists')) return falla('cuenta_existente')
    throw new Error(`crear usuario tutor: ${createErr?.message ?? 'sin usuario'}`)
  }
  const tutorId = userData.user.id

  const deshacerAlta = async () => {
    // profiles and tutores_menores cascade from auth.users -> profiles.
    await supabaseAdmin.auth.admin.deleteUser(tutorId)
    await restaurarMailMenor()
    await liberarCodigo()
  }

  // 3. Profile with role 'tutor' (no socios row: the tutor is not a member).
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({ id: tutorId, nombre, rol: 'tutor', roles: ['tutor'], divisiones: null, activo: true })
  if (profileErr) {
    await deshacerAlta()
    throw new Error(`crear perfil tutor: ${profileErr.message}`)
  }

  // 4. Link tutor <-> minor.
  const { error: linkErr } = await supabaseAdmin
    .from('tutores_menores')
    .insert({ tutor_profile_id: tutorId, socio_id: menor.id, relacion })
  if (linkErr) {
    await deshacerAlta()
    throw new Error(`vincular tutor: ${linkErr.message}`)
  }

  return jsonOk({ ok: true })
}
