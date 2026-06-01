export const ROLES = {
  SUBCOMISION: 'subcomision',
  COORDINADOR: 'coordinador',
  ENTRENADOR:  'entrenador',
  MANAGER:     'manager',
  ADMIN:       'admin',
  SECRETARIA:  'secretaria',
  PORTERIA:    'porteria',
  SOCIO:       'socio',
} as const

export type Rol = (typeof ROLES)[keyof typeof ROLES]

export const ROL_LABELS: Record<Rol, string> = {
  subcomision: 'Subcomisión',
  coordinador: 'Coordinador',
  entrenador:  'Entrenador',
  manager:     'Manager',
  admin:       'Admin',
  secretaria:  'Secretaría',
  porteria:    'Portería',
  socio:       'Socio',
}

export const ROL_RUTA_INICIAL: Record<Rol, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador:  '/(entrenador)/diario',
  manager:     '/(manager)/diario',
  admin:       '/(subcomision)/diario',
  secretaria:  '/(secretaria)/diario',
  porteria:    '/(porteria)/scanner',
  socio:       '/(socio)/carnet',
}
