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

// Cierre del pedido después de resetPasswordForEmail. Sólo una cuenta real con
// mail real llega a ese envío, así que su falla (429 de GoTrue u otra) no puede
// llegarle al cliente: dos pedidos seguidos (ok y después 429) delatarían que
// la cuenta existe. El cliente recibe siempre RESPUESTA_RECUPERO y la falla
// queda en el log del servidor (`aviso`), con el código y el status pero sin
// el mensaje de GoTrue, que puede traer el mail.
export function cierreRecupero(
  error: { code?: string; status?: number; message?: string } | null | undefined,
): { respuesta: typeof RESPUESTA_RECUPERO; aviso: string | null } {
  if (!error) return { respuesta: RESPUESTA_RECUPERO, aviso: null }
  const aviso = `login-dni reset: falló el envío del mail (code=${error.code ?? '-'}, status=${error.status ?? '-'})`
  return { respuesta: RESPUESTA_RECUPERO, aviso }
}
