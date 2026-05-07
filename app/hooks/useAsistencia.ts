import { useState, useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar } from '@/lib/offlineQueue'

export type EstadoAsistencia = 'presente' | 'ausente' | 'justificado'

export interface JugadorConEstado {
  id: string
  nombre_completo: string
  estado: EstadoAsistencia | null
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
  divisionNombre: string
  sinDivision: boolean
  marcados: number
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
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
  const [sinDivision, setSinDivision] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  const fecha = new Date().toISOString().split('T')[0]
  const marcados = jugadores.filter(j => j.estado !== null).length

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  async function fetchDatos() {
    if (!session) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divId = (profile?.divisiones as string[] | null)?.[0] ?? null

    if (!divId) {
      setSinDivision(true)
      setLoading(false)
      return
    }

    setDivisionId(divId)

    const [divRes, jgsRes] = await Promise.all([
      supabase.from('divisiones').select('nombre').eq('id', divId).single(),
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', divId)
        .eq('activo', true)
        .order('nombre_completo'),
    ])

    setDivisionNombre(divRes.data?.nombre ?? '')

    const jugadoresBase: JugadorConEstado[] = (jgsRes.data ?? []).map(j => ({
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

    const { isConnected } = await NetInfo.fetch()

    if (isConnected) {
      const eventoId = await obtenerOCrearEvento(divisionId)
      if (!eventoId) {
        setErrorGuardado('No se pudo crear el evento. Verificá tu conexión o permisos.')
        setGuardando(false)
        return
      }

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
          setErrorGuardado('Error al guardar asistencias: ' + asistError.message)
          setGuardando(false)
          return
        }
      }

      await verificarAusenciasConsecutivas(divisionId)
      setGuardado(true)
    } else {
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
      setPendienteSync(true)
      setGuardado(true)
    }

    setGuardando(false)
  }

  async function obtenerOCrearEvento(divId: string): Promise<string | null> {
    const { data: existente } = await supabase
      .from('eventos')
      .select('id')
      .eq('tipo', 'entrenamiento')
      .eq('division_id', divId)
      .eq('fecha', fecha)
      .eq('cancelado', false)
      .maybeSingle()

    if (existente) return existente.id

    const { data: nuevo, error } = await supabase
      .from('eventos')
      .insert({ tipo: 'entrenamiento', division_id: divId, fecha, creado_por: session!.user.id })
      .select('id')
      .single()

    return error ? null : nuevo.id
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
    divisionNombre,
    sinDivision,
    marcados,
    marcarEstado,
    guardarAsistencia,
  }
}
