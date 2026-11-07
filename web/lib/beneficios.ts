// Pure helpers for the Beneficios web panel (club benefits, table
// `public.beneficios`, migration 20261110000000_club_beneficios). Checked in
// beneficios.check.ts.
//
// The web does not import from app/: RUBROS is a copy of app/lib/beneficios.ts.
// Keep both in sync with the CHECK constraint `beneficios_rubro_check`.

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

export const BUCKET_BENEFICIOS = 'beneficios'

export function labelRubro(rubro: string): string {
  return RUBROS.find(r => r.value === rubro)?.label ?? rubro
}

/** A row of `beneficios` as the panel reads it. */
export interface BeneficioFila {
  id: string
  nombre: string
  rubro: string
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
}

export type EstadoBeneficio = 'activo' | 'pausado' | 'vencido' | 'programado'

export const ESTADO_LABEL: Record<EstadoBeneficio, string> = {
  activo: 'ACTIVO', pausado: 'PAUSADO', vencido: 'VENCIDO', programado: 'PROGRAMADO',
}

/**
 * What socios see today: paused (activo = false) wins over the dates; then
 * expired (hasta < hoy) or scheduled (desde > hoy). Bounds are inclusive and
 * `hoy` is the Argentina calendar date 'YYYY-MM-DD' (hoyArgentina).
 */
export function estadoBeneficio(
  b: Pick<BeneficioFila, 'activo' | 'vigente_desde' | 'vigente_hasta'>,
  hoy: string,
): EstadoBeneficio {
  if (!b.activo) return 'pausado'
  if (b.vigente_hasta && b.vigente_hasta.slice(0, 10) < hoy) return 'vencido'
  if (b.vigente_desde && b.vigente_desde.slice(0, 10) > hoy) return 'programado'
  return 'activo'
}

/** Today's date in Argentina as 'YYYY-MM-DD', whatever the browser's time zone. */
export function hoyArgentina(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** Featured first, then `orden` ascending, then name (Spanish collation). Same order as the app. */
export function ordenarBeneficios<T extends Pick<BeneficioFila, 'destacado' | 'orden' | 'nombre'>>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.destacado !== b.destacado) return a.destacado ? -1 : 1
    if (a.orden !== b.orden) return a.orden - b.orden
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

// ─── Form ────────────────────────────────────────────────────────────────────

const CAMPOS_TEXTO = [
  'nombre', 'rubro', 'descuento', 'descripcion', 'condiciones', 'direccion', 'zona',
  'telefono_whatsapp', 'instagram', 'sitio_web', 'vigente_desde', 'vigente_hasta',
] as const

type CampoTexto = (typeof CAMPOS_TEXTO)[number]

/** Form state: every text input as a string ('' = empty), orden as typed. */
export type FormBeneficio = Record<CampoTexto, string> & {
  orden: string
  destacado: boolean
  activo: boolean
}

export function formVacio(): FormBeneficio {
  const f = Object.fromEntries(CAMPOS_TEXTO.map(c => [c, ''])) as Record<CampoTexto, string>
  return { ...f, orden: '0', destacado: false, activo: true }
}

export function formDesdeBeneficio(b: Omit<BeneficioFila, 'logo_url' | 'imagen_url' | 'id'> & Partial<BeneficioFila>): FormBeneficio {
  const f = Object.fromEntries(CAMPOS_TEXTO.map(c => [c, (b[c] ?? '').slice(0, c.startsWith('vigente') ? 10 : undefined)])) as Record<CampoTexto, string>
  return { ...f, orden: String(b.orden ?? 0), destacado: b.destacado, activo: b.activo }
}

/** First validation error in Spanish, or null when the form can be saved. */
export function validarBeneficio(f: FormBeneficio): string | null {
  if (!f.nombre.trim()) return 'El nombre del local es obligatorio.'
  if (!RUBROS.some(r => r.value === f.rubro)) return 'Elegí un rubro.'
  if (!f.descuento.trim()) return 'El descuento es obligatorio.'
  if (f.vigente_desde && f.vigente_hasta && f.vigente_desde > f.vigente_hasta) {
    return 'La fecha "vigente desde" no puede ser posterior a "vigente hasta".'
  }
  if (f.orden.trim() && !/^-?\d+$/.test(f.orden.trim())) return 'El orden tiene que ser un número entero.'
  return null
}

export type DatosBeneficio = Omit<BeneficioFila, 'id' | 'logo_url' | 'imagen_url'>

/** Insert / update payload (without images): trimmed text, blanks as null. */
export function datosBeneficio(f: FormBeneficio): DatosBeneficio {
  const texto = (c: CampoTexto) => f[c].trim() || null
  return {
    nombre:            f.nombre.trim(),
    rubro:             f.rubro,
    descuento:         f.descuento.trim(),
    descripcion:       texto('descripcion'),
    condiciones:       texto('condiciones'),
    direccion:         texto('direccion'),
    zona:              texto('zona'),
    telefono_whatsapp: texto('telefono_whatsapp'),
    instagram:         texto('instagram'),
    sitio_web:         texto('sitio_web'),
    destacado:         f.destacado,
    orden:             f.orden.trim() ? Number(f.orden.trim()) : 0,
    activo:            f.activo,
    vigente_desde:     texto('vigente_desde'),
    vigente_hasta:     texto('vigente_hasta'),
  }
}

// ─── Images ──────────────────────────────────────────────────────────────────

/** Object path inside `bucket` for one of its public URLs; null for any other URL. */
export function rutaDesdeUrlPublica(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null
  const marca = `/storage/v1/object/public/${bucket}/`
  const i = url.indexOf(marca)
  if (i === -1) return null
  const ruta = url.slice(i + marca.length).split(/[?#]/)[0]
  try {
    return decodeURIComponent(ruta) || null
  } catch {
    return null
  }
}

// Bucket limits (migration 20261110000000): 5 MB, jpeg / png / webp.
const TIPOS_IMAGEN: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const BYTES_MAXIMOS_BUCKET = 5 * 1024 * 1024

/** Error for the file that is about to be uploaded (after prepararImagen), or null. */
export function errorImagen(file: { type: string; size: number }): string | null {
  if (!TIPOS_IMAGEN[file.type]) return 'Formato no admitido. Usá una imagen JPG, PNG o WEBP.'
  if (file.size > BYTES_MAXIMOS_BUCKET) return 'La imagen pesa más de 5 MB. Elegí una más liviana.'
  return null
}

export function extensionImagen(tipo: string): string {
  return TIPOS_IMAGEN[tipo] ?? 'jpg'
}
