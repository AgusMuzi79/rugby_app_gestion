import { useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar } from '@/lib/offlineQueue'

export type RolEnMesa = 'titular' | 'suplente'
export type Paso = 'equipo' | 'asistencia' | 'mesa' | 'resultado'

export interface Equipo {
  id: string
  nombre: string
}

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
  titular: number
  suplente: number
}

// ─── Helpers de generación de nombres ────────────────────────────────────────

const LETRAS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

function generarNombresEquipos(
  cantidad: number,
  categoria: string,
  divisionNombre: string,
): string[] {
  if (categoria === 'superior') {
    return Array.from({ length: cantidad }, (_, i) => {
      if (i === 0) return 'Primera'
      if (i === 1) return 'Intermedia'
      if (i === 2) return 'Preintermedia'
      const l = i - 3
      return `Preintermedia ${LETRAS[l] ?? String.fromCharCode(66 + l)}`
    })
  }
  return Array.from({ length: cantidad }, (_, i) =>
    i === 0
      ? divisionNombre
      : `${divisionNombre} ${LETRAS[i - 1] ?? String.fromCharCode(65 + i)}`,
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePartido() {
  const { session } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
  const [divisionCategoria, setDivisionCategoria] = useState('')
  const [esInfantil, setEsInfantil] = useState(false)
  const [sinDivision, setSinDivision] = useState(false)

  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [equipoObligatorio, setEquipoObligatorio] = useState<Equipo | null>(null)
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<Equipo | null>(null)

  const [partidos, setPartidos] = useState<PartidoEvento[]>([])
  const [partidoSeleccionado, setPartidoSeleccionado] = useState<PartidoEvento | null>(null)

  const [jugadoresBase, setJugadoresBase] = useState<JugadorPartido[]>([])
  const [jugadores, setJugadores] = useState<JugadorPartido[]>([])

  const [paso, setPaso] = useState<Paso>('equipo')
  const [cargandoTransicion, setCargandoTransicion] = useState(false)

  const [guardandoAsistencia, setGuardandoAsistencia] = useState(false)
  const [asistenciaGuardada, setAsistenciaGuardada] = useState(false)
  const [errorAsistencia, setErrorAsistencia] = useState<string | null>(null)

  const [guardandoMesa, setGuardandoMesa] = useState(false)
  const [mesaGuardada, setMesaGuardada] = useState(false)
  const [errorMesa, setErrorMesa] = useState<string | null>(null)

  const [puntosPropios, setPuntosPropios] = useState('')
  const [puntosRival, setPuntosRival] = useState('')
  const [rivalNombre, setRivalNombre] = useState('')
  const [guardandoResultado, setGuardandoResultado] = useState(false)
  const [resultadoGuardado, setResultadoGuardado] = useState(false)
  const [errorResultado, setErrorResultado] = useState<string | null>(null)

  const conteoMesa: ConteoMesa = {
    titular: jugadores.filter(j => j.presente && j.rolEnMesa === 'titular').length,
    suplente: jugadores.filter(j => j.presente && j.rolEnMesa === 'suplente').length,
  }

  // Carga inicial cuando la sesión está disponible
  useEffect(() => {
    if (session && !divisionId) fetchDatos()
  }, [session])

  // Re-sincroniza equipos en cada foco (sin resetear el paso actual)
  useFocusEffect(
    useCallback(() => {
      if (!session) return
      if (!divisionId) {
        fetchDatos()
      } else {
        sincronizarEnBackground()
      }
    }, [session, divisionId]),
  )

  // ─── Sincronización de equipos ─────────────────────────────────────────────

  async function doSincronizarEquipos(
    divId: string,
    categoria: string,
    divNombre: string,
    jugadorCount: number,
    userId: string,
  ): Promise<Equipo[]> {
    const cantidad = Math.max(1, Math.ceil(jugadorCount / 35))
    const nombresEsperados = generarNombresEquipos(cantidad, categoria, divNombre)

    const { data: existentes } = await supabase
      .from('equipos')
      .select('id, nombre')
      .eq('division_id', divId)

    const mapaExistentes = new Map((existentes ?? []).map(e => [e.nombre, e.id] as [string, string]))

    const nuevosNombres = nombresEsperados.filter(n => !mapaExistentes.has(n))
    if (nuevosNombres.length > 0) {
      const { data: creados } = await supabase
        .from('equipos')
        .insert(nuevosNombres.map(nombre => ({ division_id: divId, nombre, created_by: userId })))
        .select('id, nombre')
      ;(creados ?? []).forEach(e => mapaExistentes.set(e.nombre, e.id))
    }

    // Orden: esperados primero (en orden generado), extras al final
    const result: Equipo[] = []
    for (const nombre of nombresEsperados) {
      const id = mapaExistentes.get(nombre)
      if (id) result.push({ id, nombre })
    }
    for (const [nombre, id] of mapaExistentes) {
      if (!nombresEsperados.includes(nombre)) result.push({ id, nombre })
    }

    return result
  }

  async function sincronizarEnBackground() {
    if (!session || !divisionId || loading) return
    const lista = await doSincronizarEquipos(
      divisionId,
      divisionCategoria,
      divisionNombre,
      jugadoresBase.length,
      session.user.id,
    )
    setEquipos(lista)
    if (lista.length > 0) setEquipoObligatorio(lista[0])
  }

  // ─── Carga completa ────────────────────────────────────────────────────────

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
      supabase.from('divisiones').select('nombre, categoria').eq('id', divId).single(),
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

    const categoria = divRes.data?.categoria ?? ''
    const divNombre = divRes.data?.nombre ?? ''

    setDivisionNombre(divNombre)
    setDivisionCategoria(categoria)
    setEsInfantil(categoria === 'infantil')
    setPartidos(partidosRes.data ?? [])

    const base: JugadorPartido[] = (jgsRes.data ?? []).map(j => ({
      id: j.id,
      nombre_completo: j.nombre_completo,
      presente: true,
      rolEnMesa: null,
    }))
    setJugadoresBase(base)
    setJugadores(base)

    const lista = await doSincronizarEquipos(divId, categoria, divNombre, base.length, session.user.id)
    setEquipos(lista)
    if (lista.length > 0) {
      setEquipoObligatorio(lista[0])
      if (lista.length === 1) setEquipoSeleccionado(lista[0])
    }

    setLoading(false)
  }

  // ─── Selección de equipo y partido ─────────────────────────────────────────

  function seleccionarEquipo(equipo: Equipo) {
    setEquipoSeleccionado(equipo)
    setMesaGuardada(false)
    setErrorMesa(null)
    setResultadoGuardado(false)
    setErrorResultado(null)
  }

  function seleccionarPartido(partido: PartidoEvento) {
    setPartidoSeleccionado(partido)
    setAsistenciaGuardada(false)
    setMesaGuardada(false)
    setErrorAsistencia(null)
    setErrorMesa(null)
    setResultadoGuardado(false)
    setErrorResultado(null)
    setJugadores(jugadoresBase.map(j => ({ ...j, presente: true, rolEnMesa: null as RolEnMesa | null })))
  }

  // ─── Transición a asistencia (carga datos previos del equipo) ──────────────

  async function irAAsistencia() {
    if (!equipoSeleccionado || !partidoSeleccionado) return
    setCargandoTransicion(true)

    const reset = jugadoresBase.map(j => ({
      ...j,
      presente: true,
      rolEnMesa: null as RolEnMesa | null,
    }))

    const [asistRes, mesaRes] = await Promise.all([
      supabase
        .from('asistencias')
        .select('jugador_id, estado')
        .eq('evento_id', partidoSeleccionado.id),
      supabase
        .from('mesas_de_partido')
        .select('id, mesa_jugadores(jugador_id, rol_en_mesa)')
        .eq('evento_id', partidoSeleccionado.id)
        .eq('equipo_id', equipoSeleccionado.id)
        .maybeSingle(),
    ])

    if (asistRes.data && asistRes.data.length > 0) {
      const mapa: Record<string, boolean> = {}
      asistRes.data.forEach(a => { mapa[a.jugador_id] = a.estado === 'presente' })
      reset.forEach(j => { if (j.id in mapa) j.presente = mapa[j.id] })
      setAsistenciaGuardada(true)
    }

    if (mesaRes.data) {
      type MJ = { jugador_id: string; rol_en_mesa: string }
      const rolesMap: Record<string, RolEnMesa> = {}
      ;(mesaRes.data.mesa_jugadores as MJ[]).forEach(mj => {
        if (mj.rol_en_mesa === 'titular' || mj.rol_en_mesa === 'suplente') {
          rolesMap[mj.jugador_id] = mj.rol_en_mesa
        }
      })
      reset.forEach(j => { if (rolesMap[j.id]) j.rolEnMesa = rolesMap[j.id] })
      setMesaGuardada(true)
    }

    setJugadores(reset)
    setCargandoTransicion(false)
    setPaso('asistencia')
  }

  function irAEquipo() { setPaso('equipo') }
  function irAMesa()   { setPaso('mesa') }

  // ─── Transición a resultado (carga dato existente si hay) ──────────────────

  async function irAResultado() {
    if (!session || !partidoSeleccionado || !equipoSeleccionado) return
    setCargandoTransicion(true)

    const { data } = await supabase
      .from('resultados')
      .select('puntos_propios, puntos_rival, rival')
      .eq('evento_id', partidoSeleccionado.id)
      .eq('equipo_id', equipoSeleccionado.id)
      .maybeSingle()

    if (data) {
      setPuntosPropios(String(data.puntos_propios))
      setPuntosRival(String(data.puntos_rival))
      setRivalNombre(data.rival ?? partidoSeleccionado.rival ?? '')
      setResultadoGuardado(true)
    } else {
      setPuntosPropios('')
      setPuntosRival('')
      setRivalNombre(partidoSeleccionado.rival ?? '')
      setResultadoGuardado(false)
    }

    setErrorResultado(null)
    setCargandoTransicion(false)
    setPaso('resultado')
  }

  // ─── Asistencia ────────────────────────────────────────────────────────────

  function togglePresente(jugadorId: string) {
    setJugadores(prev =>
      prev.map(j => j.id === jugadorId ? { ...j, presente: !j.presente, rolEnMesa: null } : j),
    )
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
    setGuardandoAsistencia(false)
    if (!esInfantil) setPaso('mesa')
  }

  // ─── Mesa ──────────────────────────────────────────────────────────────────

  function asignarRol(jugadorId: string, rol: RolEnMesa) {
    setMesaGuardada(false)
    setErrorMesa(null)

    const jugadorActual = jugadores.find(j => j.id === jugadorId)
    if (!jugadorActual) return

    if (jugadorActual.rolEnMesa === rol) {
      setJugadores(prev => prev.map(j => j.id === jugadorId ? { ...j, rolEnMesa: null } : j))
      return
    }
    if (rol === 'titular' && conteoMesa.titular >= 15) {
      setErrorMesa('Máximo 15 titulares alcanzado.')
      return
    }
    if (rol === 'suplente' && conteoMesa.suplente >= 8) {
      setErrorMesa('Máximo 8 suplentes alcanzado.')
      return
    }
    setJugadores(prev => prev.map(j => j.id === jugadorId ? { ...j, rolEnMesa: rol } : j))
  }

  async function guardarMesa() {
    if (!session || !partidoSeleccionado || !equipoSeleccionado || !equipoObligatorio) return

    // Bloquear si equipo opcional y el obligatorio aún no tiene mesa
    const esObligatorio = equipoSeleccionado.id === equipoObligatorio.id
    if (!esInfantil && !esObligatorio) {
      const { data: mesaOblig } = await supabase
        .from('mesas_de_partido')
        .select('id')
        .eq('evento_id', partidoSeleccionado.id)
        .eq('equipo_id', equipoObligatorio.id)
        .maybeSingle()

      if (!mesaOblig) {
        setErrorMesa(
          `Completá primero la mesa de "${equipoObligatorio.nombre}" antes de guardar este equipo.`,
        )
        return
      }
    }

    const enMesa = jugadores.filter(j => j.presente && j.rolEnMesa !== null)
    setGuardandoMesa(true)
    setErrorMesa(null)

    const { data: mesa, error: mesaErr } = await supabase
      .from('mesas_de_partido')
      .upsert(
        { evento_id: partidoSeleccionado.id, equipo_id: equipoSeleccionado.id },
        { onConflict: 'evento_id,equipo_id' },
      )
      .select('id')
      .single()

    if (mesaErr || !mesa) {
      setErrorMesa('Error al crear la mesa: ' + (mesaErr?.message ?? 'desconocido'))
      setGuardandoMesa(false)
      return
    }

    await supabase.from('mesa_jugadores').delete().eq('mesa_id', mesa.id)

    if (enMesa.length > 0) {
      const { error: mjErr } = await supabase.from('mesa_jugadores').insert(
        enMesa.map(j => ({ mesa_id: mesa.id, jugador_id: j.id, rol_en_mesa: j.rolEnMesa! })),
      )
      if (mjErr) {
        setErrorMesa('Error al guardar jugadores: ' + mjErr.message)
        setGuardandoMesa(false)
        return
      }
    }

    setMesaGuardada(true)
    setGuardandoMesa(false)

    if (!esInfantil) await irAResultado()
  }

  // ─── Resultado ─────────────────────────────────────────────────────────────

  async function guardarResultado() {
    if (!session || !partidoSeleccionado || !equipoSeleccionado) return

    const propiosNum = parseInt(puntosPropios, 10)
    const rivalNum   = parseInt(puntosRival, 10)

    if (isNaN(propiosNum) || isNaN(rivalNum)) {
      setErrorResultado('Ingresá puntos válidos.')
      return
    }

    setGuardandoResultado(true)
    setErrorResultado(null)

    const { error } = await supabase
      .from('resultados')
      .upsert(
        {
          evento_id:      partidoSeleccionado.id,
          equipo_id:      equipoSeleccionado.id,
          puntos_propios: propiosNum,
          puntos_rival:   rivalNum,
          rival:          rivalNombre.trim() || null,
          registrado_por: session.user.id,
        },
        { onConflict: 'evento_id,equipo_id' },
      )

    if (error) {
      setErrorResultado('Error al guardar: ' + error.message)
      setGuardandoResultado(false)
      return
    }

    setResultadoGuardado(true)
    setGuardandoResultado(false)
  }

  return {
    loading,
    divisionNombre,
    sinDivision,
    esInfantil,
    equipos,
    equipoObligatorio,
    equipoSeleccionado,
    seleccionarEquipo,
    partidos,
    partidoSeleccionado,
    seleccionarPartido,
    jugadores,
    paso,
    cargandoTransicion,
    irAAsistencia,
    irAEquipo,
    irAMesa,
    irAResultado,
    guardandoAsistencia,
    asistenciaGuardada,
    errorAsistencia,
    togglePresente,
    guardarAsistencia,
    conteoMesa,
    asignarRol,
    guardandoMesa,
    mesaGuardada,
    errorMesa,
    guardarMesa,
    puntosPropios,
    puntosRival,
    rivalNombre,
    setPuntosPropios,
    setPuntosRival,
    setRivalNombre,
    guardandoResultado,
    resultadoGuardado,
    errorResultado,
    guardarResultado,
  }
}
