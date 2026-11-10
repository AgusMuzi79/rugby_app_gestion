// Reglas de la function `colaboradores`: el entrenador designa colaboradores de
// sus propias divisiones eligiendo un socio que ya tiene cuenta.
//
// `profiles.divisiones` es un solo array compartido por todos los roles de la
// cuenta (tiene_acceso_division() lo lee sin mirar el rol). Por eso sólo se
// designa a quien no tiene otro rol que use divisiones: si no, la división del
// colaborador también le daría acceso como entrenador/coordinador/manager.
// Lógica pura, sin imports, para poder chequearla con tsx (colaboradores.check.ts).

export interface Rechazo { status: number; mensaje: string }

// Roles que usan profiles.divisiones (o que tienen acceso global).
export const ROLES_EXCLUYENTES: readonly string[] = ['entrenador', 'coordinador', 'manager', 'subcomision', 'admin']

export const MIN_CARACTERES_BUSQUEDA = 3
export const MAX_RESULTADOS_BUSQUEDA = 20
export const EDAD_MINIMA = 13

export interface Candidato {
  id: string
  activo: boolean
  rol: string | null
  roles: string[] | null
  divisiones: string[] | null
  fechaNacimiento: string | null
  // Existe una fila en `socios` con profile_id = id.
  tieneSocio: boolean
}

function rolesDe(c: { rol: string | null; roles: string[] | null }): string[] {
  return [...new Set([...(c.roles ?? []), ...(c.rol ? [c.rol] : [])])]
}

// null = autorizado. `perfil` null = el caller no tiene profile.
export function autorizarCaller(perfil: { rol: string | null; activo: boolean } | null): Rechazo | null {
  if (!perfil || perfil.rol !== 'entrenador' || !perfil.activo) {
    return { status: 403, mensaje: 'Sólo un entrenador puede gestionar colaboradores' }
  }
  return null
}

export function verificarDivisionDelCaller(divisionId: unknown, divisionesCaller: string[] | null): Rechazo | null {
  if (typeof divisionId !== 'string' || !divisionId) {
    return { status: 400, mensaje: 'Falta la división' }
  }
  if (!(divisionesCaller ?? []).includes(divisionId)) {
    return { status: 403, mensaje: 'Esa división no está a tu cargo' }
  }
  return null
}

// Divisiones de una persona que el entrenador puede ver (las que comparten), en
// el orden de las del entrenador.
export function divisionesVisibles(divisionesPersona: string[] | null, divisionesCaller: string[]): string[] {
  const propias = new Set(divisionesPersona ?? [])
  return divisionesCaller.filter((d) => propias.has(d))
}

export type Busqueda =
  | { tipo: 'dni'; dni: string }
  | { tipo: 'nombre'; q: string }
  | { tipo: 'error'; mensaje: string }

// Sólo dígitos (admite puntos y espacios) = DNI exacto; si no, nombre.
export function interpretarBusqueda(q: unknown): Busqueda {
  const limpio = typeof q === 'string' ? q.trim().replace(/\s+/g, ' ') : ''
  if (limpio.length < MIN_CARACTERES_BUSQUEDA) {
    return { tipo: 'error', mensaje: `Escribí al menos ${MIN_CARACTERES_BUSQUEDA} caracteres` }
  }
  if (/^[\d.\s]+$/.test(limpio)) {
    const dni = limpio.replace(/\D/g, '')
    if (dni.length < MIN_CARACTERES_BUSQUEDA) {
      return { tipo: 'error', mensaje: `Escribí al menos ${MIN_CARACTERES_BUSQUEDA} dígitos` }
    }
    return { tipo: 'dni', dni }
  }
  return { tipo: 'nombre', q: limpio }
}

// `fechaNacimiento` como 'YYYY-MM-DD'. Una fecha ilegible no se rechaza por edad
// (igual que una desconocida).
function esMenorDe(fechaNacimiento: string, anios: number, hoy: Date): boolean {
  const nacimiento = new Date(fechaNacimiento)
  if (Number.isNaN(nacimiento.getTime())) return false
  const limite = new Date(hoy)
  limite.setUTCFullYear(limite.getUTCFullYear() - anios)
  return nacimiento > limite
}

// null = elegible; si no, el motivo (se muestra en la búsqueda y como error).
export function motivoNoElegible(callerId: string, c: Candidato, hoy: Date): string | null {
  if (c.id === callerId) return 'No podés designarte a vos mismo'
  if (!c.activo) return 'La cuenta está desactivada'
  const roles = rolesDe(c)
  if (!c.tieneSocio || (roles.includes('cliente_gimnasio') && !roles.includes('socio'))) {
    return 'No es socio del club'
  }
  if (roles.some((r) => ROLES_EXCLUYENTES.includes(r))) {
    return 'Ya tiene un rol del cuerpo técnico o de la Subcomisión'
  }
  if (c.fechaNacimiento && esMenorDe(c.fechaNacimiento, EDAD_MINIMA, hoy)) {
    return `Tiene menos de ${EDAD_MINIMA} años`
  }
  return null
}

export function esColaboradorDe(c: Pick<Candidato, 'rol' | 'roles' | 'divisiones'>, divisionId: string): boolean {
  return rolesDe(c).includes('colaborador') && (c.divisiones ?? []).includes(divisionId)
}

export interface EstadoPerfil { roles: string[]; rol: string; divisiones: string[] | null }

// Asume que el candidato ya pasó motivoNoElegible. `cambia` = false si ya era
// colaborador de esa división (no se escribe nada ni se le cambia el rol activo).
export function estadoTrasAsignar(c: Candidato, divisionId: string): EstadoPerfil & { cambia: boolean } {
  const roles = rolesDe(c)
  if (esColaboradorDe(c, divisionId)) {
    return { roles, rol: c.rol ?? 'colaborador', divisiones: c.divisiones, cambia: false }
  }
  return {
    roles: [...new Set(['socio', ...roles, 'colaborador'])],
    rol: 'colaborador',
    divisiones: [...new Set([...(c.divisiones ?? []), divisionId])],
    cambia: true,
  }
}

// Saca sólo esa división. Si no le queda ninguna, deja de ser colaborador.
export function estadoTrasQuitar(c: Candidato, divisionId: string): EstadoPerfil | Rechazo {
  const roles = rolesDe(c)
  if (!esColaboradorDe(c, divisionId)) {
    return { status: 404, mensaje: 'No es colaborador de esa división' }
  }
  if (roles.some((r) => ROLES_EXCLUYENTES.includes(r))) {
    return { status: 403, mensaje: 'Esta cuenta tiene un rol del cuerpo técnico: la gestiona la Subcomisión' }
  }
  const divisiones = (c.divisiones ?? []).filter((d) => d !== divisionId)
  if (divisiones.length > 0) {
    return { roles, rol: c.rol ?? 'colaborador', divisiones }
  }
  const quedan = roles.filter((r) => r !== 'colaborador')
  if (quedan.length === 0) {
    return { status: 409, mensaje: 'La cuenta no tiene otro rol: no se le puede quitar el de colaborador' }
  }
  const rol = c.rol && c.rol !== 'colaborador' && quedan.includes(c.rol)
    ? c.rol
    : (quedan.includes('socio') ? 'socio' : quedan[0])
  return { roles: quedan, rol, divisiones: null }
}
