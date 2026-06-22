import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface CategoriaSocio {
  id:            string
  nombre:        string
  descripcion:   string | null
  monto_mensual: number
  activa:        boolean
}

export interface ServicioOpcional {
  id:            string
  nombre:        string
  descripcion:   string | null
  monto_mensual: number
  activo:        boolean
}

export interface SocioItem {
  id:            string
  numero_socio:  string
  dni:           string
  estado:        string
  foto_path:        string | null
  foto_validada:    boolean
  created_at:       string
  nombre:           string    // from profiles
  email:            string    // fetched separately if needed
  categoria:        string
  categoria_id:     string
  mp_card_last_four: string | null
  mp_card_brand:     string | null
}

export interface CardFormData {
  card_number:      string
  expiration_month: number
  expiration_year:  number
  security_code:    string
  cardholder_name:  string
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
  const [socios, setSocios]             = useState<SocioItem[]>([])
  const [categorias, setCategorias]     = useState<CategoriaSocio[]>([])
  const [servicios, setServicios]       = useState<ServicioOpcional[]>([])
  const [serviciosSocio, setServiciosSocio] = useState<string[]>([]) // servicio_id[]
  const [loading, setLoading]           = useState(true)
  const [filtro, setFiltro]             = useState<FiltroEstado>('todos')
  const [creando, setCreando]           = useState(false)

  const fetchServicios = useCallback(async () => {
    const { data } = await db
      .from('servicios_opcionales')
      .select('id, nombre, descripcion, monto_mensual, activo')
      .eq('activo', true)
      .order('nombre')
    setServicios((data ?? []) as ServicioOpcional[])
  }, [])

  const fetchServiciosSocio = useCallback(async (socioId: string) => {
    const { data } = await db
      .from('socio_servicios')
      .select('servicio_id')
      .eq('socio_id', socioId)
    setServiciosSocio((data ?? []).map((r: { servicio_id: string }) => r.servicio_id))
  }, [])

  const toggleServicio = useCallback(async (socioId: string, servicioId: string, agregar: boolean) => {
    if (agregar) {
      const { error } = await db.from('socio_servicios').insert({ socio_id: socioId, servicio_id: servicioId })
      if (error) { Alert.alert('Error', error.message); return }
      setServiciosSocio(prev => [...prev, servicioId])
    } else {
      const { error } = await db.from('socio_servicios').delete()
        .eq('socio_id', socioId).eq('servicio_id', servicioId)
      if (error) { Alert.alert('Error', error.message); return }
      setServiciosSocio(prev => prev.filter(id => id !== servicioId))
    }
  }, [])

  const fetchCategorias = useCallback(async () => {
    const { data, error } = await db
      .from('categorias_socio')
      .select('id, nombre, descripcion, monto_mensual, activa')
      .order('nombre')
    if (error) {
      console.error('[useSociosSecretaria] fetchCategorias error:', error)
      Alert.alert('Error', 'No se pudieron cargar las categorías: ' + error.message)
    }
    setCategorias((data ?? []) as CategoriaSocio[])
  }, [])

  const fetchSocios = useCallback(async () => {
    setLoading(true)
    const { data } = await db
      .from('socios')
      .select(`
        id, numero_socio, dni, estado, foto_path, foto_validada, created_at, categoria_id,
        mp_card_last_four, mp_card_brand,
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
      nombre:            (s.profiles as { nombre: string } | null)?.nombre ?? '—',
      email:             '',
      categoria:         (s.categorias_socio as { nombre: string } | null)?.nombre ?? '—',
      categoria_id:      s.categoria_id as string,
      mp_card_last_four: s.mp_card_last_four as string | null,
      mp_card_brand:     s.mp_card_brand as string | null,
    }))

    setSocios(normalized)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCategorias()
    fetchServicios()
    fetchSocios()
  }, [fetchCategorias, fetchServicios, fetchSocios])

  const refreshAll = useCallback(() => {
    fetchCategorias()
    fetchServicios()
    fetchSocios()
  }, [fetchCategorias, fetchServicios, fetchSocios])
  useRefreshOnFocus(refreshAll)

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

  const registrarPagoManual = useCallback(async (
    socioId:   string,
    periodo:   string,
    monto:     number,
    formaPago: 'efectivo' | 'transferencia',
  ): Promise<boolean> => {
    const res = await supabase.functions.invoke('socios-pagos', {
      body: { action: 'manual', socio_id: socioId, periodo, monto, forma_pago: formaPago },
    })
    if (res.error || res.data?.error) {
      Alert.alert('Error', res.data?.error ?? res.error?.message ?? 'Error al registrar pago')
      return false
    }
    return true
  }, [])

  const associateCard = useCallback(async (socioId: string, data: CardFormData): Promise<boolean> => {
    const res = await supabase.functions.invoke('socios-pagos', {
      body: { action: 'associate-card', socio_id: socioId, ...data },
    })
    if (res.error || res.data?.error) {
      Alert.alert('Error', res.data?.error ?? res.error?.message ?? 'Error al asociar tarjeta')
      return false
    }
    setSocios(prev => prev.map(s => s.id === socioId
      ? { ...s, mp_card_last_four: res.data.last_four ?? null, mp_card_brand: res.data.brand ?? null }
      : s
    ))
    return true
  }, [])

  const removeCard = useCallback(async (socioId: string): Promise<boolean> => {
    const res = await supabase.functions.invoke('socios-pagos', {
      body: { action: 'remove-card', socio_id: socioId },
    })
    if (res.error || res.data?.error) {
      Alert.alert('Error', res.data?.error ?? res.error?.message ?? 'Error al quitar tarjeta')
      return false
    }
    setSocios(prev => prev.map(s => s.id === socioId
      ? { ...s, mp_card_last_four: null, mp_card_brand: null }
      : s
    ))
    return true
  }, [])

  const chargeCard = useCallback(async (socioId: string, periodo: string): Promise<boolean> => {
    const res = await supabase.functions.invoke('socios-pagos', {
      body: { action: 'charge-card', socio_id: socioId, periodo },
    })
    if (res.error || res.data?.error) {
      Alert.alert('Error', res.data?.error ?? res.error?.message ?? 'Error al cobrar con tarjeta')
      return false
    }
    Alert.alert('Cobro iniciado ✓', `Se procesó el cobro del período ${periodo}.`)
    return true
  }, [])

  return {
    socios: sociosFiltrados,
    todosLosSocios: socios,
    categorias,
    servicios,
    serviciosSocio,
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
    registrarPagoManual,
    associateCard,
    removeCard,
    chargeCard,
    fetchServiciosSocio,
    toggleServicio,
    refetch: fetchSocios,
  }
}
