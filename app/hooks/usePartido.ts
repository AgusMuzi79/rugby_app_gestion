import { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar } from '@/lib/offlineQueue'
import { esErrorDeRed } from '@/lib/offlineSync'
import { actualizarPendientes } from '@/hooks/useSincronizacionOffline'
import { fechaLocal, fechaLocalMasDias } from '@/lib/fecha'
import { useEstadoCarga } from './useEstadoCarga'
import { presenciasSinGuardar, textoSinGuardar } from '@/lib/marcasSinGuardar'
import { confirmarDescarte } from '@/components/shared/confirmarDescarte'
import { sincronizarEquipos, type AccesoEquipos, type Equipo } from '@/lib/equiposPartido'
import { crearGuardaEnVuelo } from '@/lib/guardaEnVuelo'
import { mensajeErrorCarga } from '@/lib/errorCarga'

export type { Equipo } from '@/lib/equiposPartido'

// Tabla `equipos` vía Supabase (lib/equiposPartido.ts). Del más viejo al más
// nuevo: si hay duplicados viejos, la app usa el más viejo.
const accesoEquipos: AccesoEquipos = {
  listar: async (divisionId) => {
    const { data, error } = await supabase
      .from('equipos')
      .select('id, nombre')
      .eq('division_id', divisionId)
      .order('created_at')
      .order('id')
    return { data, error }
  },
  crear: async (filas, modo) => {
    const { error } = modo === 'upsert'
      ? await supabase.from('equipos').upsert(filas, { onConflict: 'division_id,nombre', ignoreDuplicates: true })
      : await supabase.from('equipos').insert(filas)
    return { error }
  },
}

export type RolEnMesa = 'titular' | 'suplente'
export type Paso = 'equipo' | 'asistencia' | 'mesa' | 'resultado'

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePartido() {
  const { session } = useAuthStore()

  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
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
  // Presentes según lo último cargado o guardado del partido (T3).
  const presenciaGuardada = useRef<Record<string, boolean>>({})

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

  // Una sola carga a la vez (auditoría entrenador T16): la carga inicial y la
  // re-sincronización de equipos al volver a la pestaña comparten la guarda,
  // así dos cargas en paralelo nunca crean el mismo equipo dos veces.
  const guardaCarga = useRef(crearGuardaEnVuelo()).current
  const cargado = useRef(false)
  // Lo que necesita la re-sincronización en segundo plano (sin closures viejos).
  const datosDivision = useRef<{ divId: string; categoria: string; nombre: string; cantidad: number } | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  // Primera vez: carga completa. Después, en cada foco, sólo re-sincroniza
  // los equipos (sin resetear el paso actual). useFocusEffect corre también
  // en el montaje: no hace falta (ni conviene) otro useEffect de carga.
  useFocusEffect(
    useCallback(() => {
      if (!session) return
      if (!cargado.current) {
        cargado.current = true
        fetchDatos()
      } else {
        sincronizarEnBackground()
      }
    }, [session]),
  )

  // ─── Sincronización de equipos ─────────────────────────────────────────────

  function aplicarEquipos(lista: Equipo[], inicial: boolean) {
    setEquipos(lista)
    if (lista.length > 0) {
      setEquipoObligatorio(lista[0])
      if (inicial && lista.length === 1) setEquipoSeleccionado(lista[0])
    }
  }

  function sincronizarEnBackground() {
    const d = datosDivision.current
    if (!session || !d) return
    guardaCarga(async () => {
      const r = await sincronizarEquipos(accesoEquipos, {
        divisionId: d.divId, categoria: d.categoria, divisionNombre: d.nombre,
        cantidadJugadores: d.cantidad, userId: session.user.id,
      })
      // Un error en segundo plano no borra los equipos que ya se ven.
      if (!r.error) aplicarEquipos(r.equipos, false)
    }, undefined)
  }

  // ─── Carga completa ────────────────────────────────────────────────────────

  function fetchDatos() {
    return guardaCarga(cargarDatos, undefined)
  }

  async function cargarDatos() {
    if (!session) return
    empezar()
    setErrorCarga(null)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divId = (profile?.divisiones as string[] | null)?.[0] ?? null
    if (!divId) { setSinDivision(true); terminar(); return }
    setDivisionId(divId)

    const hoy = fechaLocal()
    const en14dias = fechaLocalMasDias(14)

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

    datosDivision.current = { divId, categoria, nombre: divNombre, cantidad: base.length }
    const r = await sincronizarEquipos(accesoEquipos, {
      divisionId: divId, categoria, divisionNombre: divNombre,
      cantidadJugadores: base.length, userId: session.user.id,
    })
    if (r.error) setErrorCarga(mensajeErrorCarga('los equipos', r.error))
    aplicarEquipos(r.equipos, true)

    terminar()
  }

  // ─── Selección de equipo y partido ─────────────────────────────────────────

  function seleccionarEquipo(equipo: Equipo) {
    setEquipoSeleccionado(equipo)
    setMesaGuardada(false)
    setErrorMesa(null)
    setResultadoGuardado(false)
    setErrorResultado(null)
  }

  // Cambiar de partido vuelve a todos a presentes: con marcas sin guardar,
  // primero se pregunta (auditoría entrenador T3). Sin "Guardar y cambiar":
  // guardar acá también avanza al paso de la mesa.
  function seleccionarPartido(partido: PartidoEvento) {
    const sinGuardar = partidoSeleccionado ? presenciasSinGuardar(jugadores, presenciaGuardada.current) : 0
    if (sinGuardar === 0) { aplicarPartido(partido); return }
    confirmarDescarte({
      mensaje: textoSinGuardar(sinGuardar, partidoSeleccionado?.rival ? `el partido vs ${partidoSeleccionado.rival}` : 'este partido'),
      onDescartar: () => aplicarPartido(partido),
    })
  }

  function aplicarPartido(partido: PartidoEvento) {
    presenciaGuardada.current = {}
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
    presenciaGuardada.current = Object.fromEntries(reset.map(j => [j.id, j.presente]))

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

    let enTelefono = !isConnected
    if (isConnected) {
      const { error } = await supabase
        .from('asistencias')
        .upsert(payload, { onConflict: 'evento_id,jugador_id' })
      if (error && !esErrorDeRed(error)) {
        setErrorAsistencia('Error al guardar: ' + error.message)
        setGuardandoAsistencia(false)
        return
      }
      enTelefono = !!error
    }
    // Sin señal (o si la red se cae a mitad): queda en el teléfono y
    // useSincronizacionOffline la manda cuando vuelve la conexión.
    if (enTelefono) {
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
      await actualizarPendientes()
    }

    presenciaGuardada.current = Object.fromEntries(jugadores.map(j => [j.id, j.presente]))
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
      const { data: mesaOblig, error: obligErr } = await supabase
        .from('mesas_de_partido')
        .select('id')
        .eq('evento_id', partidoSeleccionado.id)
        .eq('equipo_id', equipoObligatorio.id)
        .maybeSingle()

      if (obligErr) {
        setErrorMesa('No se pudo verificar la mesa de "' + equipoObligatorio.nombre + '": ' + obligErr.message)
        return
      }
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

    // Mesa + jugadores en una sola transacción (auditoría entrenador T15):
    // si algo falla, la mesa anterior queda como estaba.
    const { error: mesaErr } = await supabase.rpc('guardar_mesa', {
      p_evento: partidoSeleccionado.id,
      p_equipo: equipoSeleccionado.id,
      p_jugadores: enMesa.map(j => ({ jugador_id: j.id, rol_en_mesa: j.rolEnMesa! })),
    })

    if (mesaErr) {
      setErrorMesa('Error al guardar la mesa: ' + mesaErr.message)
      setGuardandoMesa(false)
      return
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
    refrescando,
    errorCarga,
    reintentar: fetchDatos,
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
