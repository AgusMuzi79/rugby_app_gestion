'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Promo {
  id:          string
  titulo:      string
  cuerpo:      string
  created_at:  string
  imagen_path: string | null
  imagenUrl:   string | null
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BuffetPromosPage() {
  const [promos, setPromos]   = useState<Promo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // form
  const [titulo, setTitulo]       = useState('')
  const [cuerpo, setCuerpo]       = useState('')
  const [imagenFile, setImagenFile] = useState<File | null>(null)
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [formError, setFormError]   = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchPromos = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('noticias')
      .select('id, titulo, cuerpo, created_at, imagen_path')
      .order('created_at', { ascending: false })

    const conUrl: Promo[] = (data ?? []).map((n: Record<string, unknown>) => ({
      id:          n.id as string,
      titulo:      n.titulo as string,
      cuerpo:      n.cuerpo as string,
      created_at:  n.created_at as string,
      imagen_path: n.imagen_path as string | null,
      imagenUrl:   n.imagen_path
        ? supabase.storage.from('noticias-imagenes').getPublicUrl(n.imagen_path as string).data.publicUrl
        : null,
    }))
    setPromos(conUrl)
    setLoading(false)
  }

  useEffect(() => { fetchPromos() }, [])

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

  const handleEliminar = async (promo: Promo) => {
    if (!confirm(`¿Eliminar "${promo.titulo}"?`)) return
    const { error } = await supabase.from('noticias').delete().eq('id', promo.id)
    if (error) return
    if (promo.imagen_path) {
      void supabase.storage.from('noticias-imagenes').remove([promo.imagen_path])
    }
    setPromos(ps => ps.filter(p => p.id !== promo.id))
  }

  const handlePublicar = async () => {
    if (!titulo.trim()) { setFormError('El título es obligatorio.'); return }
    if (!cuerpo.trim()) { setFormError('El detalle es obligatorio.'); return }
    setPublicando(true); setFormError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFormError('Sesión expirada.'); setPublicando(false); return }

    let imagenPath: string | null = null
    if (imagenFile) {
      const ext  = imagenFile.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('noticias-imagenes')
        .upload(path, imagenFile, { contentType: imagenFile.type })
      if (uploadErr) { setFormError('No se pudo subir la imagen.'); setPublicando(false); return }
      imagenPath = path
    }

    const { data, error } = await supabase
      .from('noticias')
      .insert({
        titulo:      titulo.trim(),
        cuerpo:      cuerpo.trim(),
        etiquetas:   [],
        audiencia:   'todos',
        autor_id:    user.id,
        publicada:   true,
        imagen_path: imagenPath,
      })
      .select('id')
      .single()

    if (error || !data) { setFormError(error?.message ?? 'No se pudo publicar la promoción.'); setPublicando(false); return }

    // Push a los socios — fire & forget, un error acá no invalida la publicación.
    supabase.functions.invoke('notifications', {
      body: { type: 'noticia_publicada', payload: { titulo: titulo.trim(), noticiaId: data.id, audiencia: 'todos' } },
    }).catch(() => {})

    await fetchPromos()
    setPublicando(false)
    closeModal()
  }

  const closeModal = () => {
    setShowModal(false)
    setTitulo(''); setCuerpo(''); setFormError('')
    quitarImagen()
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Promociones</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">{promos.length} publicadas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVA PROMO
        </button>
      </div>

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : promos.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN PROMOCIONES TODAVÍA</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {promos.map(p => (
            <div key={p.id} className="border-b border-gris-claro py-5 flex gap-4 items-start hover:bg-gris-claro/20 transition-colors px-2">
              {p.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagenUrl} alt="" className="w-16 h-16 object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-lora text-sm text-tinta leading-snug mb-1">{p.titulo}</p>
                <p className="font-lora text-xs text-tinta/50 mb-1 line-clamp-2">{p.cuerpo}</p>
                <p className="font-lora text-xs text-tinta/40">{fechaCorta(p.created_at)}</p>
              </div>
              <button
                onClick={() => handleEliminar(p)}
                className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo/60 hover:border-rojo hover:text-rojo transition-colors shrink-0"
              >
                ELIMINAR
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva promo */}
      {showModal && (
        <div className="fixed inset-0 bg-dark/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <p className="font-lora text-xs tracking-widest text-tinta/60">NUEVA PROMOCIÓN</p>
              <button onClick={closeModal} className="text-tinta/40 hover:text-tinta text-xl leading-none">×</button>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">TÍTULO</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                  placeholder="Ej: 2x1 en hamburguesas"
                />
              </div>

              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">DETALLE</label>
                <textarea
                  value={cuerpo}
                  onChange={e => setCuerpo(e.target.value)}
                  rows={4}
                  className="w-full font-lora text-sm text-tinta bg-transparent border border-gris-claro p-3 outline-none focus:border-oro transition-colors resize-none"
                  placeholder="Contá la promo, vigencia, condiciones…"
                />
              </div>

              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">FOTO (OPCIONAL)</label>
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
                    <span className="font-lora text-xs tracking-widest text-oro">+ AGREGAR FOTO</span>
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

            <p className="font-lora text-xs text-tinta/40 italic mt-4">Se publica de una para todos los socios del club.</p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handlePublicar}
                disabled={publicando}
                className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
              >
                {publicando ? 'PUBLICANDO…' : 'PUBLICAR PROMOCIÓN'}
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
