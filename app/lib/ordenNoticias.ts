// Order of the member news feed (socio / tutor). Pure, checked by
// ordenNoticias.check.ts.
//
// A noticia is featured while `destacada_hasta` is in the future (Subcomisión
// ticks "Destacar noticia", see lib/noticiaSubcomision.ts). Featured items go
// first, most recent first among them; the rest follow by created_at desc.
// Once the window ends the item falls back to its date position.

export interface NoticiaOrdenable {
  created_at:      string
  destacada_hasta: string | null
}

export function estaDestacada(n: { destacada_hasta: string | null }, ahora: Date): boolean {
  if (!n.destacada_hasta) return false
  return new Date(n.destacada_hasta).getTime() > ahora.getTime()
}

// Returns a new array (the input is not mutated). Array.prototype.sort is
// stable, so items with the same rank and created_at keep their input order.
export function ordenarNoticiasFeed<T extends NoticiaOrdenable>(noticias: readonly T[], ahora: Date): T[] {
  return noticias
    .map(n => ({ n, destacada: estaDestacada(n, ahora), t: new Date(n.created_at).getTime() }))
    .sort((a, b) => {
      if (a.destacada !== b.destacada) return a.destacada ? -1 : 1
      return b.t - a.t
    })
    .map(x => x.n)
}
