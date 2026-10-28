import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import { useAuthStore } from '@/stores/authStore'
import { confirmacionPublicar, mensajeResultadoAviso, type Audiencia } from '@/lib/avisoNoticia'

export interface Noticia {
  id:          string
  titulo:      string
  cuerpo:      string
  imagen_path: string | null
  imagenUrl:   string | null
  publicada:   boolean
  etiquetas:   string[]
  created_at:  string
  autor:       string
  // Sólo en la lista de Secretaría (useNoticias(false)); en la del socio quedan
  // en 'todos' / null porque no se piden.
  audiencia:     Audiencia
  notificada_at: string | null
}

interface NuevosDatos {
  titulo:    string
  cuerpo:    string
  etiquetas: string[]
}

export function useNoticias(soloPublicadas: boolean) {
  const { session } = useAuthStore()
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const fetch = useCallback(async () => {
    empezar()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    // La consulta del socio no cambia; Secretaría además trae audiencia y
    // notificada_at para confirmar el aviso push al publicar.
    const columnas = 'id, titulo, cuerpo, imagen_path, publicada, etiquetas, created_at, profiles!noticias_autor_id_fkey(nombre)'
    let q = db
      .from('noticias')
      .select(soloPublicadas ? columnas : `${columnas}, audiencia, notificada_at`)
      .order('created_at', { ascending: false })

    if (soloPublicadas) q = q.eq('publicada', true)

    const { data, error: errLectura } = await q

    // Sin red no es lo mismo que "no hay noticias": se avisa y se deja
    // reintentar (las que ya estaban cargadas se mantienen).
    if (errLectura) {
      setError('No se pudieron cargar las noticias. Revisá tu conexión.')
      terminar()
      return
    }
    setError(null)

    const normalized: Noticia[] = (data ?? []).map((n: Record<string, unknown>) => {
      const imagenPath = n.imagen_path as string | null
      return {
        id:          n.id as string,
        titulo:      n.titulo as string,
        cuerpo:      n.cuerpo as string,
        imagen_path: imagenPath,
        imagenUrl:   imagenPath ? supabase.storage.from('noticias-imagenes').getPublicUrl(imagenPath).data.publicUrl : null,
        publicada:   n.publicada as boolean,
        etiquetas:   (n.etiquetas as string[]) ?? [],
        created_at:  n.created_at as string,
        autor:       (n.profiles as { nombre: string } | null)?.nombre ?? '—',
        audiencia:     (n.audiencia as Audiencia | undefined) ?? 'todos',
        notificada_at: (n.notificada_at as string | null | undefined) ?? null,
      }
    })

    setNoticias(normalized)
    terminar()
  }, [soloPublicadas, empezar, terminar])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  // Pull-to-refresh con su propio indicador: `loading` es sólo la primera
  // carga y las recargas silenciosas (foco, realtime) son `refrescando`; la
  // pantalla del socio usa `refreshing` para el RefreshControl (sólo el tirón).
  const [refreshing, setRefreshing] = useState(false)
  const refrescar = useCallback(async () => {
    setRefreshing(true)
    await fetch()
    setRefreshing(false)
  }, [fetch])

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

  const cambiarPublicada = useCallback(async (noticiaId: string, publicada: boolean): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('noticias')
      .update({ publicada })
      .eq('id', noticiaId)
    if (error) { Alert.alert('Error', error.message); return false }
    setNoticias(prev =>
      prev.map(n => n.id === noticiaId ? { ...n, publicada } : n)
    )
    return true
  }, [])

  // Publicar (sólo Secretaría): igual que el panel web, pide confirmación y
  // manda el aviso push con `notifications`, que lo manda una sola vez por
  // noticia (noticias.notificada_at): republicar no lo repite.
  const publicarConAviso = useCallback(async (noticia: Noticia) => {
    if (!(await cambiarPublicada(noticia.id, true))) return
    const resultado = await supabase.functions.invoke('notifications', {
      body: { type: 'noticia_publicada', payload: { titulo: noticia.titulo, noticiaId: noticia.id, audiencia: noticia.audiencia } },
    }).catch((e: unknown) => ({ error: e, data: null }))
    const mensaje = mensajeResultadoAviso(resultado)
    if (mensaje) Alert.alert('Noticia publicada', mensaje)
    // Relee para tener notificada_at al día (la próxima confirmación lo usa).
    await fetch()
  }, [cambiarPublicada, fetch])

  const togglePublicar = useCallback(async (noticiaId: string, publicada: boolean) => {
    if (!publicada) { await cambiarPublicada(noticiaId, false); return }
    const noticia = noticias.find(n => n.id === noticiaId)
    if (!noticia) return
    const mensaje = confirmacionPublicar({ audiencia: noticia.audiencia, notificadaAt: noticia.notificada_at })
    Alert.alert('Publicar noticia', `"${noticia.titulo}"\n\n${mensaje}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Publicar', onPress: () => { void publicarConAviso(noticia) } },
    ])
  }, [noticias, cambiarPublicada, publicarConAviso])

  const eliminar = useCallback(async (noticiaId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('noticias')
      .delete()
      .eq('id', noticiaId)
    if (error) { Alert.alert('Error', error.message); return }
    setNoticias(prev => prev.filter(n => n.id !== noticiaId))
  }, [])

  return { noticias, loading, refrescando, error, guardando, crear, togglePublicar, eliminar, refetch: fetch, refreshing, refrescar }
}
