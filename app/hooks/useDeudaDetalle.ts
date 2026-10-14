import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { agruparDeuda, type DeudaAgrupada, type FilaComprobanteDeuda } from '@/lib/deudaSocio'

export type { ComprobanteDeuda, PeriodoDeuda } from '@/lib/deudaSocio'

export interface DeudaDetalle extends DeudaAgrupada {
  fechaCorte: string | null
}

const SIN_DEUDA: DeudaDetalle = { fechaCorte: null, periodos: [], regCesantesTotal: 0, proximosVencimientos: [], saldoAnterior: 0 }

// Deuda del socio en la última importación de NUVIX. Compartido entre
// useDeudaDetalle (modal "Deuda según el club") y useCuotas (monto de la cuota
// virtual), así los dos muestran el mismo número.
// error = true si alguna query falló (no es lo mismo que "sin deuda").
export async function cargarDeudaDetalle(targetSocioId: string): Promise<{ data: DeudaDetalle | null; error: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // La deuda vigente siempre es la de la última importación — reimportar
  // reemplaza (no acumula), pero puede haber importaciones de fechas de
  // corte distintas coexistiendo si en algún momento hay más de una.
  const { data: ultimaImportacion, error: errImportacion } = await db
    .from('importaciones_deuda')
    .select('id, fecha_corte')
    .order('fecha_corte', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errImportacion) return { data: null, error: true }
  if (!ultimaImportacion) return { data: SIN_DEUDA, error: false }

  const { data: comprobantes, error: errComprobantes } = await db
    .from('comprobantes_deuda')
    .select('id, periodo, concepto, vencido, a_vencer, vencimiento, es_saldo_anterior')
    .eq('socio_id', targetSocioId)
    .eq('importacion_id', ultimaImportacion.id)

  if (errComprobantes) return { data: null, error: true }

  return {
    data: {
      fechaCorte: ultimaImportacion.fecha_corte,
      ...agruparDeuda((comprobantes ?? []) as FilaComprobanteDeuda[]),
    },
    error: false,
  }
}

// socioId: undefined = own socio (profile_id = auth.uid()); given = that socio
// by id (tutor viewing a linked minor, RLS comprobantes_deuda_select_tutor).
export function useDeudaDetalle(socioId?: string) {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DeudaDetalle | null>(null)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    const { data: socio } = await db
      .from('socios')
      .select('id')
      .eq(socioId ? 'id' : 'profile_id', socioId ?? session.user.id)
      .single()

    if (!socio) { setLoading(false); return }

    const { data: deuda } = await cargarDeudaDetalle(socio.id)
    setData(deuda)
    setLoading(false)
  }, [session, socioId])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refetch: fetch }
}
