// Mensajes legibles para los errores de `supabase.functions.invoke`.
//
// Con un non-2xx, invoke devuelve `data: null` y un FunctionsHttpError cuyo
// mensaje es "Edge Function returned a non-2xx status code": el motivo real
// viaja en el body (`error.context`, un Response). Leer `data?.error` en ese
// caso siempre daba null y el usuario veía el texto en inglés. Se reconocen
// por `name` (sin importar supabase-js) para poder chequearlo con tsx
// (errorFunction.check.ts).

export const SIN_CONEXION = 'No hay conexión. Revisá internet y volvé a intentar.'

// Largo mínimo de contraseña que pide la app (registro, reset, tutor). Tiene
// que coincidir con Supabase → Auth → "Minimum password length": si se
// cambia allá, cambiarlo acá y en esas pantallas.
export const MIN_PASSWORD = 8

interface ErrorConContexto { name?: string; message?: string; context?: unknown }

function comoError(e: unknown): ErrorConContexto | null {
  return e && typeof e === 'object' ? (e as ErrorConContexto) : null
}

// Un objeto JSON común (no null, no array).
function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function statusErrorFunction(error: unknown): number | undefined {
  const ctx = comoError(error)?.context
  if (ctx && typeof ctx === 'object' && 'status' in ctx && typeof (ctx as { status: unknown }).status === 'number') {
    return (ctx as { status: number }).status
  }
  return undefined
}

// Lee el body de un non-2xx una sola vez. null si no es JSON.
export async function cuerpoErrorFunction(error: unknown): Promise<Record<string, unknown> | null> {
  const ctx = comoError(error)?.context
  if (!ctx || typeof (ctx as Response).json !== 'function') return null
  try {
    const body = await (ctx as Response).clone().json()
    return body && typeof body === 'object' ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

// El mensaje a mostrar. `data` cubre las functions que devuelven 200 con
// { error } / { motivo }; `porDefecto` reemplaza cualquier texto técnico.
export async function mensajeErrorFunction(
  error: unknown,
  porDefecto = 'Ocurrió un error. Intentá de nuevo.',
  data?: unknown,
): Promise<string> {
  const d = comoError(data) as { error?: unknown; motivo?: unknown } | null
  if (!error) {
    if (typeof d?.error === 'string' && d.error) return d.error
    if (typeof d?.motivo === 'string' && d.motivo) return d.motivo
    return porDefecto
  }
  const e = comoError(error)
  if (e?.name === 'FunctionsFetchError') return SIN_CONEXION
  const body = await cuerpoErrorFunction(error)
  if (typeof body?.error === 'string' && body.error) return body.error
  if (typeof body?.motivo === 'string' && body.motivo) return body.motivo
  return porDefecto
}

// Errores de GoTrue (supabase.auth.*), que llegan en inglés.
export function mensajeErrorAuth(
  error: { message?: string; code?: string } | null | undefined,
  porDefecto = 'Ocurrió un error. Intentá de nuevo.',
): string {
  const msg = error?.message ?? ''
  if (/network request failed|failed to fetch|fetch failed/i.test(msg)) return SIN_CONEXION
  if (error?.code === 'same_password' || /different from the old password/i.test(msg)) {
    return 'La contraseña nueva tiene que ser distinta de la actual.'
  }
  if (error?.code === 'weak_password' || /password should|weak password/i.test(msg)) {
    return `La contraseña es muy débil: usá al menos ${MIN_PASSWORD} caracteres.`
  }
  if (error?.code === 'over_request_rate_limit' || /rate limit/i.test(msg)) {
    return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
  }
  return porDefecto
}

// Login (login-dni): cada falla dice algo distinto.
export function mensajeLogin(r: { status?: number; sinRed?: boolean }): string {
  if (r.sinRed) return SIN_CONEXION
  if (r.status === 400) return 'Completá tu DNI (o mail) y tu contraseña.'
  if (r.status === 401) return 'El DNI o mail, o la contraseña, no son correctos. Si es tu primera vez, tu contraseña es tu DNI sin puntos.'
  // Socio sacado del padrón: el import banea la cuenta (login-dni → 403).
  if (r.status === 403) return 'Tu cuenta está dada de baja. Consultá en Secretaría.'
  if (r.status === 429) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
  return 'El servidor no respondió. Probá de nuevo en un rato.'
}

// Recupero de contraseña (login-dni, action 'reset'). El éxito es siempre el
// mismo; acá sólo las fallas del pedido, que no dicen nada de la cuenta. Cada
// falla tiene su motivo explícito (antes se inventaban status HTTP).
export type FallaRecupero =
  | { motivo: 'vacio' }
  | { motivo: 'mail_invalido' }
  | { motivo: 'sin_red' }
  // Se cortó la espera: el pedido pudo haber salido y el mail llegar igual.
  | { motivo: 'tardo' }
  // 200 sin { ok: true }.
  | { motivo: 'respuesta_invalida' }
  // codigo: el `codigo` estable del body de login-dni, si vino.
  | { motivo: 'servidor'; status?: number; codigo?: string }

const REVISA_MAIL = 'Revisá el mail.'
// Lo que manda login-dni en el 400 de mail mal escrito (CODIGO_MAIL_INVALIDO en
// supabase/functions/_shared/recupero-password.ts). Se decide por el código,
// no por el texto del servidor: el texto se muestra desde acá.
const CODIGO_MAIL_INVALIDO = 'mail_invalido'

export function mensajeRecupero(f: FallaRecupero): string {
  switch (f.motivo) {
    case 'vacio':         return 'Ingresá tu DNI o tu mail.'
    case 'mail_invalido': return REVISA_MAIL
    case 'sin_red':       return SIN_CONEXION
    case 'tardo':
      return 'Está tardando más de lo normal. Si te llega el mail, usá el link más nuevo; si no, probá en unos minutos.'
    case 'servidor':
      // Nunca el texto del servidor tal cual: sólo códigos conocidos.
      if (f.status === 400) return f.codigo === CODIGO_MAIL_INVALIDO ? REVISA_MAIL : 'Ingresá tu DNI o tu mail.'
      if (f.status === 429) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
      return 'No se pudo enviar el link. Probá de nuevo en un rato.'
    case 'respuesta_invalida':
      return 'No se pudo enviar el link. Probá de nuevo en un rato.'
  }
}

// Falla del invoke a login-dni, o null si salió bien. `tardo` = la app cortó
// la espera; `cuerpo` = body del non-2xx (cuerpoErrorFunction).
export function fallaRecupero(r: {
  tardo: boolean
  error: unknown
  data: unknown
  cuerpo?: Record<string, unknown> | null
}): FallaRecupero | null {
  if (r.tardo) return { motivo: 'tardo' }
  if (r.error) {
    if (comoError(r.error)?.name === 'FunctionsFetchError') return { motivo: 'sin_red' }
    const codigo = typeof r.cuerpo?.codigo === 'string' ? r.cuerpo.codigo : undefined
    return { motivo: 'servidor', status: statusErrorFunction(r.error), codigo }
  }
  if (!esRegistro(r.data) || r.data.ok !== true) return { motivo: 'respuesta_invalida' }
  return null
}
