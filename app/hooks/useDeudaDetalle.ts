import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface ComprobanteDeuda {
  id:        string
  vencido:   number
  a_vencer:  number
  vencimiento: string | null
}

export interface PeriodoDeuda {
  periodo:      string // YYYY-MM
  vencido:      number
  comprobantes: ComprobanteDeuda[]
}

export interface DeudaDetalle {
  fechaCorte:            string | null
  periodos:               PeriodoDeuda[]  // deuda real, ya excluye reg_cesantes — orden desc por período
  regCesantesTotal:       number
  proximosVencimientos:   ComprobanteDeuda[] // a_vencer > 0, informativo — no es deuda
  saldoAnterior:          number // filas es_saldo_anterior=true, sin período discreto
}

// socioId: opcional — si se pasa, trae la deuda de ESE socio en vez de la
// propia (usado por el titular para ver el detalle de un menor a cargo; la
// RLS de comprobantes_deuda_select_titular_de_menor es la que autoriza esto).
export function useDeudaDetalle(socioId?: string) {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DeudaDetalle | null>(null)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    let targetSocioId = socioId
    if (!targetSocioId) {
      const { data: socio } = await db
        .from('socios')
        .select('id')
        .eq('profile_id', session.user.id)
        .single()

      if (!socio) { setLoading(false); return }
      targetSocioId = socio.id
    }

    // La deuda vigente siempre es la de la última importación — reimportar
    // reemplaza (no acumula), pero puede haber importaciones de fechas de
    // corte distintas coexistiendo si en algún momento hay más de una.
    const { data: ultimaImportacion } = await db
      .from('importaciones_deuda')
      .select('id, fecha_corte')
      .order('fecha_corte', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!ultimaImportacion) {
      setData({ fechaCorte: null, periodos: [], regCesantesTotal: 0, proximosVencimientos: [], saldoAnterior: 0 })
      setLoading(false)
      return
    }

    const { data: comprobantes } = await db
      .from('comprobantes_deuda')
      .select('id, periodo, concepto, vencido, a_vencer, vencimiento, es_saldo_anterior')
      .eq('socio_id', targetSocioId)
      .eq('importacion_id', ultimaImportacion.id)

    const rows: Record<string, unknown>[] = comprobantes ?? []

    let regCesantesTotal = 0
    let saldoAnterior     = 0
    const porPeriodo      = new Map<string, PeriodoDeuda>()
    const proximosVencimientos: ComprobanteDeuda[] = []

    for (const r of rows) {
      const vencido    = Number(r.vencido ?? 0)
      const aVencer     = Number(r.a_vencer ?? 0)
      const concepto    = r.concepto as string | null
      const periodo     = r.periodo as string | null
      const esSaldoAnt  = r.es_saldo_anterior as boolean

      if (concepto === 'reg_cesantes') {
        regCesantesTotal += vencido
        continue
      }
      if (esSaldoAnt) {
        saldoAnterior += vencido
        continue
      }
      if (vencido > 0 && periodo) {
        const item: ComprobanteDeuda = {
          id: r.id as string,
          vencido,
          a_vencer: aVencer,
          vencimiento: r.vencimiento as string | null,
        }
        const existente = porPeriodo.get(periodo)
        if (existente) {
          existente.vencido += vencido
          existente.comprobantes.push(item)
        } else {
          porPeriodo.set(periodo, { periodo, vencido, comprobantes: [item] })
        }
      }
      if (aVencer > 0) {
        proximosVencimientos.push({
          id: r.id as string,
          vencido: 0,
          a_vencer: aVencer,
          vencimiento: r.vencimiento as string | null,
        })
      }
    }

    const periodos = [...porPeriodo.values()].sort((a, b) => b.periodo.localeCompare(a.periodo))

    setData({
      fechaCorte: ultimaImportacion.fecha_corte,
      periodos,
      regCesantesTotal,
      proximosVencimientos,
      saldoAnterior,
    })
    setLoading(false)
  }, [session, socioId])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refetch: fetch }
}
