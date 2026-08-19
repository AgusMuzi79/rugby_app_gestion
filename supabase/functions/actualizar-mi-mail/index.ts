// Edge Function: actualizar-mi-mail
//
// Self-service: un socio con mail sintético (socio-{numero}@uncas.local,
// asignado en la carga masiva a quien no tenía mail propio en NUVIX) puede
// registrar su mail real desde la app. Cualquier usuario autenticado puede
// llamar esto — SIEMPRE opera sobre auth.uid() del caller, nunca sobre un
// id que venga en el body, para que nadie pueda cambiarle el mail a otra
// cuenta.
//
// A diferencia del flujo estándar de Supabase Auth (updateUser desde el
// cliente), esto actualiza el mail directo vía auth.admin — sin mandar un
// link de confirmación. Mismo criterio que ya usa toda la app: el DNI es la
// contraseña real, el mail nunca se verificó (createUser con
// email_confirm: true) — pedir que confirmen el mail nuevo por link
// agregaría fricción sin sumar seguridad real, y además dependería del
// mailer propio de Supabase Auth (no configurado con Resend/Custom SMTP,
// separado del envío transaccional de _shared/email.ts).

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }

  const email = (body.email as string | undefined)?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return jsonError(400, 'Mail inválido')
  if (email.endsWith('@uncas.local')) return jsonError(400, 'Ese mail no es válido')

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(caller.id, {
    email,
    email_confirm: true,
  })

  if (updateErr) {
    const yaExiste = updateErr.message?.toLowerCase().includes('already been registered')
      || updateErr.message?.toLowerCase().includes('duplicate')
    return jsonError(yaExiste ? 409 : 500, yaExiste
      ? 'Ese mail ya está en uso por otra cuenta'
      : 'No se pudo actualizar el mail: ' + updateErr.message)
  }

  return jsonOk({ email })
})
