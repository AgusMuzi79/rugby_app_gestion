// Lógica pura del avatar de "Mi perfil" del Header (auditoría UX, T7): las
// iniciales cuando no hay foto, a qué ruta lleva según el grupo de rol activo
// y cuándo hay que volver a pedir la URL firmada de la foto.

// Grupos de rol con pantalla "sobre" (Mi perfil). (auth) e index no tienen.
const GRUPOS_CON_PERFIL = new Set([
  '(socio)', '(tutor)', '(cliente-gimnasio)', '(admin)', '(coordinador)',
  '(entrenador)', '(manager)', '(porteria)', '(secretaria)', '(subcomision)',
])

// La URL firmada de socios-fotos dura 3600 s; se renueva antes.
export const AVATAR_TTL_MS = 50 * 60 * 1000

export function inicialesNombre(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ''
  const primera = palabras[0][0]
  const ultima  = palabras.length > 1 ? palabras[palabras.length - 1][0] : ''
  return (primera + ultima).toLocaleUpperCase('es-AR')
}

export function rutaPerfil(segments: readonly string[]): string | null {
  const grupo = segments[0]
  if (!grupo || !GRUPOS_CON_PERFIL.has(grupo)) return null
  return `/${grupo}/sobre`
}

export function avatarVencido(cargadoAt: number | null, ahora: number): boolean {
  return cargadoAt === null || ahora - cargadoAt >= AVATAR_TTL_MS
}

// cargadoAt mide la edad de la URL firmada de la foto: sólo arranca de nuevo
// si cambia la foto o el usuario. Guardar sólo el nombre no la renueva.
export function nuevoCargadoAt(args: {
  anterior:     number | null
  mismoUsuario: boolean
  cambiaFoto:   boolean
  ahora:        number
}): number {
  if (!args.mismoUsuario || args.cambiaFoto || args.anterior === null) return args.ahora
  return args.anterior
}
