import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  normalizarAudiencia,
  resultadoBorrado,
  type AudienciaComunicado,
  type AudienciaMostrada,
} from '@/lib/comunicadosAdmin'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export type { AudienciaComunicado, AudienciaMostrada }

export interface Comunicado {
  id:         string
  titulo:     string
  cuerpo:     string
  audiencia:  AudienciaMostrada
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
  const [errorCarga, setErrorCarga]   = useState<string | null>(null)
  const [publicando, setPublicando]   = useState(false)

  const fetchComunicados = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('noticias')
        .select('id, titulo, cuerpo, audiencia, publicada, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      // A failed read clears the list so it is not mistaken for current data.
      if (error) {
        setErrorCarga(error.message)
        setComunicados([])
      } else {
        setErrorCarga(null)
        setComunicados((data ?? []).map(n => ({ ...n, audiencia: normalizarAudiencia(n.audiencia) })))
      }
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'Error de conexión.')
      setComunicados([])
    } finally {
      setLoading(false)
    }
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

    try {
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
        return false
      }

      // Fire & forget: a push failure does not undo the publication.
      void supabase.functions.invoke('notifications', {
        body: { type: 'noticia_publicada', payload: { titulo: titulo.trim(), noticiaId: data.id, audiencia } },
      })

      await fetchComunicados()
      return true
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo publicar el comunicado.')
      return false
    } finally {
      setPublicando(false)
    }
  }, [session, fetchComunicados])

  const eliminar = useCallback(async (id: string): Promise<boolean> => {
    let data: { id: string }[] | null = null
    let error: { message: string } | null = null
    try {
      ({ data, error } = await supabase.from('noticias').delete().eq('id', id).select('id'))
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo eliminar el comunicado.')
      return false
    }
    const resultado = resultadoBorrado(error, data)

    if (resultado === 'error') {
      Alert.alert('Error', error?.message ?? 'No se pudo eliminar el comunicado.')
      return false
    }
    if (resultado === 'sin_filas') {
      Alert.alert(
        'No se pudo eliminar',
        'El comunicado no se eliminó: no tenés permiso o ya había sido eliminado.',
      )
      await fetchComunicados()
      return false
    }
    setComunicados(prev => prev.filter(c => c.id !== id))
    return true
  }, [fetchComunicados])

  return { comunicados, loading, errorCarga, publicando, publicar, eliminar, refetch: fetchComunicados }
}
