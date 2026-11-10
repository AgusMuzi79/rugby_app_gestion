// Panel al que entra una cuenta después del login web. Lógica pura, verificada
// en panelLogin.check.ts; la usa app/login/page.tsx.
//
// El orden importa: quien tiene varios roles de web entra al primero de la lista.
// beneficios y entrenador van al final para que subcomisión/admin/secretaría/
// portería/buffet sigan entrando a su propio panel.

export const ROLES_WEB = ['subcomision', 'admin', 'secretaria', 'porteria', 'buffet', 'beneficios', 'entrenador'] as const

const DESTINOS: Record<(typeof ROLES_WEB)[number], string> = {
  subcomision: '/dashboard',
  admin:       '/dashboard',
  secretaria:  '/secretaria/socios',
  porteria:    '/porteria/accesos',
  buffet:      '/buffet/promos',
  beneficios:  '/beneficios',
  entrenador:  '/entrenador/asistencias',
}

export interface PanelLogin {
  rolWeb: string
  destino: string
  /** Escribir profiles.rol = rolWeb: la RLS de esos paneles mira el rol activo. */
  reescribirRol: boolean
}

/** null = la cuenta no tiene ningún rol de web: no entra al panel. */
export function elegirPanelLogin(profile: { rol: string; roles?: string[] | null } | null): PanelLogin | null {
  if (!profile) return null
  const roles = profile.roles ?? []
  // profiles.rol puede estar en 'manager' u otro rol móvil si la persona cambió
  // de rol en la app: se busca el primer rol de web en roles[].
  const rolWeb = ROLES_WEB.find(r => roles.includes(r))
    ?? ROLES_WEB.find(r => r === profile.rol)
  if (!rolWeb) return null
  return {
    rolWeb,
    destino: DESTINOS[rolWeb],
    // beneficios es sólo web: la app deja a la cuenta en 'socio' y pisar
    // profiles.rol rompería la app en el teléfono.
    reescribirRol: rolWeb !== 'beneficios' && profile.rol !== rolWeb,
  }
}
