// Deep links de auth (recupero de contraseña, invitación, alta) que abre
// app/_layout.tsx. Lógica pura (linkAuth.check.ts).
//
// GoTrue manda los tokens en el fragmento (flujo implícito) o un `code` en la
// query (PKCE). Cuando el link venció o ya se usó, en vez de tokens manda
// `error` / `error_code` (p. ej. otp_expired), en el fragmento o en la query.
// Antes se ignoraban y la persona quedaba en el login sin saber por qué.

export type FlujoLink = 'recovery' | 'nuevo' | null

export type LinkAuth =
  | { tipo: 'error'; codigo: string }
  | { tipo: 'tokens'; accessToken: string; refreshToken: string; flujo: FlujoLink }
  | { tipo: 'codigo'; code: string; flujo: FlujoLink }
  | { tipo: 'nada' }

export const AVISO_LINK_VENCIDO = 'El link venció o ya se usó. Pedí uno nuevo.'
export const AVISO_LINK_SIN_RED = 'No hay conexión: no pudimos abrir el link. Revisá internet y volvé a tocarlo.'

function flujoDe(type: string | null): FlujoLink {
  if (type === 'recovery') return 'recovery'
  if (type === 'invite' || type === 'signup' || type === 'magiclink') return 'nuevo'
  return null
}

export function parsearLinkAuth(url: string): LinkAuth {
  const [antes, fragmento = ''] = url.split('#', 2)
  const query = antes.includes('?') ? antes.slice(antes.indexOf('?') + 1) : ''
  const q = new URLSearchParams(query)
  const f = new URLSearchParams(fragmento)

  // El error gana sobre cualquier token; el del fragmento sobre el de la query.
  const codigoError =
    f.get('error_code') ?? f.get('error') ?? q.get('error_code') ?? q.get('error')
  if (codigoError) return { tipo: 'error', codigo: codigoError }

  const code = q.get('code')
  if (code) return { tipo: 'codigo', code, flujo: flujoDe(q.get('type')) }

  const accessToken = f.get('access_token')
  const refreshToken = f.get('refresh_token')
  if (accessToken && refreshToken) {
    return { tipo: 'tokens', accessToken, refreshToken, flujo: flujoDe(f.get('type')) }
  }
  return { tipo: 'nada' }
}

// El link no pudo abrir la sesión: sin red no es que haya vencido.
export function avisoFallaLink(sinRed: boolean): string {
  return sinRed ? AVISO_LINK_SIN_RED : AVISO_LINK_VENCIDO
}
