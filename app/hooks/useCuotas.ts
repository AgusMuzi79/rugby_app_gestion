import { useState, useEffect, useCallback } from 'react'
import { Linking, Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface Cuota {
  id:         string
  periodo:    string   // YYYY-MM
  monto:      number
  estado:     'pendiente' | 'pagado'
  fecha_pago: string | null
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

export function useCuotas() {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [socioId,          setSocioId]          = useState<string | null>(null)
  const [cuotas,           setCuotas]           = useState<Cuota[]>([])
  const [loading,          setLoading]          = useState(true)
  const [pagando,          setPagando]          = useState<string | null>(null)
  const [cardLastFour,     setCardLastFour]     = useState<string | null>(null)
  const [cardBrand,        setCardBrand]        = useState<string | null>(null)
  const [serviciosActivos, setServiciosActivos] = useState<ServicioActivo[]>([])
  const [totalMensual,     setTotalMensual]     = useState(0)
  const [categoriaLabel,   setCategoriaLabel]   = useState<string>('')
  const [montoCategoria,   setMontoCategoria]   = useState<number>(0)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    // Socio + categoría en un solo query
    const { data: socio } = await db
      .from('socios')
      .select('id, mp_card_last_four, mp_card_brand, categorias_socio(nombre, monto_mensual)')
      .eq('profile_id', session.user.id)
      .single()

    if (!socio) { setLoading(false); return }

    setSocioId(socio.id)
    setCardLastFour(socio.mp_card_last_four ?? null)
    setCardBrand(socio.mp_card_brand ?? null)

    const cat = socio.categorias_socio as { nombre: string; monto_mensual: number } | null
    const montoCategoria: number = cat?.monto_mensual ?? 0
    setCategoriaLabel(cat?.nombre ?? '')
    setMontoCategoria(montoCategoria)

    // Servicios opcionales del socio
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

    // Cuotas históricas
    const { data } = await db
      .from('cuotas')
      .select('id, periodo, monto, estado, fecha_pago:pagos_socios(created_at)')
      .eq('socio_id', socio.id)
      .order('periodo', { ascending: false })

    const normalized: Cuota[] = (data ?? []).map((c: Record<string, unknown>) => {
      const pagos = c.fecha_pago as { created_at: string }[] | null
      return {
        id:         c.id as string,
        periodo:    c.periodo as string,
        monto:      c.monto as number,
        estado:     c.estado as 'pendiente' | 'pagado',
        fecha_pago: pagos?.[0]?.created_at ?? null,
      }
    })

    // Inyectar cuota del mes actual si no existe todavía
    const hoy = periodoHoy()
    if (!normalized.some(c => c.periodo === hoy)) {
      normalized.unshift({
        id:         `virtual-${hoy}`,
        periodo:    hoy,
        monto:      total,
        estado:     'pendiente',
        fecha_pago: null,
      })
    }

    setCuotas(normalized)
    setLoading(false)
  }, [session])

  useEffect(() => { fetch() }, [fetch])

  const iniciarPago = useCallback(async (cuotaId: string) => {
    const cuota = cuotas.find(c => c.id === cuotaId)
    if (!cuota) return

    setPagando(cuotaId)
    try {
      const res = await supabase.functions.invoke('socios-pagos', {
        body: { action: 'checkout', periodo: cuota.periodo },
      })
      if (res.error || !res.data?.checkout_url) {
        Alert.alert('Error', 'No se pudo iniciar el pago. Intentá de nuevo.')
        return
      }
      await Linking.openURL(res.data.checkout_url)
    } catch {
      Alert.alert('Error', 'No se pudo abrir Mercado Pago.')
    } finally {
      setPagando(null)
    }
  }, [cuotas])

  return {
    cuotas,
    loading,
    pagando,
    iniciarPago,
    refetch: fetch,
    cardLastFour,
    cardBrand,
    serviciosActivos,
    totalMensual,
    categoriaLabel,
    montoCategoria,
  }
}
