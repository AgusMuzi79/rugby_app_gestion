import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useAuthStore } from '@/stores/authStore'

export interface Noticia {
  id:          string
  titulo:      string
  cuerpo:      string
  imagen_path: string | null
  publicada:   boolean
  etiquetas:   string[]
  created_at:  string
  autor:       string
}

interface NuevosDatos {
  titulo:    string
  cuerpo:    string
  etiquetas: string[]
}

export function useNoticias(soloPublicadas: boolean) {
  const { session } = useAuthStore()
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [loading, setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let q = db
      .from('noticias')
      .select('id, titulo, cuerpo, imagen_path, publicada, etiquetas, created_at, profiles!noticias_autor_id_fkey(nombre)')
      .order('created_at', { ascending: false })

    if (soloPublicadas) q = q.eq('publicada', true)

    const { data } = await q

    const normalized: Noticia[] = (data ?? []).map((n: Record<string, unknown>) => ({
      id:          n.id as string,
      titulo:      n.titulo as string,
      cuerpo:      n.cuerpo as string,
      imagen_path: n.imagen_path as string | null,
      publicada:   n.publicada as boolean,
      etiquetas:   (n.etiquetas as string[]) ?? [],
      created_at:  n.created_at as string,
      autor:       (n.profiles as { nombre: string } | null)?.nombre ?? '—',
    }))

    setNoticias(normalized)
    setLoading(false)
  }, [soloPublicadas])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  useEffect(() => {
    const channel = supabase
      .channel(`noticias-rt-${soloPublicadas ? 'pub' : 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'noticias' }, () => {
        void fetch()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [fetch, soloPublicadas])

  const crear = useCallback(async (datos: NuevosDatos): Promise<boolean> => {
    if (!session?.user.id) return false
    setGuardando(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('noticias').insert({
      titulo:    datos.titulo,
      cuerpo:    datos.cuerpo,
      etiquetas: datos.etiquetas,
      autor_id:  session.user.id,
      publicada: false,
    })
    setGuardando(false)
    if (error) { Alert.alert('Error', error.message); return false }
    await fetch()
    return true
  }, [session, fetch])

  const togglePublicar = useCallback(async (noticiaId: string, publicada: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('noticias')
      .update({ publicada })
      .eq('id', noticiaId)
    if (error) { Alert.alert('Error', error.message); return }
    setNoticias(prev =>
      prev.map(n => n.id === noticiaId ? { ...n, publicada } : n)
    )
  }, [])

  const eliminar = useCallback(async (noticiaId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('noticias')
      .delete()
      .eq('id', noticiaId)
    if (error) { Alert.alert('Error', error.message); return }
    setNoticias(prev => prev.filter(n => n.id !== noticiaId))
  }, [])

  return { noticias, loading, guardando, crear, togglePublicar, eliminar, refetch: fetch }
}
