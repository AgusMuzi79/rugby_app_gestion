import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface ProximoEvento {
  id:    string
  tipo:  'entrenamiento' | 'partido'
  fecha: string
  hora:  string | null
  lugar: string | null
  rival: string | null
}

export interface TareaPendiente {
  tipo:  'RESULTADO' | 'MESA' | 'LESIÓN'
  desc:  string
  route: '/(entrenador)/partido' | '/(entrenador)/lesiones'
}

export interface DiarioEntrenadorData {
  nombre:         string
  divisionNombre: string
  divisionId:     string | null
  totalJugadores: number
  proximoEvento:  ProximoEvento | null
  tareas:         TareaPendiente[]
  sinDivision:    boolean
}

function hoy()      { return new Date().toISOString().split('T')[0] }
function hace3Dias()  { const d = new Date(); d.setDate(d.getDate() - 3);  return d.toISOString().split('T')[0] }
function hace30Dias() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] }

const DEFAULT: DiarioEntrenadorData = {
  nombre: '', divisionNombre: '', divisionId: null, totalJugadores: 0,
  proximoEvento: null, tareas: [], sinDivision: false,
}

export function useDiarioEntrenador() {
  const { session } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<DiarioEntrenadorData>(DEFAULT)

  useEffect(() => { if (session) void fetchTodo() }, [session])

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

      // Queries paralelas base
      const [divRes, jugadoresRes, proximoEventoRes, lesionesRes, partidosPas3dRes, proximoPartidoRes] =
        await Promise.all([
          supabase.from('divisiones').select('nombre').eq('id', divId).single(),
          supabase.from('jugadores')
            .select('id', { count: 'exact', head: true })
            .eq('division_id', divId).eq('activo', true),
          // Próximo evento (entrenamiento o partido)
          supabase.from('eventos')
            .select('id, tipo, fecha, hora, lugar, rival')
            .eq('division_id', divId).eq('cancelado', false)
            .gte('fecha', hoy())
            .order('fecha').order('hora', { nullsFirst: false })
            .limit(1),
          // Lesiones últimos 30 días
          supabase.from('lesiones')
            .select('id', { count: 'exact', head: true })
            .eq('division_id', divId).gte('fecha', hace30Dias()),
          // Partidos de los últimos 3 días (para resultado pendiente)
          supabase.from('eventos')
            .select('id')
            .eq('tipo', 'partido').eq('division_id', divId).eq('cancelado', false)
            .gte('fecha', hace3Dias()).lt('fecha', hoy()),
          // Próximo partido (para mesa pendiente)
          supabase.from('eventos')
            .select('id')
            .eq('tipo', 'partido').eq('division_id', divId).eq('cancelado', false)
            .gte('fecha', hoy())
            .order('fecha').order('hora', { nullsFirst: false })
            .limit(1),
        ])

      // Chequear resultados pendientes (partidos últimos 3 días)
      const partidoIds3d = (partidosPas3dRes.data ?? []).map(p => p.id)
      let sinResultado = 0
      if (partidoIds3d.length > 0) {
        const resRes = await supabase.from('resultados')
          .select('evento_id').in('evento_id', partidoIds3d)
        const resSet = new Set((resRes.data ?? []).map(r => r.evento_id))
        sinResultado = partidoIds3d.filter(id => !resSet.has(id)).length
      }

      // Chequear mesa del próximo partido
      const proximoPartidoId = proximoPartidoRes.data?.[0]?.id ?? null
      let sinMesa = 0
      if (proximoPartidoId) {
        const mesaRes = await supabase.from('mesas_de_partido')
          .select('evento_id').eq('evento_id', proximoPartidoId).limit(1)
        if (!(mesaRes.data?.length ?? 0)) sinMesa = 1
      }

      // Construir lista de tareas
      const tareas: TareaPendiente[] = []
      if (sinResultado > 0) {
        tareas.push({
          tipo: 'RESULTADO',
          desc: `${sinResultado} partido${sinResultado > 1 ? 's' : ''} sin resultado cargado`,
          route: '/(entrenador)/partido',
        })
      }
      if (sinMesa > 0) {
        tareas.push({
          tipo: 'MESA',
          desc: 'Próximo partido sin mesa confirmada',
          route: '/(entrenador)/partido',
        })
      }
      const lesiones = lesionesRes.count ?? 0
      if (lesiones > 0) {
        tareas.push({
          tipo: 'LESIÓN',
          desc: `${lesiones} lesión${lesiones > 1 ? 'es' : ''} registrada${lesiones > 1 ? 's' : ''} este mes`,
          route: '/(entrenador)/lesiones',
        })
      }

      const rawEvento = proximoEventoRes.data?.[0]
      const proximoEvento: ProximoEvento | null = rawEvento
        ? { id: rawEvento.id, tipo: rawEvento.tipo as 'entrenamiento' | 'partido',
            fecha: rawEvento.fecha, hora: rawEvento.hora, lugar: rawEvento.lugar, rival: rawEvento.rival }
        : null

      setData({
        nombre:         profile?.nombre ?? '',
        divisionNombre: divRes.data?.nombre ?? '',
        divisionId:     divId,
        totalJugadores: jugadoresRes.count ?? 0,
        proximoEvento,
        tareas,
        sinDivision:    false,
      })
    } catch { /* keep defaults */ }

    setLoading(false)
  }

  return { loading, data }
}
