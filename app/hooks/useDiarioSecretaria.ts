import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

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

    const [sociosRes, pagosRes] = await Promise.all([
      db.from('socios').select('estado'),
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

    const socios = (sociosRes.data ?? []) as { estado: string }[]
    const estados: EstadosSocios = {
      activos:    socios.filter(x => x.estado === 'activo').length,
      morosos:    socios.filter(x => x.estado === 'moroso').length,
      pendientes: socios.filter(x => x.estado === 'pendiente').length,
      inactivos:  socios.filter(x => x.estado === 'inactivo').length,
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

    setData({ estados, pagosRecientes, totalSocios: socios.length })
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { loading, data, refetch: fetch }
}
