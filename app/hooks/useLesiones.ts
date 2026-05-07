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

function fechaHoy(): string {
  return new Date().toISOString().split('T')[0]
}

export function useLesiones() {
  const { session } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
  const [sinDivision, setSinDivision] = useState(false)

  const [lesiones, setLesiones] = useState<LesionItem[]>([])
  const [jugadores, setJugadores] = useState<JugadorOpcion[]>([])

  const [modalVisible, setModalVisible] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [jugadorSeleccionado, setJugadorSeleccionado] = useState<JugadorOpcion | null>(null)
  const [grado, setGrado] = useState<number | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(fechaHoy)

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  useFocusEffect(
    useCallback(() => {
      if (session && divisionId) recargarLesiones(divisionId)
    }, [session, divisionId]),
  )

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

    const [divRes, lesionesRes, jgsRes] = await Promise.all([
      supabase.from('divisiones').select('nombre').eq('id', divId).single(),
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

    setDivisionNombre(divRes.data?.nombre ?? '')
    setJugadores(jgsRes.data ?? [])
    setLesiones(toLesionItems(lesionesRes.data ?? []))
    setLoading(false)
  }

  async function recargarLesiones(divId: string) {
    const { data } = await supabase
      .from('lesiones')
      .select('id, jugador_id, fecha, descripcion, grado, jugadores(nombre_completo)')
      .eq('division_id', divId)
      .order('fecha', { ascending: false })
    setLesiones(toLesionItems(data ?? []))
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

    if (!jugadorSeleccionado)                   { setError('Seleccioná un jugador.'); return }
    if (!grado)                                 { setError('Seleccioná el grado.'); return }
    if (!descripcion.trim())                    { setError('Ingresá una descripción.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))   { setError('Fecha inválida. Formato: AAAA-MM-DD'); return }

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
    divisionNombre,
    sinDivision,
    lesiones,
    jugadores,
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
