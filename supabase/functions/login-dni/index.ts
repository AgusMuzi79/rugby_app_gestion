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
// Opcional: supabase secrets set RECUPERO_HMAC_KEY=<valor al azar> (clave de
// los hashes del límite; si falta se usa la service role key).
// supabase functions deploy login-dni --no-verify-jwt
// (se llama sin sesión — el usuario todavía no está logueado)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { normalizarIdentificador, passwordAProbar, type Identificador } from '../_shared/login-identificador.ts'
import { respuestaErrorLogin } from '../_shared/login-errores.ts'
import {
  REDIRECT_RECUPERO,
  cuentaDeUsuarioAuth,
  manejarRecupero,
  type CuentaDni,
} from '../_shared/recupero-password.ts'
import {
  claveHmacRecupero,
  clavesRecupero,
  decisionRecupero,
  ipCliente,
  parametrosLimite,
} from '../_shared/recupero-intentos.ts'

const GENERIC_ERROR = 'Credenciales incorrectas'

function clienteAnon() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Mail de la cuenta de un DNI. `email: null` = no hay cuenta (o no tiene
// mail, o el perfil no tiene usuario de Auth); `fallo` = la base o Auth no
// respondieron (no es "no existe"). Las fallas quedan en el log con código y
// mensaje, nunca con el DNI.
async function emailDeDni(dni: string): Promise<CuentaDni> {
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('dni', dni)
    .maybeSingle()
  if (profileErr) {
    console.error('login-dni: búsqueda de perfil', profileErr.code, profileErr.message)
    return { email: null, fallo: true }
  }
  if (!profile) return { email: null, fallo: false }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profile.id)
  const cuenta = cuentaDeUsuarioAuth(userErr, userData?.user)
  if (userErr) console.error('login-dni: getUserById', userErr.code ?? '-', userErr.status ?? '-', userErr.message)
  return cuenta
}

// Límite propio por identificador y por IP (_shared/recupero-intentos.ts). Va
// antes de buscar la cuenta, así que nada de lo que responde depende de que
// exista. Una sola llamada: la base evalúa las claves en orden y corta en la
// primera que rechaza.
async function limiteRecupero(identificador: Identificador, ip: string | null) {
  const claveHmac = claveHmacRecupero((nombre) => Deno.env.get(nombre))
  if (!claveHmac) {
    console.error('login-dni reset: falta RECUPERO_HMAC_KEY y SUPABASE_SERVICE_ROLE_KEY')
    return 'error' as const
  }
  const claves = await clavesRecupero(identificador, ip, claveHmac)
  const { data, error } = await supabaseAdmin.rpc('registrar_intento_recupero', parametrosLimite(claves))
  if (error) {
    console.error('login-dni reset: registrar_intento_recupero', error.code, error.message)
    return 'error' as const
  }
  const { decision, aviso } = decisionRecupero(data, claves)
  if (aviso) console.info(aviso)
  if (decision === 'error') console.error('login-dni reset: registrar_intento_recupero devolvió algo inesperado')
  return decision
}

// Recupero: la lógica (y cada rama, probada) vive en manejarRecupero
// (_shared/recupero-password.ts); acá sólo se conectan la base y GoTrue.
async function recuperar(raw: string, ip: string | null): Promise<Response> {
  const r = await manejarRecupero(raw, {
    limite: (identificador) => limiteRecupero(identificador, ip),
    emailDeDni,
    // GoTrue tampoco revela si el mail existe: con un mail tipeado que no es
    // de nadie responde OK sin mandar nada. Flujo implícito (tokens en el
    // fragmento), el que entiende el deep link de la app.
    enviar: (email) => clienteAnon().auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_RECUPERO }),
    log: (mensaje) => console.warn(mensaje),
  })
  return r.status === 200
    ? jsonOk(r.body)
    : jsonError(r.status, String(r.body.error))
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

  if (body.action === 'reset') {
    return await recuperar(raw, ipCliente((nombre) => req.headers.get(nombre)))
  }

  const identificador = normalizarIdentificador(raw)

  const password = body.password as string | undefined
  if (!identificador || !password) return jsonError(400, 'Faltan datos')

  let email: string

  if (identificador.tipo === 'email') {
    email = identificador.email
  } else {
    // La misma búsqueda que el recupero. Una falla de la base o de Auth no es
    // "credenciales incorrectas"; sin cuenta o sin mail, sí.
    const cuenta = await emailDeDni(identificador.dni)
    if (cuenta.fallo) return jsonError(500, 'No se pudo verificar el usuario')
    if (!cuenta.email) return jsonError(401, GENERIC_ERROR)
    email = cuenta.email
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
