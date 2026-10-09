import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { buildNoticiaSubcomision } from '@/lib/noticiaSubcomision'
import { resultadoBorrado } from '@/lib/comunicadosAdmin'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export interface NoticiaSubco {
  id:          string
  titulo:      string
  cuerpo:      string
  etiquetas:   string[]
  created_at:  string
  imagen_path: string | null
  imagenUrl:   string | null
}

const BUCKET = 'noticias-imagenes'
const LIMITE = 50

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Subcomisión noticias: same flow as Buffet promos (usePromosBuffet) — optional
// image uploaded first to the public 'noticias-imagenes' bucket under
// {uid}/{timestamp}.jpg, then a single insert published immediately to every
// member, then the 'noticia_publicada' push with the title.
// Payload rules (etiquetas from profiles.deporte, cuerpo '' when title-only)
// live in lib/noticiaSubcomision.ts.
export function useNoticiasSubcomision() {
  const { session } = useAuthStore()
  const [noticias, setNoticias]     = useState<NoticiaSubco[]>([])
  const [deporte, setDeporte]       = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)

  const fetchNoticias = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('noticias')
      .select('id, titulo, cuerpo, etiquetas, created_at, imagen_path')
      .order('created_at', { ascending: false })
      .limit(LIMITE)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    setNoticias((data ?? []).map(n => ({
      ...n,
      imagenUrl: n.imagen_path
        ? supabase.storage.from(BUCKET).getPublicUrl(n.imagen_path).data.publicUrl
        : null,
    })))
    setLoading(false)
  }, [])

  const fetchDeporte = useCallback(async () => {
    if (!session?.user.id) return
    const { data, error: err } = await supabase
      .from('profiles')
      .select('deporte')
      .eq('id', session.user.id)
      .single()
    if (err) { setError(err.message); return }
    setDeporte(data?.deporte ?? null)
  }, [session?.user.id])

  useEffect(() => { void fetchNoticias() }, [fetchNoticias])
  useEffect(() => { void fetchDeporte() }, [fetchDeporte])
  useRefreshOnFocus(fetchNoticias)

  const publicar = useCallback(async (
    titulo: string,
    descripcion: string,
    imagenUri?: string | null,
  ): Promise<boolean> => {
    const autorId = session?.user.id ?? ''
    const validacion = buildNoticiaSubcomision({ titulo, descripcion, deporte, autorId })
    if (!validacion.ok) {
      Alert.alert('Error', validacion.error === 'titulo_vacio'
        ? 'El título es obligatorio.'
        : 'Tu sesión expiró. Volvé a ingresar.')
      return false
    }

    setPublicando(true)

    let imagenPath: string | null = null
    if (imagenUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(imagenUri, { encoding: 'base64' })
        const path   = `${autorId}/${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
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

    const { data, error: insertErr } = await supabase
      .from('noticias')
      .insert({ ...validacion.payload, imagen_path: imagenPath })
      .select('id')
      .single()

    if (insertErr || !data) {
      Alert.alert('Error', insertErr?.message ?? 'No se pudo publicar la noticia.')
      if (imagenPath) await supabase.storage.from(BUCKET).remove([imagenPath])
      setPublicando(false)
      return false
    }

    // The noticia is already published; a push failure is reported but does
    // not undo it.
    const { error: pushErr } = await supabase.functions.invoke('notifications', {
      body: {
        type: 'noticia_publicada',
        payload: { titulo: validacion.payload.titulo, noticiaId: data.id, audiencia: 'todos' },
      },
    })
    if (pushErr) {
      Alert.alert('Noticia publicada', 'La noticia se publicó, pero no se pudo enviar la notificación a los socios.')
    }

    await fetchNoticias()
    setPublicando(false)
    return true
  }, [session?.user.id, deporte, fetchNoticias])

  const eliminar = useCallback(async (noticia: NoticiaSubco) => {
    const { data, error: err } = await supabase.from('noticias').delete().eq('id', noticia.id).select('id')
    const resultado = resultadoBorrado(err, data)
    if (resultado === 'error') { Alert.alert('Error', err?.message ?? 'No se pudo eliminar la noticia.'); return }
    if (resultado === 'sin_filas') {
      Alert.alert('No se eliminó', 'No tenés permiso para eliminar esta noticia o ya no existe.')
      await fetchNoticias()
      return
    }
    if (noticia.imagen_path) {
      // Orphan image cleanup only — the noticia is already gone.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([noticia.imagen_path])
      if (rmErr) console.warn('noticias: image cleanup failed', rmErr.message)
    }
    setNoticias(prev => prev.filter(n => n.id !== noticia.id))
  }, [fetchNoticias])

  return { noticias, deporte, loading, error, publicando, publicar, eliminar, refetch: fetchNoticias }
}
