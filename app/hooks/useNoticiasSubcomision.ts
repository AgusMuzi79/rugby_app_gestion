import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  buildNoticiaSubcomision,
  camposImagenesNoticia,
  pathsImagenesNoticia,
  MAX_IMAGENES_NOTICIA,
} from '@/lib/noticiaSubcomision'
import { resultadoBorrado } from '@/lib/comunicadosAdmin'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'

export interface NoticiaSubco {
  id:           string
  titulo:       string
  cuerpo:       string
  etiquetas:    string[]
  created_at:   string
  imagen_path:  string | null
  // Storage paths of the images (`imagenes`, or the legacy imagen_path), in order.
  imagenes:     string[]
  imagenesUrls: string[]
  destacada_hasta: string | null
}

const BUCKET = 'noticias-imagenes'
const LIMITE = 50

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Subcomisión noticias: optional images (up to MAX_IMAGENES_NOTICIA) uploaded
// first, in order, to the public 'noticias-imagenes' bucket under
// {uid}/{timestamp}-{i}.jpg, then a single insert published immediately to
// every member. The 'noticia_publicada' push is sent only when the caller
// passes notificar = true (the "Enviar notificación" checkbox, unchecked by
// default). destacar = true ("Destacar noticia") sets destacada_hasta so the
// item goes first in the member feed for DIAS_DESTACADA days.
// Payload rules (etiquetas from profiles.deporte, cuerpo '' when title-only)
// live in lib/noticiaSubcomision.ts.
export function useNoticiasSubcomision() {
  const { session } = useAuthStore()
  const [noticias, setNoticias]     = useState<NoticiaSubco[]>([])
  const [deporte, setDeporte]       = useState<string | null>(null)
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [error, setError]           = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)

  const fetchNoticias = useCallback(async () => {
    empezar()
    setError(null)
    const { data, error: err } = await supabase
      .from('noticias')
      .select('id, titulo, cuerpo, etiquetas, created_at, imagen_path, imagenes, destacada_hasta')
      .order('created_at', { ascending: false })
      .limit(LIMITE)

    if (err) {
      setError(err.message)
      terminar()
      return
    }

    setNoticias((data ?? []).map(n => {
      const imagenes = pathsImagenesNoticia(n)
      return {
        ...n,
        imagenes,
        imagenesUrls: imagenes.map(path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl),
      }
    }))
    terminar()
  }, [empezar, terminar])

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
    imagenesUris: string[],
    notificar: boolean,
    destacar: boolean,
  ): Promise<boolean> => {
    const autorId = session?.user.id ?? ''
    // The local URIs only count here; the payload gets the storage paths below.
    const validacion = buildNoticiaSubcomision({ titulo, descripcion, deporte, autorId, imagenes: imagenesUris, destacar })
    if (!validacion.ok) {
      Alert.alert('Error', validacion.error === 'titulo_vacio'
        ? 'El título es obligatorio.'
        : validacion.error === 'demasiadas_imagenes'
          ? `Podés agregar hasta ${MAX_IMAGENES_NOTICIA} imágenes.`
          : 'Tu sesión expiró. Volvé a ingresar.')
      return false
    }

    setPublicando(true)

    // Upload in order; if one fails, remove the ones already uploaded (best
    // effort) so no orphan files are left.
    const subidas: string[] = []
    const limpiarSubidas = async () => {
      if (subidas.length === 0) return
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(subidas)
      if (rmErr) console.warn('noticias: image cleanup failed', rmErr.message)
    }
    const inicio = Date.now()
    for (const [i, uri] of imagenesUris.entries()) {
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
        const path   = `${autorId}/${inicio}-${i}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, decodeBase64(base64), { contentType: 'image/jpeg' })
        if (uploadErr) throw uploadErr
        subidas.push(path)
      } catch {
        await limpiarSubidas()
        Alert.alert('Error', imagenesUris.length > 1
          ? `No se pudo subir la imagen ${i + 1} de ${imagenesUris.length}.`
          : 'No se pudo subir la imagen.')
        setPublicando(false)
        return false
      }
    }

    const fila = { ...validacion.payload, ...camposImagenesNoticia(subidas) }
    const { data, error: insertErr } = await supabase
      .from('noticias')
      .insert(fila)
      .select('id')
      .single()

    if (insertErr || !data) {
      Alert.alert('Error', insertErr?.message ?? 'No se pudo publicar la noticia.')
      await limpiarSubidas()
      setPublicando(false)
      return false
    }

    // Push only when the author ticked the checkbox. The noticia is already
    // published; a push failure is reported but does not undo it.
    if (notificar) {
      const { error: pushErr } = await supabase.functions.invoke('notifications', {
        body: {
          type: 'noticia_publicada',
          payload: { titulo: fila.titulo, noticiaId: data.id, audiencia: 'todos' },
        },
      })
      if (pushErr) {
        Alert.alert('Noticia publicada', 'La noticia se publicó, pero no se pudo enviar la notificación a los socios.')
      }
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
    if (noticia.imagenes.length > 0) {
      // Orphan image cleanup only — the noticia is already gone.
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(noticia.imagenes)
      if (rmErr) console.warn('noticias: image cleanup failed', rmErr.message)
    }
    setNoticias(prev => prev.filter(n => n.id !== noticia.id))
  }, [fetchNoticias])

  return { noticias, deporte, loading, refrescando, error, publicar, publicando, eliminar, refetch: fetchNoticias }
}
