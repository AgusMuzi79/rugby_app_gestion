'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Noticia {
  id: string
  titulo: string
  cuerpo: string
  publicada: boolean
  etiquetas: string[]
  created_at: string
  autor: string
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

  // form
  const [titulo, setTitulo]   = useState('')
  const [cuerpo, setCuerpo]   = useState('')
  const [deporte, setDeporte] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchNoticias = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('noticias')
      .select('id, titulo, cuerpo, publicada, etiquetas, created_at, profiles!noticias_autor_id_fkey(nombre)')
      .order('created_at', { ascending: false })

    const normalized: Noticia[] = (data ?? []).map((n: Record<string, unknown>) => ({
      id:         n.id as string,
      titulo:     n.titulo as string,
      cuerpo:     n.cuerpo as string,
      publicada:  n.publicada as boolean,
      etiquetas:  (n.etiquetas as string[]) ?? [],
      created_at: n.created_at as string,
      autor:      (n.profiles as { nombre: string } | null)?.nombre ?? '—',
    }))
    setNoticias(normalized)
    setLoading(false)
  }

  useEffect(() => { fetchNoticias() }, [])

  const noticiasVisibles = filtro === 'todas'
    ? noticias
    : noticias.filter(n => n.etiquetas.includes(filtro))

  const handleTogglePublicar = async (id: string, publicada: boolean) => {
    const { error } = await supabase.from('noticias').update({ publicada }).eq('id', id)
    if (error) return
    setNoticias(ns => ns.map(n => n.id === id ? { ...n, publicada } : n))
    if (publicada) {
      const noticia = noticias.find(n => n.id === id)
      if (noticia) {
        supabase.functions.invoke('notifications', {
          body: { type: 'noticia_publicada', payload: { titulo: noticia.titulo, noticiaId: id } },
        }).catch(() => {})
      }
    }
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta noticia?')) return
    const { error } = await supabase.from('noticias').delete().eq('id', id)
    if (!error) setNoticias(ns => ns.filter(n => n.id !== id))
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
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Noticias</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            {noticias.filter(n => n.publicada).length} publicadas · {noticias.length} en total
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVA NOTICIA
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 mb-6 border-b border-gris-claro">
        {FILTROS.map(f => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`font-lora text-xs tracking-widest px-4 py-2 border-b-2 transition-colors -mb-px ${
              filtro === f.value
                ? 'border-oro text-tinta'
                : 'border-transparent text-tinta/40 hover:text-tinta'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : noticiasVisibles.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN NOTICIAS</p>
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
                    <span className="font-lora text-xs tracking-widest text-tinta/40 border border-gris-claro px-2 py-0.5">
                      {n.etiquetas[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="font-lora text-sm text-tinta leading-snug mb-1 truncate">{n.titulo}</p>
                <p className="font-lora text-xs text-tinta/40">
                  {n.autor} · {tiempoRelativo(n.created_at)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 pt-1">
                <button
                  onClick={() => handleTogglePublicar(n.id, !n.publicada)}
                  className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-tinta/50 hover:border-tinta hover:text-tinta transition-colors"
                >
                  {n.publicada ? 'DESPUBLICAR' : 'PUBLICAR'}
                </button>
                <button
                  onClick={() => handleEliminar(n.id)}
                  className="font-lora text-xs tracking-widest px-3 py-1.5 border border-gris-claro text-rojo/60 hover:border-rojo hover:text-rojo transition-colors"
                >
                  ELIMINAR
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva noticia */}
      {showModal && (
        <div className="fixed inset-0 bg-dark/70 flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-xl p-8">
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
                  className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                  placeholder="Título de la noticia"
                />
              </div>

              <div>
                <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">CONTENIDO</label>
                <textarea
                  value={cuerpo}
                  onChange={e => setCuerpo(e.target.value)}
                  rows={5}
                  className="w-full font-lora text-sm text-tinta bg-transparent border border-gris-claro p-3 outline-none focus:border-oro transition-colors resize-none"
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

            {formError && <p className="font-lora text-rojo text-sm mt-4">{formError}</p>}

            <p className="font-lora text-xs text-tinta/40 italic mt-4">Se guardará como borrador. Podés publicarla luego.</p>

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
          </div>
        </div>
      )}
    </div>
  )
}
