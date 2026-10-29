import { useState, useEffect, useRef } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar, resolverNoEnviadas } from '@/lib/offlineQueue'
import { esErrorDeRed } from '@/lib/offlineSync'
import { actualizarPendientes } from '@/hooks/useSincronizacionOffline'
import { fechaLocal } from '@/lib/fecha'
import { elegirEntrenamiento, type EntrenamientoHoy } from '@/lib/entrenamientoHoy'

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
  // Entrenamientos de hoy de la división (doble turno: más de uno) y el elegido.
  // eventoId null = no hay ninguno hoy: se crea al guardar.
  entrenamientos: EntrenamientoHoy[]
  eventoId: string | null
  seleccionarDivision: (id: string) => void
  seleccionarEntrenamiento: (id: string) => void
  marcarEstado: (jugadorId: string, estado: EstadoAsistencia) => void
  guardarAsistencia: () => Promise<void>
}

// Lo que llega desde el Inicio ("TOMAR ASISTENCIA" del entrenamiento de hoy).
export interface PedidoAsistencia {
  eventoId?: string
  divisionId?: string
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

  // Pedido del Inicio todavía sin aplicar: lo consume la próxima carga.
  const eventoPedido = useRef<string | null>(pedido.eventoId ?? null)
  const divisionPedida = useRef<string | null>(pedido.divisionId ?? null)
  // Sólo la última lectura escribe (cambio rápido de división o de turno).
  const ultimaLectura = useRef(0)

  const fecha = fechaLocal()
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
    if (pedido.divisionId && pedido.divisionId !== divisionId && divisiones.some(d => d.id === pedido.divisionId)) {
      eventoPedido.current = pedido.eventoId ?? null
      setDivisionId(pedido.divisionId)
      return
    }
    if (pedido.eventoId && pedido.eventoId !== eventoId && entrenamientos.some(e => e.id === pedido.eventoId)) {
      void cargarMarcas(pedido.eventoId)
    }
  }, [pedido.eventoId, pedido.divisionId])

  // Jugadores + entrenamientos de hoy de la división seleccionada.
  useEffect(() => {
    if (divisionId) fetchJugadores(divisionId)
  }, [divisionId])

  async function leerMarcas(evId: string): Promise<Record<string, EstadoAsistencia>> {
    const { data } = await supabase
      .from('asistencias')
      .select('jugador_id, estado')
      .eq('evento_id', evId)
    const estadoMap: Record<string, EstadoAsistencia> = {}
    ;(data ?? []).forEach(a => {
      estadoMap[a.jugador_id] = a.estado as EstadoAsistencia
    })
    return estadoMap
  }

  async function fetchJugadores(divId: string) {
    const lectura = ++ultimaLectura.current
    setLoading(true)
    setGuardado(false)
    setAlertas([])
    setErrorGuardado(null)

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
    const elegido = elegirEntrenamiento(lista, eventoPedido.current, minutosAhora())
    eventoPedido.current = null
    const estadoMap = elegido ? await leerMarcas(elegido) : {}

    if (lectura !== ultimaLectura.current) return
    setEntrenamientos(lista)
    setEventoId(elegido)
    setJugadores((jgsRes.data ?? []).map(j => ({
      id: j.id,
      nombre_completo: j.nombre_completo,
      estado: estadoMap[j.id] ?? null,
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
    const estadoMap = await leerMarcas(evId)
    if (lectura !== ultimaLectura.current) return
    setEventoId(evId)
    setJugadores(prev => prev.map(j => ({ ...j, estado: estadoMap[j.id] ?? null })))
    setLoading(false)
  }

  function seleccionarDivision(id: string) {
    if (id === divisionId) return
    setDivisionId(id)
  }

  function seleccionarEntrenamiento(id: string) {
    if (id === eventoId) return
    void cargarMarcas(id)
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
          // Con el turno elegido va su evento; sin evento hoy, la sync usa el
          // primero del día de la división o lo crea (igual que online).
          ...(eventoId ? { evento_id: eventoId, entrenamiento: true } : {}),
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

    const evento = eventoId ? { id: eventoId, error: null } : await obtenerOCrearEvento(divisionId)
    if (!evento.id) {
      if (esErrorDeRed(evento.error)) { await guardarEnTelefono(); return }
      setErrorGuardado('No se pudo crear el evento. Verificá tu conexión o permisos.')
      setGuardando(false)
      return
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
    entrenamientos,
    eventoId,
    seleccionarDivision,
    seleccionarEntrenamiento,
    marcarEstado,
    guardarAsistencia,
  }
}
