import { useState, useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar } from '@/lib/offlineQueue'

export type RolEnMesa = 'capitan' | 'titular' | 'suplente' | 'cuerpo_tecnico'

export interface PartidoEvento {
  id: string
  fecha: string
  rival: string | null
  lugar: string | null
}

export interface JugadorPartido {
  id: string
  nombre_completo: string
  presente: boolean
  rolEnMesa: RolEnMesa | null
}

export interface ConteoMesa {
  capitan: number
  titular: number
  suplente: number
  cuerpo_tecnico: number
}

export interface UsePartidoReturn {
  loading: boolean
  divisionNombre: string
  sinDivision: boolean
  partidos: PartidoEvento[]
  partidoSeleccionado: PartidoEvento | null
  jugadores: JugadorPartido[]
  paso: 'asistencia' | 'mesa'
  guardandoAsistencia: boolean
  asistenciaGuardada: boolean
  errorAsistencia: string | null
  guardandoMesa: boolean
  mesaGuardada: boolean
  errorMesa: string | null
  conteoMesa: ConteoMesa
  seleccionarPartido: (partido: PartidoEvento) => Promise<void>
  togglePresente: (jugadorId: string) => void
  guardarAsistencia: () => Promise<void>
  asignarRol: (jugadorId: string, rol: RolEnMesa) => void
  guardarMesa: () => Promise<void>
}

export function usePartido(): UsePartidoReturn {
  const { session } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
  const [sinDivision, setSinDivision] = useState(false)
  const [partidos, setPartidos] = useState<PartidoEvento[]>([])
  const [partidoSeleccionado, setPartidoSeleccionado] = useState<PartidoEvento | null>(null)
  const [jugadoresBase, setJugadoresBase] = useState<JugadorPartido[]>([])
  const [jugadores, setJugadores] = useState<JugadorPartido[]>([])
  const [paso, setPaso] = useState<'asistencia' | 'mesa'>('asistencia')
  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false)
  const [asistenciaGuardada, setAsistenciaGuardada] = useState(false)
  const [errorAsistencia, setErrorAsistencia] = useState<string | null>(null)
  const [guardandoMesa, setGuardandoMesa] = useState(false)
  const [mesaGuardada, setMesaGuardada] = useState(false)
  const [errorMesa, setErrorMesa] = useState<string | null>(null)

  const conteoMesa: ConteoMesa = {
    capitan:       jugadores.filter(j => j.presente && j.rolEnMesa === 'capitan').length,
    titular:       jugadores.filter(j => j.presente && j.rolEnMesa === 'titular').length,
    suplente:      jugadores.filter(j => j.presente && j.rolEnMesa === 'suplente').length,
    cuerpo_tecnico:jugadores.filter(j => j.presente && j.rolEnMesa === 'cuerpo_tecnico').length,
  }

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
    if (!divId) { setSinDivision(true); setLoading(false); return }
    setDivisionId(divId)

    const hoy = new Date().toISOString().split('T')[0]
    const en14dias = new Date(Date.now() + 14 * 86_400_000).toISOString().split('T')[0]

    const [divRes, jgsRes, partidosRes] = await Promise.all([
      supabase.from('divisiones').select('nombre').eq('id', divId).single(),
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', divId)
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('eventos')
        .select('id, fecha, rival, lugar')
        .eq('tipo', 'partido')
        .eq('division_id', divId)
        .eq('cancelado', false)
        .gte('fecha', hoy)
        .lte('fecha', en14dias)
        .order('fecha'),
    ])

    setDivisionNombre(divRes.data?.nombre ?? '')
    setPartidos(partidosRes.data ?? [])

    const base: JugadorPartido[] = (jgsRes.data ?? []).map(j => ({
      id: j.id,
      nombre_completo: j.nombre_completo,
      presente: true,
      rolEnMesa: null,
    }))
    setJugadoresBase(base)
    setJugadores(base)
    setLoading(false)
  }

  async function seleccionarPartido(partido: PartidoEvento) {
    setPartidoSeleccionado(partido)
    setPaso('asistencia')
    setAsistenciaGuardada(false)
    setMesaGuardada(false)
    setErrorAsistencia(null)
    setErrorMesa(null)

    // Reset jugadores al estado base y pre-cargar datos existentes
    const reset = jugadoresBase.map(j => ({ ...j, presente: true, rolEnMesa: null as RolEnMesa | null }))

    const [asistRes, mesaRes] = await Promise.all([
      supabase
        .from('asistencias')
        .select('jugador_id, estado')
        .eq('evento_id', partido.id),
      supabase
        .from('mesas_de_partido')
        .select('id, mesa_jugadores(jugador_id, rol_en_mesa)')
        .eq('evento_id', partido.id)
        .maybeSingle(),
    ])

    // Aplicar asistencias existentes
    if (asistRes.data && asistRes.data.length > 0) {
      const mapa: Record<string, boolean> = {}
      asistRes.data.forEach(a => { mapa[a.jugador_id] = a.estado === 'presente' })
      reset.forEach(j => { if (j.id in mapa) j.presente = mapa[j.id] })
      setAsistenciaGuardada(true)
      setPaso('mesa')
    }

    // Aplicar mesa existente
    if (mesaRes.data) {
      type MJ = { jugador_id: string; rol_en_mesa: string }
      const rolesMap: Record<string, RolEnMesa> = {}
      ;(mesaRes.data.mesa_jugadores as MJ[]).forEach(mj => {
        rolesMap[mj.jugador_id] = mj.rol_en_mesa as RolEnMesa
      })
      reset.forEach(j => { if (rolesMap[j.id]) j.rolEnMesa = rolesMap[j.id] })
      setMesaGuardada(true)
    }

    setJugadores(reset)
  }

  function togglePresente(jugadorId: string) {
    setJugadores(prev => prev.map(j =>
      j.id === jugadorId ? { ...j, presente: !j.presente, rolEnMesa: null } : j
    ))
    setAsistenciaGuardada(false)
  }

  async function guardarAsistencia() {
    if (!session || !divisionId || !partidoSeleccionado) return
    setGuardandoAsistencia(true)
    setErrorAsistencia(null)

    const { isConnected } = await NetInfo.fetch()

    const payload = jugadores.map(j => ({
      evento_id: partidoSeleccionado.id,
      jugador_id: j.id,
      division_id: divisionId,
      estado: j.presente ? ('presente' as const) : ('ausente' as const),
      registrado_por: session.user.id,
    }))

    if (isConnected) {
      const { error } = await supabase
        .from('asistencias')
        .upsert(payload, { onConflict: 'evento_id,jugador_id' })

      if (error) {
        setErrorAsistencia('Error al guardar: ' + error.message)
        setGuardandoAsistencia(false)
        return
      }
    } else {
      await encolar({
        tipo: 'asistencia',
        payload: {
          evento_id: partidoSeleccionado.id,
          division_id: divisionId,
          registrado_por: session.user.id,
          jugadores: jugadores.map(j => ({
            jugador_id: j.id,
            estado: j.presente ? 'presente' : 'ausente',
          })),
        },
      })
    }

    setAsistenciaGuardada(true)
    setPaso('mesa')
    setGuardandoAsistencia(false)
  }

  function asignarRol(jugadorId: string, rol: RolEnMesa) {
    setMesaGuardada(false)
    setErrorMesa(null)
    setJugadores(prev => prev.map(j =>
      j.id === jugadorId ? { ...j, rolEnMesa: j.rolEnMesa === rol ? null : rol } : j
    ))
  }

  async function guardarMesa() {
    if (!session || !partidoSeleccionado) return

    const enMesa = jugadores.filter(j => j.presente && j.rolEnMesa !== null)
    const nCap     = enMesa.filter(j => j.rolEnMesa === 'capitan').length
    const nCancha  = enMesa.filter(j => j.rolEnMesa === 'capitan' || j.rolEnMesa === 'titular').length
    const nSup     = enMesa.filter(j => j.rolEnMesa === 'suplente').length

    if (nCap !== 1) {
      setErrorMesa('Debe designar exactamente 1 capitán.')
      return
    }
    if (nCancha > 15) {
      setErrorMesa(`Máximo 15 en cancha (capitán + titulares). Actuales: ${nCancha}.`)
      return
    }
    if (nSup > 8) {
      setErrorMesa(`Máximo 8 suplentes. Actuales: ${nSup}.`)
      return
    }

    setGuardandoMesa(true)
    setErrorMesa(null)

    const { data: mesa, error: mesaErr } = await supabase
      .from('mesas_de_partido')
      .upsert({ evento_id: partidoSeleccionado.id }, { onConflict: 'evento_id' })
      .select('id')
      .single()

    if (mesaErr || !mesa) {
      setErrorMesa('Error al crear la mesa: ' + (mesaErr?.message ?? 'desconocido'))
      setGuardandoMesa(false)
      return
    }

    // Reemplazar mesa_jugadores
    await supabase.from('mesa_jugadores').delete().eq('mesa_id', mesa.id)

    if (enMesa.length > 0) {
      const { error: mjErr } = await supabase.from('mesa_jugadores').insert(
        enMesa.map(j => ({ mesa_id: mesa.id, jugador_id: j.id, rol_en_mesa: j.rolEnMesa! }))
      )
      if (mjErr) {
        setErrorMesa('Error al guardar jugadores: ' + mjErr.message)
        setGuardandoMesa(false)
        return
      }
    }

    setMesaGuardada(true)
    setGuardandoMesa(false)
  }

  return {
    loading,
    divisionNombre,
    sinDivision,
    partidos,
    partidoSeleccionado,
    jugadores,
    paso,
    guardandoAsistencia,
    asistenciaGuardada,
    errorAsistencia,
    guardandoMesa,
    mesaGuardada,
    errorMesa,
    conteoMesa,
    seleccionarPartido,
    togglePresente,
    guardarAsistencia,
    asignarRol,
    guardarMesa,
  }
}
