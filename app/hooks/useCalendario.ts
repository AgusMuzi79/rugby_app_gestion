import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export type TipoEvento = 'entrenamiento' | 'partido'

export interface EventoCalendario {
  id: string
  tipo: string
  division_id: string
  fecha: string
  hora: string | null
  lugar: string | null
  rival: string | null
  cancelado: boolean
  creado_por: string
  created_at: string
  updated_at: string
  division_nombre: string
}

export interface NuevoEventoForm {
  tipo: TipoEvento
  division_id: string
  fecha: string
  hora: string
  lugar: string
  rival: string
}

const FORM_VACIO: NuevoEventoForm = {
  tipo: 'entrenamiento',
  division_id: '',
  fecha: '',
  hora: '',
  lugar: '',
  rival: '',
}

export interface UseCalendarioReturn {
  eventos: EventoCalendario[]
  divisiones: { id: string; nombre: string }[]
  loading: boolean
  guardando: boolean
  errorGuardado: string | null
  sinDivisiones: boolean
  form: NuevoEventoForm
  setForm: (form: NuevoEventoForm) => void
  resetForm: () => void
  crearEvento: () => Promise<boolean>
  cancelarEvento: (id: string, divisionId: string, divisionNombre: string, fecha: string, mensaje: string) => Promise<boolean>
  cancelando: boolean
  errorCancelacion: string | null
  recargar: () => void
}

export function useCalendario(): UseCalendarioReturn {
  const { session } = useAuthStore()
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [divisiones, setDivisiones] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null)
  const [sinDivisiones, setSinDivisiones] = useState(false)
  const [form, setForm] = useState<NuevoEventoForm>(FORM_VACIO)

  const fetchDatos = useCallback(async () => {
    if (!session) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divIds: string[] = (profile?.divisiones as string[] | null) ?? []

    if (divIds.length === 0) {
      setSinDivisiones(true)
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

    setForm(prev => ({
      ...prev,
      division_id: prev.division_id || (divs[0]?.id ?? ''),
    }))

    const hace30 = new Date()
    hace30.setDate(hace30.getDate() - 30)
    const en60 = new Date()
    en60.setDate(en60.getDate() + 60)

    const desde = hace30.toISOString().split('T')[0]
    const hasta = en60.toISOString().split('T')[0]

    console.log('[calendario] Fetching eventos:', { divIds, desde, hasta })

    const { data: eventosData, error: eventosError } = await supabase
      .from('eventos')
      .select('*, divisiones(nombre)')
      .in('division_id', divIds)
      .eq('cancelado', false)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })

    console.log('[calendario] Eventos recibidos:', eventosData?.length ?? 0, eventosError ?? 'sin error')
    console.log('[calendario] Detalle eventos:', eventosData?.map(e => ({ id: e.id, tipo: e.tipo, fecha: e.fecha, division_id: e.division_id })))

    const eventosNormalizados: EventoCalendario[] = (eventosData ?? []).map((e: {
      id: string
      tipo: string
      division_id: string
      fecha: string
      hora: string | null
      lugar: string | null
      rival: string | null
      cancelado: boolean
      creado_por: string
      created_at: string
      updated_at: string
      divisiones: { nombre: string } | null
    }) => ({
      id: e.id,
      tipo: e.tipo,
      division_id: e.division_id,
      fecha: e.fecha,
      hora: e.hora,
      lugar: e.lugar,
      rival: e.rival,
      cancelado: e.cancelado,
      creado_por: e.creado_por,
      created_at: e.created_at,
      updated_at: e.updated_at,
      division_nombre: e.divisiones?.nombre ?? '',
    }))

    setEventos(eventosNormalizados)
    setLoading(false)
  }, [session])

  useEffect(() => {
    fetchDatos()
  }, [fetchDatos])

  function resetForm() {
    setForm({
      ...FORM_VACIO,
      division_id: divisiones[0]?.id ?? '',
    })
    setErrorGuardado(null)
  }

  async function crearEvento(): Promise<boolean> {
    if (!session) return false
    if (!form.division_id || !form.fecha) {
      setErrorGuardado('División y fecha son obligatorias.')
      return false
    }
    if (form.tipo === 'partido' && !form.rival.trim()) {
      setErrorGuardado('El nombre del rival es obligatorio para un partido.')
      return false
    }

    setGuardando(true)
    setErrorGuardado(null)

    console.log('[calendario] Creando evento:', { tipo: form.tipo, division_id: form.division_id, fecha: form.fecha })

    const { error } = await supabase.from('eventos').insert({
      tipo: form.tipo,
      division_id: form.division_id,
      fecha: form.fecha,
      hora: form.hora.trim() || null,
      lugar: form.lugar.trim() || null,
      rival: form.tipo === 'partido' ? (form.rival.trim() || null) : null,
      creado_por: session.user.id,
      cancelado: false,
    })

    setGuardando(false)

    if (error) {
      console.log('[calendario] Error al crear evento:', error.message)
      setErrorGuardado(error.message)
      return false
    }

    console.log('[calendario] Evento creado OK, refrescando lista...')
    await fetchDatos()
    return true
  }

  async function cancelarEvento(
    id: string,
    divisionId: string,
    divisionNombre: string,
    fecha: string,
    mensaje: string,
  ): Promise<boolean> {
    if (!session) return false
    setCancelando(true)
    setErrorCancelacion(null)

    // Marcar como cancelado
    const { error: cancelErr } = await supabase
      .from('eventos')
      .update({ cancelado: true })
      .eq('id', id)

    if (cancelErr) {
      setErrorCancelacion('Error al cancelar: ' + cancelErr.message)
      setCancelando(false)
      return false
    }

    // Quitar de lista local
    setEventos(prev => prev.filter(e => e.id !== id))

    // Publicar noticia automática
    await supabase.from('noticias').insert({
      titulo:                  `Entrenamiento cancelado — ${divisionNombre}`,
      cuerpo:                  mensaje,
      autor_id:                session.user.id,
      publicada:               true,
      audiencia:               'todos',
      division_id:             divisionId,
      generada_automaticamente: true,
    })

    // Push a jugadores-socios de la división (fire & forget)
    void supabase.functions.invoke('notifications', {
      body: {
        type: 'cancelacion_entrenamiento',
        payload: { divisionId, divisionNombre, mensaje, fecha },
      },
    })

    setCancelando(false)
    return true
  }

  return {
    eventos,
    divisiones,
    loading,
    guardando,
    errorGuardado,
    cancelando,
    errorCancelacion,
    sinDivisiones,
    form,
    setForm,
    resetForm,
    crearEvento,
    cancelarEvento,
    recargar: fetchDatos,
  }
}
