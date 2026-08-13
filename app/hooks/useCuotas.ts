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

// Misma regla que es_menor_de_edad() en SQL (20260813000000) — mantener en sync.
function esMenorDeEdad(fechaNacimiento: string | null): boolean {
  if (!fechaNacimiento) return false
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - 18)
  return new Date(fechaNacimiento) > limite
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
  // Semáforo real de NUVIX (importador de deuda) — señal aparte de `cuotas`,
  // que es el flujo interino de alias+comprobante de la app. Binario a
  // propósito: el socio no ve colores ni se compara contra otros socios.
  const [alDia,             setAlDia]             = useState(true)
  const [deudaActualizadaAt, setDeudaActualizadaAt] = useState<string | null>(null)
  // Menor de edad: la cuota/deuda propia la administra el titular de su grupo
  // familiar, no el socio mismo — ver migración 20260813000000.
  const [esMenor, setEsMenor] = useState(false)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    const { data: socio } = await db
      .from('socios')
      .select('id, fecha_nacimiento, categorias_socio(nombre, monto_mensual), semaforo, deuda_actualizada_at')
      .eq('profile_id', session.user.id)
      .single()

    if (!socio) { setLoading(false); return }

    setSocioId(socio.id)

    if (esMenorDeEdad(socio.fecha_nacimiento)) {
      // No pedimos cuotas/servicios/deuda: la RLS las bloquea igual, y
      // mostrarle el semáforo propio a un menor es justo lo que queremos evitar.
      setEsMenor(true)
      setCuotas([])
      setServiciosActivos([])
      setTotalMensual(0)
      setLoading(false)
      return
    }
    setEsMenor(false)

    setAlDia(!['amarillo', 'rojo'].includes(socio.semaforo))
    setDeudaActualizadaAt(socio.deuda_actualizada_at ?? null)

    const cat = socio.categorias_socio as { nombre: string; monto_mensual: number } | null
    const montoCategoria: number = cat?.monto_mensual ?? 0
    setCategoriaLabel(cat?.nombre ?? '')
    setMontoCategoria(montoCategoria)

    // importe real del vínculo manda sobre el precio de catálogo (reconciliación
    // con el Padrón de Servicios de NUVIX, 2026-08-05 — ver socios-pagos)
    const { data: socioServiciosData } = await db
      .from('socio_servicios')
      .select('importe, servicios_opcionales(id, nombre, monto_mensual)')
      .eq('socio_id', socio.id)

    const servicios: ServicioActivo[] = (socioServiciosData ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((ss: any) => ss.servicios_opcionales && {
        ...ss.servicios_opcionales,
        monto_mensual: ss.importe ?? ss.servicios_opcionales.monto_mensual,
      })
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

    const cuota = cuotas.find(c => c.id === cuotaId)
    if (!cuota) return

    setSubiendo(cuotaId)

    try {
      const asset    = result.assets[0]
      const base64   = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' })
      const filePath = `${socioId}/${cuota.periodo}.jpg`

      const { error: uploadErr } = await supabase.storage
        .from('comprobantes')
        .upload(filePath, decodeBase64(base64), { contentType: 'image/jpeg', upsert: true })

      if (uploadErr) {
        Alert.alert('Error', 'No se pudo subir el comprobante.')
        return
      }

      // Resuelve/crea la fila de cuotas con el monto correcto — nunca lo escribe el cliente
      const { error: fnError } = await supabase.functions.invoke('socios-pagos', {
        body: { action: 'declarar-comprobante', periodo: cuota.periodo, comprobante_path: filePath },
      })

      if (fnError) {
        Alert.alert('Error', 'El comprobante se subió pero no se pudo registrar. Contactá a Secretaría.')
        return
      }

      await fetch()
    } catch {
      Alert.alert('Error', 'Ocurrió un error al subir el comprobante.')
    } finally {
      setSubiendo(null)
    }
  }, [socioId, cuotas, fetch])

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
    alDia,
    deudaActualizadaAt,
    esMenor,
  }
}
