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

// La contraseña a probar: un solo intento contra GoTrue (todos los logins
// salen de la IP de login-dni y comparten su límite). La inicial es el DNI:
// si lo tipeado es el DNI de esta misma cuenta con puntos o espacios
// ("30.123.456"), se prueba sin ellos; cualquier otra cosa, tal cual.
// `dniCuenta` = null cuando se entra por mail (no se conoce el DNI).
export function passwordAProbar(password: string, dniCuenta: string | null): string {
  if (!dniCuenta || !/^[\d.\s]+$/.test(password)) return password
  return normalizarDni(password) === dniCuenta ? dniCuenta : password
}
