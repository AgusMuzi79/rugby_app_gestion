import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import { pctCobrado, resumenDe, resumenesPorEvento } from '@/lib/resumenCobranzas'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import {
  SELECT_DIVISIONES_EVENTO,
  divisionesDeEvento,
  etiquetaDivisiones,
  type EventoDivisionesRow,
} from './useEventos'

export interface EventoProgreso {
  id:           string
  nombre:       string
  tipo:         string
  descripcion:  string | null
  // Sobre los jugadores del evento de las divisiones del manager (RPC
  // resumen_cobranzas_eventos). null = no se pudo cargar el resumen; pct
  // también es null si el evento no tiene jugadores suyos.
  pct:          number | null
  pagados:      number | null
  total:        number | null
  montoCobrado: number | null
  createdAt:    string
  esGlobal:     boolean  // de todo el club (sin divisiones)
}

export interface UltimoFichaje {
  id:             string
  nombreCompleto: string
  divisionNombre: string
  createdAt:      string
}

export interface DiarioManagerData {
  nombre:         string
  divisionNombre: string         // todas sus divisiones: "M15 · M16"
  divisionId:     string | null  // primera división (compatibilidad)
  eventos:        EventoProgreso[]
  fichajes:       UltimoFichaje[]
  sinDivision:    boolean
}

const DEFAULT: DiarioManagerData = {
  nombre: '', divisionNombre: '', divisionId: null,
  eventos: [], fichajes: [], sinDivision: false,
}

export function useDiarioManager() {
  const { session } = useAuthStore()
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [data, setData]       = useState<DiarioManagerData>(DEFAULT)
  // Error de red / RLS: no es "sin división" ni "sin cobranzas" (T4).
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  useEffect(() => { if (session) void fetchTodo() }, [session])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session) return
    empezar()

    try {
      const { data: profile, error: errorProfile } = await supabase
        .from('profiles').select('nombre, divisiones').eq('id', session.user.id).single()
      if (errorProfile) throw errorProfile

      const divIds: string[] = (profile?.divisiones as string[] | null) ?? []
      const divId = divIds[0] ?? null

      if (!divId) {
        setData({ ...DEFAULT, nombre: profile?.nombre ?? '', sinDivision: true })
        setErrorCarga(null)
        terminar()
        return
      }

      // Todas las divisiones del manager, no sólo la primera.
      const [divRes, eventosRes, fichajesRes] = await Promise.all([
        supabase.from('divisiones').select('id, nombre').in('id', divIds),
        supabase.from('eventos_financieros')
          .select(`id, nombre, tipo, descripcion, created_at, ${SELECT_DIVISIONES_EVENTO}`)
          .eq('estado', 'activo')
          .order('created_at', { ascending: false }),
        supabase.from('jugadores')
          .select('id, nombre_completo, division_id, created_at')
          .in('division_id', divIds).eq('activo', true)
          .order('created_at', { ascending: false })
          .limit(3),
      ])
      const errorLectura = primerError(divRes.error, eventosRes.error, fichajesRes.error)
      if (errorLectura) throw errorLectura

      type Fila = EventoDivisionesRow & {
        id: string; nombre: string; tipo: string; descripcion: string | null
        created_at: string
      }

      const misDivs = (divRes.data ?? [])
        .map(d => ({ id: d.id, nombre: d.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
      const nombreDivision = new Map(misDivs.map(d => [d.id, d.nombre]))

      // Eventos de todo el club o que incluyen alguna división del manager.
      const filas = ((eventosRes.data ?? []) as unknown as Fila[])
        .map(ef => ({ ef, divs: divisionesDeEvento(ef) }))
        .filter(({ divs }) => divs.length === 0 || divs.some(d => divIds.includes(d.id)))

      // Avance de cobro sobre los jugadores del evento (T3), no sobre las filas
      // de cobranzas (antes daba 100 % con 3 de 80 y "$45k / $45k").
      const resumenRes = filas.length > 0
        ? await supabase.rpc('resumen_cobranzas_eventos', { p_ids: filas.map(({ ef }) => ef.id) })
        : { data: [], error: null }
      const resumenes = resumenRes.error ? null : resumenesPorEvento(resumenRes.data)

      const eventos: EventoProgreso[] = filas.map(({ ef, divs }) => {
        const r = resumenes ? resumenDe(resumenes, ef.id) : null
        return {
          id:           ef.id,
          nombre:       ef.nombre,
          tipo:         ef.tipo,
          descripcion:  ef.descripcion ?? null,
          pct:          r ? pctCobrado(r) : null,
          pagados:      r ? r.pagados : null,
          total:        r ? r.jugadores : null,
          montoCobrado: r ? r.cobrado : null,
          createdAt:    ef.created_at,
          esGlobal:     divs.length === 0,
        }
      })

      const fichajes: UltimoFichaje[] = (fichajesRes.data ?? []).map(j => ({
        id:             j.id,
        nombreCompleto: j.nombre_completo,
        divisionNombre: nombreDivision.get(j.division_id) ?? '',
        createdAt:      j.created_at,
      }))

      setData({
        nombre:         profile?.nombre ?? '',
        divisionNombre: etiquetaDivisiones(misDivs) ?? '',
        divisionId:     divId,
        eventos,
        fichajes,
        sinDivision:    false,
      })
      setErrorCarga(null)
    } catch (err) {
      setErrorCarga(mensajeErrorCarga('las cobranzas y fichajes', err))
    }

    terminar()
  }

  return { loading, refrescando, data, errorCarga, refetch: fetchTodo }
}
