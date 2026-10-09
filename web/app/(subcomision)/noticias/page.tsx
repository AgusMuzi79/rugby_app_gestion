'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildNoticiaSubcomision } from '@/lib/noticiaSubcomision'

// Subcomisión noticias: same flow as the Buffet promos page — optional image
// uploaded first to 'noticias-imagenes' under {uid}/{timestamp}.{ext}, then a
// single insert published immediately to every member, then the
// 'noticia_publicada' push with the title. Payload rules live in
// lib/noticiaSubcomision.ts.

interface Noticia {
  id:          string
  titulo:      string
  cuerpo:      string
  etiquetas:   string[]
  created_at:  string
  imagen_path: string | null
  imagenUrl:   string | null
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
  const [imagenFile, setImagenFile]   = useState<File | null>(null)
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [publicando, setPublicando]   = useState(false)
  const [formError, setFormError]     = useState('')
  const [aviso, setAviso]             = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchNoticias = useCallback(async () => {
    const { data, error } = await supabase
      .from('noticias')
      .select('id, titulo, cuerpo, etiquetas, created_at, imagen_path')
      .order('created_at', { ascending: false })
      .limit(LIMITE)

    if (error) {
      setListError(error.message)
      setLoading(false)
      return
    }

    setListError('')
    setNoticias((data ?? []).map((n: Record<string, unknown>) => ({
      id:          n.id as string,
      titulo:      n.titulo as string,
      cuerpo:      n.cuerpo as string,
      etiquetas:   (n.etiquetas as string[] | null) ?? [],
      created_at:  n.created_at as string,
      imagen_path: n.imagen_path as string | null,
      imagenUrl:   n.imagen_path
        ? supabase.storage.from(BUCKET).getPublicUrl(n.imagen_path as string).data.publicUrl
        : null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('deporte')
          .eq('id', user.id)
          .single()
        if (error) setListError(error.message)
        else setDeporte((data?.deporte as string | null) ?? null)
      }
      await fetchNoticias()
    }
    void cargar()
  }, [fetchNoticias])

  const handleElegirImagen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImagenFile(file)
    setImagenPreview(URL.createObjectURL(file))
  }

  const quitarImagen = () => {
    setImagenFile(null)
    setImagenPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleEliminar = async (noticia: Noticia) => {
    if (!confirm(`¿Eliminar "${noticia.titulo}"? Los socios dejan de verla.`)) return
    setAviso('')
    const { data, error } = await supabase.from('noticias').delete().eq('id', noticia.id).select('id')
    if (error) { setAviso(`No se pudo eliminar: ${error.message}`); return }
    if (!data || data.length === 0) {
      setAviso('No se eliminó: no tenés permiso o la noticia ya no existe.')
      await fetchNoticias()
      return
    }
    if (noticia.imagen_path) {
      // Orphan image cleanup only — the noticia is already gone.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([noticia.imagen_path])
      if (rmErr) console.warn('noticias: image cleanup failed', rmErr.message)
    }
    setNoticias(ns => ns.filter(n => n.id !== noticia.id))
  }

  const closeModal = () => {
    setShowModal(false)
    setTitulo(''); setDescripcion(''); setFormError('')
    quitarImagen()
  }

  const handlePublicar = async () => {
    setFormError(''); setAviso('')

    const { data: { user } } = await supabase.auth.getUser()
    const validacion = buildNoticiaSubcomision({ titulo, descripcion, deporte, autorId: user?.id ?? '' })
    if (!validacion.ok) {
      setFormError(validacion.error === 'titulo_vacio' ? 'El título es obligatorio.' : 'Sesión expirada.')
      return
    }
    const autorId = validacion.payload.autor_id

    setPublicando(true)

    let imagenPath: string | null = null
    if (imagenFile) {
      const ext  = imagenFile.name.split('.').pop() ?? 'jpg'
      const path = `${autorId}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, imagenFile, { contentType: imagenFile.type })
      if (uploadErr) { setFormError('No se pudo subir la imagen.'); setPublicando(false); return }
      imagenPath = path
    }

    const { data, error } = await supabase
      .from('noticias')
      .insert({ ...validacion.payload, imagen_path: imagenPath })
      .select('id')
      .single()

    if (error || !data) {
      setFormError(error?.message ?? 'No se pudo publicar la noticia.')
      if (imagenPath) await supabase.storage.from(BUCKET).remove([imagenPath])
      setPublicando(false)
      return
    }

    // The noticia is already published; a push failure is reported but does
    // not undo it.
    const { error: pushErr } = await supabase.functions.invoke('notifications', {
      body: {
        type: 'noticia_publicada',
        payload: { titulo: validacion.payload.titulo, noticiaId: data.id, audiencia: 'todos' },
      },
    })
    if (pushErr) setAviso('La noticia se publicó, pero no se pudo enviar la notificación a los socios.')

    await fetchNoticias()
    setPublicando(false)
    closeModal()
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Noticias</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">{noticias.length} publicadas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVA NOTICIA
        </button>
      </div>

      {aviso && <p className="font-lora text-rojo text-sm mb-4">{aviso}</p>}

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : listError ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-rojo text-sm">No se pudieron cargar las noticias: {listError}</p>
        </div>
      ) : noticias.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN NOTICIAS TODAVÍA</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {noticias.map(n => (
            <div key={n.id} className="border-b border-gris-claro py-5 flex gap-4 items-start hover:bg-gris-claro/20 transition-colors px-2">
              {n.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.imagenUrl} alt="" className="w-16 h-16 object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-lora text-sm text-tinta leading-snug mb-1">{n.titulo}</p>
                {n.cuerpo && <p className="font-lora text-xs text-tinta/50 mb-1 line-clamp-2">{n.cuerpo}</p>}
                <p className="font-lora text-xs text-tinta/40">
                  {fechaCorta(n.created_at)}
                  {n.etiquetas.length > 0 && ` · ${n.etiquetas.join(', ').toUpperCase()}`}
                </p>
              </div>
              <button
                onClick={() => handleEliminar(n)}
                className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo/60 hover:border-rojo hover:text-rojo transition-colors shrink-0"
              >
                ELIMINAR
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva noticia */}
      {showModal && (
        <div className="fixed inset-0 bg-dark/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <p className="font-lora text-xs tracking-widest text-tinta/60">NUEVA NOTICIA</p>
              <button onClick={closeModal} className="text-tinta/40 hover:text-tinta text-xl leading-none">×</button>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">TÍTULO</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  maxLength={120}
                  className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                  placeholder="Ej: Se suspende el entrenamiento del sábado"
                />
              </div>

              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">DESCRIPCIÓN (OPCIONAL)</label>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  rows={5}
                  className="w-full font-lora text-sm text-tinta bg-transparent border border-gris-claro p-3 outline-none focus:border-oro transition-colors resize-none"
                  placeholder="Contá los detalles…"
                />
              </div>

              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">IMAGEN (OPCIONAL)</label>
                {imagenPreview ? (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagenPreview} alt="" className="w-full aspect-[4/3] object-cover" />
                    <button
                      type="button"
                      onClick={quitarImagen}
                      className="font-lora text-xs tracking-widest text-rojo/70 hover:text-rojo mt-2"
                    >
                      QUITAR
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center border border-dashed border-gris-claro py-6 cursor-pointer hover:border-tinta/40 transition-colors">
                    <span className="font-lora text-xs tracking-widest text-oro">+ AGREGAR IMAGEN</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleElegirImagen}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {formError && <p className="font-lora text-rojo text-sm mt-4">{formError}</p>}

            <p className="font-lora text-xs text-tinta/40 italic mt-4">
              Se publica en el momento para todos los socios
              {deporte ? ` (aparece en la sección ${deporte.toUpperCase()})` : ''} y les llega una
              notificación con el título. Si sólo completás el título, funciona como un aviso rápido.
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
          </div>
        </div>
      )}
    </div>
  )
}
