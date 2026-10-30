// Edge Function: login-dni
//
// El login de la app pide DNI en vez de mail (pedido de Secretaría — nadie
// se acuerda del mail sintético socio-{numero}@uncas.local). Resuelve
// DNI -> email real vía profiles.dni (sincronizado desde socios.dni por
// trigger, ver migración 20260828000000, o cargado directo para staff sin
// fila en socios) y valida la contraseña con el propio signInWithPassword
// de GoTrue — nunca se reimplementa el chequeo de password acá.
//
// Nunca devuelve el email al cliente ni distingue "DNI no existe" de
// "contraseña incorrecta" — mismo mensaje genérico, para no habilitar
// enumeración de DNIs desde un endpoint público sin JWT.
//
// Fallback: si el valor recibido en `dni` tiene forma de email, se usa
// directo como email — cubre cualquier cuenta staff cuyo DNI todavía no
// esté cargado en profiles.dni (staff creada antes de esta migración,
// directo vía admin-usuarios, sin pasar por un socio existente).
//
// `action: 'reset'` (body { action, dni }): recupero de contraseña por DNI o
// mail. Resuelve el mail de la cuenta igual que el login y le manda el link
// de GoTrue; si no hay cuenta o el mail es sintético (@uncas.local) no manda
// nada. Siempre responde { ok: true } — misma regla anti-enumeración. Tiene
// límite propio por identificador y por IP (registrar_intento_recupero).
//
// Deploy: aplicar antes la migración 20261107000000_recupero_password_intentos.
// supabase functions deploy login-dni --no-verify-jwt
// (se llama sin sesión — el usuario todavía no está logueado)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { normalizarIdentificador, passwordAProbar, type Identificador } from '../_shared/login-identificador.ts'
import { respuestaErrorLogin } from '../_shared/login-errores.ts'
import {
  REDIRECT_RECUPERO,
  RESPUESTA_RECUPERO,
  cierreRecupero,
  emailParaRecupero,
} from '../_shared/recupero-password.ts'
import { clavesRecupero, decisionRecupero, ipCliente } from '../_shared/recupero-intentos.ts'

const GENERIC_ERROR = 'Credenciales incorrectas'

function clienteAnon() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Mail de la cuenta de un DNI. `email: null` = no hay cuenta (o no tiene
// mail); `fallo` = la base o Auth no respondieron (no es "no existe").
async function emailDeDni(dni: string): Promise<{ email: string | null; fallo: boolean }> {
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('dni', dni)
    .maybeSingle()
  if (profileErr) return { email: null, fallo: true }
  if (!profile) return { email: null, fallo: false }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profile.id)
  if (userErr) return { email: null, fallo: true }
  return { email: userData?.user?.email ?? null, fallo: false }
}

// Límite propio por identificador y por IP (_shared/recupero-intentos.ts). Va
// antes de buscar la cuenta, así que nada de lo que responde depende de que
// exista.
async function limiteRecupero(identificador: Identificador, ip: string | null) {
  const claves = await clavesRecupero(identificador, ip)
  const resultados = await Promise.all(claves.map(async ({ clave, ventana, maximo }) => {
    const { data, error } = await supabaseAdmin.rpc('registrar_intento_recupero', {
      p_clave: clave, p_ventana: ventana, p_maximo: maximo,
    })
    if (error) {
      console.error('login-dni reset: registrar_intento_recupero', error.code, error.message)
      return 'error' as const
    }
    return data === true
  }))
  return decisionRecupero(resultados)
}

async function recuperar(identificador: Identificador, ip: string | null): Promise<Response> {
  const limite = await limiteRecupero(identificador, ip)
  if (limite === 'error') return jsonError(500, 'No se pudo verificar el usuario')
  // Pasado el límite: la misma respuesta, sin mandar nada.
  if (limite === 'limitado') return jsonOk(RESPUESTA_RECUPERO)

  let email: string | null
  if (identificador.tipo === 'email') {
    email = identificador.email
  } else {
    const cuenta = await emailDeDni(identificador.dni)
    if (cuenta.fallo) return jsonError(500, 'No se pudo verificar el usuario')
    email = cuenta.email
  }

  // Sin cuenta o con mail sintético: no hay a dónde mandar. Misma respuesta.
  const destino = emailParaRecupero(email)
  if (!destino) return jsonOk(RESPUESTA_RECUPERO)

  // GoTrue tampoco revela si el mail existe: con un mail tipeado que no es de
  // nadie responde OK sin mandar nada. Flujo implícito (tokens en el
  // fragmento), el que entiende el deep link de la app.
  // Una falla del envío (429 u otra) sólo pasa con una cuenta real: no se le
  // dice al cliente (cierreRecupero), sólo queda en el log.
  const { error } = await clienteAnon().auth.resetPasswordForEmail(destino, { redirectTo: REDIRECT_RECUPERO })
  const { respuesta, aviso } = cierreRecupero(error)
  if (aviso) console.warn(aviso)
  return jsonOk(respuesta)
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

  // DNI con puntos o espacios ("30.123.456") se busca sin ellos: profiles.dni
  // guarda sólo dígitos.
  const raw = typeof body.dni === 'string' ? body.dni : ''
  const identificador = normalizarIdentificador(raw)

  if (body.action === 'reset') {
    if (!identificador) return jsonError(400, 'Faltan datos')
    return await recuperar(identificador, ipCliente(req.headers.get('x-forwarded-for')))
  }

  const password = body.password as string | undefined
  if (!identificador || !password) return jsonError(400, 'Faltan datos')

  let email: string

  if (identificador.tipo === 'email') {
    email = identificador.email
  } else {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('dni', identificador.dni)
      .maybeSingle()

    // Una falla de la base no es "credenciales incorrectas".
    if (profileErr) return jsonError(500, 'No se pudo verificar el usuario')
    if (!profile) return jsonError(401, GENERIC_ERROR)

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profile.id)
    if (userErr || !userData?.user?.email) return jsonError(401, GENERIC_ERROR)

    email = userData.user.email
  }

  const supabaseAnon = clienteAnon()

  // Un solo intento: la inicial es el DNI, y si tipearon el DNI de esta misma
  // cuenta con puntos se manda sin ellos (passwordAProbar).
  const intento = passwordAProbar(password, identificador.tipo === 'dni' ? identificador.dni : null)
  const { data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({ email, password: intento })
  if (!authErr && authData.session) {
    return jsonOk({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    })
  }
  // Cuenta dada de baja (baneada por el import) o GoTrue limitando la IP de
  // esta función: decirlo, en vez de culpar a la contraseña.
  const especial = respuestaErrorLogin(authErr)
  if (especial) return jsonError(especial.status, especial.mensaje)
  return jsonError(401, GENERIC_ERROR)
})
