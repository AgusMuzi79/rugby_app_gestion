import { useState, useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar, resolverNoEnviadas } from '@/lib/offlineQueue'
import { esErrorDeRed } from '@/lib/offlineSync'
import { actualizarPendientes } from '@/hooks/useSincronizacionOffline'

export type EstadoAsistencia = 'presente' | 'ausente' | 'justificado'

export interface JugadorConEstado {
  id: string
  nombre_completo: string
  estado: EstadoAsistencia | null
}

export interface DivisionOpcion {
  id: string
  nombre: string
}

export interface UseAsistenciaReturn {
  jugadores: JugadorConEstado[]
  loading: boolean
  guardando: boolean
  guardado: boolean
  pendienteSync: boolean
  errorGuardado: string | null
  alertas: string[]
  fecha: string
  divisiones: DivisionOpcion[]
  divisionId: string | null
  divisionNombre: string
  sinDivision: boolean
  marcados: number
  seleccionarDivision: (id: string) => void
  marcarEstado: (jugadorId: string, estado: EstadoAsistencia) => void
  guardarAsistencia: () => Promise<void>
}

export function useAsistencia(): UseAsistenciaReturn {
  const { session } = useAuthStore()
  const [jugadores, setJugadores] = useState<JugadorConEstado[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [pendienteSync, setPendienteSync] = useState(false)
  const [alertas, setAlertas] = useState<string[]>([])
  const [divisiones, setDivisiones] = useState<DivisionOpcion[]>([])
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [sinDivision, setSinDivision] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const fecha = new Date().toISOString().split('T')[0]
  const marcados = jugadores.filter(j => j.estado !== null).length
  const divisionNombre = divisiones.find(d => d.id === divisionId)?.nombre ?? ''

  // Divisiones asignadas al entrenador — puede tener más de una.
  useEffect(() => {
    if (session) fetchDivisiones()
  }, [session])

  async function fetchDivisiones() {
    if (!session) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divIds = (profile?.divisiones as string[] | null) ?? []

    if (divIds.length === 0) {
      setSinDivision(true)
      setLoading(false)
      return
    }

    const { data: divsData } = await supabase
      .from('divisiones')
      .select('id, nombre')
      .in('id', divIds)
      .order('nombre')

    const divs = divsData ?? []
    setDivisiones(divs)
    setDivisionId(prev => (prev && divs.some(d => d.id === prev) ? prev : (divs[0]?.id ?? null)))
  }

  // Jugadores + asistencia de hoy de la división seleccionada.
  useEffect(() => {
    if (divisionId) fetchJugadores(divisionId)
  }, [divisionId])

  async function fetchJugadores(divId: string) {
    setLoading(true)
    setGuardado(false)
    setAlertas([])
    setErrorGuardado(null)

    const { data: jgsRes } = await supabase
      .from('jugadores')
      .select('id, nombre_completo')
      .eq('division_id', divId)
      .eq('activo', true)
      .order('nombre_completo')

    const jugadoresBase: JugadorConEstado[] = (jgsRes ?? []).map(j => ({
      id: j.id,
      nombre_completo: j.nombre_completo,
      estado: null,
    }))

    // Pre-cargar asistencias de hoy si ya existe el evento
    const { data: eventoHoy } = await supabase
      .from('eventos')
      .select('id')
      .eq('tipo', 'entrenamiento')
      .eq('division_id', divId)
      .eq('fecha', fecha)
      .eq('cancelado', false)
      .maybeSingle()

    if (eventoHoy) {
      const { data: asistenciasHoy } = await supabase
        .from('asistencias')
        .select('jugador_id, estado')
        .eq('evento_id', eventoHoy.id)

      const estadoMap: Record<string, EstadoAsistencia> = {}
      ;(asistenciasHoy ?? []).forEach(a => {
        estadoMap[a.jugador_id] = a.estado as EstadoAsistencia
      })
      jugadoresBase.forEach(j => {
        if (estadoMap[j.id]) j.estado = estadoMap[j.id]
      })
    }

    setJugadores(jugadoresBase)
    setLoading(false)
  }

  function seleccionarDivision(id: string) {
    if (id === divisionId) return
    setDivisionId(id)
  }

  function marcarEstado(jugadorId: string, estado: EstadoAsistencia) {
    setGuardado(false)
    setJugadores(prev => prev.map(j => (j.id === jugadorId ? { ...j, estado } : j)))
  }

  async function guardarAsistencia() {
    if (!session || !divisionId) return
    setGuardando(true)
    setPendienteSync(false)
    setAlertas([])
    setErrorGuardado(null)

    // Sin señal (o si la red se cae a mitad): queda en el teléfono y
    // useSincronizacionOffline la manda cuando vuelve la conexión.
    const guardarEnTelefono = async () => {
      await encolar({
        tipo: 'asistencia',
        payload: {
          division_id: divisionId,
          fecha,
          registrado_por: session.user.id,
          jugadores: jugadores
            .filter(j => j.estado !== null)
            .map(j => ({ jugador_id: j.id, estado: j.estado })),
        },
      })
      await actualizarPendientes()
      setPendienteSync(true)
      setGuardado(true)
      setGuardando(false)
    }

    const { isConnected } = await NetInfo.fetch()
    if (!isConnected) { await guardarEnTelefono(); return }

    const evento = await obtenerOCrearEvento(divisionId)
    if (!evento.id) {
      if (esErrorDeRed(evento.error)) { await guardarEnTelefono(); return }
      setErrorGuardado('No se pudo crear el evento. Verificá tu conexión o permisos.')
      setGuardando(false)
      return
    }
    const eventoId = evento.id

    const asistencias = jugadores
      .filter(j => j.estado !== null)
      .map(j => ({
        evento_id: eventoId,
        jugador_id: j.id,
        division_id: divisionId,
        estado: j.estado!,
        registrado_por: session.user.id,
      }))

    if (asistencias.length > 0) {
      const { error: asistError } = await supabase
        .from('asistencias')
        .upsert(asistencias, { onConflict: 'evento_id,jugador_id' })
      if (asistError) {
        if (esErrorDeRed(asistError)) { await guardarEnTelefono(); return }
        setErrorGuardado('Error al guardar asistencias: ' + asistError.message)
        setGuardando(false)
        return
      }
    }

    await verificarAusenciasConsecutivas(divisionId)
    // Si había una de esta división y fecha que no se pudo enviar, esta la
    // reemplaza. Es limpieza local: si falla, el guardado ya llegó a la base.
    try {
      await resolverNoEnviadas(divisionId, fecha)
      await actualizarPendientes()
    } catch (e) {
      console.warn('no enviadas:', e instanceof Error ? e.message : String(e))
    }
    setGuardado(true)
    setGuardando(false)
  }

  async function obtenerOCrearEvento(divId: string): Promise<{ id: string | null; error: unknown }> {
    const { data: existente, error: errorBusqueda } = await supabase
      .from('eventos')
      .select('id')
      .eq('tipo', 'entrenamiento')
      .eq('division_id', divId)
      .eq('fecha', fecha)
      .eq('cancelado', false)
      .maybeSingle()

    if (existente) return { id: existente.id, error: null }
    if (errorBusqueda && esErrorDeRed(errorBusqueda)) return { id: null, error: errorBusqueda }

    const { data: nuevo, error } = await supabase
      .from('eventos')
      .insert({ tipo: 'entrenamiento', division_id: divId, fecha, creado_por: session!.user.id })
      .select('id')
      .single()

    return error ? { id: null, error } : { id: nuevo.id, error: null }
  }

  async function verificarAusenciasConsecutivas(divId: string) {
    if (jugadores.length === 0) return

    const resultados = await Promise.all(
      jugadores.map(j =>
        supabase
          .from('asistencias')
          .select('estado')
          .eq('jugador_id', j.id)
          .eq('division_id', divId)
          .order('created_at', { ascending: false })
          .limit(4),
      ),
    )

    const conAlertas: string[] = []
    resultados.forEach((res, i) => {
      const ultimas = res.data ?? []
      if (ultimas.length === 4 && ultimas.every(a => a.estado === 'ausente')) {
        conAlertas.push(jugadores[i].nombre_completo)
        void supabase.functions.invoke('notifications', {
          body: {
            type: 'ausencias_consecutivas',
            payload: {
              jugadorNombre:  jugadores[i].nombre_completo,
              jugadorId:      jugadores[i].id,
              divisionNombre,
              divisionId:     divId,
            },
          },
        })
      }
    })

    setAlertas(conAlertas)
  }

  return {
    jugadores,
    loading,
    guardando,
    guardado,
    pendienteSync,
    errorGuardado,
    alertas,
    fecha,
    divisiones,
    divisionId,
    divisionNombre,
    sinDivision,
    marcados,
    seleccionarDivision,
    marcarEstado,
    guardarAsistencia,
  }
}
