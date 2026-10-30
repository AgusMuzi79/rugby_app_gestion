// Lógica pura de la pantalla de Usuarios (admin y subcomisión,
// components/shared/UsuariosScreen.tsx). Verificada en usuariosForm.check.ts.

// ¿El detalle tiene divisiones tildadas y sin guardar? El orden no importa y
// `null` (sin divisiones en el perfil) equivale a una lista vacía.
export function divisionesCambiaron(originales: string[] | null, editadas: string[]): boolean {
  const antes = new Set(originales ?? [])
  const ahora = new Set(editadas)
  if (antes.size !== ahora.size) return true
  for (const id of ahora) {
    if (!antes.has(id)) return true
  }
  return false
}
