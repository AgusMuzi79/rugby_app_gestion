// Lógica pura de la pantalla de Usuarios (admin y subcomisión,
// components/shared/UsuariosScreen.tsx). Verificada en usuariosForm.check.ts.

import { EMAIL_RE, sinVacios, type Errores } from './validacionAuth'

// ── Formulario "Nuevo usuario" ──────────────────────────────────────────────
// Antes devolvía sólo el primer error en un banner al pie del modal (auditoría
// auth T15). Ahora cada campo tiene su error, con el patrón de validacionAuth
// (tocados + errores). Las divisiones no son obligatorias para ningún rol
// (ni acá ni en admin-usuarios): se pueden asignar después desde el detalle.

export type CampoNuevoUsuario = 'nombre' | 'email' | 'dni' | 'rol'
export const CAMPOS_NUEVO_USUARIO: readonly CampoNuevoUsuario[] = ['nombre', 'email', 'dni', 'rol']

function errorEmail(email: string): string | undefined {
  const limpio = email.trim().toLowerCase()
  if (!limpio) return 'Ingresá el email.'
  if (!EMAIL_RE.test(limpio)) return 'El email no es válido.'
  return undefined
}

// El DNI es la contraseña inicial; admin-usuarios guarda sólo los números,
// así que puntos, espacios y guiones se aceptan.
function errorDni(dni: string): string | undefined {
  const sinSeparadores = dni.replace(/[\s.-]/g, '')
  if (!sinSeparadores) return 'Ingresá el DNI.'
  if (!/^\d+$/.test(sinSeparadores)) return 'El DNI sólo lleva números.'
  return undefined
}

export function validarFormNuevoUsuario(
  v: { nombre: string; email: string; dni: string; rol: string | null },
): Errores<CampoNuevoUsuario> {
  return sinVacios<CampoNuevoUsuario>({
    nombre: v.nombre.trim() ? undefined : 'Ingresá el nombre completo.',
    email:  errorEmail(v.email),
    dni:    errorDni(v.dni),
    rol:    v.rol ? undefined : 'Seleccioná un rol.',
  })
}

// ── Detalle ─────────────────────────────────────────────────────────────────

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
