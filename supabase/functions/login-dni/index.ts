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
// Deploy: supabase functions deploy login-dni --no-verify-jwt
// (se llama sin sesión — el usuario todavía no está logueado)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { normalizarIdentificador, variantesPassword } from '../_shared/login-identificador.ts'

const GENERIC_ERROR = 'Credenciales incorrectas'

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
  const identificador = normalizarIdentificador((body.dni as string | undefined) ?? '')
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

  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // La contraseña inicial es el DNI: si la tipearon con puntos, se prueba
  // también sin ellos (variantesPassword).
  for (const intento of variantesPassword(password)) {
    const { data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({ email, password: intento })
    if (!authErr && authData.session) {
      return jsonOk({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      })
    }
    // Todos los logins salen de la IP de esta función: si GoTrue la limita,
    // decirlo (la app muestra "Demasiados intentos") en vez de culpar a la clave.
    if (authErr?.status === 429) return jsonError(429, 'Demasiados intentos')
  }
  return jsonError(401, GENERIC_ERROR)
})
