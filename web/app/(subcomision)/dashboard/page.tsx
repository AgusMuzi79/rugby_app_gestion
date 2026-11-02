'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, selectAllRows } from '@/lib/supabase'
import { FEATURES } from '@/lib/features'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { fechaLocal } from '@/lib/informesAsistencia'
import { pendientesDe, resumenesPorEvento } from '@/lib/resumenCobranzas'
import ErrorCarga from '@/components/ErrorCarga'

interface Stats {
  asistenciaPct: number
  jugadoresActivos: number
  lesionesActivas: number
  cobranzasPendientes: number
  cobranzasPagadas: number
}

// Pendiente (backend): un RPC resumen_dashboard() que devuelva los números ya
// contados; hoy se leen las filas paginadas (selectAllRows) para no cortar en 1000.
export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setErrorCarga(null)
    try {
      const hace30Dias = new Date()
      hace30Dias.setDate(hace30Dias.getDate() - 30)
      const desde = fechaLocal(hace30Dias)

      const [asistencias, jugadoresRes, lesionesRes, eventosFinancieros] = await Promise.all([
        // Asistencias de eventos de los últimos 30 días, sin armar una lista de ids.
        selectAllRows<{ estado: string }>((from, to) =>
          supabase
            .from('asistencias')
            .select('estado, eventos!inner(fecha)')
            .gte('eventos.fecha', desde)
            .order('id')
            .range(from, to)
        ),
        supabase
          .from('jugadores')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true),
        // Módulo de lesiones oculto (FEATURES.lesiones): ni se consulta la tabla.
        FEATURES.lesiones
          ? supabase
              .from('lesiones')
              .select('*', { count: 'exact', head: true })
              .eq('activo', true)
          : Promise.resolve({ count: 0 as number | null, error: null }),
        selectAllRows<{ id: string }>((from, to) =>
          supabase
            .from('eventos_financieros')
            .select('id')
            .eq('estado', 'activo')
            .order('id')
            .range(from, to)
        ),
      ])
      const errorLectura = primerError(jugadoresRes.error, lesionesRes.error)
      if (errorLectura) throw errorLectura

      let asistenciaPct = 0
      if (asistencias.length > 0) {
        const presentes = asistencias.filter(a => a.estado === 'presente').length
        asistenciaPct = Math.round((presentes / asistencias.length) * 100)
      }

      // Cobranzas de los eventos activos sobre los jugadores de cada evento
      // (RPC resumen_cobranzas_eventos, la misma fuente que la app): en una
      // recaudación sólo existen las filas de quienes pagaron.
      let pendientes = 0
      let pagadas = 0
      if (eventosFinancieros.length > 0) {
        const { data, error } = await supabase.rpc('resumen_cobranzas_eventos', {
          p_ids: eventosFinancieros.map(e => e.id),
        })
        if (error) throw error
        for (const r of resumenesPorEvento(data).values()) {
          pendientes += pendientesDe(r)
          pagadas += r.pagados
        }
      }

      setStats({
        asistenciaPct,
        jugadoresActivos: jugadoresRes.count ?? 0,
        lesionesActivas: lesionesRes.count ?? 0,
        cobranzasPendientes: pendientes,
        cobranzasPagadas: pagadas,
      })
    } catch (err) {
      setErrorCarga(mensajeErrorCarga('el resumen', err))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void fetchStats() }, [fetchStats])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-lora text-texto-2 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div>
        <div className="mb-10">
          <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">SUBCOMISIÓN · TABLERO</p>
          <h1 className="font-playfair italic text-4xl font-black text-tinta">Resumen General</h1>
        </div>
        <ErrorCarga mensaje={errorCarga} onReintentar={() => void fetchStats()} />
      </div>
    )
  }

  const cards = [
    {
      label: 'ASISTENCIA GLOBAL',
      value: `${stats?.asistenciaPct ?? 0}%`,
      sub: 'Últimos 30 días',
      accent: stats?.asistenciaPct && stats.asistenciaPct >= 70,
    },
    {
      label: 'JUGADORES FICHADOS',
      value: String(stats?.jugadoresActivos ?? 0),
      sub: 'Activos',
      accent: false,
    },
    ...(FEATURES.lesiones ? [{
      label: 'LESIONES ACTIVAS',
      value: String(stats?.lesionesActivas ?? 0),
      sub: 'En seguimiento',
      accent: stats?.lesionesActivas ? stats.lesionesActivas > 0 : false,
    }] : []),
    {
      label: 'COBRANZAS PENDIENTES',
      value: String(stats?.cobranzasPendientes ?? 0),
      sub: `${stats?.cobranzasPagadas ?? 0} pagadas · eventos activos`,
      accent: false,
    },
  ]

  return (
    <div>
      <div className="mb-10">
        <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">SUBCOMISIÓN · TABLERO</p>
        <h1 className="font-playfair italic text-4xl font-black text-tinta">Resumen General</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(card => (
          <div
            key={card.label}
            className={`p-6 border ${card.accent ? 'bg-card border-oro' : 'bg-card border-gris-claro'}`}
          >
            <p className={`font-lora text-xs tracking-widest mb-3 ${card.accent ? 'text-oro' : 'text-texto-2'}`}>
              {card.label}
            </p>
            <p className={`font-playfair text-5xl font-black leading-none mb-2 ${card.accent ? 'text-oro' : 'text-tinta'}`}>
              {card.value}
            </p>
            <p className={`font-lora text-xs ${card.accent ? 'text-tinta/50' : 'text-texto-2'}`}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
