import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'

interface EstadosSocios {
  activos:   number
  morosos:   number
  pendientes: number
  inactivos: number
}

interface PagoReciente {
  id:          string
  nombre:      string
  numero_socio: string
  periodo:     string
  monto:       number
  forma_pago:  string
  created_at:  string
}

interface DashboardSecretaria {
  estados:       EstadosSocios
  pagosRecientes: PagoReciente[]
  totalSocios:   number
}

const INITIAL: DashboardSecretaria = {
  estados:        { activos: 0, morosos: 0, pendientes: 0, inactivos: 0 },
  pagosRecientes: [],
  totalSocios:    0,
}

export function useDiarioSecretaria() {
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DashboardSecretaria>(INITIAL)

  const fetch = useCallback(async () => {
    setLoading(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Conteos exactos vía count/head — evita traer las filas (y el tope de 1000 de PostgREST)
    const countByEstado = (estado: string) =>
      db.from('socios').select('*', { count: 'exact', head: true }).eq('estado', estado)

    const [activosRes, morososRes, pendientesRes, inactivosRes, totalRes, pagosRes] = await Promise.all([
      countByEstado('activo'),
      countByEstado('moroso'),
      countByEstado('pendiente'),
      countByEstado('inactivo'),
      db.from('socios').select('*', { count: 'exact', head: true }),
      db
        .from('pagos_socios')
        .select(`
          id, monto, forma_pago, created_at,
          cuotas ( periodo ),
          socios ( numero_socio, profiles!socios_profile_id_fkey ( nombre ) )
        `)
        .eq('estado', 'aprobado')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    const estados: EstadosSocios = {
      activos:    activosRes.count    ?? 0,
      morosos:    morososRes.count    ?? 0,
      pendientes: pendientesRes.count ?? 0,
      inactivos:  inactivosRes.count  ?? 0,
    }

    const pagosRecientes: PagoReciente[] = (pagosRes.data ?? []).map((p: Record<string, unknown>) => {
      const socio  = p.socios  as { numero_socio: string; profiles: { nombre: string } | null } | null
      const cuota  = p.cuotas  as { periodo: string } | null
      return {
        id:           p.id as string,
        nombre:       socio?.profiles?.nombre  ?? '—',
        numero_socio: socio?.numero_socio       ?? '—',
        periodo:      cuota?.periodo            ?? '—',
        monto:        p.monto as number,
        forma_pago:   p.forma_pago as string,
        created_at:   p.created_at as string,
      }
    })

    setData({ estados, pagosRecientes, totalSocios: totalRes.count ?? 0 })
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  return { loading, data, refetch: fetch }
}
