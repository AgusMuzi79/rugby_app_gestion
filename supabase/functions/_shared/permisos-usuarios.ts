// Quién puede actuar sobre qué cuenta en `admin-usuarios`.
//
// Antes la function sólo miraba el rol del caller: cualquier Subcomisión podía
// banear, borrar o leer el mail de cualquier cuenta (admin incluido) por API, y
// borrar una cuenta arrastra su socio, cuotas y pagos (cascade). Lógica pura,
// sin imports, para poder chequearla con tsx (permisos-usuarios.check.ts).

// 'colaborador' (auditoría entrenador T23): sólo toma asistencia en sus
// divisiones; se crea y se le asignan divisiones igual que a un entrenador.
export type RolCreable =
  | 'coordinador' | 'entrenador' | 'colaborador' | 'manager' | 'secretaria'
  | 'porteria' | 'canchero' | 'buffet' | 'subcomision'

export const ROLES_POR_CALLER: Record<string, RolCreable[]> = {
  subcomision: ['coordinador', 'entrenador', 'colaborador', 'manager', 'subcomision'],
  admin:       ['coordinador', 'entrenador', 'colaborador', 'manager', 'secretaria', 'porteria', 'canchero', 'buffet', 'subcomision'],
}

export type AccionSobreUsuario = 'deactivate' | 'reactivate' | 'delete' | 'getUser' | 'remove-role'

export interface Caller { id: string; rol: string }

export interface Destino {
  id: string
  rol: string | null
  roles: string[] | null
  // Existe una fila en `socios` con profile_id = id.
  tieneSocio: boolean
}

export interface Rechazo { status: number; mensaje: string }

function rolesDe(d: Destino): string[] {
  return [...new Set([...(d.roles ?? []), ...(d.rol ? [d.rol] : [])])]
}

// Roles que quedan si el caller le saca los roles de staff que gestiona.
// null = no queda ningún rol (la cuenta se desactiva, no se "vacía").
export function rolesTrasQuitarStaff(
  callerRol: string,
  roles: string[],
): { roles: string[]; rol: string } | null {
  const gestionables = new Set<string>(ROLES_POR_CALLER[callerRol] ?? [])
  const quedan = roles.filter((r) => !gestionables.has(r))
  if (quedan.length === 0) return null
  return { roles: quedan, rol: quedan.includes('socio') ? 'socio' : quedan[0] }
}

// null = autorizado.
export function autorizarAccion(caller: Caller, destino: Destino, accion: AccionSobreUsuario): Rechazo | null {
  const roles = rolesDe(destino)

  if (roles.includes('admin')) {
    return { status: 403, mensaje: 'No se puede modificar una cuenta de administrador' }
  }
  if (destino.id === caller.id && accion !== 'getUser') {
    return { status: 403, mensaje: 'No podés aplicar esta acción sobre tu propia cuenta' }
  }

  const gestionables = new Set<string>(ROLES_POR_CALLER[caller.rol] ?? [])
  if (!roles.some((r) => gestionables.has(r))) {
    return { status: 403, mensaje: 'No tenés permiso para gestionar esta cuenta' }
  }

  if (accion === 'delete') {
    if (caller.rol !== 'admin') {
      return { status: 403, mensaje: 'Sólo un administrador puede eliminar cuentas' }
    }
    if (destino.tieneSocio) {
      return { status: 409, mensaje: 'Esta cuenta es de un socio: no se elimina. Quitale el rol de staff o desactivala.' }
    }
  }

  if (accion === 'remove-role' && rolesTrasQuitarStaff(caller.rol, roles) === null) {
    return { status: 409, mensaje: 'La cuenta no tiene otro rol: desactivala en lugar de quitarle el rol.' }
  }

  return null
}
