// Rol de staff de una cuenta en Usuarios (auditoría web-subcomisión T5).
//
// Antes "EDITAR ROL" escribía sólo `profiles.rol`: `roles[]` (lo que decide
// qué puede elegir la cuenta en el selector de rol de la app) quedaba con el
// rol viejo. Y la lista filtraba por `rol`, así que un staff que estaba en
// "vista socio" (rol = 'socio') desaparecía. Ahora el rol de staff se busca en
// los dos y el cambio reemplaza el viejo en `roles[]` (y en `rol` si era el
// activo). Lógica pura (rolesStaff.check.ts).

/**
 * Web-only roles: granted with assign-role, which ADDS them to roles[] and keeps
 * the active rol (supabase/functions/_shared/permisos-usuarios.ts, ROLES_SOLO_WEB;
 * keep in sync). The web panel checks them by membership in roles[].
 */
export const ROLES_SOLO_WEB = ['beneficios']

export function esRolSoloWeb(rol: string): boolean {
  return ROLES_SOLO_WEB.includes(rol)
}

/**
 * Options for EDITAR ROL, which REPLACES the current staff role: a web-only
 * role is only listed when it is the current one (so the select shows it);
 * turning another staff role into it would drop that role.
 */
export function rolesParaEditar(disponibles: string[], actual: string): string[] {
  return disponibles.filter(r => !esRolSoloWeb(r) || r === actual)
}

/** Options for creating a new account: admin-usuarios `create` rejects web-only roles. */
export function rolesParaCrear(disponibles: string[]): string[] {
  return disponibles.filter(r => !esRolSoloWeb(r))
}

/** El rol de staff que se muestra: el activo si es de staff; si no, el primero de roles[]. */
export function rolStaffDe(rol: string, roles: string[] | null | undefined, staff: string[]): string | null {
  if (staff.includes(rol)) return rol
  return (roles ?? []).find(r => staff.includes(r)) ?? null
}

/** Reemplaza `viejo` por `nuevo` en roles[] (sin duplicar) y en `rol` si era el activo. */
export function reemplazarRolStaff(
  perfil: { rol: string; roles: string[] | null | undefined },
  viejo: string,
  nuevo: string,
): { rol: string; roles: string[] } {
  const roles: string[] = []
  const actuales = perfil.roles ?? []
  for (const r of actuales.length > 0 ? actuales : [viejo]) {
    const valor = r === viejo ? nuevo : r
    if (!roles.includes(valor)) roles.push(valor)
  }
  if (!roles.includes(nuevo)) roles.push(nuevo)
  return { rol: perfil.rol === viejo ? nuevo : perfil.rol, roles }
}
