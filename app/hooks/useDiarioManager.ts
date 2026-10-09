import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
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
  pct:          number
  pagados:      number
  total:        number
  montoCobrado: number
  montoTotal:   number
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
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DiarioManagerData>(DEFAULT)

  useEffect(() => { if (session) void fetchTodo() }, [session])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session) return
    setLoading(true)

    try {
      const { data: profile } = await supabase
        .from('profiles').select('nombre, divisiones').eq('id', session.user.id).single()

      const divIds: string[] = (profile?.divisiones as string[] | null) ?? []
      const divId = divIds[0] ?? null

      if (!divId) {
        setData({ ...DEFAULT, nombre: profile?.nombre ?? '', sinDivision: true })
        setLoading(false)
        return
      }

      // Todas las divisiones del manager, no sólo la primera.
      const [divRes, eventosRes, fichajesRes] = await Promise.all([
        supabase.from('divisiones').select('id, nombre').in('id', divIds),
        supabase.from('eventos_financieros')
          .select(`id, nombre, tipo, descripcion, created_at, ${SELECT_DIVISIONES_EVENTO}, cobranzas(estado, monto)`)
          .eq('estado', 'activo')
          .order('created_at', { ascending: false }),
        supabase.from('jugadores')
          .select('id, nombre_completo, division_id, created_at')
          .in('division_id', divIds).eq('activo', true)
          .order('created_at', { ascending: false })
          .limit(3),
      ])

      type CobrRow = { estado: string; monto: number | null }
      type Fila    = EventoDivisionesRow & {
        id: string; nombre: string; tipo: string; descripcion: string | null
        created_at: string; cobranzas: CobrRow[] | null
      }

      const misDivs = (divRes.data ?? [])
        .map(d => ({ id: d.id, nombre: d.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
      const nombreDivision = new Map(misDivs.map(d => [d.id, d.nombre]))

      // Eventos de todo el club o que incluyen alguna división del manager.
      const filas = ((eventosRes.data ?? []) as unknown as Fila[])
        .map(ef => ({ ef, divs: divisionesDeEvento(ef) }))
        .filter(({ divs }) => divs.length === 0 || divs.some(d => divIds.includes(d.id)))

      const eventos: EventoProgreso[] = filas.map(({ ef, divs }) => {
        const cobrs       = ef.cobranzas ?? []
        const total       = cobrs.length
        const pagados     = cobrs.filter(c => c.estado === 'pagado').length
        const montoCobrado = cobrs
          .filter(c => c.estado === 'pagado')
          .reduce((s, c) => s + (c.monto ?? 0), 0)
        const montoTotal  = cobrs.reduce((s, c) => s + (c.monto ?? 0), 0)

        return {
          id:           ef.id,
          nombre:       ef.nombre,
          tipo:         ef.tipo,
          descripcion:  ef.descripcion ?? null,
          pct:          total > 0 ? Math.round((pagados / total) * 100) : 0,
          pagados,
          total,
          montoCobrado,
          montoTotal,
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
    } catch { /* keep defaults */ }

    setLoading(false)
  }

  return { loading, data }
}
