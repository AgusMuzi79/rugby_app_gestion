// Builds the `noticias` insert payload for a Subcomisión publication.
// Pure (no Supabase) so it can be checked with noticiaSubcomision.check.ts.
// The web panel keeps an identical copy in web/lib/noticiaSubcomision.ts.
//
// - Published immediately to every member (audiencia 'todos').
// - `cuerpo` is NOT NULL in the DB: a title-only noticia stores ''. That is
//   the "quick notification" case: only then members get a push with the
//   title (see debeNotificarNoticia). With a description or images the
//   noticia is just published in the feed, without a push.
// - Up to MAX_IMAGENES_NOTICIA images (`imagenes`, storage paths in order).
//   `imagen_path` keeps the first one for older readers.
// - `etiquetas` = [deporte] when the subcomisión has a sport, so it shows
//   under that sport filter in the member feed; otherwise no etiquetas.

export const MAX_IMAGENES_NOTICIA = 6

export const DEPORTES_NOTICIA = ['rugby', 'hockey', 'tenis'] as const
export type DeporteNoticia = typeof DEPORTES_NOTICIA[number]

export interface NoticiaSubcomisionInput {
  titulo:       string
  descripcion?: string | null
  deporte?:     string | null
  autorId:      string
  imagenes?:    string[] | null
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

// Subcomisión push rule: only a title-only noticia (blank cuerpo, no images)
// is a quick notice that sends a push.
export function debeNotificarNoticia(noticia: { cuerpo: string; imagenes: string[] }): boolean {
  return noticia.cuerpo.trim() === '' && noticia.imagenes.length === 0
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
    },
  }
}
