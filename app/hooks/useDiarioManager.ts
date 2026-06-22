import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

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
  esGlobal:     boolean
}

export interface UltimoFichaje {
  id:             string
  nombreCompleto: string
  createdAt:      string
}

export interface DiarioManagerData {
  nombre:         string
  divisionNombre: string
  divisionId:     string | null
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

      const [divRes, eventosRes, fichajesRes] = await Promise.all([
        supabase.from('divisiones').select('nombre').eq('id', divId).single(),
        supabase.from('eventos_financieros')
          .select('id, nombre, tipo, division_id, descripcion, created_at, cobranzas(estado, monto)')
          .eq('estado', 'activo')
          .or(`division_id.eq.${divId},division_id.is.null`)
          .order('created_at', { ascending: false }),
        supabase.from('jugadores')
          .select('id, nombre_completo, created_at')
          .eq('division_id', divId).eq('activo', true)
          .order('created_at', { ascending: false })
          .limit(3),
      ])

      type CobrRow = { estado: string; monto: number | null }

      const eventos: EventoProgreso[] = (eventosRes.data ?? []).map(ef => {
        const cobrs       = (ef.cobranzas as CobrRow[]) ?? []
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
          esGlobal:     ef.division_id === null,
        }
      })

      const fichajes: UltimoFichaje[] = (fichajesRes.data ?? []).map(j => ({
        id:             j.id,
        nombreCompleto: j.nombre_completo,
        createdAt:      j.created_at,
      }))

      setData({
        nombre:         profile?.nombre ?? '',
        divisionNombre: divRes.data?.nombre ?? '',
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
