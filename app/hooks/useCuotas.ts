import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useAuthStore } from '@/stores/authStore'

export interface Cuota {
  id:                string
  periodo:           string   // YYYY-MM
  monto:             number
  estado:            'pendiente' | 'en_revision' | 'pagado'
  fecha_pago:        string | null
  comprobante_path:  string | null
}

export interface ServicioActivo {
  id:            string
  nombre:        string
  monto_mensual: number
}

function periodoHoy(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function useCuotas() {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [socioId,          setSocioId]          = useState<string | null>(null)
  const [cuotas,           setCuotas]           = useState<Cuota[]>([])
  const [loading,          setLoading]          = useState(true)
  const [subiendo,         setSubiendo]         = useState<string | null>(null)
  const [serviciosActivos, setServiciosActivos] = useState<ServicioActivo[]>([])
  const [totalMensual,     setTotalMensual]     = useState(0)
  const [categoriaLabel,   setCategoriaLabel]   = useState<string>('')
  const [montoCategoria,   setMontoCategoria]   = useState<number>(0)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    const { data: socio } = await db
      .from('socios')
      .select('id, categorias_socio(nombre, monto_mensual)')
      .eq('profile_id', session.user.id)
      .single()

    if (!socio) { setLoading(false); return }

    setSocioId(socio.id)

    const cat = socio.categorias_socio as { nombre: string; monto_mensual: number } | null
    const montoCategoria: number = cat?.monto_mensual ?? 0
    setCategoriaLabel(cat?.nombre ?? '')
    setMontoCategoria(montoCategoria)

    const { data: socioServiciosData } = await db
      .from('socio_servicios')
      .select('servicios_opcionales(id, nombre, monto_mensual)')
      .eq('socio_id', socio.id)

    const servicios: ServicioActivo[] = (socioServiciosData ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((ss: any) => ss.servicios_opcionales)
      .filter(Boolean)

    const montoServicios = servicios.reduce((s: number, srv: ServicioActivo) => s + srv.monto_mensual, 0)
    const total = montoCategoria + montoServicios

    setServiciosActivos(servicios)
    setTotalMensual(total)

    const { data } = await db
      .from('cuotas')
      .select('id, periodo, monto, estado, comprobante_path, fecha_pago:pagos_socios(created_at)')
      .eq('socio_id', socio.id)
      .order('periodo', { ascending: false })

    const normalized: Cuota[] = (data ?? []).map((c: Record<string, unknown>) => {
      const pagos = c.fecha_pago as { created_at: string }[] | null
      return {
        id:               c.id as string,
        periodo:          c.periodo as string,
        monto:            c.monto as number,
        estado:           c.estado as Cuota['estado'],
        fecha_pago:       pagos?.[0]?.created_at ?? null,
        comprobante_path: c.comprobante_path as string | null,
      }
    })

    const hoy = periodoHoy()
    if (!normalized.some(c => c.periodo === hoy)) {
      normalized.unshift({
        id:               `virtual-${hoy}`,
        periodo:          hoy,
        monto:            total,
        estado:           'pendiente',
        fecha_pago:       null,
        comprobante_path: null,
      })
    }

    setCuotas(normalized)
    setLoading(false)
  }, [session])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  const subirComprobante = useCallback(async (cuotaId: string) => {
    if (!socioId) return

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitás permitir acceso a la galería.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return

    const isVirtual = cuotaId.startsWith('virtual-')
    setSubiendo(cuotaId)

    try {
      const asset    = result.assets[0]
      const base64   = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' })
      const filePath = `${socioId}/${cuotaId.replace('virtual-', '')}.jpg`

      const { error: uploadErr } = await supabase.storage
        .from('comprobantes')
        .upload(filePath, decodeBase64(base64), { contentType: 'image/jpeg', upsert: true })

      if (uploadErr) {
        Alert.alert('Error', 'No se pudo subir el comprobante.')
        return
      }

      if (!isVirtual) {
        await db
          .from('cuotas')
          .update({ estado: 'en_revision', comprobante_path: filePath })
          .eq('id', cuotaId)
      }

      // Actualizar estado local sin refetch
      setCuotas(prev => prev.map(c =>
        c.id === cuotaId
          ? { ...c, estado: 'en_revision', comprobante_path: filePath }
          : c
      ))
    } catch {
      Alert.alert('Error', 'Ocurrió un error al subir el comprobante.')
    } finally {
      setSubiendo(null)
    }
  }, [socioId, db])

  return {
    cuotas,
    loading,
    subiendo,
    subirComprobante,
    refetch: fetch,
    serviciosActivos,
    totalMensual,
    categoriaLabel,
    montoCategoria,
  }
}
