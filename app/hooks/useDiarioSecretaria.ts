import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ReporteDeuda } from '@/lib/secretariaNuvix'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'

interface EstadosSocios {
  activos:    number
  enRojo:     number   // semáforo NUVIX en rojo (activos o pendientes)
  pendientes: number
  inactivos:  number
}

interface DashboardSecretaria {
  estados:       EstadosSocios
  ultimoReporte: ReporteDeuda | null
  totalSocios:   number
}

const INITIAL: DashboardSecretaria = {
  estados:       { activos: 0, enRojo: 0, pendientes: 0, inactivos: 0 },
  ultimoReporte: null,
  totalSocios:   0,
}

export function useDiarioSecretaria() {
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [data, setData]       = useState<DashboardSecretaria>(INITIAL)
  const [error, setError]     = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)   // hubo al menos una lectura buena

  const fetch = useCallback(async () => {
    empezar()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Conteos exactos vía count/head — evita traer las filas (y el tope de 1000 de PostgREST)
    const countByEstado = (estado: string) =>
      db.from('socios').select('*', { count: 'exact', head: true }).eq('estado', estado)

    // La deuda real es la de NUVIX (semáforo del último reporte importado); el
    // estado 'moroso' de socios no lo setea nadie.
    const [activosRes, enRojoRes, pendientesRes, inactivosRes, totalRes, reporteRes] = await Promise.all([
      countByEstado('activo'),
      db.from('socios').select('*', { count: 'exact', head: true })
        .in('estado', ['activo', 'pendiente']).eq('semaforo', 'rojo'),
      countByEstado('pendiente'),
      countByEstado('inactivo'),
      db.from('socios').select('*', { count: 'exact', head: true }),
      // El último reporte aplicado es el que definió el semáforo actual.
      db.from('importaciones_deuda')
        .select('fecha_corte, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Un error de lectura no es "0 socios": se avisa y se deja reintentar
    // (si ya había datos, se mantienen a la vista).
    const err = primerError(
      activosRes.error, enRojoRes.error, pendientesRes.error, inactivosRes.error, totalRes.error, reporteRes.error,
    )
    if (err) {
      setError(mensajeErrorCarga('el resumen de socios', err))
      terminar()
      return
    }
    setError(null)

    const estados: EstadosSocios = {
      activos:    activosRes.count    ?? 0,
      enRojo:     enRojoRes.count     ?? 0,
      pendientes: pendientesRes.count ?? 0,
      inactivos:  inactivosRes.count  ?? 0,
    }

    setCargado(true)
    setData({
      estados,
      ultimoReporte: (reporteRes.data as ReporteDeuda | null) ?? null,
      totalSocios:   totalRes.count ?? 0,
    })
    terminar()
  }, [empezar, terminar])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  return { loading, refrescando, data, cargado, error, refetch: fetch }
}
