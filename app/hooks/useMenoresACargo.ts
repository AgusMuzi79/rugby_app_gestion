import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useAuthStore } from '@/stores/authStore'

// Dependientes menores de edad del grupo familiar del titular logueado.
// La RLS (migración 20260813000000) ya filtra por cabecera_id + menor de
// edad — acá sólo pedimos "mis dependientes", no hace falta re-chequear nada.
export interface MenorACargo {
  id:                 string
  nombre:             string
  categoriaLabel:     string
  alDia:              boolean
  deudaActualizadaAt: string | null
}

export function useMenoresACargo() {
  const { session } = useAuthStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [menores, setMenores] = useState<MenorACargo[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!session?.user.id) return
    setLoading(true)

    const { data: propio } = await db
      .from('socios')
      .select('id')
      .eq('profile_id', session.user.id)
      .single()

    if (!propio) { setMenores([]); setLoading(false); return }

    const { data } = await db
      .from('socios')
      .select('id, semaforo, deuda_actualizada_at, categorias_socio(nombre), profiles!socios_profile_id_fkey(nombre)')
      .eq('cabecera_id', propio.id)

    const normalized: MenorACargo[] = (data ?? []).map((s: Record<string, unknown>) => {
      const categoria = s.categorias_socio as { nombre: string } | null
      const perfil    = s.profiles as { nombre: string } | null
      return {
        id:                 s.id as string,
        nombre:             perfil?.nombre ?? 'Socio',
        categoriaLabel:     categoria?.nombre ?? '',
        alDia:              !['amarillo', 'rojo'].includes(s.semaforo as string),
        deudaActualizadaAt: (s.deuda_actualizada_at as string | null) ?? null,
      }
    })

    setMenores(normalized)
    setLoading(false)
  }, [session])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  return { menores, loading, refetch: fetch }
}
