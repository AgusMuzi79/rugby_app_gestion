// Helpers puros de la página pública /reset-password (sin React ni Supabase,
// para poder verificarlos con resetPassword.check.ts).
// Espejan app/lib/linkAuth.ts y app/lib/validacionAuth.ts: mismas reglas y copy.

export const MIN_PASSWORD = 8

export const AVISO_LINK_VENCIDO = 'El link venció o ya se usó. Pedí uno nuevo desde la app.'

export type FragmentoRecupero =
  | { tipo: 'tokens'; accessToken: string; refreshToken: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'invalido' }

// Lee el fragmento del link de recuperación (implicit flow de Supabase):
//   #access_token=…&refresh_token=…&type=recovery
//   #error=access_denied&error_code=otp_expired&error_description=…
// El error gana sobre los tokens. Sólo un fragmento type=recovery con los dos
// tokens habilita el formulario; cualquier otra cosa es inválida.
export function parsearFragmentoRecupero(hash: string): FragmentoRecupero {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)

  if (params.get('error') || params.get('error_code') || params.get('error_description')) {
    return { tipo: 'error', mensaje: AVISO_LINK_VENCIDO }
  }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (params.get('type') === 'recovery' && accessToken && refreshToken) {
    return { tipo: 'tokens', accessToken, refreshToken }
  }

  return { tipo: 'invalido' }
}

export type ErroresNuevaPassword = { password?: string; confirmacion?: string }

export function validarNuevaPassword(password: string, confirmacion: string): ErroresNuevaPassword {
  const errores: ErroresNuevaPassword = {}

  if (!password) errores.password = 'Ingresá una contraseña.'
  else if (password.length < MIN_PASSWORD) errores.password = `Tiene que tener al menos ${MIN_PASSWORD} caracteres.`

  if (!confirmacion) errores.confirmacion = 'Repetí la contraseña.'
  else if (confirmacion !== password) errores.confirmacion = 'Las contraseñas no coinciden.'

  return errores
}
