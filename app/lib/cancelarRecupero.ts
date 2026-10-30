// "Cancelar y volver al inicio" de reset-password (hooks/useResetPassword.ts).
// Lógica pura (cancelarRecupero.check.ts).
//
// El orden importa: si el flag de recovery se limpia antes de cerrar la
// sesión del link, el guard raíz ve una sesión viva sin flag y la manda al
// inicio del rol, adentro de la app. Primero se cierra la sesión (en el
// servidor; sin red o con error, al menos la local, para que no quede
// guardada), y recién después se limpia el estado.

export type SignOut = (opciones?: { scope: 'local' }) => Promise<{ error: unknown }>

export async function cerrarSesionRecupero(signOut: SignOut, limpiar: () => void): Promise<void> {
  let cerrada = false
  try {
    const { error } = await signOut()
    cerrada = !error
  } catch {
    // Sin red: abajo, cierre local.
  }
  if (!cerrada) {
    try {
      await signOut({ scope: 'local' })
    } catch {
      // Igual se limpia el estado: la sesión del link vence sola.
    }
  }
  limpiar()
}
