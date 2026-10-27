'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { mensajeErrorCarga } from '@/lib/errorCarga'
import ErrorCarga from '@/components/secretaria/ErrorCarga'
import { confirmacionPublicar, mensajeResultadoAviso } from '@/lib/avisoNoticia'

interface Noticia {
  id: string
  titulo: string
  cuerpo: string
  publicada: boolean
  etiquetas: string[]
  created_at: string
  autor: string
  audiencia: 'todos' | 'cuerpo_tecnico'
  // Cuándo salió el aviso push (null = nunca): se avisa una sola vez.
  notificadaAt: string | null
}

type Filtro = 'todas' | 'rugby' | 'hockey' | 'tenis'
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todas',  label: 'TODAS'  },
  { value: 'rugby',  label: 'RUGBY'  },
  { value: 'hockey', label: 'HOCKEY' },
  { value: 'tenis',  label: 'TENIS'  },
]
const DEPORTES = ['rugby', 'hockey', 'tenis'] as const

function tiempoRelativo(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 30) return new Date(iso).toLocaleDateString('es-AR')
  if (days  > 0)  return `hace ${days}d`
  if (hours > 0)  return `hace ${hours}h`
  return 'hoy'
}

export default function NoticiasPage() {
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [loading, setLoading]   = useState(true)
  const [filtro, setFiltro]     = useState<Filtro>('todas')
  const [showModal, setShowModal] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [aviso, setAviso]       = useState('')
  // Noticia a publicar, esperando la confirmación (el push no se deshace).
  const [aConfirmar, setAConfirmar] = useState<Noticia | null>(null)
  const [publicando, setPublicando] = useState(false)

  // form
  const [titulo, setTitulo]     = useState('')
  const [cuerpo, setCuerpo]     = useState('')
  const [deporte, setDeporte]   = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchNoticias = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('noticias')
      .select('id, titulo, cuerpo, publicada, etiquetas, audiencia, notificada_at, created_at, profiles!noticias_autor_id_fkey(nombre)')
      .order('created_at', { ascending: false })
    if (error) {
      setErrorCarga(mensajeErrorCarga('las noticias', error))
      setLoading(false)
      return
    }

    const normalized: Noticia[] = (data ?? []).map((n: Record<string, unknown>) => ({
      id:         n.id as string,
      titulo:     n.titulo as string,
      cuerpo:     n.cuerpo as string,
      publicada:  n.publicada as boolean,
      etiquetas:  (n.etiquetas as string[]) ?? [],
      audiencia:  (n.audiencia as 'todos' | 'cuerpo_tecnico') ?? 'todos',
      notificadaAt: (n.notificada_at as string | null) ?? null,
      created_at: n.created_at as string,
      autor:      (n.profiles as { nombre: string } | null)?.nombre ?? '—',
    }))
    setErrorCarga(null)
    setNoticias(normalized)
    setLoading(false)
  }

  const reintentar = () => { setLoading(true); void fetchNoticias() }

  useEffect(() => { fetchNoticias() }, [])

  const noticiasVisibles = filtro === 'todas'
    ? noticias
    : noticias.filter(n => n.etiquetas.includes(filtro))

  const handleDespublicar = async (id: string) => {
    setAviso('')
    const { error } = await supabase.from('noticias').update({ publicada: false }).eq('id', id)
    if (error) { setAviso(`No se pudo despublicar la noticia: ${error.message}`); return }
    setNoticias(ns => ns.map(n => n.id === id ? { ...n, publicada: false } : n))
  }

  // Después de confirmar. El push lo manda `notifications` una sola vez por
  // noticia (noticias.notificada_at): republicar no lo repite.
  const handlePublicar = async (noticia: Noticia) => {
    setAviso('')
    setPublicando(true)
    try {
      const { error } = await supabase.from('noticias').update({ publicada: true }).eq('id', noticia.id)
      if (error) { setAviso(`No se pudo publicar la noticia: ${error.message}`); return }
      setNoticias(ns => ns.map(n => n.id === noticia.id ? { ...n, publicada: true } : n))
      const resultado = await supabase.functions.invoke('notifications', {
        body: { type: 'noticia_publicada', payload: { titulo: noticia.titulo, noticiaId: noticia.id, audiencia: noticia.audiencia } },
      }).catch((e: unknown) => ({ error: e, data: null }))
      const mensaje = mensajeResultadoAviso(resultado)
      if (mensaje) setAviso(mensaje)
      // Relee para tener notificada_at al día (la próxima confirmación lo usa).
      await fetchNoticias()
    } finally {
      setPublicando(false)
      setAConfirmar(null)
    }
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta noticia?')) return
    setAviso('')
    const { error } = await supabase.from('noticias').delete().eq('id', id)
    if (error) { setAviso(`No se pudo eliminar la noticia: ${error.message}`); return }
    setNoticias(ns => ns.filter(n => n.id !== id))
  }

  const handleCrear = async () => {
    if (!titulo.trim()) { setFormError('El título es obligatorio.'); return }
    if (!cuerpo.trim()) { setFormError('El contenido es obligatorio.'); return }
    setGuardando(true); setFormError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFormError('Sesión expirada.'); setGuardando(false); return }

    const { error } = await supabase.from('noticias').insert({
      titulo:    titulo.trim(),
      cuerpo:    cuerpo.trim(),
      etiquetas: deporte ? [deporte] : [],
      autor_id:  user.id,
      publicada: false,
      audiencia: 'todos',
    })

    if (error) { setFormError(error.message); setGuardando(false); return }
    await fetchNoticias()
    setGuardando(false)
    setShowModal(false)
    setTitulo(''); setCuerpo(''); setDeporte(null)
  }

  const closeModal = () => {
    setShowModal(false)
    setTitulo(''); setCuerpo(''); setDeporte(null); setFormError('')
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Noticias</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {loading || errorCarga ? 'Noticias para los socios' : <>{noticias.filter(n => n.publicada).length} publicadas · {noticias.length} en total</>}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVA NOTICIA
        </button>
      </div>

      {aviso && (
        <p role="alert" className="font-lora text-sm text-tinta border border-rojo p-4 mb-6">{aviso}</p>
      )}

      {/* Filtros */}
      <div className="flex gap-1 mb-6 border-b border-gris-claro">
        {FILTROS.map(f => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`font-lora text-xs tracking-widest px-4 py-2 border-b-2 transition-colors -mb-px ${
              filtro === f.value
                ? 'border-oro text-tinta'
                : 'border-transparent text-texto-2 hover:text-tinta'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-lora text-texto-2 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={reintentar} />
      ) : noticiasVisibles.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-texto-2 text-sm tracking-widest">SIN NOTICIAS</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {noticiasVisibles.map(n => (
            <div key={n.id} className="border-b border-gris-claro py-5 flex gap-4 items-start hover:bg-gris-claro/20 transition-colors px-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 ${
                    n.publicada ? 'bg-oro text-papel' : 'bg-gris-claro text-tinta/50'
                  }`}>
                    {n.publicada ? 'PUBLICADA' : 'BORRADOR'}
                  </span>
                  {n.etiquetas.length > 0 && (
                    <span className="font-lora text-xs tracking-widest text-texto-2 border border-gris-claro px-2 py-0.5">
                      {n.etiquetas[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="font-lora text-sm text-tinta leading-snug mb-1 truncate">{n.titulo}</p>
                <p className="font-lora text-xs text-texto-2">
                  {n.autor} · {tiempoRelativo(n.created_at)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 pt-1">
                <button
                  onClick={() => { if (n.publicada) void handleDespublicar(n.id); else setAConfirmar(n) }}
                  className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-tinta/50 hover:border-tinta hover:text-tinta transition-colors"
                >
                  {n.publicada ? 'DESPUBLICAR' : 'PUBLICAR'}
                </button>
                <button
                  onClick={() => handleEliminar(n.id)}
                  className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo-texto hover:border-rojo hover:text-rojo-texto transition-colors"
                >
                  ELIMINAR
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmación de publicar: el aviso push no se puede deshacer */}
      {aConfirmar && (
        <Modal titulo="PUBLICAR NOTICIA" ancho="max-w-md" onClose={() => { if (!publicando) setAConfirmar(null) }}>
          <p className="font-lora text-sm text-tinta mb-2">&ldquo;{aConfirmar.titulo}&rdquo;</p>
          <p className="font-lora text-sm text-tinta/70">{confirmacionPublicar(aConfirmar)}</p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => { void handlePublicar(aConfirmar) }}
              disabled={publicando}
              className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
            >
              {publicando ? 'PUBLICANDO…' : 'PUBLICAR'}
            </button>
            <button
              onClick={() => setAConfirmar(null)}
              disabled={publicando}
              className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors disabled:opacity-50"
            >
              CANCELAR
            </button>
          </div>
        </Modal>
      )}

      {/* Modal nueva noticia */}
      {showModal && (
        <Modal titulo="NUEVA NOTICIA" onClose={closeModal}>
          <div className="flex flex-col gap-5">
            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">TÍTULO</label>
              <input
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-borde-control py-2 outline-none focus:border-oro transition-colors"
                placeholder="Título de la noticia"
              />
            </div>

            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">CONTENIDO</label>
              <textarea
                value={cuerpo}
                onChange={e => setCuerpo(e.target.value)}
                rows={5}
                className="w-full font-lora text-sm text-tinta bg-transparent border border-borde-control p-3 outline-none focus:border-oro transition-colors resize-none"
                placeholder="Escribí el contenido aquí…"
              />
            </div>

            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DEPORTE (OPCIONAL)</label>
              <div className="flex gap-2">
                {DEPORTES.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDeporte(prev => prev === d ? null : d)}
                    className={`font-lora text-xs tracking-widest px-4 py-2 border transition-colors ${
                      deporte === d
                        ? 'bg-oro border-oro text-papel'
                        : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
                    }`}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {formError && <p className="font-lora text-rojo-texto text-sm mt-4">{formError}</p>}

          <p className="font-lora text-xs text-texto-2 italic mt-4">Se guardará como borrador. Podés publicarla luego.</p>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleCrear}
              disabled={guardando}
              className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
            >
              {guardando ? 'GUARDANDO…' : 'GUARDAR BORRADOR'}
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
