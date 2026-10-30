// Recupero de contraseña por DNI o mail (login-dni, action 'reset').
// Lógica pura (recupero-password.check.ts).
//
// Los socios entran con DNI y muchos no tienen mail real: el padrón les deja
// socio-{n}@uncas.local. A esa dirección no se manda nada (no existe), pero
// la respuesta es siempre la misma: el endpoint es público y sin JWT, y no
// tiene que revelar si un DNI existe ni si su mail es sintético.

import { mailMalEscrito, normalizarIdentificador, type Identificador } from './login-identificador.ts'

const DOMINIO_SINTETICO = '@uncas.local'

const REVISA_MAIL = 'Revisá el mail.'
const NO_SE_PUDO_VERIFICAR = 'No se pudo verificar el usuario'

type ErrorGoTrue = { code?: string; status?: number; message?: string }

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
  error: ErrorGoTrue | null | undefined,
): { respuesta: typeof RESPUESTA_RECUPERO; aviso: string | null } {
  if (!error) return { respuesta: RESPUESTA_RECUPERO, aviso: null }
  const aviso = `login-dni reset: falló el envío del mail (code=${error.code ?? '-'}, status=${error.status ?? '-'})`
  return { respuesta: RESPUESTA_RECUPERO, aviso }
}

// Mail de la cuenta según auth.admin.getUserById. Un perfil sin usuario de
// Auth (404 / user_not_found) es "no hay cuenta", no una falla.
export type CuentaDni = { email: string | null; fallo: boolean }

export function cuentaDeUsuarioAuth(
  error: ErrorGoTrue | null | undefined,
  user: { email?: string | null } | null | undefined,
): CuentaDni {
  if (error) {
    const noExiste = error.status === 404 || error.code === 'user_not_found'
    return { email: null, fallo: !noExiste }
  }
  return { email: user?.email ?? null, fallo: false }
}

// GoTrue rechaza el formato del mail. Sólo se le dice al cliente si el mail lo
// tipeó él: no depende de que exista una cuenta.
function esErrorDeFormatoMail(error: ErrorGoTrue): boolean {
  return error.code === 'validation_failed' || error.code === 'email_address_invalid'
}

export type ResultadoHttp = { status: number; body: Record<string, unknown> }

// Lo que el handler necesita de afuera (base, GoTrue, log): se inyecta para
// poder probar cada rama sin red.
export interface DepsRecupero {
  // Límite propio (recupero-intentos.ts); va antes de buscar la cuenta.
  limite: (identificador: Identificador) => Promise<'enviar' | 'limitado' | 'error'>
  emailDeDni: (dni: string) => Promise<CuentaDni>
  enviar: (email: string) => Promise<{ error: ErrorGoTrue | null }>
  log: (mensaje: string) => void
}

const ok = (): ResultadoHttp => ({ status: 200, body: { ...RESPUESTA_RECUPERO } })
const falla = (status: number, error: string): ResultadoHttp => ({ status, body: { error } })

// Pedido de recupero (login-dni, action 'reset'). Las únicas respuestas que no
// son la genérica salen de algo que no depende de la cuenta: el formato de lo
// tipeado, o una falla nuestra antes de decidir (límite o búsqueda).
export async function manejarRecupero(raw: string, deps: DepsRecupero): Promise<ResultadoHttp> {
  if (mailMalEscrito(raw)) return falla(400, REVISA_MAIL)
  const identificador = normalizarIdentificador(raw)
  if (!identificador) return falla(400, 'Faltan datos')

  const limite = await deps.limite(identificador)
  if (limite === 'error') return falla(500, NO_SE_PUDO_VERIFICAR)
  // Pasado el límite: la misma respuesta, sin buscar ni mandar nada.
  if (limite === 'limitado') return ok()

  let email: string | null
  if (identificador.tipo === 'email') {
    email = identificador.email
  } else {
    const cuenta = await deps.emailDeDni(identificador.dni)
    if (cuenta.fallo) return falla(500, NO_SE_PUDO_VERIFICAR)
    email = cuenta.email
  }

  // Sin cuenta o con mail sintético: no hay a dónde mandar. Misma respuesta.
  const destino = emailParaRecupero(email)
  if (!destino) return ok()

  let error: ErrorGoTrue | null
  try {
    ;({ error } = await deps.enviar(destino))
  } catch (e) {
    // Sólo el tipo: el mensaje puede traer el mail.
    error = { code: `excepcion:${(e as Error)?.name ?? 'desconocida'}` }
  }
  if (error && identificador.tipo === 'email' && esErrorDeFormatoMail(error)) return falla(400, REVISA_MAIL)

  // Cualquier otra falla del envío sólo pasa con una cuenta real: al log, no al cliente.
  const { aviso } = cierreRecupero(error)
  if (aviso) deps.log(aviso)
  return ok()
}
