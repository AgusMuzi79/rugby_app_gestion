import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface CategoriaSocio {
  id:            string
  nombre:        string
  descripcion:   string | null
  monto_mensual: number
  activa:        boolean
}

export interface SocioItem {
  id:            string
  numero_socio:  string
  dni:           string
  estado:        string
  foto_path:     string | null
  foto_validada: boolean
  created_at:    string
  nombre:        string    // from profiles
  email:         string    // fetched separately if needed
  categoria:     string
  categoria_id:  string
}

interface NuevoSocioPayload {
  email:            string
  nombre:           string
  dni:              string
  categoria_id:     string
  fecha_nacimiento?: string
}

type FiltroEstado = 'todos' | 'activo' | 'moroso' | 'pendiente' | 'inactivo'

export function useSociosSecretaria() {
  const [socios, setSocios]         = useState<SocioItem[]>([])
  const [categorias, setCategorias] = useState<CategoriaSocio[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtro, setFiltro]         = useState<FiltroEstado>('todos')
  const [creando, setCreando]       = useState(false)

  const fetchCategorias = useCallback(async () => {
    const { data } = await db
      .from('categorias_socio')
      .select('id, nombre, descripcion, monto_mensual, activa')
      .order('nombre')
    setCategorias((data ?? []) as CategoriaSocio[])
  }, [])

  const fetchSocios = useCallback(async () => {
    setLoading(true)
    const { data } = await db
      .from('socios')
      .select(`
        id, numero_socio, dni, estado, foto_path, foto_validada, created_at, categoria_id,
        categorias_socio ( nombre ),
        profiles!socios_profile_id_fkey ( nombre )
      `)
      .order('numero_socio')

    const normalized: SocioItem[] = (data ?? []).map((s: Record<string, unknown>) => ({
      id:            s.id as string,
      numero_socio:  s.numero_socio as string,
      dni:           s.dni as string,
      estado:        s.estado as string,
      foto_path:     s.foto_path as string | null,
      foto_validada: s.foto_validada as boolean,
      created_at:    s.created_at as string,
      nombre:        (s.profiles as { nombre: string } | null)?.nombre ?? '—',
      email:         '',
      categoria:     (s.categorias_socio as { nombre: string } | null)?.nombre ?? '—',
      categoria_id:  s.categoria_id as string,
    }))

    setSocios(normalized)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCategorias()
    fetchSocios()
  }, [fetchCategorias, fetchSocios])

  const sociosFiltrados = socios.filter(s =>
    filtro === 'todos' ? true : s.estado === filtro
  )

  const crearSocio = useCallback(async (payload: NuevoSocioPayload): Promise<boolean> => {
    setCreando(true)
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'create', ...payload },
    })
    setCreando(false)
    if (res.error || res.data?.error) {
      Alert.alert('Error', res.data?.error ?? res.error?.message ?? 'Error al crear socio')
      return false
    }
    await fetchSocios()
    return true
  }, [fetchSocios])

  const desactivarSocio = useCallback(async (socioId: string): Promise<boolean> => {
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'deactivate', socio_id: socioId },
    })
    if (res.error) { Alert.alert('Error', res.error.message); return false }
    setSocios(prev => prev.map(s => s.id === socioId ? { ...s, estado: 'inactivo' } : s))
    return true
  }, [])

  const reactivarSocio = useCallback(async (socioId: string): Promise<boolean> => {
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'reactivate', socio_id: socioId },
    })
    if (res.error) { Alert.alert('Error', res.error.message); return false }
    const nuevoEstado = res.data?.estado ?? 'pendiente'
    setSocios(prev => prev.map(s => s.id === socioId ? { ...s, estado: nuevoEstado } : s))
    return true
  }, [])

  const validarFoto = useCallback(async (socioId: string): Promise<{ validada: boolean; mensaje?: string; estado?: string }> => {
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'validate-photo', socio_id: socioId },
    })
    if (res.error) return { validada: false, mensaje: res.error.message }
    if (res.data?.validada) {
      const nuevoEstado = res.data.estado
      setSocios(prev => prev.map(s =>
        s.id === socioId ? { ...s, foto_validada: true, estado: nuevoEstado } : s
      ))
    }
    return { validada: res.data?.validada ?? false, mensaje: res.data?.mensaje, estado: res.data?.estado }
  }, [])

  const crearCategoria = useCallback(async (nombre: string, monto: number, descripcion?: string): Promise<boolean> => {
    const { error } = await db.from('categorias_socio').insert({ nombre, monto_mensual: monto, descripcion })
    if (error) { Alert.alert('Error', error.message); return false }
    await fetchCategorias()
    return true
  }, [fetchCategorias])

  const fotoSignedUrl = useCallback(async (fotoPath: string): Promise<string | null> => {
    const { data } = await supabase.storage
      .from('socios-fotos')
      .createSignedUrl(fotoPath, 120)
    return data?.signedUrl ?? null
  }, [])

  return {
    socios: sociosFiltrados,
    todosLosSocios: socios,
    categorias,
    loading,
    creando,
    filtro,
    setFiltro,
    crearSocio,
    desactivarSocio,
    reactivarSocio,
    validarFoto,
    crearCategoria,
    fotoSignedUrl,
    refetch: fetchSocios,
  }
}
