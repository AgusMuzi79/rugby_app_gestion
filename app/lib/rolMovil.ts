// Mobile view of an account's roles. Web-only roles (ROLES_SOLO_WEB, today
// `beneficios`) and any value the app does not know are dropped: they have no
// label, screen or initial route here, and as the active view they would send
// a logged-in user to the login (guardRaiz) or crash the role picker.
//
// Holders of a web-only role normally keep `profiles.rol = 'socio'` (the DB
// grants benefits by membership in `roles[]`), so this mostly hides the role.
// If the active `rol` is web-only anyway, the app picks 'socio' (or the first
// mobile role left) and writes it back to `profiles.rol`, because RLS and the
// carnet QR read the active role from there.
//
// No mobile role left (an account with only `beneficios`): `rol` is null and
// the caller signs the user out with SIN_ACCESO_MOVIL. Pure logic
// (rolMovil.check.ts); the write is injected so it runs without Supabase.

import { ROL_LABELS, type Rol } from '../constants/roles'

export const SIN_ACCESO_MOVIL =
  'Tu cuenta no tiene acceso a la app. Entrá desde uncasapp.com.'

export interface RolesMovil {
  rol:        Rol | null
  roles:      Rol[]
  // true when `rol` changed and must be written back to profiles.rol.
  reescribir: boolean
}

export function esRolMovil(valor: unknown): valor is Rol {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(ROL_LABELS, valor)
}

export function normalizarRolesMovil(
  rol: string | null | undefined,
  roles: readonly string[] | null | undefined,
): RolesMovil {
  const fuente = roles ?? (rol ? [rol] : [])
  const moviles = [...new Set(fuente.filter(esRolMovil))]
  if (rol == null || esRolMovil(rol)) {
    return { rol: rol ?? null, roles: moviles, reescribir: false }
  }
  const nuevo = moviles.includes('socio') ? 'socio' : (moviles[0] ?? null)
  return { rol: nuevo, roles: moviles, reescribir: nuevo !== null }
}

// Normalizes a loaded profile and, when needed, writes the new active rol back
// (best effort: a failed write is logged and the normalized rol is still used
// locally; the next app open tries again).
export async function aplicarPerfilMovil(
  perfil: { rol?: string | null; roles?: readonly string[] | null },
  escribirRol: (rol: Rol) => PromiseLike<unknown>,
): Promise<RolesMovil> {
  const r = normalizarRolesMovil(perfil.rol, perfil.roles)
  if (r.reescribir && r.rol) {
    try {
      const res = await escribirRol(r.rol) as { error?: unknown } | null | undefined
      if (res?.error) console.warn('rolMovil: no se pudo reescribir profiles.rol', res.error)
    } catch (e) {
      console.warn('rolMovil: no se pudo reescribir profiles.rol', e)
    }
  }
  return r
}
