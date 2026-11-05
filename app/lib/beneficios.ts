// Pure helpers for the club benefits ("Club de beneficios"). No Supabase / RN
// imports so it can be checked with `npx tsx lib/beneficios.check.ts`.
//
// The table is `public.beneficios` (migration 20261110000000_club_beneficios).
// RLS already hides inactive / expired rows from socios and tutors; the client
// filter (esVigente) is a second guard for cached data and for admin sessions.

// Keep in sync with the CHECK constraint `beneficios_rubro_check`.
export const RUBROS = [
  { value: 'gastronomia',  label: 'Gastronomía' },
  { value: 'deportes',     label: 'Deportes' },
  { value: 'salud',        label: 'Salud' },
  { value: 'belleza',      label: 'Belleza' },
  { value: 'indumentaria', label: 'Indumentaria' },
  { value: 'educacion',    label: 'Educación' },
  { value: 'servicios',    label: 'Servicios' },
  { value: 'otros',        label: 'Otros' },
] as const

export type Rubro = (typeof RUBROS)[number]['value']

export type Beneficio = {
  id: string
  nombre: string
  rubro: Rubro
  descuento: string
  descripcion: string | null
  condiciones: string | null
  direccion: string | null
  zona: string | null
  telefono_whatsapp: string | null
  instagram: string | null
  sitio_web: string | null
  logo_url: string | null
  imagen_url: string | null
  destacado: boolean
  orden: number
  activo: boolean
  vigente_desde: string | null // 'YYYY-MM-DD'
  vigente_hasta: string | null // 'YYYY-MM-DD'
  created_at: string
  updated_at: string
}

export function labelRubro(rubro: string): string {
  return RUBROS.find(r => r.value === rubro)?.label ?? rubro
}

/**
 * Active and within its validity window (both bounds inclusive, null = open).
 * `hoyISO` is the local (Argentina) calendar date, 'YYYY-MM-DD' — e.g. from
 * `fechaLocal()` in lib/fecha.ts; only the first 10 characters of each value are compared.
 */
export function esVigente(
  b: Pick<Beneficio, 'activo' | 'vigente_desde' | 'vigente_hasta'>,
  hoyISO: string,
): boolean {
  if (!b.activo) return false
  const hoy = hoyISO.slice(0, 10)
  if (b.vigente_desde && b.vigente_desde.slice(0, 10) > hoy) return false
  if (b.vigente_hasta && b.vigente_hasta.slice(0, 10) < hoy) return false
  return true
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export type FiltroBeneficios = {
  rubro?: Rubro | null
  busqueda?: string | null
}

/** Filters by rubro and a free-text search over nombre, rubro label, zona and descuento. */
export function filtrarBeneficios<T extends Beneficio>(lista: readonly T[], filtro: FiltroBeneficios): T[] {
  const q = normalizar(filtro.busqueda ?? '')
  return lista.filter(b => {
    if (filtro.rubro && b.rubro !== filtro.rubro) return false
    if (!q) return true
    const texto = normalizar([b.nombre, labelRubro(b.rubro), b.zona ?? '', b.descuento].join(' '))
    return texto.includes(q)
  })
}

/** Featured first, then `orden` ascending, then name (Spanish collation). Returns a new array. */
export function ordenarBeneficios<T extends Beneficio>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.destacado !== b.destacado) return a.destacado ? -1 : 1
    if (a.orden !== b.orden) return a.orden - b.orden
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

export function urlMaps(direccion: string | null | undefined): string | null {
  const d = direccion?.trim()
  if (!d) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d)}`
}

// Drops the mobile "15" prefix that follows the area code (2 to 4 digits) in
// local notation: area + 15 + subscriber = 12 digits -> area + subscriber = 10.
function sinQuince(nacional: string): string {
  if (nacional.length !== 12) return nacional
  for (const k of [2, 3, 4]) {
    if (nacional.slice(k, k + 2) === '15') return nacional.slice(0, k) + nacional.slice(k + 2)
  }
  return nacional
}

/**
 * wa.me link for an Argentine mobile number. Assumes every partner number is
 * Argentine: accepts international (+54 9 ..., +54 ... without the 9), local
 * with trunk 0 and/or the "15" mobile prefix, or the bare 10-digit national
 * number. Anything that does not end up as 10 national digits returns null.
 */
export function urlWhatsapp(telefono: string | null | undefined): string | null {
  let d = (telefono ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  } else if (d.startsWith('0')) {
    d = d.slice(1)
  }
  d = sinQuince(d)
  if (d.length !== 10) return null
  return `https://wa.me/549${d}`
}

const HANDLE_IG = /^[A-Za-z0-9._]{1,30}$/

/** Accepts '@handle', 'handle' or an instagram.com URL; returns the profile URL. */
export function urlInstagram(handleOrUrl: string | null | undefined): string | null {
  let s = (handleOrUrl ?? '').trim()
  if (!s) return null
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i)
  if (m) s = m[1]
  s = s.replace(/^@/, '')
  if (!HANDLE_IG.test(s)) return null
  return `https://www.instagram.com/${s}/`
}
