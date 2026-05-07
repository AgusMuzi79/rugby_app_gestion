export const ROLES = {
  SUBCOMISION: 'subcomision',
  COORDINADOR: 'coordinador',
  ENTRENADOR: 'entrenador',
  MANAGER: 'manager',
  ADMIN: 'admin',
} as const

export type Rol = (typeof ROLES)[keyof typeof ROLES]

export const ROL_LABELS: Record<Rol, string> = {
  subcomision: 'Subcomisión',
  coordinador: 'Coordinador',
  entrenador: 'Entrenador',
  manager: 'Manager',
  admin: 'Admin',
}

export const ROL_RUTA_INICIAL: Record<Rol, string> = {
  subcomision: '/(subcomision)/dashboard',
  coordinador: '/(coordinador)/calendario',
  entrenador: '/(entrenador)/asistencia',
  manager: '/(manager)/cobranzas',
  admin: '/(subcomision)/dashboard',
}
