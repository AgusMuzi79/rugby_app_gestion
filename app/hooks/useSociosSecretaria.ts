import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react'
import { Alert } from 'react-native'
import { mensajeErrorFunction } from '@/lib/errorFunction'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { filtrarSocios, nombresSocio } from '@/lib/busquedaSocios'
import type { VinculoServicio } from '@/lib/secretariaNuvix'
import { supabase, selectAllRows } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'

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
  nombre:           string    // padrón NUVIX (o el de la app si no hay)
  nombreApp:        string    // profiles.nombre (lo edita el socio)
  email:            string    // fetched separately if needed
  categoria:        string
  categoria_id:     string
}

// Sin filtro MOROSO: el estado 'moroso' no lo setea nadie (la deuda real es el
// semáforo de NUVIX, que se ve en el panel web › Deudas).
type FiltroEstado = 'todos' | 'activo' | 'pendiente' | 'inactivo'

export function useSociosSecretaria() {
  const [socios, setSocios]             = useState<SocioItem[]>([])
  const [categorias, setCategorias]     = useState<CategoriaSocio[]>([])
  const [servicios, setServicios]       = useState<ServicioOpcional[]>([])
  // Vínculos del socio abierto: el importe real (NUVIX) manda sobre el catálogo.
  const [serviciosSocio, setServiciosSocio] = useState<VinculoServicio[]>([])
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [filtro, setFiltro]             = useState<FiltroEstado>('todos')
  const [busqueda, setBusqueda]         = useState('')
  // Errores de lectura: un fallo no se muestra como "no hay socios" ni como
  // "sin servicios" (auditoría UX secretaría, T12).
  const [errorLista, setErrorLista]           = useState<string | null>(null)
  const [errorCategorias, setErrorCategorias] = useState<string | null>(null)
  const [errorServicios, setErrorServicios]   = useState<string | null>(null)
  const [errorVinculos, setErrorVinculos]     = useState<string | null>(null)

  const fetchServicios = useCallback(async () => {
    const { data, error } = await db
      .from('servicios_opcionales')
      .select('id, nombre, descripcion, monto_mensual, activo')
      .eq('activo', true)
      .order('nombre')
    if (error) { setErrorServicios(mensajeErrorCarga('los servicios del club', error)); return }
    setErrorServicios(null)
    setServicios((data ?? []) as ServicioOpcional[])
  }, [])

  const fetchServiciosSocio = useCallback(async (socioId: string) => {
    const { data, error } = await db
      .from('socio_servicios')
      .select('servicio_id, importe')
      .eq('socio_id', socioId)
    if (error) {
      setServiciosSocio([])
      setErrorVinculos(mensajeErrorCarga('los servicios del socio', error))
      return
    }
    setErrorVinculos(null)
    setServiciosSocio((data ?? []) as VinculoServicio[])
  }, [])

  const toggleServicio = useCallback(async (socioId: string, servicioId: string, agregar: boolean) => {
    if (agregar) {
      const { error } = await db.from('socio_servicios').insert({ socio_id: socioId, servicio_id: servicioId })
      if (error) { Alert.alert('Error', error.message); return }
      // Alta manual: sin importe propio, se toma el de catálogo hasta que lo liquide NUVIX.
      setServiciosSocio(prev => [...prev, { servicio_id: servicioId, importe: null }])
    } else {
      const { error } = await db.from('socio_servicios').delete()
        .eq('socio_id', socioId).eq('servicio_id', servicioId)
      if (error) { Alert.alert('Error', error.message); return }
      setServiciosSocio(prev => prev.filter(v => v.servicio_id !== servicioId))
    }
  }, [])

  const fetchCategorias = useCallback(async () => {
    const { data, error } = await db
      .from('categorias_socio')
      .select('id, nombre, descripcion, monto_mensual, activa')
      .order('nombre')
    if (error) {
      console.error('[useSociosSecretaria] fetchCategorias error:', error)
      setErrorCategorias(mensajeErrorCarga('las categorías', error))
      return
    }
    setErrorCategorias(null)
    setCategorias((data ?? []) as CategoriaSocio[])
  }, [])

  const fetchSocios = useCallback(async () => {
    empezar()
    try {
      const data = await selectAllRows<Record<string, unknown>>((from, to) =>
        db
          .from('socios')
          .select(`
            id, numero_socio, dni, estado, foto_path, foto_validada, created_at, categoria_id, nombre_padron,
            categorias_socio ( nombre ),
            profiles!socios_profile_id_fkey ( nombre )
          `)
          .order('numero_socio')
          .range(from, to)
      )

      const normalized: SocioItem[] = (data ?? []).map((s: Record<string, unknown>) => ({
        id:            s.id as string,
        numero_socio:  s.numero_socio as string,
        dni:           s.dni as string,
        estado:        s.estado as string,
        foto_path:     s.foto_path as string | null,
        foto_validada: s.foto_validada as boolean,
        created_at:    s.created_at as string,
        ...nombresSocio(s.nombre_padron as string | null, s.profiles as { nombre: string | null } | null),
        email:             '',
        categoria:         (s.categorias_socio as { nombre: string } | null)?.nombre ?? '—',
        categoria_id:      s.categoria_id as string,
      }))

      setSocios(normalized)
      setErrorLista(null)
    } catch (err) {
      // selectAllRows lanza el error de Supabase: se avisa y se mantiene lo cargado.
      setErrorLista(mensajeErrorCarga('los socios', err))
    } finally {
      terminar()
    }
  }, [empezar, terminar])

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

  const reintentarDetalle = useCallback(async (socioId: string) => {
    await Promise.all([fetchCategorias(), fetchServicios(), fetchServiciosSocio(socioId)])
  }, [fetchCategorias, fetchServicios, fetchServiciosSocio])

  // La búsqueda se difiere para que el TextInput no espere al filtrado de ~1.500 filas.
  const busquedaDiferida = useDeferredValue(busqueda)
  const sociosFiltrados = useMemo(
    () => filtrarSocios(socios, filtro, busquedaDiferida),
    [socios, filtro, busquedaDiferida],
  )

  const desactivarSocio = useCallback(async (socioId: string): Promise<boolean> => {
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'deactivate', socio_id: socioId },
    })
    if (res.error) { Alert.alert('Error', await mensajeErrorFunction(res.error, 'No se pudo desactivar al socio.')); return false }
    setSocios(prev => prev.map(s => s.id === socioId ? { ...s, estado: 'inactivo' } : s))
    return true
  }, [])

  const reactivarSocio = useCallback(async (socioId: string): Promise<boolean> => {
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'reactivate', socio_id: socioId },
    })
    if (res.error) { Alert.alert('Error', await mensajeErrorFunction(res.error, 'No se pudo reactivar al socio.')); return false }
    const nuevoEstado = res.data?.estado ?? 'pendiente'
    setSocios(prev => prev.map(s => s.id === socioId ? { ...s, estado: nuevoEstado } : s))
    return true
  }, [])

  const validarFoto = useCallback(async (socioId: string): Promise<{ validada: boolean; mensaje?: string; estado?: string }> => {
    const res = await supabase.functions.invoke('admin-socios', {
      body: { action: 'validate-photo', socio_id: socioId },
    })
    if (res.error) return { validada: false, mensaje: await mensajeErrorFunction(res.error, 'No se pudo validar la foto.') }
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
    errorLista,
    // Lo que usa el detalle: catálogo (categorías, servicios) y vínculos del socio.
    errorDetalle: primerError(errorVinculos, errorServicios, errorCategorias),
    reintentarDetalle,
    todosLosSocios: socios,
    categorias,
    servicios,
    serviciosSocio,
    loading,
    refrescando,
    filtro,
    setFiltro,
    busqueda,
    setBusqueda,
    desactivarSocio,
    reactivarSocio,
    validarFoto,
    crearCategoria,
    fotoSignedUrl,
    fetchServiciosSocio,
    toggleServicio,
    refetch: fetchSocios,
  }
}
