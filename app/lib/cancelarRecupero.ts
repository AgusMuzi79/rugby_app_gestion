// "Cancelar y volver al inicio" de reset-password (hooks/useResetPassword.ts).
// Lógica pura (cancelarRecupero.check.ts).
//
// Cierre local (scope 'local'): termina sólo la sesión de este teléfono, la
// que abrió el link. Con el scope global por defecto, cancelar un recupero
// acá cerraba la sesión de la persona en todos sus otros dispositivos.
//
// El orden importa: si el flag de recovery se limpia antes de cerrar la
// sesión del link, el guard raíz ve una sesión viva sin flag y la manda al
// inicio del rol, adentro de la app. Primero se cierra la sesión y recién
// después se limpia el estado, aunque el cierre falle. Sin red supabase-js
// devuelve error sin borrar la sesión guardada, y no hay un cierre "más
// local" al que caer (repetir el mismo llamado daría lo mismo): el estado se
// limpia igual, como antes de este helper.

export type SignOut = (opciones: { scope: 'local' }) => Promise<{ error: unknown }>

export async function cerrarSesionRecupero(signOut: SignOut, limpiar: () => void): Promise<void> {
  try {
    await signOut({ scope: 'local' })
  } catch {
    // Igual se limpia el estado abajo.
  }
  limpiar()
}
