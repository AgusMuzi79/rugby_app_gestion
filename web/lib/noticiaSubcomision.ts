// Builds the `noticias` insert payload for a Subcomisión publication.
// Copy of app/lib/noticiaSubcomision.ts (web does not import from app/).
// Keep both in sync; the behaviour is checked by app/lib/noticiaSubcomision.check.ts
// and web/lib/noticiaSubcomision.check.ts.
//
// - Published immediately to every member (audiencia 'todos').
// - `cuerpo` is NOT NULL in the DB: a title-only noticia stores ''.
// - Whether a push is sent is an explicit choice in the form ("Enviar
//   notificación a los socios", unchecked by default), not derived from the
//   payload.
// - Up to MAX_IMAGENES_NOTICIA images (`imagenes`, storage paths in order).
//   `imagen_path` keeps the first one for older readers.
// - `etiquetas` = [deporte] when the subcomisión has a sport, so it shows
//   under that sport filter in the member feed; otherwise no etiquetas.
// - "Destacar noticia" (unchecked by default): `destacada_hasta` = now +
//   DIAS_DESTACADA days, so the item goes first in the member feed until
//   then (see app/lib/ordenNoticias.ts); null when not featured.

export const MAX_IMAGENES_NOTICIA = 6
export const DIAS_DESTACADA = 7

const MS_POR_DIA = 24 * 60 * 60 * 1000

// End of the featured window for an item featured at `ahora` (ISO).
export function destacadaHasta(ahora: Date): string {
  return new Date(ahora.getTime() + DIAS_DESTACADA * MS_POR_DIA).toISOString()
}

export const DEPORTES_NOTICIA = ['rugby', 'hockey', 'tenis'] as const
export type DeporteNoticia = typeof DEPORTES_NOTICIA[number]

export interface NoticiaSubcomisionInput {
  titulo:       string
  descripcion?: string | null
  deporte?:     string | null
  autorId:      string
  imagenes?:    string[] | null
  destacar?:    boolean
  // Clock for `destacada_hasta` (defaults to now; injectable for checks).
  ahora?:       Date
}

export interface NoticiaSubcomisionPayload {
  titulo:      string
  cuerpo:      string
  etiquetas:   DeporteNoticia[]
  audiencia:   'todos'
  autor_id:    string
  publicada:   true
  imagen_path: string | null
  imagenes:    string[]
  destacada_hasta: string | null
}

export type NoticiaSubcomisionResult =
  | { ok: true;  payload: NoticiaSubcomisionPayload }
  | { ok: false; error: 'titulo_vacio' | 'sin_autor' | 'demasiadas_imagenes' }

export interface CamposImagenesNoticia {
  imagenes:    string[]
  imagen_path: string | null
}

// Storage paths -> the two image columns (imagen_path = first, for compat).
export function camposImagenesNoticia(paths: string[]): CamposImagenesNoticia {
  return { imagenes: [...paths], imagen_path: paths[0] ?? null }
}

// Storage paths of a stored noticia: `imagenes`, or the legacy single
// `imagen_path` for rows written before the column existed.
export function pathsImagenesNoticia(fila: { imagenes?: string[] | null; imagen_path?: string | null }): string[] {
  if (fila.imagenes && fila.imagenes.length > 0) return fila.imagenes
  return fila.imagen_path ? [fila.imagen_path] : []
}

function esDeporte(value: string | null | undefined): value is DeporteNoticia {
  return (DEPORTES_NOTICIA as readonly string[]).includes(value ?? '')
}

export function buildNoticiaSubcomision(input: NoticiaSubcomisionInput): NoticiaSubcomisionResult {
  const titulo = input.titulo.trim()
  if (!titulo) return { ok: false, error: 'titulo_vacio' }
  if (!input.autorId) return { ok: false, error: 'sin_autor' }
  const imagenes = input.imagenes ?? []
  if (imagenes.length > MAX_IMAGENES_NOTICIA) return { ok: false, error: 'demasiadas_imagenes' }

  return {
    ok: true,
    payload: {
      titulo,
      cuerpo:      (input.descripcion ?? '').trim(),
      etiquetas:   esDeporte(input.deporte) ? [input.deporte] : [],
      audiencia:   'todos',
      autor_id:    input.autorId,
      publicada:   true,
      ...camposImagenesNoticia(imagenes),
      destacada_hasta: input.destacar ? destacadaHasta(input.ahora ?? new Date()) : null,
    },
  }
}
