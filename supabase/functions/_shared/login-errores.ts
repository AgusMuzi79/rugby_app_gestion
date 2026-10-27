// Errores de GoTrue (signInWithPassword) que login-dni no debe tapar con
// "Credenciales incorrectas". Lógica pura (login-errores.check.ts).
//
// La baja de un socio es: Secretaría lo saca del padrón → importar-socios
// banea la cuenta (ban_duration 876000h). GoTrue responde `user_banned` y la
// persona tiene que leer que está dada de baja, no que se equivocó de clave.

export const MENSAJE_CUENTA_BAJA = 'Tu cuenta está dada de baja. Consultá en Secretaría.'

// null = error de credenciales (o ninguno): seguir con el 401 genérico.
export function respuestaErrorLogin(
  error: { code?: string; status?: number; message?: string } | null | undefined,
): { status: number; mensaje: string } | null {
  if (!error) return null
  if (error.code === 'user_banned' || /user is banned/i.test(error.message ?? '')) {
    return { status: 403, mensaje: MENSAJE_CUENTA_BAJA }
  }
  // Todos los logins salen de la IP de login-dni: si GoTrue la limita, decirlo.
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return { status: 429, mensaje: 'Demasiados intentos' }
  }
  return null
}
