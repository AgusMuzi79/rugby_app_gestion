// Shared helpers for the "tutor de menores" feature (migration 20261009000000_tutor_menores).
//
// A tutor is an adult who is NOT a club member (no `socios` row), linked to one or more minors
// through `tutores_menores`. Edge Functions run with service_role, so they resolve the link here
// instead of relying on RLS.

import { supabaseAdmin } from './supabase-admin.ts'

const IN_CHUNK_SIZE = 100

// Synthetic emails assigned by the padrón importer: socio-{numero_socio}@uncas.local.
export function esMailSintetico(email: string | null | undefined): boolean {
  return !email || email.toLowerCase().endsWith('@uncas.local')
}

export function mailSintetico(numeroSocio: string): string {
  return `socio-${numeroSocio}@uncas.local`
}

// Same threshold and formula as esMenorDe13 in socios-qr and es_menor_de_13() in SQL.
export function esMenorDe13(fechaNacimiento: string | null): boolean {
  if (!fechaNacimiento) return false
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - 13)
  return new Date(fechaNacimiento) > limite
}

// true when the date is at least `anios` years ago (inclusive of the birthday itself).
export function tieneAlMenosAnios(fechaNacimiento: string, anios: number): boolean {
  const nacimiento = new Date(fechaNacimiento)
  if (Number.isNaN(nacimiento.getTime())) return false
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - anios)
  return nacimiento <= limite
}

// Whether `tutorProfileId` is linked to `socioId` in tutores_menores.
export async function esTutorDe(tutorProfileId: string, socioId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('tutores_menores')
    .select('id')
    .eq('tutor_profile_id', tutorProfileId)
    .eq('socio_id', socioId)
    .limit(1)
  if (error) {
    console.error('esTutorDe:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

// socio_id -> active tutor profile ids. Chunked so large socio lists stay under URL limits.
// Errors are logged and yield an empty result for that chunk: a tutor lookup failure must never
// block the original recipients of a notification.
export async function tutoresPorSocio(socioIds: string[]): Promise<Map<string, string[]>> {
  const porSocio = new Map<string, string[]>()
  const unicos = [...new Set(socioIds.filter(Boolean))]
  for (let i = 0; i < unicos.length; i += IN_CHUNK_SIZE) {
    const chunk = unicos.slice(i, i + IN_CHUNK_SIZE)
    const { data, error } = await supabaseAdmin
      .from('tutores_menores')
      .select('socio_id, tutor_profile_id, profiles!inner(activo)')
      .in('socio_id', chunk)
      .eq('profiles.activo', true)
    if (error) {
      console.error('tutoresPorSocio:', error.message)
      continue
    }
    for (const row of data ?? []) {
      const socioId = row.socio_id as string
      const arr = porSocio.get(socioId) ?? []
      arr.push(row.tutor_profile_id as string)
      porSocio.set(socioId, arr)
    }
  }
  return porSocio
}

// Flat, deduplicated list of active tutor profile ids for the given socios.
export async function tutorProfileIds(socioIds: string[]): Promise<string[]> {
  const porSocio = await tutoresPorSocio(socioIds)
  return [...new Set([...porSocio.values()].flat())]
}
