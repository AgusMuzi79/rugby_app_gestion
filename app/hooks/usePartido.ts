import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar } from '@/lib/offlineQueue'
import { esErrorDeRed } from '@/lib/offlineSync'
import { actualizarPendientes } from '@/hooks/useSincronizacionOffline'
import { elegirDivision, ventanaPartidos, type PedidoPartido } from '@/lib/partidosEntrenador'
import { useEstadoCarga } from './useEstadoCarga'
import { presenciasSinGuardar, textoSinGuardar } from '@/lib/marcasSinGuardar'
import { confirmarDescarte } from '@/components/shared/confirmarDescarte'
import { sincronizarEquipos, type AccesoEquipos, type Equipo } from '@/lib/equiposPartido'
import { crearGuardaEnVuelo } from '@/lib/guardaEnVuelo'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { abrirPaso, type DestinoPartido } from '@/lib/cargaPartido'
import { mensajeError } from '@/lib/mensajeError'

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
  // Tiene al menos un resultado cargado (de cualquier equipo).
  conResultado: boolean
}

export interface DivisionPartido {
  id: string
  nombre: string
  categoria: string
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

// `pedido`: lo que llega desde el Inicio (tarea RESULTADO / MESA, tarjeta del
// próximo partido): partido, división y, para RESULTADO, el paso.
export function usePartido(pedido: PedidoPartido = {}) {
  const { session } = useAuthStore()

  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [divisiones, setDivisiones] = useState<DivisionPartido[]>([])
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [sinDivision, setSinDivision] = useState(false)
  const [cargandoDivision, setCargandoDivision] = useState(false)
  const division = divisiones.find(d => d.id === divisionId) ?? null
  const divisionNombre = division?.nombre ?? ''
  const esInfantil = division?.categoria === 'infantil'

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

  // Una sola carga inicial a la vez (auditoría entrenador T16): la carga y la
  // re-sincronización de equipos al volver a la pestaña comparten la guarda,
  // así dos cargas en paralelo nunca crean el mismo equipo dos veces.
  const guardaCarga = useRef(crearGuardaEnVuelo()).current
  const cargado = useRef(false)
  // Sólo la última lectura de división escribe (cambio rápido de división).
  const ultimaLectura = useRef(0)
  // Lo que necesita la re-sincronización en segundo plano (sin closures viejos).
  const datosDivision = useRef<{ divId: string; categoria: string; nombre: string; cantidad: number } | null>(null)
  // Un error de lectura nunca es "sin división" ni "sin partidos": se muestra
  // con REINTENTAR, que repite lo que falló (T7).
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const reintento = useRef<(() => void) | null>(null)

  // Pedido del Inicio todavía sin aplicar: lo consume la próxima carga.
  const divisionPedida = useRef<string | null>(pedido.divisionId ?? null)
  const eventoPedido = useRef<string | null>(pedido.eventoId ?? null)
  const pasoPedido = useRef<'resultado' | null>(pedido.paso ?? null)

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

  // Volver desde el Inicio con otro partido (la pestaña ya estaba montada).
  // `marca` cambia en cada toque: el mismo partido pedido dos veces se reaplica.
  useEffect(() => {
    if (!pedido.eventoId && !pedido.divisionId) return
    const guardarPedido = () => {
      divisionPedida.current = pedido.divisionId ?? null
      eventoPedido.current = pedido.eventoId ?? null
      pasoPedido.current = pedido.paso ?? null
    }
    // Todavía cargando: la carga lo toma de los refs.
    if (divisiones.length === 0 || loading || cargandoDivision) { guardarPedido(); return }
    const destino = divisiones.find(d => d.id === elegirDivision(divisiones, pedido.divisionId, divisionId))
    // Si elige "Seguir marcando", el pedido no queda pendiente.
    cambiarSinPerderMarcas(() => {
      guardarPedido()
      if (destino && destino.id !== divisionId) {
        void cambiarDivision(destino)
      } else {
        void aplicarPedido(partidos, equipos, jugadoresBase, esInfantil)
      }
    })
  }, [pedido.marca, pedido.eventoId, pedido.divisionId, pedido.paso])

  // Con marcas de asistencia sin guardar, primero se pregunta (T3).
  function cambiarSinPerderMarcas(cambiar: () => void) {
    const sinGuardar = partidoSeleccionado ? presenciasSinGuardar(jugadores, presenciaGuardada.current) : 0
    if (sinGuardar === 0) { cambiar(); return }
    confirmarDescarte({
      mensaje: textoSinGuardar(sinGuardar, partidoSeleccionado?.rival ? `el partido vs ${partidoSeleccionado.rival}` : 'este partido'),
      onDescartar: cambiar,
    })
  }

  // ─── Sincronización de equipos ─────────────────────────────────────────────

  function aplicarEquipos(lista: Equipo[], inicial: boolean): Equipo | null {
    setEquipos(lista)
    if (lista.length === 0) return null
    setEquipoObligatorio(lista[0])
    if (inicial && lista.length === 1) setEquipoSeleccionado(lista[0])
    return lista[0]
  }

  function sincronizarEnBackground() {
    const d = datosDivision.current
    if (!session || !d) return
    const lectura = ultimaLectura.current
    guardaCarga(async () => {
      const r = await sincronizarEquipos(accesoEquipos, {
        divisionId: d.divId, categoria: d.categoria, divisionNombre: d.nombre,
        cantidadJugadores: d.cantidad, userId: session.user.id,
      })
      // Un error en segundo plano no borra los equipos que ya se ven; y si
      // mientras tanto se cambió de división, esta lista ya no corresponde.
      if (!r.error && lectura === ultimaLectura.current) aplicarEquipos(r.equipos, false)
    }, undefined)
  }

  // ─── Carga completa ────────────────────────────────────────────────────────

  function fetchDatos() {
    return guardaCarga(cargarDatos, undefined)
  }

  function reintentar() {
    const r = reintento.current
    if (r) r()
    else void fetchDatos()
  }

  function fallo(que: string, err: unknown, repetir: () => void) {
    setErrorCarga(mensajeErrorCarga(que, err))
    reintento.current = repetir
  }

  function limpiarError() {
    setErrorCarga(null)
    reintento.current = null
  }

  // Divisiones del entrenador (puede tener más de una) y la elegida.
  async function cargarDatos() {
    if (!session) return
    empezar()
    limpiarError()

    const { data: profile, error: errProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()
    if (errProfile) { fallo('tus divisiones', errProfile, () => { void fetchDatos() }); terminar(); return }

    const divIds = (profile?.divisiones as string[] | null) ?? []
    if (divIds.length === 0) { setSinDivision(true); terminar(); return }

    const { data: divs, error: errDivs } = await supabase
      .from('divisiones')
      .select('id, nombre, categoria')
      .in('id', divIds)
      .order('nombre')
    if (errDivs) { fallo('tus divisiones', errDivs, () => { void fetchDatos() }); terminar(); return }

    const lista = (divs ?? []) as DivisionPartido[]
    if (lista.length === 0) { setSinDivision(true); terminar(); return }
    setSinDivision(false)
    setDivisiones(lista)

    const elegida = elegirDivision(lista, divisionPedida.current, divisionId)
    const div = lista.find(d => d.id === elegida)
    if (div) await cargarDivision(div)
    terminar()
  }

  // Jugadores, partidos (−7/+14 días) y equipos de una división.
  async function cargarDivision(div: DivisionPartido) {
    if (!session) return
    const lectura = ++ultimaLectura.current
    limpiarError()
    setDivisionId(div.id)
    divisionPedida.current = null

    const { desde, hasta } = ventanaPartidos()
    const [jgsRes, partidosRes] = await Promise.all([
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', div.id)
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('eventos')
        .select('id, fecha, rival, lugar, resultados(evento_id)')
        .eq('tipo', 'partido')
        .eq('division_id', div.id)
        .eq('cancelado', false)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha'),
    ])
    if (lectura !== ultimaLectura.current) return

    const err = primerError(jgsRes.error, partidosRes.error)
    if (err) {
      fallo('los partidos y el plantel', err, () => { void cambiarDivision(div) })
      return
    }

    const lista: PartidoEvento[] = (partidosRes.data ?? []).map(p => ({
      id: p.id,
      fecha: p.fecha,
      rival: p.rival,
      lugar: p.lugar,
      conResultado: ((p.resultados as unknown[] | null) ?? []).length > 0,
    }))
    setPartidos(lista)

    const base: JugadorPartido[] = (jgsRes.data ?? []).map(j => ({
      id: j.id,
      nombre_completo: j.nombre_completo,
      presente: true,
      rolEnMesa: null,
    }))
    setJugadoresBase(base)
    setJugadores(base)

    datosDivision.current = { divId: div.id, categoria: div.categoria, nombre: div.nombre, cantidad: base.length }
    const r = await sincronizarEquipos(accesoEquipos, {
      divisionId: div.id, categoria: div.categoria, divisionNombre: div.nombre,
      cantidadJugadores: base.length, userId: session.user.id,
    })
    if (lectura !== ultimaLectura.current) return
    if (r.error) fallo('los equipos', r.error, () => { void cambiarDivision(div) })
    const listaEquipos = r.equipos
    aplicarEquipos(listaEquipos, true)

    await aplicarPedido(lista, listaEquipos, base, div.categoria === 'infantil')
  }

  // Cambio de división: vuelve al paso 1 sin partido ni equipo elegidos.
  async function cambiarDivision(div: DivisionPartido) {
    presenciaGuardada.current = {}
    setPartidoSeleccionado(null)
    setEquipoSeleccionado(null)
    setEquipoObligatorio(null)
    setEquipos([])
    setPartidos([])
    setPaso('equipo')
    setCargandoDivision(true)
    await cargarDivision(div)
    setCargandoDivision(false)
  }

  function seleccionarDivision(id: string) {
    const div = divisiones.find(d => d.id === id)
    if (!div || id === divisionId) return
    cambiarSinPerderMarcas(() => { void cambiarDivision(div) })
  }

  // Partido pedido desde el Inicio: se elige y, para RESULTADO, se abre ese
  // paso con el equipo obligatorio (cargando antes su asistencia y su mesa,
  // así "VOLVER A MESA" muestra la mesa real y no una vacía).
  async function aplicarPedido(
    lista: PartidoEvento[], listaEquipos: Equipo[], base: JugadorPartido[], infantil: boolean,
  ) {
    const evId = eventoPedido.current
    const pasoP = pasoPedido.current
    eventoPedido.current = null
    pasoPedido.current = null
    if (!evId) return
    const partido = lista.find(p => p.id === evId)
    if (!partido) return
    aplicarPartido(partido, base)
    setPaso('equipo')
    const equipo = listaEquipos[0]
    if (pasoP !== 'resultado' || infantil || !equipo) return
    setEquipoSeleccionado(equipo)
    await abrirPartido(partido, equipo, 'resultado', base)
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
    cambiarSinPerderMarcas(() => aplicarPartido(partido))
  }

  function aplicarPartido(partido: PartidoEvento, base: JugadorPartido[] = jugadoresBase) {
    presenciaGuardada.current = {}
    setPartidoSeleccionado(partido)
    setAsistenciaGuardada(false)
    setMesaGuardada(false)
    setErrorAsistencia(null)
    setErrorMesa(null)
    setResultadoGuardado(false)
    setErrorResultado(null)
    setJugadores(base.map(j => ({ ...j, presente: true, rolEnMesa: null as RolEnMesa | null })))
  }

  // ─── Asistencia y mesa guardadas del partido ───────────────────────────────

  // Abre ASISTENCIA o RESULTADO cargando antes lo guardado. Si la lectura
  // falla, REINTENTAR repite esta misma carga con estos datos (no con los
  // elegidos en pantalla, que pueden no estar todavía) y abre el mismo paso
  // (lib/cargaPartido.ts).
  function abrirPartido(
    partido: PartidoEvento, equipo: Equipo, destino: DestinoPartido, base: JugadorPartido[] = jugadoresBase,
  ): Promise<boolean> {
    return abrirPaso({ partido, equipo, base, destino }, {
      cargar: cargarPartido,
      fallo: (err, repetir) => fallo('la asistencia y la mesa del partido', err, repetir),
      irA: async (d, p, e) => {
        if (d === 'resultado') await irAResultado(p, e)
        else setPaso('asistencia')
      },
    })
  }

  // Carga lo guardado (asistencia del partido + mesa del equipo) en la lista.
  // Devuelve el error de la lectura (o null): abrirPartido lo muestra.
  async function cargarPartido(
    partido: PartidoEvento, equipo: Equipo, base: JugadorPartido[],
  ): Promise<unknown> {
    setCargandoTransicion(true)
    const reset = base.map(j => ({
      ...j,
      presente: true,
      rolEnMesa: null as RolEnMesa | null,
    }))

    const [asistRes, mesaRes] = await Promise.all([
      supabase
        .from('asistencias')
        .select('jugador_id, estado')
        .eq('evento_id', partido.id),
      supabase
        .from('mesas_de_partido')
        .select('id, mesa_jugadores(jugador_id, rol_en_mesa)')
        .eq('evento_id', partido.id)
        .eq('equipo_id', equipo.id)
        .maybeSingle(),
    ])

    const err = primerError(asistRes.error, mesaRes.error)
    if (err) {
      setCargandoTransicion(false)
      return err
    }
    limpiarError()

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
    return null
  }

  async function irAAsistencia() {
    if (!equipoSeleccionado || !partidoSeleccionado) return
    await abrirPartido(partidoSeleccionado, equipoSeleccionado, 'asistencia')
  }

  function irAEquipo() { setPaso('equipo') }
  function irAMesa()   { setPaso('mesa') }

  // ─── Transición a resultado (carga dato existente si hay) ──────────────────

  async function irAResultado(
    partido: PartidoEvento | null = partidoSeleccionado,
    equipo: Equipo | null = equipoSeleccionado,
  ) {
    if (!session || !partido || !equipo) return
    setCargandoTransicion(true)

    const { data, error } = await supabase
      .from('resultados')
      .select('puntos_propios, puntos_rival, rival')
      .eq('evento_id', partido.id)
      .eq('equipo_id', equipo.id)
      .maybeSingle()

    // Si no se pudo leer, no se muestra un resultado vacío que pise el cargado.
    if (error) {
      fallo('el resultado del partido', error, () => { void irAResultado(partido, equipo) })
      setCargandoTransicion(false)
      return
    }
    limpiarError()

    if (data) {
      setPuntosPropios(String(data.puntos_propios))
      setPuntosRival(String(data.puntos_rival))
      setRivalNombre(data.rival ?? partido.rival ?? '')
      setResultadoGuardado(true)
    } else {
      setPuntosPropios('')
      setPuntosRival('')
      setRivalNombre(partido.rival ?? '')
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
        console.warn('asistencia partido:', error)
        setErrorAsistencia(mensajeError(error, 'No se pudo guardar la asistencia. Probá de nuevo.'))
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
        console.warn('verificar mesa obligatoria:', obligErr)
        setErrorMesa(mensajeError(obligErr, `No se pudo verificar la mesa de "${equipoObligatorio.nombre}". Probá de nuevo.`))
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
      console.warn('guardar mesa:', mesaErr)
      // guardar_mesa: 23505 = jugador repetido, 22023 = equipo de otra división.
      setErrorMesa(mensajeError(mesaErr, 'No se pudo guardar la mesa. Probá de nuevo.', {
        duplicado: 'Hay un jugador repetido en la mesa.',
        invalido:  'Ese equipo no es de esta división. Recargá la pantalla.',
      }))
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
      console.warn('guardar resultado:', error)
      setErrorResultado(mensajeError(error, 'No se pudo guardar el resultado. Probá de nuevo.'))
      setGuardandoResultado(false)
      return
    }

    setResultadoGuardado(true)
    setGuardandoResultado(false)
    // Sale de "SIN RESULTADO" sin recargar la lista.
    const id = partidoSeleccionado.id
    setPartidos(prev => prev.map(p => p.id === id ? { ...p, conResultado: true } : p))
  }

  return {
    loading,
    refrescando,
    errorCarga,
    reintentar,
    divisiones,
    divisionId,
    seleccionarDivision,
    cargandoDivision,
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
    // Envuelto: el onPress pasaría el evento del toque como "partido".
    irAResultado: () => irAResultado(),
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
