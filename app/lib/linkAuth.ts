// Deep links de auth (recupero de contraseña, invitación, alta) que abre
// app/_layout.tsx. Lógica pura (linkAuth.check.ts).
//
// GoTrue manda los tokens en el fragmento (flujo implícito) o un `code` en la
// query (PKCE). Cuando el link venció o ya se usó, en vez de tokens manda
// `error` / `error_code` (p. ej. otp_expired), en el fragmento o en la query.
// Antes se ignoraban y la persona quedaba en el login sin saber por qué.

export type FlujoLink = 'recovery' | 'nuevo' | null

export type LinkAuth =
  // codigoError: el error_code (o error) de GoTrue, sólo para el log.
  | { tipo: 'error'; codigoError: string }
  | { tipo: 'tokens'; accessToken: string; refreshToken: string; flujo: FlujoLink }
  | { tipo: 'codigo'; code: string; flujo: FlujoLink }
  | { tipo: 'nada' }

export const AVISO_LINK_VENCIDO = 'El link venció o ya se usó. Pedí uno nuevo.'
export const AVISO_LINK_SIN_RED = 'No hay conexión: no pudimos abrir el link. Revisá internet y volvé a tocarlo.'

// Por qué no abrió un link. Viaja como código (authStore.avisoLink), nunca
// como texto: el banner de forgot-password sólo muestra estas constantes, así
// un link armado no puede poner texto propio en una pantalla de confianza.
export type AvisoLink = 'vencido' | 'sin_red'

const TEXTOS_AVISO_LINK: Record<AvisoLink, string> = {
  vencido: AVISO_LINK_VENCIDO,
  sin_red: AVISO_LINK_SIN_RED,
}

// Texto del banner para un código conocido; cualquier otra cosa, null.
export function textoAvisoLink(codigo: unknown): string | null {
  if (typeof codigo !== 'string' || !Object.prototype.hasOwnProperty.call(TEXTOS_AVISO_LINK, codigo)) return null
  return TEXTOS_AVISO_LINK[codigo as AvisoLink]
}

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
  if (codigoError) return { tipo: 'error', codigoError }

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
export function avisoFallaLink(sinRed: boolean): AvisoLink {
  return sinRed ? 'sin_red' : 'vencido'
}

// Espera máxima para abrir la sesión de un link (exchangeCodeForSession /
// setSession). Mientras se abre, `procesandoLink` frena el guard raíz: sin un
// tope, una red colgada dejaba la app frenada en la splash o en la pantalla
// anterior para siempre. Vencido, se avisa como "sin red".
export const ESPERA_LINK_MS = 15_000

export type CarreraLink<T> = { tipo: 'a_tiempo'; valor: T } | { tipo: 'vencido' }
export type LlegadaTardia<T> = { valor: T } | { error: unknown }

// Espera `promesa` como máximo `ms`. Si vence, devuelve 'vencido' enseguida y
// lo que la promesa dé después (valor o rechazo) va a `alLlegarTarde`, que
// decide qué hacer con eso; ningún rechazo queda suelto. Un rechazo antes del
// tope sigue de largo, como sin tope.
export function conTiempoMaximo<T>(
  promesa: Promise<T>,
  ms: number,
  alLlegarTarde: (llegada: LlegadaTardia<T>) => void,
): Promise<CarreraLink<T>> {
  return new Promise((resolve, reject) => {
    let vencido = false
    const timer = setTimeout(() => {
      vencido = true
      resolve({ tipo: 'vencido' })
    }, ms)
    promesa.then(
      (valor) => {
        if (vencido) alLlegarTarde({ valor })
        else { clearTimeout(timer); resolve({ tipo: 'a_tiempo', valor }) }
      },
      (error) => {
        if (vencido) alLlegarTarde({ error })
        else { clearTimeout(timer); reject(error) }
      },
    )
  })
}

// Qué hacer con una sesión de link que abrió después del tope. Ya se avisó la
// falla y se soltó el guard sin marcar recovery / usuario nuevo: si la sesión
// quedara, el guard la llevaría adentro de la app sin pasar por
// reset-password (o registro). Lo seguro es cerrarla (sólo en este teléfono):
// la persona vuelve a tocar el link o pide otro. Si mientras tanto se abrió
// otro link (`vigente` = false), no se toca: esa sesión es del nuevo. Una
// llegada tardía que falló no dejó sesión: se ignora.
export function accionLinkTardio(abrioSesion: boolean, vigente: boolean): 'cerrar_sesion_local' | 'ignorar' {
  return abrioSesion && vigente ? 'cerrar_sesion_local' : 'ignorar'
}
