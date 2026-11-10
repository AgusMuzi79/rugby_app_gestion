import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { mensajeErrorCarga } from '@/lib/errorCarga'
import { mensajeErrorFunction } from '@/lib/errorFunction'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import {
  ESPERA_BUSQUEDA_MS,
  busquedaColaborador,
  colaboradoresDeDivision,
  divisionInicial,
  marcarDesignado,
  type ColaboradorListado,
  type DivisionColaboradores,
  type ResultadoBusqueda,
} from '@/lib/colaboradores'

// El entrenador designa y quita colaboradores de sus divisiones
// (odd/tasks/colaborador-por-entrenador.md). Todo pasa por la Edge Function
// `colaboradores` (service_role): el entrenador no puede escribir roles ni
// leer socios con su JWT.
export function useColaboradores() {
  const { session } = useAuthStore()

  const [divisiones, setDivisiones] = useState<DivisionColaboradores[]>([])
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [sinDivision, setSinDivision] = useState(false)
  const [colaboradores, setColaboradores] = useState<ColaboradorListado[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [buscado, setBuscado] = useState(false)

  // profileId en curso (asignar o quitar), para deshabilitar ese botón.
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  // Descarta respuestas de búsquedas viejas (el usuario siguió escribiendo).
  const ultimaBusqueda = useRef(0)

  // ─── Divisiones + colaboradores ────────────────────────────────────────────

  async function fetchTodo() {
    if (!session) return
    setLoading(true)
    setErrorCarga(null)

    const { data: profile, error: errProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()
    if (errProfile) {
      setErrorCarga(mensajeErrorCarga('tus divisiones', errProfile))
      setLoading(false)
      return
    }
    const divIds = (profile?.divisiones as string[] | null) ?? []
    if (divIds.length === 0) {
      setSinDivision(true)
      setLoading(false)
      return
    }

    const { data: divs, error: errDivs } = await supabase
      .from('divisiones').select('id, nombre').in('id', divIds).order('nombre')
    if (errDivs) {
      setErrorCarga(mensajeErrorCarga('tus divisiones', errDivs))
      setLoading(false)
      return
    }
    const lista = (divs ?? []) as DivisionColaboradores[]
    if (lista.length === 0) {
      setSinDivision(true)
      setLoading(false)
      return
    }
    setSinDivision(false)
    setDivisiones(lista)
    setDivisionId(prev => divisionInicial(lista, prev))

    const ok = await fetchColaboradores()
    if (!ok) setErrorCarga('No se pudieron cargar los colaboradores. Probá de nuevo.')
    setLoading(false)
  }

  async function fetchColaboradores(): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('colaboradores', {
        body: { action: 'listar' },
      })
      if (error || !Array.isArray(data?.colaboradores)) return false
      setColaboradores(data.colaboradores as ColaboradorListado[])
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (session) void fetchTodo()
  }, [session])

  useRefreshOnFocus(() => { void fetchTodo() })

  // ─── Búsqueda (con espera entre teclas) ────────────────────────────────────

  const busqueda = busquedaColaborador(texto)
  const avisoBusqueda = busqueda.tipo === 'corta' ? busqueda.mensaje : null

  useEffect(() => {
    const id = ++ultimaBusqueda.current
    setErrorBusqueda(null)
    if (busqueda.tipo !== 'buscar' || !divisionId) {
      setResultados([])
      setBuscando(false)
      setBuscado(false)
      return
    }
    setBuscando(true)
    const timer = setTimeout(() => { void buscar(id, busqueda.q, divisionId) }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(timer)
  }, [busqueda.tipo === 'buscar' ? busqueda.q : '', divisionId])

  async function buscar(id: number, q: string, division: string) {
    let mensaje: string | null = null
    let encontrados: ResultadoBusqueda[] = []
    try {
      const { data, error } = await supabase.functions.invoke('colaboradores', {
        body: { action: 'buscar', q, divisionId: division },
      })
      if (error || !Array.isArray(data?.resultados)) {
        mensaje = await mensajeErrorFunction(error, 'No se pudo buscar. Probá de nuevo.', data)
      } else {
        encontrados = data.resultados as ResultadoBusqueda[]
      }
    } catch {
      mensaje = 'No se pudo buscar. Probá de nuevo.'
    }
    if (id !== ultimaBusqueda.current) return
    setErrorBusqueda(mensaje)
    setResultados(encontrados)
    setBuscado(true)
    setBuscando(false)
  }

  function reintentarBusqueda() {
    if (busqueda.tipo !== 'buscar' || !divisionId) return
    const id = ++ultimaBusqueda.current
    setErrorBusqueda(null)
    setBuscando(true)
    void buscar(id, busqueda.q, divisionId)
  }

  // ─── Asignar / quitar ──────────────────────────────────────────────────────

  // enCurso is always cleared (try/finally), so a thrown invoke never leaves
  // every DESIGNAR/QUITAR button disabled.
  async function ejecutarAccion(
    action: 'asignar' | 'quitar',
    profileId: string,
    mensajeFallo: string,
    alGuardar: () => void,
  ) {
    if (!divisionId || enCurso) return
    setEnCurso(profileId)
    setErrorAccion(null)
    try {
      const { data, error } = await supabase.functions.invoke('colaboradores', {
        body: { action, profileId, divisionId },
      })
      if (error || data?.ok !== true) {
        setErrorAccion(await mensajeErrorFunction(error, mensajeFallo, data))
        return
      }
      alGuardar()
      const ok = await fetchColaboradores()
      if (!ok) setErrorAccion('El cambio se guardó, pero no se pudo actualizar la lista. Volvé a entrar para verla.')
    } catch {
      setErrorAccion(mensajeFallo)
    } finally {
      setEnCurso(null)
    }
  }

  function asignar(profileId: string) {
    return ejecutarAccion('asignar', profileId, 'No se pudo designar al colaborador. Probá de nuevo.',
      () => setResultados(prev => marcarDesignado(prev, profileId)))
  }

  function quitar(profileId: string) {
    return ejecutarAccion('quitar', profileId, 'No se pudo quitar al colaborador. Probá de nuevo.',
      () => setResultados(prev => prev.map(r => (r.profileId === profileId ? { ...r, yaEsColaborador: false } : r))))
  }

  function elegirDivision(id: string) {
    setDivisionId(id)
    setErrorAccion(null)
  }

  return {
    loading,
    errorCarga,
    sinDivision,
    divisiones,
    divisionId,
    divisionNombre: divisiones.find(d => d.id === divisionId)?.nombre ?? '',
    elegirDivision,
    colaboradores: colaboradoresDeDivision(colaboradores, divisionId),
    refetch: () => { void fetchTodo() },

    texto,
    setTexto,
    avisoBusqueda,
    resultados,
    buscando,
    buscado,
    errorBusqueda,
    reintentarBusqueda,

    enCurso,
    errorAccion,
    asignar,
    quitar,
  }
}
