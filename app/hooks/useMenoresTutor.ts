import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useTutorStore, type MenorTutor } from '@/stores/tutorStore'

// Lists the minors linked to the logged-in tutor and publishes them to
// useTutorStore. RLS: tutores_menores_select_own + socios_select_tutor +
// profiles_select_tutor_de_menor (migration 20261010000000_tutor_menores).
export function useMenoresTutor() {
  const userId     = useAuthStore(s => s.session?.user.id)
  const menores    = useTutorStore(s => s.menores)
  const setMenores = useTutorStore(s => s.setMenores)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchMenores = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: links, error: linksError } = await db
      .from('tutores_menores')
      .select('socio_id, relacion')
      .eq('tutor_profile_id', userId)

    if (linksError) {
      setError('No se pudieron cargar los datos. Probá de nuevo.')
      setLoading(false)
      return
    }

    const relacionPorSocio = new Map<string, string>(
      (links ?? []).map((l: { socio_id: string; relacion: string }) => [l.socio_id, l.relacion]),
    )
    const ids = [...relacionPorSocio.keys()]
    if (ids.length === 0) {
      setMenores([])
      setLoading(false)
      return
    }

    const { data: socios, error: sociosError } = await db
      .from('socios')
      .select('id, numero_socio, profiles!socios_profile_id_fkey ( nombre )')
      .in('id', ids)

    if (sociosError) {
      setError('No se pudieron cargar los datos. Probá de nuevo.')
      setLoading(false)
      return
    }

    const lista: MenorTutor[] = (socios ?? [])
      .map((s: { id: string; numero_socio: string; profiles: { nombre: string } | null }) => ({
        id:           s.id,
        nombre:       s.profiles?.nombre ?? '—',
        numero_socio: s.numero_socio,
        relacion:     relacionPorSocio.get(s.id) ?? 'otro',
      }))
      .sort((a: MenorTutor, b: MenorTutor) => a.nombre.localeCompare(b.nombre))

    setMenores(lista)
    setLoading(false)
  }, [userId, setMenores])

  useEffect(() => { void fetchMenores() }, [fetchMenores])

  return { menores, loading, error, refetch: fetchMenores }
}
