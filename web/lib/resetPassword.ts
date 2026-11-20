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

export const AVISO_FALLA_VERIFICACION = 'No pudimos verificar el link. Revisá tu conexión y reintentá.'

// Distingue una falla de red o del servidor (el link sigue sirviendo: hay que
// ofrecer reintentar) de un token inválido o vencido (4xx: hay que pedir otro).
export function esFallaTransitoria(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!error || typeof error !== 'object') return false
  const { name, status } = error as { name?: unknown; status?: unknown }
  if (name === 'AuthRetryableFetchError') return true
  // 429: rate limit de Supabase. El link no se gastó; alcanza con esperar y reintentar.
  return typeof status === 'number' && (status === 429 || status >= 500)
}

export type DestinoVerificacion = 'formulario' | 'falla' | 'invalido'

// Qué pantalla mostrar después de intentar abrir la sesión del link.
export function destinoTrasVerificar({ session, error }: { session: boolean; error: unknown }): DestinoVerificacion {
  if (session && !error) return 'formulario'
  return esFallaTransitoria(error) ? 'falla' : 'invalido'
}

const ERROR_GUARDAR_GENERICO = 'No se pudo actualizar la contraseña. Intentá de nuevo.'

export type ErrorAlGuardar = { tipo: 'formulario' | 'vencido'; mensaje: string }

// Traduce un error de updateUser: 'vencido' saca al usuario del formulario
// (hay que pedir otro link); 'formulario' lo deja ahí con el mensaje.
export function errorAlGuardar(error: unknown): ErrorAlGuardar {
  const { name, code } = (error && typeof error === 'object' ? error : {}) as { name?: unknown; code?: unknown }
  if (code === 'same_password') {
    return { tipo: 'formulario', mensaje: 'La contraseña nueva tiene que ser distinta de la anterior.' }
  }
  if (code === 'weak_password') return { tipo: 'formulario', mensaje: 'Esa contraseña es muy débil. Probá con otra.' }
  if (name === 'AuthSessionMissingError' || code === 'session_not_found' || code === 'session_expired') {
    return { tipo: 'vencido', mensaje: AVISO_LINK_VENCIDO }
  }
  return { tipo: 'formulario', mensaje: ERROR_GUARDAR_GENERICO }
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
