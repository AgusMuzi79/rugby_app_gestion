import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export interface Promo {
  id:         string
  titulo:     string
  cuerpo:     string
  created_at: string
}

// Promos de Buffet: siempre audiencia='todos' y sin etiqueta de deporte, se
// publican al toque (sin paso de borrador) — reforzado también por RLS
// (ver 20260910000002_rol_buffet_y_noticias.sql), acá sólo evita mandar
// valores que la base igual rechazaría.
export function usePromosBuffet() {
  const { session } = useAuthStore()
  const [promos, setPromos]       = useState<Promo[]>([])
  const [loading, setLoading]     = useState(true)
  const [publicando, setPublicando] = useState(false)

  const fetchPromos = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('noticias')
      .select('id, titulo, cuerpo, created_at')
      .order('created_at', { ascending: false })
    setPromos((data ?? []) as Promo[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPromos() }, [fetchPromos])
  useRefreshOnFocus(fetchPromos)

  const publicar = useCallback(async (titulo: string, cuerpo: string): Promise<boolean> => {
    if (!session?.user.id) return false
    setPublicando(true)

    const { data, error } = await supabase
      .from('noticias')
      .insert({
        titulo:    titulo.trim(),
        cuerpo:    cuerpo.trim(),
        etiquetas: [],
        audiencia: 'todos',
        autor_id:  session.user.id,
        publicada: true,
      })
      .select('id')
      .single()

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'No se pudo publicar la promoción.')
      setPublicando(false)
      return false
    }

    // Push a los socios — fire & forget, un error acá no invalida la publicación.
    void supabase.functions.invoke('notifications', {
      body: { type: 'noticia_publicada', payload: { titulo: titulo.trim(), noticiaId: data.id, audiencia: 'todos' } },
    })

    await fetchPromos()
    setPublicando(false)
    return true
  }, [session, fetchPromos])

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('noticias').delete().eq('id', id)
    if (error) { Alert.alert('Error', error.message); return }
    setPromos(prev => prev.filter(p => p.id !== id))
  }, [])

  return { promos, loading, publicando, publicar, eliminar, refetch: fetchPromos }
}
