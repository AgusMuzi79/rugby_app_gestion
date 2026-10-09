import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

// Values allowed by noticias_audiencia_check (20260616000001_noticias_audiencia).
export type AudienciaComunicado = 'cuerpo_tecnico' | 'todos'

export interface Comunicado {
  id:         string
  titulo:     string
  cuerpo:     string
  audiencia:  AudienciaComunicado
  publicada:  boolean
  created_at: string
}

// Admin comunicados: noticias published straight away (no draft step) with an
// explicit audience. RLS: noticias_insert_staff / noticias_select_staff /
// noticias_delete_staff include 'admin'. Push goes through the existing
// `notifications` Edge Function (noticia_publicada), which admits admin and
// fans out to coordinador/entrenador/manager for 'cuerpo_tecnico' and to
// socios for 'todos'.
export function useComunicadosAdmin() {
  const { session } = useAuthStore()
  const [comunicados, setComunicados] = useState<Comunicado[]>([])
  const [loading, setLoading]         = useState(true)
  const [publicando, setPublicando]   = useState(false)

  const fetchComunicados = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('noticias')
      .select('id, titulo, cuerpo, audiencia, publicada, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    setComunicados((data ?? []).map(n => ({
      ...n,
      audiencia: n.audiencia === 'cuerpo_tecnico' ? 'cuerpo_tecnico' : 'todos',
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchComunicados() }, [fetchComunicados])
  useRefreshOnFocus(fetchComunicados)

  const publicar = useCallback(async (
    titulo: string,
    cuerpo: string,
    audiencia: AudienciaComunicado,
  ): Promise<boolean> => {
    if (!session?.user.id) return false
    setPublicando(true)

    const { data, error } = await supabase
      .from('noticias')
      .insert({
        titulo:    titulo.trim(),
        cuerpo:    cuerpo.trim(),
        etiquetas: [],
        audiencia,
        autor_id:  session.user.id,
        publicada: true,
      })
      .select('id')
      .single()

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'No se pudo publicar el comunicado.')
      setPublicando(false)
      return false
    }

    // Fire & forget: a push failure does not undo the publication.
    void supabase.functions.invoke('notifications', {
      body: { type: 'noticia_publicada', payload: { titulo: titulo.trim(), noticiaId: data.id, audiencia } },
    })

    await fetchComunicados()
    setPublicando(false)
    return true
  }, [session, fetchComunicados])

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('noticias').delete().eq('id', id)
    if (error) { Alert.alert('Error', error.message); return }
    setComunicados(prev => prev.filter(c => c.id !== id))
  }, [])

  return { comunicados, loading, publicando, publicar, eliminar, refetch: fetchComunicados }
}
