import { useState, useEffect, useCallback } from 'react'
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

export function useCuotas() {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [cuotas,           setCuotas]           = useState<Cuota[]>([])
  const [loading,          setLoading]          = useState(true)
  const [serviciosActivos, setServiciosActivos] = useState<ServicioActivo[]>([])
  const [totalMensual,     setTotalMensual]     = useState(0)
  const [categoriaLabel,   setCategoriaLabel]   = useState<string>('')
  const [montoCategoria,   setMontoCategoria]   = useState<number>(0)
  // Semáforo real de NUVIX (importador de deuda) — señal aparte de `cuotas`,
  // que es el flujo interino de alias+comprobante de la app. Binario a
  // propósito: el socio no ve colores ni se compara contra otros socios.
  const [alDia,             setAlDia]             = useState(true)
  const [deudaActualizadaAt, setDeudaActualizadaAt] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    const { data: socio } = await db
      .from('socios')
      .select('id, categorias_socio(nombre, monto_mensual), semaforo, deuda_actualizada_at')
      .eq('profile_id', session.user.id)
      .single()

    if (!socio) { setLoading(false); return }

    const alDiaSegunClub = !['amarillo', 'rojo'].includes(socio.semaforo)
    setAlDia(alDiaSegunClub)
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

    // La cuota virtual del mes actual sólo se ofrece a pagar por alias si el
    // club (semáforo NUVIX, fuente real de verdad) todavía te marca con deuda.
    // Si ya estás al día, mostrarla igual sería contradecir el propio banner
    // de deuda real.
    const hoy = periodoHoy()
    if (!alDiaSegunClub && !normalized.some(c => c.periodo === hoy)) {
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

  return {
    cuotas,
    loading,
    refetch: fetch,
    serviciosActivos,
    totalMensual,
    categoriaLabel,
    montoCategoria,
    alDia,
    deudaActualizadaAt,
  }
}
