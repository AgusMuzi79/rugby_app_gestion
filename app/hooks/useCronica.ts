import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export type FeedTipo = 'LESIÓN' | 'ASISTENCIA' | 'FICHAJE' | 'RESULTADO' | 'INFO'

export interface FeedItem {
  id:        string
  tipo:      FeedTipo
  titulo:    string
  desc:      string
  autor:     string
  createdAt: string
  urgente:   boolean
  route:     string | null
}

function hace7Dias() {
  const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString()
}

function routeForTipo(tipo: FeedTipo, rol: string): string | null {
  switch (tipo) {
    case 'LESIÓN':     return rol === 'entrenador' ? '/(entrenador)/lesiones' : null
    case 'FICHAJE':    return rol === 'manager'    ? '/(manager)/fichajes'    : null
    case 'RESULTADO':  return rol === 'entrenador' ? '/(entrenador)/partido'  : null
    case 'ASISTENCIA': return rol === 'coordinador'? '/(coordinador)/asistencia' : null
    default:           return null
  }
}

type LesionRow = {
  id: string; created_at: string; grado: number; descripcion: string | null
  division_id: string
  jugadores:  { nombre_completo: string } | null
  divisiones: { nombre: string } | null
}
type JugadorRow = {
  id: string; nombre_completo: string; division_id: string; created_at: string
  divisiones: { nombre: string } | null
}
type ResultadoRow = {
  id: string; created_at: string; evento_id: string
  eventos: { rival: string | null; division_id: string; divisiones: { nombre: string } | null } | null
}
type NotifRow = { id: string; titulo: string; mensaje: string; tipo: string; created_at: string }

export function useCronica() {
  const { session, rol } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [items, setItems]     = useState<FeedItem[]>([])

  useEffect(() => { if (session && rol) void fetchTodo() }, [session, rol])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session || !rol) return
    setLoading(true)

    try {
      const { data: profile } = await supabase
        .from('profiles').select('divisiones').eq('id', session.user.id).single()

      const divIds: string[] = (profile?.divisiones as string[] | null) ?? []
      const divId            = divIds[0] ?? null
      const isSubcomision    = ['subcomision', 'admin'].includes(rol)

      // ─ Build queries ─
      let lesionesQ = supabase.from('lesiones')
        .select('id, created_at, grado, descripcion, division_id, jugadores(nombre_completo), divisiones(nombre)')
        .gte('created_at', hace7Dias())
        .order('created_at', { ascending: false }).limit(10)

      let fichajesQ = supabase.from('jugadores')
        .select('id, nombre_completo, division_id, created_at, divisiones(nombre)')
        .gte('created_at', hace7Dias())
        .order('created_at', { ascending: false }).limit(5)

      const resultadosQ = supabase.from('resultados')
        .select('id, created_at, evento_id, eventos(rival, division_id, divisiones(nombre))')
        .gte('created_at', hace7Dias())
        .order('created_at', { ascending: false }).limit(5)

      const notifQ = supabase.from('notificaciones')
        .select('id, titulo, mensaje, tipo, created_at')
        .gte('created_at', hace7Dias())
        .in('tipo', isSubcomision ? ['ausencias_consecutivas', 'manual'] : ['ausencias_consecutivas'])
        .order('created_at', { ascending: false }).limit(5)

      if (!isSubcomision && divId) {
        lesionesQ = lesionesQ.eq('division_id', divId)
        fichajesQ = fichajesQ.eq('division_id', divId)
      }

      const [lesionesRes, fichajesRes, resultadosRes, notifRes] = await Promise.all([
        lesionesQ, fichajesQ, resultadosQ, notifQ,
      ])

      // Lesiones
      const lesionItems: FeedItem[] = ((lesionesRes.data ?? []) as unknown as LesionRow[]).map(row => ({
        id:        `lesion-${row.id}`,
        tipo:      'LESIÓN',
        titulo:    `Lesión grado ${row.grado} — ${row.jugadores?.nombre_completo ?? 'Jugador'}`,
        desc:      [row.divisiones?.nombre, row.descripcion].filter(Boolean).join(' · '),
        autor:     `POR SISTEMA · ${row.divisiones?.nombre ?? '—'}`,
        createdAt: row.created_at,
        urgente:   row.grado >= 3,
        route:     routeForTipo('LESIÓN', rol),
      }))

      // Fichajes
      const fichajeItems: FeedItem[] = ((fichajesRes.data ?? []) as unknown as JugadorRow[]).map(row => ({
        id:        `fichaje-${row.id}`,
        tipo:      'FICHAJE',
        titulo:    `Nuevo fichaje — ${row.nombre_completo}`,
        desc:      row.divisiones?.nombre ?? '',
        autor:     `POR SISTEMA · ${row.divisiones?.nombre ?? '—'}`,
        createdAt: row.created_at,
        urgente:   false,
        route:     routeForTipo('FICHAJE', rol),
      }))

      // Resultados — filtrar por división client-side para no-subcomision
      let resultadosData = (resultadosRes.data ?? []) as unknown as ResultadoRow[]
      if (!isSubcomision && divId) {
        resultadosData = resultadosData.filter(r => r.eventos?.division_id === divId)
      }
      const resultadoItems: FeedItem[] = resultadosData.map(row => ({
        id:        `resultado-${row.id}`,
        tipo:      'RESULTADO',
        titulo:    row.eventos?.rival
          ? `Resultado registrado — vs ${row.eventos.rival}`
          : 'Resultado registrado',
        desc:      row.eventos?.divisiones?.nombre ?? '',
        autor:     `POR SISTEMA · ${row.eventos?.divisiones?.nombre ?? '—'}`,
        createdAt: row.created_at,
        urgente:   false,
        route:     routeForTipo('RESULTADO', rol),
      }))

      // Notificaciones
      const notifItems: FeedItem[] = ((notifRes.data ?? []) as NotifRow[]).map(row => {
        const feedTipo: FeedTipo = row.tipo === 'ausencias_consecutivas' ? 'ASISTENCIA' : 'INFO'
        return {
          id:        `notif-${row.id}`,
          tipo:      feedTipo,
          titulo:    row.titulo,
          desc:      row.mensaje.length > 80 ? row.mensaje.slice(0, 80) + '…' : row.mensaje,
          autor:     feedTipo === 'INFO' ? 'POR SUBCOMISIÓN' : 'POR SISTEMA',
          createdAt: row.created_at,
          urgente:   false,
          route:     routeForTipo(feedTipo, rol),
        }
      })

      const all = [...lesionItems, ...fichajeItems, ...resultadoItems, ...notifItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setItems(all)
    } catch { /* keep defaults */ }

    setLoading(false)
  }

  async function enviarNotificacion(titulo: string, mensaje: string): Promise<boolean> {
    try {
      await supabase.from('notificaciones').insert({ titulo, mensaje, tipo: 'manual' })
      await supabase.functions.invoke('notifications', {
        body: { tipo: 'manual', titulo, mensaje },
      })
      void fetchTodo()
      return true
    } catch {
      return false
    }
  }

  return { loading, items, rol: rol ?? '', enviarNotificacion }
}
