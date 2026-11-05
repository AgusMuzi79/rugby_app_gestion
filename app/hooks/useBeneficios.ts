import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSegments } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import { useAuthStore } from '@/stores/authStore'
import { fechaLocal } from '@/lib/fecha'
import { esVigente, ordenarBeneficios, type Beneficio } from '@/lib/beneficios'

// Club benefits (migration 20261110000000_club_beneficios). RLS already returns
// only active, in-vigencia rows to socios and tutors; esVigente is a second
// guard (stale screen left open past midnight, admin sessions).

const COLUMNAS =
  'id, nombre, rubro, descuento, descripcion, condiciones, direccion, zona, telefono_whatsapp, ' +
  'instagram, sitio_web, logo_url, imagen_url, destacado, orden, activo, vigente_desde, vigente_hasta, ' +
  'created_at, updated_at'

// logo_url / imagen_url are meant to be full URLs; a bare path is taken as an
// object of the public 'beneficios' bucket.
function urlImagen(valor: string | null): string | null {
  const v = valor?.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  return supabase.storage.from('beneficios').getPublicUrl(v).data.publicUrl
}

export function useBeneficios() {
  const [beneficios, setBeneficios] = useState<Beneficio[]>([])
  const [error, setError] = useState<string | null>(null)
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()

  const ultimaConsulta = useRef(0)

  const fetch = useCallback(async () => {
    const consulta = ++ultimaConsulta.current
    empezar()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: errLectura } = await (supabase as any).from('beneficios').select(COLUMNAS)
      // Mount, focus and retry can overlap: only the latest response is applied.
      if (consulta !== ultimaConsulta.current) return

      // Without network is not the same as "no benefits": keep what was loaded
      // and let the screen offer Reintentar.
      if (errLectura) {
        setError('No se pudieron cargar los beneficios. Revisá tu conexión.')
        return
      }
      setError(null)
      const hoy = fechaLocal()
      const lista = ((data ?? []) as Beneficio[])
        .filter(b => esVigente(b, hoy))
        .map(b => ({ ...b, logo_url: urlImagen(b.logo_url), imagen_url: urlImagen(b.imagen_url) }))
      setBeneficios(ordenarBeneficios(lista))
    } catch {
      if (consulta === ultimaConsulta.current) {
        setError('No se pudieron cargar los beneficios. Revisá tu conexión.')
      }
    } finally {
      // terminar() clears loading for everyone, so only the latest request may
      // call it; an older overlapping fetch must not end the first load early.
      if (consulta === ultimaConsulta.current) terminar()
    }
  }, [empezar, terminar])

  useEffect(() => { void fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  // Pull-to-refresh with its own indicator (same as useNoticias).
  const [refreshing, setRefreshing] = useState(false)
  const refrescar = useCallback(async () => {
    setRefreshing(true)
    await fetch()
    setRefreshing(false)
  }, [fetch])

  return { beneficios, loading, refrescando, error, refetch: fetch, refreshing, refrescar }
}

/**
 * Route group the benefit screens live in. The socio screens are re-exported
 * by (tutor); navigating into another group would make the root guard bounce
 * the user back, so links stay inside the current group.
 */
export function useGrupoBeneficios(): '/(socio)' | '/(tutor)' {
  const grupo = useSegments()[0]
  return grupo === '(tutor)' ? '/(tutor)' : '/(socio)'
}

/**
 * Whether the member's carnet shows "al día" (same rule as the carnet badge:
 * estado 'activo' and semáforo not 'rojo'). null while loading or on error, so
 * the detail screen shows no notice instead of a wrong one.
 * `socioId`: the minor for a tutor (useSocioObjetivo); undefined = own socio.
 */
export function useSocioAlDia(socioId?: string): boolean | null {
  const userId = useAuthStore(s => s.session?.user.id)
  const [fila, setFila] = useState<{ estado: string; semaforo: string | null } | null>(null)
  // Only the latest request may write: a tutor switching minors must never see
  // the previous minor's status, even if an older response arrives last.
  const ultimaConsulta = useRef(0)

  // A different member (or session) never inherits the previous status; a
  // plain focus refresh keeps it to avoid the notice flickering.
  useEffect(() => { setFila(null) }, [userId, socioId])

  const fetch = useCallback(async () => {
    const consulta = ++ultimaConsulta.current
    if (!userId) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (supabase as any).from('socios').select('estado, semaforo')
      const { data, error } = await (socioId ? q.eq('id', socioId) : q.eq('profile_id', userId)).maybeSingle()
      if (consulta !== ultimaConsulta.current) return
      setFila(error || !data ? null : (data as { estado: string; semaforo: string | null }))
    } catch {
      if (consulta === ultimaConsulta.current) setFila(null)
    }
  }, [userId, socioId])

  useEffect(() => { void fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  return useMemo(() => {
    if (!fila) return null
    return fila.estado === 'activo' && fila.semaforo !== 'rojo'
  }, [fila])
}
