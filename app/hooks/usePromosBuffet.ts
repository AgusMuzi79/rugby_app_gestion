import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export interface Promo {
  id:          string
  titulo:      string
  cuerpo:      string
  created_at:  string
  imagen_path: string | null
  imagenUrl:   string | null
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Promos de Buffet: siempre audiencia='todos' y sin etiqueta de deporte, se
// publican al toque (sin paso de borrador) — reforzado también por RLS
// (ver 20260910000002_rol_buffet_y_noticias.sql), acá sólo evita mandar
// valores que la base igual rechazaría.
//
// Imagen opcional (2026-09-17): bucket público 'noticias-imagenes', path
// propio {uid}/{timestamp}.jpg (ver 20260917000000_buffet_promos_imagenes.sql)
// — se sube antes de publicar, así el insert de la noticia queda en un solo
// paso con imagen_path ya resuelto.
export function usePromosBuffet() {
  const { session } = useAuthStore()
  const [promos, setPromos]       = useState<Promo[]>([])
  const [loading, setLoading]     = useState(true)
  const [publicando, setPublicando] = useState(false)

  const fetchPromos = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('noticias')
      .select('id, titulo, cuerpo, created_at, imagen_path')
      .order('created_at', { ascending: false })

    const conUrl: Promo[] = (data ?? []).map(n => ({
      ...n,
      imagenUrl: n.imagen_path
        ? supabase.storage.from('noticias-imagenes').getPublicUrl(n.imagen_path).data.publicUrl
        : null,
    }))
    setPromos(conUrl)
    setLoading(false)
  }, [])

  useEffect(() => { fetchPromos() }, [fetchPromos])
  useRefreshOnFocus(fetchPromos)

  const publicar = useCallback(async (titulo: string, cuerpo: string, imagenUri?: string | null): Promise<boolean> => {
    if (!session?.user.id) return false
    setPublicando(true)

    let imagenPath: string | null = null
    if (imagenUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(imagenUri, { encoding: 'base64' })
        const path   = `${session.user.id}/${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('noticias-imagenes')
          .upload(path, decodeBase64(base64), { contentType: 'image/jpeg' })
        if (uploadErr) {
          Alert.alert('Error', 'No se pudo subir la imagen.')
          setPublicando(false)
          return false
        }
        imagenPath = path
      } catch {
        Alert.alert('Error', 'No se pudo subir la imagen.')
        setPublicando(false)
        return false
      }
    }

    const { data, error } = await supabase
      .from('noticias')
      .insert({
        titulo:      titulo.trim(),
        cuerpo:      cuerpo.trim(),
        etiquetas:   [],
        audiencia:   'todos',
        autor_id:    session.user.id,
        publicada:   true,
        imagen_path: imagenPath,
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

  const eliminar = useCallback(async (promo: Promo) => {
    const { error } = await supabase.from('noticias').delete().eq('id', promo.id)
    if (error) { Alert.alert('Error', error.message); return }
    if (promo.imagen_path) {
      void supabase.storage.from('noticias-imagenes').remove([promo.imagen_path])
    }
    setPromos(prev => prev.filter(p => p.id !== promo.id))
  }, [])

  return { promos, loading, publicando, publicar, eliminar, refetch: fetchPromos }
}
