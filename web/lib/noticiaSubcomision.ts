// Builds the `noticias` insert payload for a Subcomisión publication.
// Copy of app/lib/noticiaSubcomision.ts (web does not import from app/).
// Keep both in sync; the behaviour is checked by app/lib/noticiaSubcomision.check.ts.
//
// - Published immediately to every member (audiencia 'todos').
// - `cuerpo` is NOT NULL in the DB: a title-only noticia stores ''. That is
//   the "quick notification" case (members still get a push with the title).
// - `etiquetas` = [deporte] when the subcomisión has a sport, so it shows
//   under that sport filter in the member feed; otherwise no etiquetas.

export const DEPORTES_NOTICIA = ['rugby', 'hockey', 'tenis'] as const
export type DeporteNoticia = typeof DEPORTES_NOTICIA[number]

export interface NoticiaSubcomisionInput {
  titulo:       string
  descripcion?: string | null
  deporte?:     string | null
  autorId:      string
  imagenPath?:  string | null
}

export interface NoticiaSubcomisionPayload {
  titulo:      string
  cuerpo:      string
  etiquetas:   DeporteNoticia[]
  audiencia:   'todos'
  autor_id:    string
  publicada:   true
  imagen_path: string | null
}

export type NoticiaSubcomisionResult =
  | { ok: true;  payload: NoticiaSubcomisionPayload }
  | { ok: false; error: 'titulo_vacio' | 'sin_autor' }

function esDeporte(value: string | null | undefined): value is DeporteNoticia {
  return (DEPORTES_NOTICIA as readonly string[]).includes(value ?? '')
}

export function buildNoticiaSubcomision(input: NoticiaSubcomisionInput): NoticiaSubcomisionResult {
  const titulo = input.titulo.trim()
  if (!titulo) return { ok: false, error: 'titulo_vacio' }
  if (!input.autorId) return { ok: false, error: 'sin_autor' }

  return {
    ok: true,
    payload: {
      titulo,
      cuerpo:      (input.descripcion ?? '').trim(),
      etiquetas:   esDeporte(input.deporte) ? [input.deporte] : [],
      audiencia:   'todos',
      autor_id:    input.autorId,
      publicada:   true,
      imagen_path: input.imagenPath ?? null,
    },
  }
}
