'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Stats {
  asistenciaPct: number
  jugadoresActivos: number
  lesionesActivas: number
  cobranzasPendientes: number
  cobranzasPagadas: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const hace30Dias = new Date()
      hace30Dias.setDate(hace30Dias.getDate() - 30)
      const desde = hace30Dias.toISOString()

      const [
        { data: eventos },
        { count: jugadoresActivos },
        { count: lesionesActivas },
        { data: cobranzas },
      ] = await Promise.all([
        supabase
          .from('eventos')
          .select('id')
          .gte('fecha', desde),
        supabase
          .from('jugadores')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true),
        supabase
          .from('lesiones')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true),
        supabase
          .from('cobranzas')
          .select('estado, monto'),
      ])

      let asistenciaPct = 0
      if (eventos && eventos.length > 0) {
        const eventoIds = eventos.map(e => e.id)
        const { data: asistencias } = await supabase
          .from('asistencias')
          .select('estado')
          .in('evento_id', eventoIds)

        if (asistencias && asistencias.length > 0) {
          const presentes = asistencias.filter(a => a.estado === 'presente').length
          asistenciaPct = Math.round((presentes / asistencias.length) * 100)
        }
      }

      const pendientes = cobranzas?.filter(c => c.estado === 'pendiente').length ?? 0
      const pagadas = cobranzas?.filter(c => c.estado === 'pagado').length ?? 0

      setStats({
        asistenciaPct,
        jugadoresActivos: jugadoresActivos ?? 0,
        lesionesActivas: lesionesActivas ?? 0,
        cobranzasPendientes: pendientes,
        cobranzasPagadas: pagadas,
      })
      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-lora text-tinta/40 tracking-widest text-sm">CARGANDO…</p>
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
    {
      label: 'LESIONES ACTIVAS',
      value: String(stats?.lesionesActivas ?? 0),
      sub: 'En seguimiento',
      accent: stats?.lesionesActivas ? stats.lesionesActivas > 0 : false,
    },
    {
      label: 'COBRANZAS PENDIENTES',
      value: String(stats?.cobranzasPendientes ?? 0),
      sub: `${stats?.cobranzasPagadas ?? 0} pagadas`,
      accent: false,
    },
  ]

  return (
    <div>
      <div className="mb-10">
        <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">SUBCOMISIÓN · TABLERO</p>
        <h1 className="font-playfair italic text-4xl font-black text-tinta">Resumen General</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(card => (
          <div
            key={card.label}
            className={`p-6 border ${card.accent ? 'bg-card border-oro' : 'bg-card border-gris-claro'}`}
          >
            <p className={`font-lora text-xs tracking-widest mb-3 ${card.accent ? 'text-oro' : 'text-tinta/40'}`}>
              {card.label}
            </p>
            <p className={`font-playfair text-5xl font-black leading-none mb-2 ${card.accent ? 'text-oro' : 'text-tinta'}`}>
              {card.value}
            </p>
            <p className={`font-lora text-xs ${card.accent ? 'text-tinta/50' : 'text-tinta/40'}`}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
