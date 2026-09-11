export const ROLES = {
  SUBCOMISION: 'subcomision',
  COORDINADOR: 'coordinador',
  ENTRENADOR:  'entrenador',
  MANAGER:     'manager',
  ADMIN:       'admin',
  SECRETARIA:  'secretaria',
  PORTERIA:    'porteria',
  CANCHERO:    'canchero',
  BUFFET:      'buffet',
  CLIENTE_GIMNASIO: 'cliente_gimnasio',
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
  buffet:      'Buffet',
  cliente_gimnasio: 'Cliente Gimnasio',
  socio:       'Socio',
}

// Canchero y Buffet reusan hoy la misma pantalla de escaneo que Lector
// (mismo comportamiento base, ver migraciones 20260910000001_rol_canchero
// y 20260910000002_rol_buffet_y_noticias) — Buffet además tiene una tab
// propia ("promos") dentro del mismo grupo de rutas para publicar noticias.
export const ROL_RUTA_INICIAL: Record<Rol, string> = {
  subcomision: '/(subcomision)/diario',
  coordinador: '/(coordinador)/diario',
  entrenador:  '/(entrenador)/diario',
  manager:     '/(manager)/diario',
  admin:       '/(subcomision)/diario',
  secretaria:  '/(secretaria)/diario',
  porteria:    '/(porteria)/scanner',
  canchero:    '/(porteria)/scanner',
  buffet:      '/(porteria)/scanner',
  cliente_gimnasio: '/(cliente-gimnasio)/carnet',
  socio:       '/(socio)/carnet',
}
