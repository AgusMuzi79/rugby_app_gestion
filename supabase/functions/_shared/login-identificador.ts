// Normalización de lo que la persona tipea en el login (login-dni) y del DNI
// que se carga al dar de alta staff (admin-usuarios).
//
// profiles.dni guarda sólo dígitos, pero el login comparaba el texto crudo:
// "30.123.456" nunca encontraba la cuenta, y la contraseña inicial (el DNI)
// tipeada con puntos tampoco coincidía. ~1500 socios entran por primera vez
// así. Lógica pura (login-identificador.check.ts).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Identificador =
  | { tipo: 'email'; email: string }
  | { tipo: 'dni'; dni: string }

export function normalizarDni(valor: string | undefined | null): string {
  return (valor ?? '').replace(/\D/g, '')
}

export function normalizarIdentificador(raw: string): Identificador | null {
  const limpio = raw.trim()
  if (!limpio) return null
  if (EMAIL_RE.test(limpio)) return { tipo: 'email', email: limpio.toLowerCase() }
  const dni = normalizarDni(limpio)
  return dni ? { tipo: 'dni', dni } : null
}

// Contraseñas a probar, en orden. Si lo tipeado es un DNI con puntos o
// espacios ("30.123.456"), también se prueba sin ellos: la inicial es el DNI.
export function variantesPassword(password: string): string[] {
  const sinSeparadores = password.replace(/[.\s]/g, '')
  if (/^[\d.\s]+$/.test(password) && sinSeparadores !== password && sinSeparadores.length > 0) {
    return [password, sinSeparadores]
  }
  return [password]
}
