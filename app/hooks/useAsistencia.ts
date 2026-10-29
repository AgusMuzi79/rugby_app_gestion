import { useState, useEffect, useRef } from 'react'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar, resolverNoEnviadas } from '@/lib/offlineQueue'
import { esErrorDeRed } from '@/lib/offlineSync'
import { actualizarPendientes, verificarCuartaAusencia } from '@/hooks/useSincronizacionOffline'
import type { MarcaGuardada } from '@/lib/ausenciasConsecutivas'
import { fechaLocal } from '@/lib/fecha'
import { elegirEntrenamiento, type EntrenamientoHoy } from '@/lib/entrenamientoHoy'
import { cantidadSinGuardar, textoSinGuardar } from '@/lib/marcasSinGuardar'
import { marcarTodosPresentes } from '@/lib/marcadoAsistencia'
import { claveDivisiones, clavePlantel, leerGuardado, resolverCarga, serializarGuardado } from '@/lib/plantelGuardado'
import { mensajeErrorCarga } from '@/lib/errorCarga'
import { mensajeError } from '@/lib/mensajeError'
import { confirmarDescarte } from '@/components/shared/confirmarDescarte'

export type EstadoAsistencia = 'presente' | 'ausente' | 'justificado'

export interface JugadorConEstado {
  id: string
  nombre_completo: string
  estado: EstadoAsistencia | null
  // Lo guardado (en la base o en la cola): distinto de `estado` = sin guardar.
  estadoGuardado: EstadoAsistencia | null
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
  // Falló una lectura y no hay copia: mensaje con REINTENTAR (recargar).
  errorCarga: string | null
  // Sin señal: se marca sobre la copia del plantel guardada a esta hora (ms).
  listaGuardadaEn: number | null
  recargar: () => void
  marcados: number
  sinGuardar: number
  // Entrenamientos de hoy de la división (doble turno: más de uno) y el elegido.
  // eventoId null = no hay ninguno hoy: se crea al guardar.
  entrenamientos: EntrenamientoHoy[]
  eventoId: string | null
  seleccionarDivision: (id: string) => void
  seleccionarEntrenamiento: (id: string) => void
  marcarEstado: (jugadorId: string, estado: EstadoAsistencia) => void
  marcarTodos: () => void
  // true si quedó guardada (en la base o en el teléfono).
  guardarAsistencia: () => Promise<boolean>
}

// Lo que llega desde el Inicio ("TOMAR ASISTENCIA" del entrenamiento de hoy).
export interface PedidoAsistencia {
  eventoId?: string
  divisionId?: string
}

type PlantelJugador = { id: string; nombre_completo: string }

// Copia local del plantel y de las divisiones (lib/plantelGuardado.ts). Si
// AsyncStorage falla, se sigue sin copia: nunca frena la pantalla.
async function leerLocal(clave: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(clave) } catch { return null }
}
async function guardarLocal(clave: string, valor: string): Promise<void> {
  try { await AsyncStorage.setItem(clave, valor) } catch { /* sin copia */ }
}

function minutosAhora(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function useAsistencia(pedido: PedidoAsistencia = {}): UseAsistenciaReturn {
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
  const [entrenamientos, setEntrenamientos] = useState<EntrenamientoHoy[]>([])
  const [eventoId, setEventoId] = useState<string | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [listaGuardadaEn, setListaGuardadaEn] = useState<number | null>(null)

  // Pedido del Inicio todavía sin aplicar: lo consume la próxima carga.
  const eventoPedido = useRef<string | null>(pedido.eventoId ?? null)
  const divisionPedida = useRef<string | null>(pedido.divisionId ?? null)
  // Sólo la última lectura escribe (cambio rápido de división o de turno).
  const ultimaLectura = useRef(0)

  const fecha = fechaLocal()
  const marcados = jugadores.filter(j => j.estado !== null).length
  const sinGuardar = cantidadSinGuardar(jugadores)
  const divisionNombre = divisiones.find(d => d.id === divisionId)?.nombre ?? ''

  // Divisiones asignadas al entrenador — puede tener más de una.
  useEffect(() => {
    if (session) fetchDivisiones()
  }, [session])

  // Un error de lectura no es "sin división": se muestra con REINTENTAR (o,
  // sin señal, se sigue con la copia guardada en el teléfono).
  async function fetchDivisiones() {
    if (!session) return
    setLoading(true)
    setErrorCarga(null)
    const clave = claveDivisiones(session.user.id)

    const { data: profile, error: errProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divIds = (profile?.divisiones as string[] | null) ?? []

    if (!errProfile && divIds.length === 0) {
      setSinDivision(true)
      setLoading(false)
      return
    }

    const divsRes = errProfile
      ? { data: null, error: errProfile }
      : await supabase.from('divisiones').select('id, nombre').in('id', divIds).order('nombre')

    const carga = resolverCarga<DivisionOpcion>({
      error: divsRes.error,
      remoto: divsRes.data,
      guardado: divsRes.error ? leerGuardado(await leerLocal(clave)) : null,
    })
    if (carga.tipo === 'error') {
      setErrorCarga(mensajeErrorCarga('tus divisiones', carga.error))
      setLoading(false)
      return
    }
    if (carga.tipo === 'remoto') void guardarLocal(clave, serializarGuardado(carga.datos, Date.now()))

    const divs = carga.datos
    if (divs.length === 0) {
      setSinDivision(true)
      setLoading(false)
      return
    }
    setSinDivision(false)
    setDivisiones(divs)
    const pedida = divisionPedida.current
    divisionPedida.current = null
    setDivisionId(prev => {
      if (pedida && divs.some(d => d.id === pedida)) return pedida
      return prev && divs.some(d => d.id === prev) ? prev : (divs[0]?.id ?? null)
    })
  }

  // Volver desde el Inicio con otro entrenamiento (la pestaña ya estaba montada).
  useEffect(() => {
    if (!pedido.eventoId && !pedido.divisionId) return
    if (divisiones.length === 0) {
      // Todavía cargando: fetchDivisiones / fetchJugadores lo toman de los refs.
      divisionPedida.current = pedido.divisionId ?? null
      eventoPedido.current = pedido.eventoId ?? null
      return
    }
    const divPedida = pedido.divisionId
    if (divPedida && divPedida !== divisionId && divisiones.some(d => d.id === divPedida)) {
      cambiarSinPerderMarcas(() => {
        eventoPedido.current = pedido.eventoId ?? null
        setDivisionId(divPedida)
      })
      return
    }
    const evPedido = pedido.eventoId
    if (evPedido && evPedido !== eventoId && entrenamientos.some(e => e.id === evPedido)) {
      cambiarSinPerderMarcas(() => { void cargarMarcas(evPedido) })
    }
  }, [pedido.eventoId, pedido.divisionId])

  // Jugadores + entrenamientos de hoy de la división seleccionada.
  useEffect(() => {
    if (divisionId) fetchJugadores(divisionId)
  }, [divisionId])

  async function leerMarcas(evId: string): Promise<{ marcas: Record<string, EstadoAsistencia>; error: unknown }> {
    const { data, error } = await supabase
      .from('asistencias')
      .select('jugador_id, estado')
      .eq('evento_id', evId)
    const estadoMap: Record<string, EstadoAsistencia> = {}
    ;(data ?? []).forEach(a => {
      estadoMap[a.jugador_id] = a.estado as EstadoAsistencia
    })
    return { marcas: estadoMap, error }
  }

  async function fetchJugadores(divId: string) {
    const lectura = ++ultimaLectura.current
    setLoading(true)
    setGuardado(false)
    setAlertas([])
    setErrorGuardado(null)
    setErrorCarga(null)
    setListaGuardadaEn(null)

    // Nunca `.maybeSingle()` por (división, fecha, tipo): con doble turno tira
    // error y se creaba un tercer entrenamiento. Se listan todos los de hoy.
    const [jgsRes, eventosRes] = await Promise.all([
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', divId)
        .eq('activo', true)
        .order('nombre_completo'),
      supabase
        .from('eventos')
        .select('id, hora')
        .eq('tipo', 'entrenamiento')
        .eq('division_id', divId)
        .eq('fecha', fecha)
        .eq('cancelado', false)
        .order('hora', { nullsFirst: false })
        .order('created_at'),
    ])

    const lista: EntrenamientoHoy[] = eventosRes.data ?? []
    const elegido = eventosRes.error ? null : elegirEntrenamiento(lista, eventoPedido.current, minutosAhora())
    eventoPedido.current = null
    const marcasRes = elegido ? await leerMarcas(elegido) : { marcas: {}, error: null }

    // Si algo falló: sin señal se sigue con la copia del plantel (sin evento
    // elegido: al guardar va a la cola y la sync resuelve el entrenamiento del
    // día); con otro error, REINTENTAR.
    const error = jgsRes.error ?? eventosRes.error ?? marcasRes.error
    const clave = clavePlantel(divId)
    const carga = resolverCarga<PlantelJugador>({
      error,
      remoto: jgsRes.data,
      guardado: error ? leerGuardado(await leerLocal(clave)) : null,
    })

    if (lectura !== ultimaLectura.current) return
    if (carga.tipo === 'error') {
      setEntrenamientos([])
      setEventoId(null)
      setJugadores([])
      setErrorCarga(mensajeErrorCarga('la lista de jugadores', carga.error))
      setLoading(false)
      return
    }
    if (carga.tipo === 'remoto') {
      void guardarLocal(clave, serializarGuardado(carga.datos.map(j => ({ id: j.id, nombre_completo: j.nombre_completo })), Date.now()))
    } else {
      setListaGuardadaEn(carga.guardadoEn)
    }
    const estadoMap: Record<string, EstadoAsistencia> = carga.tipo === 'remoto' ? marcasRes.marcas : {}
    setEntrenamientos(carga.tipo === 'remoto' ? lista : [])
    setEventoId(carga.tipo === 'remoto' ? elegido : null)
    setJugadores(carga.datos.map(j => ({
      id: j.id,
      nombre_completo: j.nombre_completo,
      estado: estadoMap[j.id] ?? null,
      estadoGuardado: estadoMap[j.id] ?? null,
    })))
    setLoading(false)
  }

  // Cambiar de turno (doble entrenamiento): mismas personas, marcas de ese evento.
  async function cargarMarcas(evId: string) {
    const lectura = ++ultimaLectura.current
    setLoading(true)
    setGuardado(false)
    setAlertas([])
    setErrorGuardado(null)
    const { marcas: estadoMap, error } = await leerMarcas(evId)
    if (lectura !== ultimaLectura.current) return
    if (error) {
      // Se queda en el turno anterior, con sus marcas.
      setErrorGuardado(`${mensajeErrorCarga('las marcas de ese entrenamiento', error)}`)
      setLoading(false)
      return
    }
    setEventoId(evId)
    setJugadores(prev => prev.map(j => ({ ...j, estado: estadoMap[j.id] ?? null, estadoGuardado: estadoMap[j.id] ?? null })))
    setLoading(false)
  }

  // Volver a leer lo que falló (REINTENTAR).
  function recargar() {
    if (divisiones.length === 0 || !divisionId) { void fetchDivisiones(); return }
    void fetchJugadores(divisionId)
  }

  // Cambiar de división o de turno recarga la lista: con marcas sin guardar,
  // primero se pregunta (antes se perdían sin aviso).
  function cambiarSinPerderMarcas(cambiar: () => void) {
    if (sinGuardar === 0) { cambiar(); return }
    const donde = [divisionNombre, entrenamientos.length > 1 ? 'este turno' : ''].filter(Boolean).join(', ')
    confirmarDescarte({
      mensaje: textoSinGuardar(sinGuardar, donde),
      onGuardar: () => { void guardarAsistencia().then(ok => { if (ok) cambiar() }) },
      onDescartar: cambiar,
    })
  }

  function seleccionarDivision(id: string) {
    if (id === divisionId) return
    cambiarSinPerderMarcas(() => setDivisionId(id))
  }

  function seleccionarEntrenamiento(id: string) {
    if (id === eventoId) return
    cambiarSinPerderMarcas(() => { void cargarMarcas(id) })
  }

  function marcarEstado(jugadorId: string, estado: EstadoAsistencia) {
    setGuardado(false)
    setJugadores(prev => prev.map(j => (j.id === jugadorId ? { ...j, estado } : j)))
  }

  // Un toque para el caso común: después se marcan sólo los ausentes.
  function marcarTodos() {
    setGuardado(false)
    setJugadores(prev => marcarTodosPresentes(prev))
  }

  async function guardarAsistencia(): Promise<boolean> {
    if (!session || !divisionId) return false
    setGuardando(true)
    setPendienteSync(false)
    setAlertas([])
    setErrorGuardado(null)

    // Lo que se manda: al terminar bien queda como "guardado" (sin cambios).
    const enviadas: Record<string, EstadoAsistencia> = {}
    jugadores.forEach(j => { if (j.estado !== null) enviadas[j.id] = j.estado })
    const marcarGuardadas = () => setJugadores(prev => prev.map(j => (
      enviadas[j.id] ? { ...j, estadoGuardado: enviadas[j.id] } : j
    )))
    // Para la alerta de 4 faltas: lo que había antes en el evento.
    const marcasGuardadas: MarcaGuardada[] = jugadores
      .filter(j => j.estado !== null)
      .map(j => ({ jugador_id: j.id, estado: j.estado!, estadoPrevio: j.estadoGuardado }))

    // Sin señal (o si la red se cae a mitad): queda en el teléfono y
    // useSincronizacionOffline la manda cuando vuelve la conexión.
    const guardarEnTelefono = async (): Promise<boolean> => {
      await encolar({
        tipo: 'asistencia',
        payload: {
          // Con el turno elegido va su evento; sin evento hoy, la sync usa el
          // primero del día de la división o lo crea (igual que online).
          ...(eventoId ? { evento_id: eventoId, entrenamiento: true } : {}),
          division_id: divisionId,
          fecha,
          registrado_por: session.user.id,
          jugadores: marcasGuardadas.map(m => ({
            jugador_id: m.jugador_id, estado: m.estado, estado_previo: m.estadoPrevio,
          })),
        },
      })
      await actualizarPendientes()
      marcarGuardadas()
      setPendienteSync(true)
      setGuardado(true)
      setGuardando(false)
      return true
    }

    const { isConnected } = await NetInfo.fetch()
    if (!isConnected) return guardarEnTelefono()

    const evento = eventoId ? { id: eventoId, error: null } : await obtenerOCrearEvento(divisionId)
    if (!evento.id) {
      if (esErrorDeRed(evento.error)) return guardarEnTelefono()
      console.warn('crear entrenamiento:', evento.error)
      setErrorGuardado(mensajeError(evento.error, 'No se pudo crear el entrenamiento de hoy. Probá de nuevo.'))
      setGuardando(false)
      return false
    }
    const eventoGuardado = evento.id
    if (!eventoId) {
      // El que se creó (o apareció) queda elegido: el próximo guardado no crea otro.
      setEventoId(eventoGuardado)
      setEntrenamientos(prev => (prev.some(e => e.id === eventoGuardado) ? prev : [...prev, { id: eventoGuardado, hora: null }]))
    }

    const asistencias = jugadores
      .filter(j => j.estado !== null)
      .map(j => ({
        evento_id: eventoGuardado,
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
        if (esErrorDeRed(asistError)) return guardarEnTelefono()
        console.warn('guardar asistencias:', asistError)
        setErrorGuardado(mensajeError(asistError, 'No se pudo guardar la asistencia. Probá de nuevo.'))
        setGuardando(false)
        return false
      }
    }

    marcarGuardadas()
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
    // Después de mostrar "guardada": la alerta no demora la confirmación.
    void avisarCuartaAusencia(divisionId, eventoGuardado, marcasGuardadas)
    return true
  }

  // Alerta de 4 faltas seguidas: sólo a quienes esta carga les completa la 4ª.
  async function avisarCuartaAusencia(divId: string, evId: string, marcas: MarcaGuardada[]) {
    const lectura = ultimaLectura.current
    try {
      const nombres = Object.fromEntries(jugadores.map(j => [j.id, j.nombre_completo]))
      const llegaron = await verificarCuartaAusencia({ divisionId: divId, eventoId: evId, marcas, divisionNombre, nombres })
      // Si mientras tanto cambió la lista (otra división o turno), no se marca.
      if (lectura === ultimaLectura.current) setAlertas(llegaron)
    } catch (e) {
      console.warn('alerta 4 ausencias:', e instanceof Error ? e.message : String(e))
    }
  }

  // Sin entrenamiento hoy al abrir: el primero que haya aparecido (mismo criterio
  // que la sync offline, lib/offlineSync.ts) o uno nuevo.
  async function obtenerOCrearEvento(divId: string): Promise<{ id: string | null; error: unknown }> {
    const { data: existentes, error: errorBusqueda } = await supabase
      .from('eventos')
      .select('id')
      .eq('tipo', 'entrenamiento')
      .eq('division_id', divId)
      .eq('fecha', fecha)
      .eq('cancelado', false)
      .order('created_at')
      .limit(1)

    const existente = existentes?.[0]
    if (existente) return { id: existente.id, error: null }
    if (errorBusqueda) return { id: null, error: errorBusqueda }

    const { data: nuevo, error } = await supabase
      .from('eventos')
      .insert({ tipo: 'entrenamiento', division_id: divId, fecha, creado_por: session!.user.id })
      .select('id')
      .single()

    return error ? { id: null, error } : { id: nuevo.id, error: null }
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
    errorCarga,
    listaGuardadaEn,
    recargar,
    marcados,
    sinGuardar,
    entrenamientos,
    eventoId,
    seleccionarDivision,
    seleccionarEntrenamiento,
    marcarEstado,
    marcarTodos,
    guardarAsistencia,
  }
}
