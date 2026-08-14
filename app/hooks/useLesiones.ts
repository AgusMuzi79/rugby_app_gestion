import { useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { encolar } from '@/lib/offlineQueue'

export interface JugadorOpcion {
  id: string
  nombre_completo: string
}

export interface LesionItem {
  id: string
  jugador_id: string
  jugadorNombre: string
  fecha: string
  descripcion: string
  grado: number
}

export interface JugadorHistorial {
  id: string
  nombre_completo: string
}

export interface DivisionOpcion {
  id: string
  nombre: string
}

function fechaHoy(): string {
  return new Date().toISOString().split('T')[0]
}

export function useLesiones() {
  const { session } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [divisiones, setDivisiones] = useState<DivisionOpcion[]>([])
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [sinDivision, setSinDivision] = useState(false)

  const [lesiones, setLesiones] = useState<LesionItem[]>([])
  const [jugadores, setJugadores] = useState<JugadorOpcion[]>([])

  const [paso, setPaso] = useState<'lista' | 'historial'>('lista')
  const [jugadorHistorial, setJugadorHistorial] = useState<JugadorHistorial | null>(null)
  const [historialLesiones, setHistorialLesiones] = useState<LesionItem[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const [modalVisible, setModalVisible] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [jugadorSeleccionado, setJugadorSeleccionado] = useState<JugadorOpcion | null>(null)
  const [grado, setGrado] = useState<number | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(fechaHoy)

  const divisionNombre = divisiones.find(d => d.id === divisionId)?.nombre ?? ''

  useEffect(() => {
    if (session) fetchDivisiones()
  }, [session])

  useEffect(() => {
    if (divisionId) fetchDatosDivision(divisionId)
  }, [divisionId])

  useFocusEffect(
    useCallback(() => {
      if (session && divisionId) recargarLesiones(divisionId)
    }, [session, divisionId]),
  )

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function fetchDivisiones() {
    if (!session) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divIds = (profile?.divisiones as string[] | null) ?? []
    if (divIds.length === 0) { setSinDivision(true); setLoading(false); return }

    const { data: divsData } = await supabase
      .from('divisiones')
      .select('id, nombre')
      .in('id', divIds)
      .order('nombre')

    const divs = divsData ?? []
    setDivisiones(divs)
    setDivisionId(prev => (prev && divs.some(d => d.id === prev) ? prev : (divs[0]?.id ?? null)))
  }

  async function fetchDatosDivision(divId: string) {
    setLoading(true)

    const [lesionesRes, jgsRes] = await Promise.all([
      supabase
        .from('lesiones')
        .select('id, jugador_id, fecha, descripcion, grado, jugadores(nombre_completo)')
        .eq('division_id', divId)
        .order('fecha', { ascending: false }),
      supabase
        .from('jugadores')
        .select('id, nombre_completo')
        .eq('division_id', divId)
        .eq('activo', true)
        .order('nombre_completo'),
    ])

    setJugadores(jgsRes.data ?? [])
    setLesiones(toLesionItems(lesionesRes.data ?? []))
    setLoading(false)
  }

  function seleccionarDivision(id: string) {
    if (id === divisionId) return
    setDivisionId(id)
  }

  async function recargarLesiones(divId: string) {
    const { data } = await supabase
      .from('lesiones')
      .select('id, jugador_id, fecha, descripcion, grado, jugadores(nombre_completo)')
      .eq('division_id', divId)
      .order('fecha', { ascending: false })
    setLesiones(toLesionItems(data ?? []))
  }

  // ─── Historial por jugador ─────────────────────────────────────────────────

  async function verHistorial(jugador: JugadorHistorial) {
    setPaso('historial')
    setJugadorHistorial(jugador)
    setCargandoHistorial(true)
    const { data } = await supabase
      .from('lesiones')
      .select('id, jugador_id, fecha, descripcion, grado, jugadores(nombre_completo)')
      .eq('jugador_id', jugador.id)
      .order('fecha', { ascending: false })
    setHistorialLesiones(toLesionItems(data ?? []))
    setCargandoHistorial(false)
  }

  function cerrarHistorial() {
    setPaso('lista')
    setJugadorHistorial(null)
    setHistorialLesiones([])
  }

  // ─── Modal ─────────────────────────────────────────────────────────────────

  function abrirModal() {
    setJugadorSeleccionado(null)
    setGrado(null)
    setDescripcion('')
    setFecha(fechaHoy())
    setError(null)
    setGuardadoOk(false)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
    setError(null)
    setGuardadoOk(false)
  }

  // ─── Guardar ───────────────────────────────────────────────────────────────

  async function guardarLesion() {
    if (!session || !divisionId) return

    if (!jugadorSeleccionado)  { setError('Seleccioná un jugador.'); return }
    if (!grado)               { setError('Seleccioná el grado.'); return }
    if (!descripcion.trim())  { setError('Ingresá una descripción.'); return }
    if (!fecha)               { setError('Seleccioná la fecha.'); return }

    setGuardando(true)
    setError(null)

    const payload = {
      jugador_id:     jugadorSeleccionado.id,
      division_id:    divisionId,
      fecha,
      descripcion:    descripcion.trim(),
      grado,
      registrado_por: session.user.id,
    }

    const { isConnected } = await NetInfo.fetch()

    if (isConnected) {
      const { error: dbErr } = await supabase.from('lesiones').insert(payload)
      if (dbErr) {
        setError('Error al guardar: ' + dbErr.message)
        setGuardando(false)
        return
      }
      await recargarLesiones(divisionId)
      void supabase.functions.invoke('notifications', {
        body: {
          type: 'lesion',
          payload: {
            jugadorNombre:  jugadorSeleccionado.nombre_completo,
            divisionNombre,
            grado,
            jugadorId:      jugadorSeleccionado.id,
            divisionId,
          },
        },
      })
    } else {
      await encolar({ tipo: 'lesion', payload })
      setLesiones(prev => [{
        id: crypto.randomUUID(),
        jugador_id: jugadorSeleccionado.id,
        jugadorNombre: jugadorSeleccionado.nombre_completo,
        fecha,
        descripcion: descripcion.trim(),
        grado,
      }, ...prev])
    }

    setGuardadoOk(true)
    setGuardando(false)
  }

  return {
    loading,
    divisiones,
    divisionId,
    divisionNombre,
    sinDivision,
    seleccionarDivision,
    lesiones,
    jugadores,
    paso,
    jugadorHistorial,
    historialLesiones,
    cargandoHistorial,
    verHistorial,
    cerrarHistorial,
    modalVisible,
    guardando,
    guardadoOk,
    error,
    jugadorSeleccionado,
    setJugadorSeleccionado,
    grado,
    setGrado,
    descripcion,
    setDescripcion,
    fecha,
    setFecha,
    abrirModal,
    cerrarModal,
    guardarLesion,
  }
}

// ─── Mapper fuera del hook para evitar capture de closures ──────────────────

function toLesionItems(
  rows: Array<{
    id: string
    jugador_id: string
    fecha: string
    descripcion: string
    grado: number
    jugadores: { nombre_completo: string } | { nombre_completo: string }[] | null
  }>,
): LesionItem[] {
  return rows.map(l => {
    const jug = l.jugadores
    const nombre = Array.isArray(jug)
      ? (jug[0]?.nombre_completo ?? '')
      : ((jug as { nombre_completo: string } | null)?.nombre_completo ?? '')
    return {
      id:           l.id,
      jugador_id:   l.jugador_id,
      jugadorNombre: nombre,
      fecha:        l.fecha,
      descripcion:  l.descripcion,
      grado:        l.grado,
    }
  })
}
