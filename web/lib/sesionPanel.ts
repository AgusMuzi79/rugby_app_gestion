// Decide qué hace el guard de los paneles web (PanelShell) con lo que devolvieron
// la lectura de la sesión y la del perfil. Lógica pura, verificada en sesionPanel.check.ts.
//
// Regla: sólo se cierra la sesión cuando está confirmado que la persona no tiene
// perfil o no tiene un rol permitido. Un corte de red, un timeout o Supabase caído
// no dicen nada del permiso: se muestra un error con REINTENTAR y la sesión sigue.

export type DecisionSesion =
  | { tipo: 'ok' }
  | { tipo: 'login' }   // no hay sesión (o el token ya no sirve): ir al login
  | { tipo: 'cerrar' }  // sin perfil o rol no permitido: cerrar sesión e ir al login
  | { tipo: 'error' }   // no se pudo verificar: mostrar error con REINTENTAR

interface ErrorAuth { name?: string; status?: number }
interface ErrorPerfil { code?: string; message?: string }

export function decidirSesion({ user, userError, perfil, perfilError, excepcion, rolesPermitidos }: {
  user: { id: string } | null
  userError?: ErrorAuth | null
  perfil?: { rol: string } | null
  perfilError?: ErrorPerfil | null
  excepcion?: unknown
  rolesPermitidos: string[]
}): DecisionSesion {
  if (excepcion) return { tipo: 'error' }

  if (!user) {
    if (!userError) return { tipo: 'login' }
    const status = userError.status ?? 0
    // 4xx de Auth = no hay sesión o el token venció/es inválido.
    if (userError.name === 'AuthSessionMissingError' || (status >= 400 && status < 500)) return { tipo: 'login' }
    return { tipo: 'error' }
  }

  if (perfilError) {
    // PGRST116 = .single() no encontró la fila: la persona no tiene perfil visible.
    if (perfilError.code === 'PGRST116') return { tipo: 'cerrar' }
    // PGRST30x = el JWT venció o es inválido: reintentar no lo arregla, al login
    // (sin cerrar nada, igual que un 4xx de Auth).
    if (perfilError.code?.startsWith('PGRST30')) return { tipo: 'login' }
    return { tipo: 'error' }
  }
  if (!perfil || !rolesPermitidos.includes(perfil.rol)) return { tipo: 'cerrar' }
  return { tipo: 'ok' }
}
