export const ROLES = {
  SUBCOMISION: 'subcomision',
  COORDINADOR: 'coordinador',
  ENTRENADOR:  'entrenador',
  MANAGER:     'manager',
  ADMIN:       'admin',
  SECRETARIA:  'secretaria',
  PORTERIA:    'porteria',
  CANCHERO:    'canchero',
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
  porteria:    'Lector',
  canchero:    'Canchero',
  socio:       'Socio',
}

// Canchero reusa hoy la misma pantalla de escaneo que Lector (mismo
// comportamiento, ver migración 20260910000001_rol_canchero) — cuando
// gane funcionalidad propia (turnos de cancha) puede pasar a tener su
// propio grupo de rutas.
export const ROL_RUTA_INICIAL: Record<Rol, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador:  '/(entrenador)/diario',
  manager:     '/(manager)/diario',
  admin:       '/(subcomision)/diario',
  secretaria:  '/(secretaria)/diario',
  porteria:    '/(porteria)/scanner',
  canchero:    '/(porteria)/scanner',
  socio:       '/(socio)/carnet',
}
