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

export function useCuotas() {
  const { session } = useAuthStore()
  const [socioId, setSocioId]   = useState<string | null>(null)
  const [cuotas, setCuotas]     = useState<Cuota[]>([])
  const [loading, setLoading]   = useState(true)
  const [pagando, setPagando]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: socio } = await db
      .from('socios')
      .select('id')
      .eq('profile_id', session.user.id)
      .single()

    if (!socio) { setLoading(false); return }

    setSocioId(socio.id)

    const { data } = await db
      .from('cuotas')
      .select('id, periodo, monto, estado, fecha_pago:pagos_socios(created_at)')
      .eq('socio_id', socio.id)
      .order('periodo', { ascending: false })

    // Flatten: fecha_pago viene del join como array — tomar el primero si existe
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

    setCuotas(normalized)
    setLoading(false)
  }, [session])

  useEffect(() => { fetch() }, [fetch])

  const iniciarPago = useCallback(async (cuotaId: string) => {
    setPagando(cuotaId)
    try {
      const res = await supabase.functions.invoke('socios-pagos', {
        body: { action: 'checkout', cuota_id: cuotaId },
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
  }, [])

  return { cuotas, loading, pagando, iniciarPago, refetch: fetch }
}
