// Mensajes legibles para los errores de Supabase / PostgREST al GUARDAR
// (auditoría entrenador-coordinador T20). La pantalla nunca muestra
// `error.message`: llega en inglés y con nombres de tablas y constraints.
// Para errores al LEER se usa mensajeErrorCarga (errorCarga.ts).
// Lógica pura, verificada en mensajeError.check.ts.

import { SIN_CONEXION } from './errorFunction'
import { esErrorDeRed } from './offlineSync'

export const SIN_PERMISO = 'No tenés permiso para hacer esto.'
export const DATOS_INVALIDOS = 'Revisá los datos.'

// 42501: RLS / privilegios. PGRST301-303: JWT inválido, vencido o sin rol.
const CODIGOS_PERMISO = new Set(['42501', 'PGRST301', 'PGRST302', 'PGRST303'])
// 22023: parámetro inválido (lo usan los RPC propios). 23514: check constraint.
const CODIGOS_INVALIDO = new Set(['22023', '23514'])

export interface MensajesPropios {
  /** Para una violación de unique (23505). Sin él, el por defecto. */
  duplicado?: string
  /** Para un dato rechazado (22023 / 23514). Sin él, "Revisá los datos." */
  invalido?: string
}

export function mensajeError(err: unknown, porDefecto: string, propios: MensajesPropios = {}): string {
  if (!err) return porDefecto
  if (esErrorDeRed(err)) return SIN_CONEXION
  const code = typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code ?? '') : ''
  if (CODIGOS_PERMISO.has(code)) return SIN_PERMISO
  if (code === '23505') return propios.duplicado ?? porDefecto
  if (CODIGOS_INVALIDO.has(code)) return propios.invalido ?? DATOS_INVALIDOS
  return porDefecto
}
