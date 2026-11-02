// Rol de staff de una cuenta en Usuarios (auditoría web-subcomisión T5).
//
// Antes "EDITAR ROL" escribía sólo `profiles.rol`: `roles[]` (lo que decide
// qué puede elegir la cuenta en el selector de rol de la app) quedaba con el
// rol viejo. Y la lista filtraba por `rol`, así que un staff que estaba en
// "vista socio" (rol = 'socio') desaparecía. Ahora el rol de staff se busca en
// los dos y el cambio reemplaza el viejo en `roles[]` (y en `rol` si era el
// activo). Lógica pura (rolesStaff.check.ts).

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
