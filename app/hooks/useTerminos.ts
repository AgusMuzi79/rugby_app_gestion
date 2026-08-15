import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

interface TerminosState {
  loading: boolean
  pendiente: boolean
  version: string | null
  titulo: string | null
  pdfUrl: string | null
  aceptando: boolean
  error: string | null
}

export function useTerminos() {
  const session = useAuthStore(s => s.session)
  const [state, setState] = useState<TerminosState>({
    loading: true,
    pendiente: false,
    version: null,
    titulo: null,
    pdfUrl: null,
    aceptando: false,
    error: null,
  })
  const [versionId, setVersionId] = useState<string | null>(null)

  const fetchEstado = useCallback(async () => {
    if (!session) {
      setState(s => ({ ...s, loading: false }))
      return
    }
    setState(s => ({ ...s, loading: true, error: null }))

    const { data: activa } = await supabase
      .from('terminos_versiones')
      .select('id, version, titulo, pdf_path')
      .eq('activo', true)
      .maybeSingle()

    if (!activa) {
      setVersionId(null)
      setState(s => ({ ...s, loading: false, pendiente: false, version: null, titulo: null, pdfUrl: null }))
      return
    }

    const { data: aceptacion } = await supabase
      .from('terminos_aceptaciones')
      .select('id')
      .eq('version_id', activa.id)
      .eq('profile_id', session.user.id)
      .maybeSingle()

    const { data: pub } = supabase.storage.from('legales').getPublicUrl(activa.pdf_path)

    setVersionId(activa.id)
    setState({
      loading: false,
      pendiente: !aceptacion,
      version: activa.version,
      titulo: activa.titulo,
      pdfUrl: pub.publicUrl,
      aceptando: false,
      error: null,
    })
  }, [session])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  const aceptar = useCallback(async (): Promise<boolean> => {
    if (!session || !versionId) return false
    setState(s => ({ ...s, aceptando: true, error: null }))
    const { error } = await supabase
      .from('terminos_aceptaciones')
      .insert({ profile_id: session.user.id, version_id: versionId })
    if (error) {
      setState(s => ({ ...s, aceptando: false, error: 'No se pudo registrar la aceptación. Probá de nuevo.' }))
      return false
    }
    setState(s => ({ ...s, aceptando: false, pendiente: false }))
    return true
  }, [session, versionId])

  return { ...state, aceptar, refetch: fetchEstado }
}
