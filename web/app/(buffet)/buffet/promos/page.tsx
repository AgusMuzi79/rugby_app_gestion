'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { errorTamano, prepararImagen } from '@/lib/imagenSubida'

interface Promo {
  id:          string
  titulo:      string
  cuerpo:      string
  created_at:  string
  imagen_path: string | null
  imagenUrl:   string | null
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

export default function BuffetPromosPage() {
  const [promos, setPromos]   = useState<Promo[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [aviso, setAviso]     = useState('')
  const [showModal, setShowModal] = useState(false)
  // Por defecto sólo las promos propias; "VER TODAS" muestra todas las
  // noticias del club sin poder borrarlas (antes un admin veía y borraba todo).
  const [uid, setUid]           = useState<string | null>(null)
  const [verTodas, setVerTodas] = useState(false)

  // form
  const [titulo, setTitulo]       = useState('')
  const [cuerpo, setCuerpo]       = useState('')
  const [imagenFile, setImagenFile] = useState<File | null>(null)
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [formError, setFormError]   = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchPromos = useCallback(async (autorId: string | null, todas: boolean) => {
    if (!todas && !autorId) { setListError('Sesión expirada.'); setLoading(false); return }
    let query = supabase
      .from('noticias')
      .select('id, titulo, cuerpo, created_at, imagen_path, autor_id, publicada, audiencia, profiles!noticias_autor_id_fkey(nombre)')
      .order('created_at', { ascending: false })
      .limit(LIMITE)
    if (!todas && autorId) query = query.eq('autor_id', autorId)
    const { data, error } = await query

    if (error) {
      setListError(error.message)
      setLoading(false)
      return
    }

    setListError('')
    setPromos((data ?? []).map((n: Record<string, unknown>) => ({
      id:          n.id as string,
      titulo:      n.titulo as string,
      cuerpo:      n.cuerpo as string,
      created_at:  n.created_at as string,
      imagen_path: n.imagen_path as string | null,
      imagenUrl:   n.imagen_path
        ? supabase.storage.from(BUCKET).getPublicUrl(n.imagen_path as string).data.publicUrl
        : null,
      autor_id:    n.autor_id as string,
      autor:       (n.profiles as { nombre?: string } | null)?.nombre ?? '—',
      publicada:   n.publicada !== false,
      audiencia:   (n.audiencia as string | null) ?? 'todos',
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUid(user?.id ?? null)
      await fetchPromos(user?.id ?? null, false)
    }
    void cargar()
  }, [fetchPromos])

  const alternarVerTodas = () => {
    const todas = !verTodas
    setVerTodas(todas)
    setLoading(true)
    void fetchPromos(uid, todas)
  }

  const publicadas = promos.filter(p => p.publicada).length

  const handleElegirImagen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Más de 10 MB no se acepta; lo demás se achica antes de subir (lib/imagenSubida.ts).
    const errorPeso = errorTamano(file.size)
    if (errorPeso) { setFormError(errorPeso); e.target.value = ''; return }
    setFormError('')
    setImagenFile(file)
    setImagenPreview(URL.createObjectURL(file))
  }

  const quitarImagen = () => {
    setImagenFile(null)
    setImagenPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleEliminar = async (promo: Promo) => {
    if (!confirm(`¿Eliminar "${promo.titulo}"? Los socios dejan de verla.`)) return
    setAviso('')
    const { data, error } = await supabase.from('noticias').delete().eq('id', promo.id).select('id')
    if (error) { setAviso(`No se pudo eliminar: ${error.message}`); return }
    if (!data || data.length === 0) {
      setAviso('No se eliminó: no tenés permiso o la promoción ya no existe.')
      await fetchPromos(uid, verTodas)
      return
    }
    if (promo.imagen_path) {
      // Orphan image cleanup only — the promo is already gone.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([promo.imagen_path])
      if (rmErr) console.warn('promos: image cleanup failed', rmErr.message)
    }
    setPromos(ps => ps.filter(p => p.id !== promo.id))
  }

  const handlePublicar = async () => {
    if (!titulo.trim()) { setFormError('El título es obligatorio.'); return }
    if (!cuerpo.trim()) { setFormError('El detalle es obligatorio.'); return }
    setPublicando(true); setFormError(''); setAviso('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFormError('Sesión expirada.'); setPublicando(false); return }

    let imagenPath: string | null = null
    if (imagenFile) {
      const subir = await prepararImagen(imagenFile)
      const ext  = subir.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, subir, { contentType: subir.type })
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

    if (error || !data) {
      setFormError(error?.message ?? 'No se pudo publicar la promoción.')
      if (imagenPath) await supabase.storage.from(BUCKET).remove([imagenPath])
      setPublicando(false)
      return
    }

    // La promo ya está publicada; si el push falla se avisa, pero no se deshace.
    const { error: pushErr } = await supabase.functions.invoke('notifications', {
      body: { type: 'noticia_publicada', payload: { titulo: titulo.trim(), noticiaId: data.id, audiencia: 'todos' } },
    })
    if (pushErr) setAviso('La promoción se publicó, pero no se pudo enviar la notificación a los socios.')

    await fetchPromos(uid, verTodas)
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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Promociones</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {publicadas} publicadas{verTodas ? ' en el club' : ' por vos'}
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
            + NUEVA PROMO
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
          <p role="alert" className="font-lora text-rojo-texto text-sm">No se pudieron cargar las promociones: {listError}</p>
        </div>
      ) : promos.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-texto-2 text-sm tracking-widest">SIN PROMOCIONES TODAVÍA</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {promos.map(p => (
            <div key={p.id} className="border-b border-gris-claro py-5 flex gap-4 items-start hover:bg-gris-claro/20 transition-colors px-2">
              {p.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagenUrl} alt="" loading="lazy" width={64} height={64} className="w-16 h-16 object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="font-lora text-sm text-tinta leading-snug">{p.titulo}</p>
                  {!p.publicada && (
                    <span className="font-lora text-[11px] tracking-widest text-tinta border border-borde-control px-1.5 py-0.5">BORRADOR</span>
                  )}
                  {p.audiencia === 'cuerpo_tecnico' && (
                    <span className="font-lora text-[11px] tracking-widest text-tinta bg-gris-claro px-1.5 py-0.5">CUERPO TÉCNICO</span>
                  )}
                </div>
                {p.cuerpo && <p className="font-lora text-xs text-tinta/50 mb-1 line-clamp-2">{p.cuerpo}</p>}
                <p className="font-lora text-xs text-texto-2">{fechaCorta(p.created_at)} · {p.autor}</p>
              </div>
              {p.autor_id === uid && (
                <button
                  onClick={() => handleEliminar(p)}
                  className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo-texto hover:border-rojo hover:text-rojo-texto transition-colors shrink-0"
                >
                  ELIMINAR
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva promo */}
      {showModal && (
        <Modal titulo="NUEVA PROMOCIÓN" onClose={closeModal}>
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="promo-titulo" className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">TÍTULO</label>
              <input
                id="promo-titulo"
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-borde-control py-2 outline-none focus:border-oro transition-colors"
                placeholder="Ej: 2x1 en hamburguesas"
              />
            </div>

            <div>
              <label htmlFor="promo-detalle" className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">DETALLE</label>
              <textarea
                id="promo-detalle"
                value={cuerpo}
                onChange={e => setCuerpo(e.target.value)}
                rows={4}
                className="w-full font-lora text-sm text-tinta bg-transparent border border-borde-control p-3 outline-none focus:border-oro transition-colors resize-none"
                placeholder="Contá la promo, vigencia, condiciones…"
              />
            </div>

            <div>
              <p className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">FOTO (OPCIONAL)</p>
              {imagenPreview ? (
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagenPreview} alt="" className="w-full aspect-[4/3] object-cover" />
                  <button
                    type="button"
                    onClick={quitarImagen}
                    className="font-lora text-xs tracking-widest text-rojo-texto hover:text-rojo-texto mt-2"
                  >
                    QUITAR
                  </button>
                </div>
              ) : (
                // sr-only en vez de hidden: el input sigue alcanzable con Tab, y
                // el foco se ve en la etiqueta que hace de botón.
                <label className="flex items-center justify-center border border-dashed border-gris-claro py-6 cursor-pointer hover:border-tinta/40 transition-colors focus-within:outline-2 focus-within:outline-oro focus-within:outline-offset-2">
                  <span className="font-lora text-xs tracking-widest text-oro">+ AGREGAR FOTO</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleElegirImagen}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>

          {formError && <p role="alert" className="font-lora text-rojo-texto text-sm mt-4">{formError}</p>}

          <p className="font-lora text-xs text-texto-2 italic mt-4">Se publica de una para todos los socios del club.</p>

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
        </Modal>
      )}
    </div>
  )
}
