import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useRefreshOnFocus } from './useRefreshOnFocus'
import { useEstadoCarga } from './useEstadoCarga'
import type { TipoEventoCalendario } from '@/lib/tipoEvento'
import { FEATURES } from '@/constants/features'
import { fechaLocal, fechaLocalMasDias } from '@/lib/fecha'
import { partidosSinResultado, ventanaPartidos } from '@/lib/partidosEntrenador'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'

export interface ProximoEvento {
  id:    string
  tipo:  TipoEventoCalendario
  titulo: string | null // only for actividad
  fecha: string
  hora:  string | null
  lugar: string | null
  rival: string | null
  divisionId: string
}

// Partido al que lleva la tarea (T7): RESULTADO abre ese partido en el paso
// de resultado; MESA, en el paso 1 con el partido elegido.
export interface PedidoTarea {
  eventoId:   string
  divisionId: string
  paso?:      'resultado'
}

export interface TareaPendiente {
  tipo:    'RESULTADO' | 'MESA' | 'LESIÓN'
  desc:    string
  route:   '/(entrenador)/partido' | '/(entrenador)/lesiones'
  pedido?: PedidoTarea
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

function hoy()      { return fechaLocal() }
function hace30Dias() { return fechaLocalMasDias(-30) }

const DEFAULT: DiarioEntrenadorData = {
  nombre: '', divisionNombre: '', divisionId: null, totalJugadores: 0,
  proximoEvento: null, tareas: [], sinDivision: false,
}

export function useDiarioEntrenador() {
  const { session } = useAuthStore()
  const { loading, refrescando, empezar, terminar } = useEstadoCarga()
  const [data, setData]       = useState<DiarioEntrenadorData>(DEFAULT)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  useEffect(() => { if (session) void fetchTodo() }, [session])
  useRefreshOnFocus(fetchTodo)

  async function fetchTodo() {
    if (!session) return
    empezar()

    try {
      const { data: profile, error: errProfile } = await supabase
        .from('profiles').select('nombre, divisiones').eq('id', session.user.id).single()
      // Un error de lectura no es "sin división": se muestra con REINTENTAR.
      if (errProfile) throw errProfile

      // Todas las divisiones del entrenador (T7), no sólo la primera.
      const divIds: string[] = (profile?.divisiones as string[] | null) ?? []

      if (divIds.length === 0) {
        setData({ ...DEFAULT, nombre: profile?.nombre ?? '', sinDivision: true })
        setErrorCarga(null)
        terminar()
        return
      }

      // Partidos pasados de la misma ventana que muestra Partido (7 días).
      const { desde } = ventanaPartidos()

      // Queries paralelas base
      const [divRes, jugadoresRes, proximoEventoRes, lesionesRes, partidosPasadosRes, proximoPartidoRes] =
        await Promise.all([
          supabase.from('divisiones').select('id, nombre, categoria').in('id', divIds).order('nombre'),
          supabase.from('jugadores')
            .select('id', { count: 'exact', head: true })
            .in('division_id', divIds).eq('activo', true),
          // Próximo evento (entrenamiento, partido o actividad)
          supabase.from('eventos')
            .select('id, tipo, titulo, fecha, hora, lugar, rival, division_id')
            .in('division_id', divIds).eq('cancelado', false)
            .gte('fecha', hoy())
            .order('fecha').order('hora', { nullsFirst: false })
            .limit(1),
          // Lesiones últimos 30 días (módulo oculto: ni se consulta la tabla)
          FEATURES.lesiones
            ? supabase.from('lesiones')
                .select('id', { count: 'exact', head: true })
                .in('division_id', divIds).gte('fecha', hace30Dias())
            : Promise.resolve({ count: 0 as number | null }),
          // Partidos de la última semana (para resultado pendiente)
          supabase.from('eventos')
            .select('id, fecha, division_id')
            .eq('tipo', 'partido').in('division_id', divIds).eq('cancelado', false)
            .gte('fecha', desde).lt('fecha', hoy()),
          // Próximo partido (para mesa pendiente)
          supabase.from('eventos')
            .select('id, division_id')
            .eq('tipo', 'partido').in('division_id', divIds).eq('cancelado', false)
            .gte('fecha', hoy())
            .order('fecha').order('hora', { nullsFirst: false })
            .limit(1),
        ])

      const errBase = primerError(
        divRes.error, jugadoresRes.error, proximoEventoRes.error, partidosPasadosRes.error, proximoPartidoRes.error,
        'error' in lesionesRes ? lesionesRes.error : null,
      )
      if (errBase) throw errBase

      const divisiones = divRes.data ?? []
      const infantiles = new Set(divisiones.filter(d => d.categoria === 'infantil').map(d => d.id))

      // Resultados pendientes (partidos de la última semana, no infantiles)
      const partidosPasados = partidosPasadosRes.data ?? []
      let pendientes: typeof partidosPasados = []
      if (partidosPasados.length > 0) {
        const resRes = await supabase.from('resultados')
          .select('evento_id').in('evento_id', partidosPasados.map(p => p.id))
        if (resRes.error) throw resRes.error
        const conResultado = new Set((resRes.data ?? []).map(r => r.evento_id))
        pendientes = partidosSinResultado(partidosPasados, conResultado, infantiles)
      }

      // Chequear mesa del próximo partido
      const proximoPartido = proximoPartidoRes.data?.[0] ?? null
      let sinMesa = 0
      if (proximoPartido) {
        const mesaRes = await supabase.from('mesas_de_partido')
          .select('evento_id').eq('evento_id', proximoPartido.id).limit(1)
        if (mesaRes.error) throw mesaRes.error
        if (!(mesaRes.data?.length ?? 0)) sinMesa = 1
      }

      // Construir lista de tareas
      const tareas: TareaPendiente[] = []
      if (pendientes.length > 0) {
        const n = pendientes.length
        tareas.push({
          tipo: 'RESULTADO',
          desc: `${n} partido${n > 1 ? 's' : ''} sin resultado cargado`,
          route: '/(entrenador)/partido',
          // El más reciente; los demás quedan arriba en "SIN RESULTADO".
          pedido: { eventoId: pendientes[0].id, divisionId: pendientes[0].division_id, paso: 'resultado' },
        })
      }
      if (sinMesa > 0 && proximoPartido) {
        tareas.push({
          tipo: 'MESA',
          desc: 'Próximo partido sin mesa confirmada',
          route: '/(entrenador)/partido',
          pedido: { eventoId: proximoPartido.id, divisionId: proximoPartido.division_id },
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
        ? { id: rawEvento.id, tipo: rawEvento.tipo as TipoEventoCalendario, titulo: rawEvento.titulo,
            fecha: rawEvento.fecha, hora: rawEvento.hora, lugar: rawEvento.lugar, rival: rawEvento.rival,
            divisionId: rawEvento.division_id }
        : null

      setData({
        nombre:         profile?.nombre ?? '',
        divisionNombre: divisiones.map(d => d.nombre).join(' · '),
        divisionId:     divIds[0],
        totalJugadores: jugadoresRes.count ?? 0,
        proximoEvento,
        tareas,
        sinDivision:    false,
      })
      setErrorCarga(null)
    } catch (e) {
      // Se queda lo último que se vio; la pantalla muestra el error con REINTENTAR.
      setErrorCarga(mensajeErrorCarga('tu inicio', e))
    }

    terminar()
  }

  return { loading, refrescando, data, errorCarga, refetch: fetchTodo }
}
