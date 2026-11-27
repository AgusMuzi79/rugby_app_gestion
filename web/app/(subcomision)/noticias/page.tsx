'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { errorTamano, prepararImagen } from '@/lib/imagenSubida'
import {
  buildNoticiaSubcomision,
  camposImagenesNoticia,
  debeNotificarNoticia,
  pathsImagenesNoticia,
  MAX_IMAGENES_NOTICIA,
} from '@/lib/noticiaSubcomision'

// Subcomisión noticias: optional images (up to MAX_IMAGENES_NOTICIA) uploaded
// first, in order, to 'noticias-imagenes' under {uid}/{timestamp}-{i}.{ext},
// then a single insert published immediately to every member. Only a
// title-only noticia sends the 'noticia_publicada' push (debeNotificarNoticia);
// with a description or images it is just published in the feed. Payload
// rules live in lib/noticiaSubcomision.ts.

interface ImagenElegida {
  file:    File
  preview: string // object URL, revoked when removed
}

interface Noticia {
  id:          string
  titulo:      string
  cuerpo:      string
  etiquetas:   string[]
  created_at:  string
  imagen_path: string | null
  // Storage paths (`imagenes`, or the legacy imagen_path) and their public URLs.
  imagenes:     string[]
  imagenesUrls: string[]
  autor_id:    string
  autor:       string
  publicada:   boolean
  audiencia:   string
}

const BUCKET = 'noticias-imagenes'
const LIMITE = 100

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SubcomisionNoticiasPage() {
  const [noticias, setNoticias]   = useState<Noticia[]>([])
  const [loading, setLoading]     = useState(true)
  const [listError, setListError] = useState('')
  const [deporte, setDeporte]     = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  // form
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [imagenes, setImagenes]       = useState<ImagenElegida[]>([])
  const [publicando, setPublicando]   = useState(false)
  const [formError, setFormError]     = useState('')
  const [aviso, setAviso]             = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Por defecto sólo las noticias propias; "VER TODAS" muestra las del club
  // (Secretaría, Buffet, otras disciplinas) sin poder borrarlas.
  const [uid, setUid]             = useState<string | null>(null)
  const [verTodas, setVerTodas]   = useState(false)
  // Número del último pedido: si se alterna VER TODAS rápido, una respuesta
  // vieja que llega tarde se descarta en vez de pisar la lista nueva.
  const pedidoRef = useRef(0)

  const fetchNoticias = useCallback(async (autorId: string | null, todas: boolean) => {
    const pedido = ++pedidoRef.current
    if (!todas && !autorId) { setListError('Sesión expirada.'); setLoading(false); return }
    let query = supabase
      .from('noticias')
      .select('id, titulo, cuerpo, etiquetas, created_at, imagen_path, imagenes, autor_id, publicada, audiencia, profiles!noticias_autor_id_fkey(nombre)')
      .order('created_at', { ascending: false })
      .limit(LIMITE)
    if (!todas && autorId) query = query.eq('autor_id', autorId)
    const { data, error } = await query
    if (pedido !== pedidoRef.current) return

    if (error) {
      setListError(error.message)
      setLoading(false)
      return
    }

    setListError('')
    setNoticias((data ?? []).map((n: Record<string, unknown>) => {
      const imagenPath = n.imagen_path as string | null
      const paths = pathsImagenesNoticia({ imagenes: n.imagenes as string[] | null, imagen_path: imagenPath })
      return {
        id:           n.id as string,
        titulo:       n.titulo as string,
        cuerpo:       n.cuerpo as string,
        etiquetas:    (n.etiquetas as string[] | null) ?? [],
        created_at:   n.created_at as string,
        imagen_path:  imagenPath,
        imagenes:     paths,
        imagenesUrls: paths.map(path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl),
        autor_id:     n.autor_id as string,
        autor:        (n.profiles as { nombre?: string } | null)?.nombre ?? '—',
        publicada:    n.publicada !== false,
        audiencia:    (n.audiencia as string | null) ?? 'todos',
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUid(user.id)
        const { data, error } = await supabase
          .from('profiles')
          .select('deporte')
          .eq('id', user.id)
          .single()
        if (error) setListError(error.message)
        else setDeporte((data?.deporte as string | null) ?? null)
      }
      await fetchNoticias(user?.id ?? null, false)
    }
    void cargar()
  }, [fetchNoticias])

  const alternarVerTodas = () => {
    const todas = !verTodas
    setVerTodas(todas)
    setLoading(true)
    void fetchNoticias(uid, todas)
  }

  const publicadas = noticias.filter(n => n.publicada).length

  const restantes = MAX_IMAGENES_NOTICIA - imagenes.length

  const handleElegirImagenes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegidos = Array.from(e.target.files ?? [])
    // Reset so the same file can be picked again after removing it.
    e.target.value = ''
    if (elegidos.length === 0) return
    // Más de 10 MB no se acepta; lo demás se achica antes de subir (lib/imagenSubida.ts).
    const validos = elegidos.filter(f => !errorTamano(f.size))
    const aceptados = validos.slice(0, Math.max(restantes, 0))
    const errores: string[] = []
    if (validos.length < elegidos.length) {
      errores.push(elegidos.length === 1
        ? (errorTamano(elegidos[0].size) ?? '')
        : 'Algunas imágenes pesan más de 10 MB y no se agregaron.')
    }
    if (aceptados.length < validos.length) {
      errores.push(`Podés agregar hasta ${MAX_IMAGENES_NOTICIA} imágenes; las demás no se agregaron.`)
    }
    setFormError(errores.join(' '))
    if (aceptados.length === 0) return
    setImagenes(prev => [...prev, ...aceptados.map(file => ({ file, preview: URL.createObjectURL(file) }))])
  }

  const quitarImagen = (indice: number) => {
    setImagenes(prev => {
      const quitada = prev[indice]
      if (quitada) URL.revokeObjectURL(quitada.preview)
      return prev.filter((_, i) => i !== indice)
    })
  }

  const quitarTodas = () => {
    setImagenes(prev => {
      prev.forEach(img => URL.revokeObjectURL(img.preview))
      return []
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleEliminar = async (noticia: Noticia) => {
    if (!confirm(`¿Eliminar "${noticia.titulo}"? Los socios dejan de verla.`)) return
    setAviso('')
    const { data, error } = await supabase.from('noticias').delete().eq('id', noticia.id).select('id')
    if (error) { setAviso(`No se pudo eliminar: ${error.message}`); return }
    if (!data || data.length === 0) {
      setAviso('No se eliminó: no tenés permiso o la noticia ya no existe.')
      await fetchNoticias(uid, verTodas)
      return
    }
    if (noticia.imagenes.length > 0) {
      // Orphan image cleanup only — the noticia is already gone.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(noticia.imagenes)
      if (rmErr) console.warn('noticias: image cleanup failed', rmErr.message)
    }
    setNoticias(ns => ns.filter(n => n.id !== noticia.id))
  }

  const closeModal = () => {
    setShowModal(false)
    setTitulo(''); setDescripcion(''); setFormError('')
    quitarTodas()
  }

  const handlePublicar = async () => {
    setFormError(''); setAviso('')

    const { data: { user } } = await supabase.auth.getUser()
    // The local files only count here; the payload gets the storage paths below.
    const validacion = buildNoticiaSubcomision({
      titulo, descripcion, deporte, autorId: user?.id ?? '', imagenes: imagenes.map(img => img.file.name),
    })
    if (!validacion.ok) {
      setFormError(validacion.error === 'titulo_vacio'
        ? 'El título es obligatorio.'
        : validacion.error === 'demasiadas_imagenes'
          ? `Podés agregar hasta ${MAX_IMAGENES_NOTICIA} imágenes.`
          : 'Sesión expirada.')
      return
    }
    const autorId = validacion.payload.autor_id

    setPublicando(true)

    // Upload in order; if one fails, remove the ones already uploaded (best
    // effort) so no orphan files are left.
    const subidas: string[] = []
    const limpiarSubidas = async () => {
      if (subidas.length === 0) return
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(subidas)
      if (rmErr) console.warn('noticias: image cleanup failed', rmErr.message)
    }
    const inicio = Date.now()
    for (const [i, img] of imagenes.entries()) {
      const subir = await prepararImagen(img.file)
      const ext  = subir.name.split('.').pop() ?? 'jpg'
      const path = `${autorId}/${inicio}-${i}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, subir, { contentType: subir.type })
      if (uploadErr) {
        await limpiarSubidas()
        setFormError(imagenes.length > 1
          ? `No se pudo subir la imagen ${i + 1} de ${imagenes.length}.`
          : 'No se pudo subir la imagen.')
        setPublicando(false)
        return
      }
      subidas.push(path)
    }

    const fila = { ...validacion.payload, ...camposImagenesNoticia(subidas) }
    const { data, error } = await supabase
      .from('noticias')
      .insert(fila)
      .select('id')
      .single()

    if (error || !data) {
      setFormError(error?.message ?? 'No se pudo publicar la noticia.')
      await limpiarSubidas()
      setPublicando(false)
      return
    }

    // Only a title-only noticia is a quick notice with a push. The noticia is
    // already published; a push failure is reported but does not undo it.
    if (debeNotificarNoticia(fila)) {
      const { error: pushErr } = await supabase.functions.invoke('notifications', {
        body: {
          type: 'noticia_publicada',
          payload: { titulo: fila.titulo, noticiaId: data.id, audiencia: 'todos' },
        },
      })
      if (pushErr) setAviso('La noticia se publicó, pero no se pudo enviar la notificación a los socios.')
    }

    await fetchNoticias(uid, verTodas)
    setPublicando(false)
    closeModal()
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Noticias</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {publicadas}{noticias.length >= LIMITE ? '+' : ''} publicadas{verTodas ? ' en el club' : ' por vos'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={alternarVerTodas}
            aria-pressed={verTodas}
            className={`font-lora text-xs tracking-widest px-5 py-3 border transition-colors ${
              verTodas ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-texto-2 hover:border-tinta/30'
            }`}
          >
            VER TODAS
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
          >
            + NUEVA NOTICIA
          </button>
        </div>
      </div>

      {verTodas && (
        <p className="font-lora text-xs text-texto-2 italic mb-4">
          Estás viendo todas las noticias del club. Sólo podés eliminar las tuyas.
        </p>
      )}

      {aviso && <p role="alert" className="font-lora text-rojo-texto text-sm mb-4">{aviso}</p>}

      {loading ? (
        <p className="font-lora text-texto-2 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : listError ? (
        <div className="border border-gris-claro p-8 text-center">
          <p role="alert" className="font-lora text-rojo-texto text-sm">No se pudieron cargar las noticias: {listError}</p>
        </div>
      ) : noticias.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-texto-2 text-sm tracking-widest">SIN NOTICIAS TODAVÍA</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {noticias.map(n => (
            <div key={n.id} className="border-b border-gris-claro py-5 flex gap-4 items-start hover:bg-gris-claro/20 transition-colors px-2">
              {n.imagenesUrls[0] && (
                <a
                  href={n.imagenesUrls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative shrink-0 focus-visible:outline-2 focus-visible:outline-oro focus-visible:outline-offset-2"
                  aria-label={n.imagenesUrls.length > 1
                    ? `Abrir la primera de ${n.imagenesUrls.length} imágenes en una pestaña nueva`
                    : 'Abrir la imagen en una pestaña nueva'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.imagenesUrls[0]} alt="" loading="lazy" width={64} height={64} className="w-16 h-16 object-cover" />
                  {n.imagenesUrls.length > 1 && (
                    <span className="absolute bottom-0 right-0 font-lora text-[11px] leading-none bg-oro text-papel px-1.5 py-1">
                      {n.imagenesUrls.length}
                    </span>
                  )}
                </a>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="font-lora text-sm text-tinta leading-snug">{n.titulo}</p>
                  {!n.publicada && (
                    <span className="font-lora text-[11px] tracking-widest text-tinta border border-borde-control px-1.5 py-0.5">BORRADOR</span>
                  )}
                  {n.audiencia === 'cuerpo_tecnico' && (
                    <span className="font-lora text-[11px] tracking-widest text-tinta bg-gris-claro px-1.5 py-0.5">CUERPO TÉCNICO</span>
                  )}
                </div>
                {n.cuerpo && <p className="font-lora text-xs text-tinta/50 mb-1 line-clamp-2">{n.cuerpo}</p>}
                <p className="font-lora text-xs text-texto-2">
                  {fechaCorta(n.created_at)} · {n.autor}
                  {n.etiquetas.length > 0 && ` · ${n.etiquetas.join(', ').toUpperCase()}`}
                </p>
              </div>
              {n.autor_id === uid && (
                <button
                  onClick={() => handleEliminar(n)}
                  className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo-texto hover:border-rojo hover:text-rojo-texto transition-colors shrink-0"
                >
                  ELIMINAR
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva noticia */}
      {showModal && (
        <Modal titulo="NUEVA NOTICIA" onClose={closeModal}>
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="noticia-titulo" className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">TÍTULO</label>
              <input
                id="noticia-titulo"
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                maxLength={120}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-borde-control py-2 outline-none focus:border-oro transition-colors"
                placeholder="Ej: Se suspende el entrenamiento del sábado"
              />
            </div>

            <div>
              <label htmlFor="noticia-descripcion" className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">DESCRIPCIÓN (OPCIONAL)</label>
              <textarea
                id="noticia-descripcion"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={5}
                className="w-full font-lora text-sm text-tinta bg-transparent border border-borde-control p-3 outline-none focus:border-oro transition-colors resize-none"
                placeholder="Contá los detalles…"
              />
            </div>

            <div>
              <p className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">
                IMÁGENES (OPCIONAL, HASTA {MAX_IMAGENES_NOTICIA})
              </p>
              {imagenes.length > 0 && (
                <ul className="grid grid-cols-3 gap-3 mb-3">
                  {imagenes.map((img, i) => (
                    <li key={img.preview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt={`Imagen ${i + 1}`} className="w-full aspect-square object-cover" />
                      <button
                        type="button"
                        onClick={() => quitarImagen(i)}
                        aria-label={`Quitar imagen ${i + 1}`}
                        className="font-lora text-xs tracking-widest text-rojo-texto hover:text-rojo-texto mt-1"
                      >
                        QUITAR
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {restantes > 0 && (
                // sr-only en vez de hidden: el input sigue alcanzable con Tab, y
                // el foco se ve en la etiqueta que hace de botón.
                <label className="flex items-center justify-center border border-dashed border-gris-claro py-6 cursor-pointer hover:border-tinta/40 transition-colors focus-within:outline-2 focus-within:outline-oro focus-within:outline-offset-2">
                  <span className="font-lora text-xs tracking-widest text-oro">
                    {imagenes.length === 0 ? '+ AGREGAR IMÁGENES' : `+ AGREGAR MÁS (QUEDAN ${restantes})`}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleElegirImagenes}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>

          {formError && <p role="alert" className="font-lora text-rojo-texto text-sm mt-4">{formError}</p>}

          <p className="font-lora text-xs text-texto-2 italic mt-4">
            Se publica en el momento para todos los socios
            {deporte ? ` (aparece en la sección ${deporte.toUpperCase()})` : ''}. Si sólo completás el
            título, funciona como un aviso rápido y les llega una notificación. Con descripción o
            imágenes se publica en Noticias sin notificar.
          </p>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handlePublicar}
              disabled={publicando || !titulo.trim()}
              className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
            >
              {publicando ? 'PUBLICANDO…' : 'PUBLICAR'}
            </button>
            <button
              onClick={closeModal}
              className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors"
            >
              CANCELAR
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
