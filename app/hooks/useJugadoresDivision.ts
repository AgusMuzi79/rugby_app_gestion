import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export interface DivisionCoordinador {
  id: string
  nombre: string
  deporte: string
  edad_min: number | null
  edad_max: number | null
  linea: 'A' | 'B' | null
}

export interface JugadorDivision {
  id: string
  nombre_completo: string
  fecha_nacimiento: string | null
  /** Edad en la temporada actual (año actual - año de nacimiento). */
  edad: number | null
  /** true si la división tiene rango y la edad cae fuera de él. */
  fueraDeRango: boolean
}

export interface UseJugadoresDivisionReturn {
  divisiones: DivisionCoordinador[]
  divisionSeleccionada: DivisionCoordinador | null
  jugadores: JugadorDivision[]
  loading: boolean
  loadingJugadores: boolean
  error: string | null
  sinDivisiones: boolean
  seleccionarDivision: (id: string) => void
  recargar: () => void
}

export function edadEnTemporada(fechaNacimiento: string | null, anio = new Date().getFullYear()): number | null {
  if (!fechaNacimiento) return null
  const anioNac = Number(fechaNacimiento.slice(0, 4))
  return Number.isFinite(anioNac) && anioNac > 0 ? anio - anioNac : null
}

function estaFueraDeRango(edad: number | null, div: DivisionCoordinador): boolean {
  if (edad === null) return false
  if (div.edad_min === null && div.edad_max === null) return false
  if (div.edad_min !== null && edad < div.edad_min) return true
  if (div.edad_max !== null && edad > div.edad_max) return true
  return false
}

export function useJugadoresDivision(): UseJugadoresDivisionReturn {
  const { session } = useAuthStore()
  const [divisiones, setDivisiones] = useState<DivisionCoordinador[]>([])
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [jugadores, setJugadores] = useState<JugadorDivision[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingJugadores, setLoadingJugadores] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinDivisiones, setSinDivisiones] = useState(false)
  // Evita que una respuesta vieja pise la lista al cambiar rápido de división
  const ultimaConsulta = useRef(0)

  const divisionSeleccionada = divisiones.find(d => d.id === divisionId) ?? null

  const fetchDivisiones = useCallback(async () => {
    if (!session) return
    setError(null)

    const { data: profile, error: errProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    if (errProfile) {
      setError('No se pudieron cargar tus divisiones.')
      setLoading(false)
      return
    }

    const divIds: string[] = (profile?.divisiones as string[] | null) ?? []
    if (divIds.length === 0) {
      setSinDivisiones(true)
      setLoading(false)
      return
    }

    const { data: divsData, error: errDivs } = await supabase
      .from('divisiones')
      .select('id, nombre, deporte, edad_min, edad_max, linea')
      .in('id', divIds)
      .eq('activa', true)
      .order('nombre')

    if (errDivs) {
      setError('No se pudieron cargar tus divisiones.')
      setLoading(false)
      return
    }

    // Los tipos generados todavía no incluyen edad_min/edad_max/linea (migración 1c40819)
    const divs = (divsData ?? []) as unknown as DivisionCoordinador[]
    setDivisiones(divs)
    setSinDivisiones(divs.length === 0)
    // Mantener la selección si sigue siendo válida
    setDivisionId(prev => (prev && divs.some(d => d.id === prev) ? prev : divs[0]?.id ?? null))
    setLoading(false)
  }, [session])

  const fetchJugadores = useCallback(async (div: DivisionCoordinador) => {
    const consulta = ++ultimaConsulta.current
    setLoadingJugadores(true)
    setError(null)

    const { data, error: errJug } = await supabase
      .from('jugadores')
      .select('id, nombre_completo, fecha_nacimiento')
      .eq('division_id', div.id)
      .eq('activo', true)
      .order('nombre_completo')

    if (consulta !== ultimaConsulta.current) return

    if (errJug) {
      setError('No se pudieron cargar los jugadores.')
      setJugadores([])
      setLoadingJugadores(false)
      return
    }

    const anio = new Date().getFullYear()
    setJugadores((data ?? []).map(j => {
      const edad = edadEnTemporada(j.fecha_nacimiento, anio)
      return {
        id: j.id,
        nombre_completo: j.nombre_completo,
        fecha_nacimiento: j.fecha_nacimiento,
        edad,
        fueraDeRango: estaFueraDeRango(edad, div),
      }
    }))
    setLoadingJugadores(false)
  }, [])

  useEffect(() => {
    if (session) fetchDivisiones()
  }, [session, fetchDivisiones])
  useRefreshOnFocus(fetchDivisiones)

  useEffect(() => {
    // Se dispara al cambiar de división y al recargar divisiones (foco).
    const div = divisiones.find(d => d.id === divisionId)
    if (div) fetchJugadores(div)
    else setJugadores([])
  }, [divisionId, divisiones, fetchJugadores])

  return {
    divisiones,
    divisionSeleccionada,
    jugadores,
    loading,
    loadingJugadores,
    error,
    sinDivisiones,
    seleccionarDivision: setDivisionId,
    // Sin división seleccionada (falló la carga de divisiones) se reintenta desde el principio.
    recargar: () => { if (divisionSeleccionada) fetchJugadores(divisionSeleccionada); else fetchDivisiones() },
  }
}
