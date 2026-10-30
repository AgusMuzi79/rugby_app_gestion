// Recupero de contraseña por DNI o mail (login-dni, action 'reset').
// Lógica pura (recupero-password.check.ts).
//
// Los socios entran con DNI y muchos no tienen mail real: el padrón les deja
// socio-{n}@uncas.local. A esa dirección no se manda nada (no existe), pero
// la respuesta es siempre la misma: el endpoint es público y sin JWT, y no
// tiene que revelar si un DNI existe ni si su mail es sintético.

const DOMINIO_SINTETICO = '@uncas.local'

// El mismo deep link que usaba la app al pedir el reset directo.
export const REDIRECT_RECUPERO = 'uncasrugby://reset-password'

export const RESPUESTA_RECUPERO = { ok: true } as const

export function esMailSintetico(email: string): boolean {
  return email.trim().toLowerCase().endsWith(DOMINIO_SINTETICO)
}

// El mail al que se manda el link, o null si no hay a dónde mandarlo.
export function emailParaRecupero(email: string | null | undefined): string | null {
  const limpio = (email ?? '').trim()
  if (!limpio || esMailSintetico(limpio)) return null
  return limpio
}

// Falla de resetPasswordForEmail. null = sin error.
export function respuestaErrorRecupero(
  error: { code?: string; status?: number; message?: string } | null | undefined,
): { status: number; mensaje: string } | null {
  if (!error) return null
  // Todos los pedidos salen de la IP de login-dni, y el envío de mails tiene
  // su propio límite: decirlo, como en el login.
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') {
    return { status: 429, mensaje: 'Demasiados intentos' }
  }
  return { status: 500, mensaje: 'No se pudo enviar el mail' }
}
