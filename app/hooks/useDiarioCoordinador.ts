import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export interface EventoSemana {
  id:             string
  tipo:           string
  fecha:          string
  hora:           string | null
  lugar:          string | null
  rival:          string | null
  divisionId:     string
  divisionNombre: string
  cobranzaActiva: boolean
}

export interface AlertaJugador {
  jugadorId:      string
  nombre:         string
  divisionNombre: string
}

export interface BarraAsistencia {
  divisionId:  string
  nombre:      string
  pct:         number | null
  tieneAlerta: boolean
}

export interface DiarioCoordinadorData {
  nombre:        string
  divisiones:    { id: string; nombre: string }[]
  eventosSemana: EventoSemana[]
  asistencias:   BarraAsistencia[]
  alertas:       AlertaJugador[]
  sinDivisiones: boolean
}

function hoy()       { return new Date().toISOString().split('T')[0] }
function en7Dias()   { const d = new Date(); d.setDate(d.getDate() + 7);  return d.toISOString().split('T')[0] }
function hace30Dias(){ const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] }

const DEFAULT: DiarioCoordinadorData = {
  nombre: '', divisiones: [], eventosSemana: [],
  asistencias: [], alertas: [], sinDivisiones: false,
}

export function useDiarioCoordinador() {
  const { session } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DiarioCoordinadorData>(DEFAULT)

  useEffect(() => { if (session) void fetchTodo() }, [session])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session) return
    setLoading(true)

    try {
      const { data: profile } = await supabase
        .from('profiles').select('nombre, divisiones').eq('id', session.user.id).single()

      const divIds: string[] = (profile?.divisiones as string[] | null) ?? []
      if (divIds.length === 0) {
        setData({ ...DEFAULT, nombre: profile?.nombre ?? '', sinDivisiones: true })
        setLoading(false)
        return
      }

      type DivJoin = { nombre: string } | null

      // Cobranzas activas: eventos globales + por división
      const divFilter = divIds.map(id => `division_id.eq.${id}`).join(',')

      const [divsRes, semanaRes, eventos30Res, cobranzasActivasRes] = await Promise.all([
        supabase.from('divisiones').select('id, nombre').in('id', divIds).order('nombre'),
        supabase.from('eventos')
          .select('id, tipo, fecha, hora, lugar, rival, division_id, divisiones(nombre)')
          .in('division_id', divIds)
          .gte('fecha', hoy()).lte('fecha', en7Dias())
          .eq('cancelado', false).order('fecha').order('hora', { nullsFirst: false }),
        supabase.from('eventos')
          .select('id, division_id')
          .in('division_id', divIds)
          .gte('fecha', hace30Dias()).lte('fecha', hoy())
          .eq('cancelado', false)
          .order('fecha', { ascending: false }),
        supabase.from('eventos_financieros')
          .select('division_id')
          .eq('estado', 'activo')
          .or(`${divFilter},division_id.is.null`),
      ])

      const divs = divsRes.data ?? []

      // Set de divisiones con cobranza activa (null = global → todas)
      const tieneGlobalActiva = (cobranzasActivasRes.data ?? []).some(e => e.division_id === null)
      const activeDivIds      = new Set((cobranzasActivasRes.data ?? [])
        .filter(e => e.division_id !== null).map(e => e.division_id as string))

      // Eventos semana con cobranza
      const eventosSemana: EventoSemana[] = (semanaRes.data ?? []).map(ev => ({
        id:             ev.id,
        tipo:           ev.tipo,
        fecha:          ev.fecha,
        hora:           ev.hora,
        lugar:          ev.lugar,
        rival:          ev.rival,
        divisionId:     ev.division_id,
        divisionNombre: (ev.divisiones as DivJoin)?.nombre ?? '',
        cobranzaActiva: tieneGlobalActiva || activeDivIds.has(ev.division_id),
      }))

      // Asistencia por división + alertas de jugadores (últimos 30 días)
      const eventoIds = (eventos30Res.data ?? []).map(e => e.id)
      let asistencias: BarraAsistencia[] = divs.map(d => ({
        divisionId: d.id, nombre: d.nombre, pct: null, tieneAlerta: false,
      }))
      const alertas: AlertaJugador[] = []

      if (eventoIds.length > 0) {
        const [asistRes, jugRes] = await Promise.all([
          supabase.from('asistencias')
            .select('jugador_id, evento_id, estado, division_id')
            .in('evento_id', eventoIds),
          supabase.from('jugadores')
            .select('id, nombre_completo, division_id')
            .in('division_id', divIds).eq('activo', true),
        ])

        const asists = asistRes.data ?? []
        const jugs   = jugRes.data   ?? []

        // Últimos 4 eventos por división en orden cronológico inverso
        const eventosPorDiv = new Map<string, string[]>()
        for (const ev of eventos30Res.data ?? []) {
          const arr = eventosPorDiv.get(ev.division_id) ?? []
          if (arr.length < 4) arr.push(ev.id)
          eventosPorDiv.set(ev.division_id, arr)
        }

        asistencias = divs.map(div => {
          const divAsists = asists.filter(a => a.division_id === div.id)
          const total     = divAsists.length
          const presentes = divAsists.filter(a => a.estado === 'presente').length
          const pct       = total > 0 ? Math.round((presentes / total) * 100) : null

          const ultimos4Ids = eventosPorDiv.get(div.id) ?? []
          const divJugs     = jugs.filter(j => j.division_id === div.id)
          let tieneAlerta   = false

          for (const jug of divJugs) {
            const ultimas = divAsists
              .filter(a => a.jugador_id === jug.id && ultimos4Ids.includes(a.evento_id))
            if (ultimas.length === 4 && ultimas.every(a => a.estado === 'ausente')) {
              tieneAlerta = true
              alertas.push({
                jugadorId:      jug.id,
                nombre:         jug.nombre_completo,
                divisionNombre: div.nombre,
              })
            }
          }

          return { divisionId: div.id, nombre: div.nombre, pct, tieneAlerta }
        })
      }

      setData({
        nombre:       profile?.nombre ?? '',
        divisiones:   divs,
        eventosSemana,
        asistencias,
        alertas,
        sinDivisiones: false,
      })
    } catch { /* keep defaults */ }

    setLoading(false)
  }

  return { loading, data }
}
