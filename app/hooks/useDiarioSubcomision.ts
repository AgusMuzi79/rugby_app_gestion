import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'

export type CronicaTipo = 'urgente' | 'alerta' | 'info'

export interface CronicaItem {
  id:        string
  titulo:    string
  mensaje:   string
  tipo:      CronicaTipo
  createdAt: string
  route:     string
}

export interface DiarioSubcomisionData {
  nombre:             string
  asistencia7D:       number | null
  variacion7D:        number | null   // diferencia vs semana anterior, puede ser + o -
  totalFichados:      number
  lesionesRecientes:  number
  tieneUrgencia:      boolean
  pctCobrado:         number | null
  ultimoEventoNombre: string | null
  cronica:            CronicaItem[]
}

function hoy()       { return new Date().toISOString().split('T')[0] }
function hace7Dias() { const d = new Date(); d.setDate(d.getDate() - 7);  return d.toISOString().split('T')[0] }
function hace14Dias(){ const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().split('T')[0] }
function hace30Dias(){ const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] }

function notifTipo(tipo: string): CronicaTipo {
  if (tipo === 'lesion')                return 'urgente'
  if (tipo === 'ausencias_consecutivas') return 'alerta'
  return 'info'
}

function notifRoute(tipo: string): string {
  if (tipo === 'lesion')                return '/(subcomision)/informes'
  if (tipo === 'ausencias_consecutivas') return '/(subcomision)/informes'
  if (tipo === 'fichaje')               return '/(subcomision)/informes'
  return '/(subcomision)/diario'
}

const DEFAULT: DiarioSubcomisionData = {
  nombre: '', asistencia7D: null, variacion7D: null, totalFichados: 0,
  lesionesRecientes: 0, tieneUrgencia: false,
  pctCobrado: null, ultimoEventoNombre: null, cronica: [],
}

export function useDiarioSubcomision() {
  const { session } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DiarioSubcomisionData>(DEFAULT)

  useEffect(() => { if (session) void fetchTodo() }, [session])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session) return
    setLoading(true)

    try {
      const [profileRes, eventos7DRes, eventosPrev7DRes, fichadosRes, lesionesRes, financieroRes, notifRes] =
        await Promise.all([
          supabase.from('profiles').select('nombre').eq('id', session.user.id).single(),
          // Eventos últimos 7 días
          supabase.from('eventos').select('id')
            .gte('fecha', hace7Dias()).lte('fecha', hoy()).eq('cancelado', false),
          // Eventos semana anterior (días -14 a -7) para variación
          supabase.from('eventos').select('id')
            .gte('fecha', hace14Dias()).lt('fecha', hace7Dias()).eq('cancelado', false),
          // Total jugadores fichados
          supabase.from('jugadores').select('id', { count: 'exact', head: true }).eq('activo', true),
          // Lesiones últimos 30 días con grado
          supabase.from('lesiones').select('id, grado').gte('fecha', hace30Dias()),
          // Último evento financiero activo
          supabase.from('eventos_financieros')
            .select('id, nombre, cobranzas(estado)')
            .eq('estado', 'activo')
            .order('created_at', { ascending: false })
            .limit(1),
          // Últimas notificaciones para crónica
          supabase.from('notificaciones')
            .select('id, titulo, mensaje, tipo, created_at')
            .order('created_at', { ascending: false })
            .limit(5),
        ])

      // Asistencia 7D actual + semana anterior en paralelo
      const eventoIds     = (eventos7DRes.data     ?? []).map(e => e.id)
      const prevEventoIds = (eventosPrev7DRes.data ?? []).map(e => e.id)

      const [asists7D, asistsPrev] = await Promise.all([
        eventoIds.length > 0
          ? supabase.from('asistencias').select('estado').in('evento_id', eventoIds)
          : Promise.resolve({ data: [] as { estado: string }[], error: null }),
        prevEventoIds.length > 0
          ? supabase.from('asistencias').select('estado').in('evento_id', prevEventoIds)
          : Promise.resolve({ data: [] as { estado: string }[], error: null }),
      ])

      let asistencia7D: number | null = null
      let variacion7D:  number | null = null

      const arr7D = asists7D.data ?? []
      if (arr7D.length > 0) {
        asistencia7D = Math.round((arr7D.filter(a => a.estado === 'presente').length / arr7D.length) * 100)
      }

      const arrPrev = asistsPrev.data ?? []
      if (arrPrev.length > 0 && asistencia7D !== null) {
        const pctPrev = Math.round((arrPrev.filter(a => a.estado === 'presente').length / arrPrev.length) * 100)
        variacion7D = asistencia7D - pctPrev
      }

      // Lesiones
      const lesiones      = lesionesRes.data ?? []
      const tieneUrgencia = lesiones.some(l => (l.grado as number) >= 3)

      // Financiero
      type CobrRow = { estado: string }
      let pctCobrado:         number | null = null
      let ultimoEventoNombre: string | null = null
      const ev = financieroRes.data?.[0]
      if (ev) {
        ultimoEventoNombre = ev.nombre
        const cobrs  = (ev.cobranzas as CobrRow[]) ?? []
        pctCobrado   = cobrs.length > 0
          ? Math.round((cobrs.filter(c => c.estado === 'pagado').length / cobrs.length) * 100)
          : 0
      }

      // Crónica
      const cronica: CronicaItem[] = (notifRes.data ?? []).map(n => ({
        id: n.id, titulo: n.titulo, mensaje: n.mensaje,
        tipo:      notifTipo(n.tipo),
        createdAt: n.created_at,
        route:     notifRoute(n.tipo),
      }))

      setData({
        nombre:             profileRes.data?.nombre ?? '',
        asistencia7D,
        variacion7D,
        totalFichados:      fichadosRes.count ?? 0,
        lesionesRecientes:  lesiones.length,
        tieneUrgencia,
        pctCobrado,
        ultimoEventoNombre,
        cronica,
      })
    } catch { /* keep defaults */ }

    setLoading(false)
  }

  return { loading, data }
}
