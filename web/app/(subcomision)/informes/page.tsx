'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tab = 'asistencia' | 'resultados' | 'fichajes' | 'financiero'

interface Division { id: string; nombre: string; categoria: string }
interface Jugador { id: string; nombre_completo: string; division_id: string }
interface Evento { id: string; tipo: string; division_id: string; fecha: string; rival?: string }
interface AsistenciaDB { evento_id: string; jugador_id: string; estado: string }
interface ResultadoDB { evento_id: string; puntos_propios: number; puntos_rival: number; eventos: { rival: string; division_id: string; fecha: string } }
interface FichajeDB { id: string; jugador_id: string; fecha_fichaje: string; jugadores: { nombre_completo: string; division_id: string } }
interface CobranzaDB { estado: string; monto: number; forma_de_pago: string }
interface EventoFinanciero { id: string; nombre: string; tipo: string; division_id: string | null; estado: string; cobranzas: CobranzaDB[] }

export default function InformesPage() {
  const [tab, setTab] = useState<Tab>('asistencia')
  const [divFiltro, setDivFiltro] = useState('all')
  const [loading, setLoading] = useState(true)

  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [asistencias, setAsistencias] = useState<AsistenciaDB[]>([])
  const [resultados, setResultados] = useState<ResultadoDB[]>([])
  const [fichajes, setFichajes] = useState<FichajeDB[]>([])
  const [eventosFinancieros, setEventosFinancieros] = useState<EventoFinanciero[]>([])

  useEffect(() => {
    const fetchAll = async () => {
      const [
        { data: divs },
        { data: jugs },
        { data: evts },
        { data: asis },
        { data: ress },
        { data: fichs },
        { data: evsf },
      ] = await Promise.all([
        supabase.from('divisiones').select('id, nombre, categoria').eq('activa', true).order('nombre'),
        supabase.from('jugadores').select('id, nombre_completo, division_id').eq('activo', true),
        supabase.from('eventos').select('id, tipo, division_id, fecha, rival').eq('cancelado', false),
        supabase.from('asistencias').select('evento_id, jugador_id, estado'),
        supabase.from('resultados').select('evento_id, puntos_propios, puntos_rival, eventos(rival, division_id, fecha)'),
        supabase.from('fichajes').select('id, jugador_id, fecha_fichaje, jugadores(nombre_completo, division_id)').order('fecha_fichaje', { ascending: false }),
        supabase.from('eventos_financieros').select('id, nombre, tipo, division_id, estado, cobranzas(estado, monto, forma_de_pago)').eq('estado', 'activo'),
      ])
      setDivisiones(divs ?? [])
      setJugadores(jugs ?? [])
      setEventos(evts ?? [])
      setAsistencias(asis ?? [])
      setResultados((ress ?? []) as unknown as ResultadoDB[])
      setFichajes((fichs ?? []) as unknown as FichajeDB[])
      setEventosFinancieros((evsf ?? []) as unknown as EventoFinanciero[])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const jugadoresFiltrados = useMemo(() =>
    divFiltro === 'all' ? jugadores : jugadores.filter(j => j.division_id === divFiltro),
    [jugadores, divFiltro]
  )

  const eventosFiltrados = useMemo(() =>
    divFiltro === 'all' ? eventos : eventos.filter(e => e.division_id === divFiltro),
    [eventos, divFiltro]
  )

  const asistenciaRows = useMemo(() => {
    const evIds = new Set(eventosFiltrados.map(e => e.id))
    return jugadoresFiltrados.map(j => {
      const propios = asistencias.filter(a => a.jugador_id === j.id && evIds.has(a.evento_id))
      const total = propios.length
      const presentes = propios.filter(a => a.estado === 'presente').length
      const pct = total > 0 ? Math.round((presentes / total) * 100) : null

      // 4 consecutive absences
      const sorted = eventosFiltrados.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))
      const last4 = sorted.slice(0, 4)
      const cuatroConsec = last4.length === 4 && last4.every(ev => {
        const a = asistencias.find(a => a.evento_id === ev.id && a.jugador_id === j.id)
        return a?.estado === 'ausente'
      })
      return { jugador: j, total, presentes, pct, cuatroConsec }
    }).sort((a, b) => a.jugador.nombre_completo.localeCompare(b.jugador.nombre_completo))
  }, [jugadoresFiltrados, eventosFiltrados, asistencias])

  const resultadoRows = useMemo(() => {
    const divIds = divFiltro === 'all'
      ? new Set(divisiones.filter(d => d.categoria !== 'infantil').map(d => d.id))
      : new Set(divisiones.filter(d => d.id === divFiltro && d.categoria !== 'infantil').map(d => d.id))
    return resultados
      .filter(r => divIds.has(r.eventos?.division_id))
      .map(r => {
        const gano = r.puntos_propios > r.puntos_rival
        const perdio = r.puntos_propios < r.puntos_rival
        const empato = r.puntos_propios === r.puntos_rival
        const div = divisiones.find(d => d.id === r.eventos?.division_id)
        return { ...r, gano, perdio, empato, divNombre: div?.nombre ?? '—' }
      })
      .sort((a, b) => b.eventos?.fecha?.localeCompare(a.eventos?.fecha ?? '') ?? 0)
  }, [resultados, divisiones, divFiltro])

  const fichajesRows = useMemo(() => {
    const filtered = divFiltro === 'all'
      ? fichajes
      : fichajes.filter(f => f.jugadores?.division_id === divFiltro)
    const countByDiv: Record<string, number> = {}
    filtered.forEach(f => {
      const dId = f.jugadores?.division_id
      if (dId) countByDiv[dId] = (countByDiv[dId] ?? 0) + 1
    })
    return { recientes: filtered.slice(0, 20), countByDiv }
  }, [fichajes, divFiltro])

  const financieroRows = useMemo(() => {
    return eventosFinancieros
      .filter(e => divFiltro === 'all' || e.division_id === divFiltro || e.division_id === null)
      .map(e => {
        const cobs = e.cobranzas ?? []
        const total = cobs.length
        const pagados = cobs.filter(c => c.estado === 'pagado').length
        const montoCobrado = cobs.filter(c => c.estado === 'pagado').reduce((s, c) => s + (c.monto ?? 0), 0)
        const formas: Record<string, number> = {}
        cobs.filter(c => c.estado === 'pagado').forEach(c => {
          const k = c.forma_de_pago ?? 'otro'
          formas[k] = (formas[k] ?? 0) + 1
        })
        const div = divisiones.find(d => d.id === e.division_id)
        return { ...e, total, pagados, montoCobrado, formas, divNombre: div?.nombre ?? 'Global' }
      })
  }, [eventosFinancieros, divisiones, divFiltro])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'asistencia', label: 'ASISTENCIA' },
    { key: 'resultados', label: 'RESULTADOS' },
    { key: 'fichajes', label: 'FICHAJES' },
    { key: 'financiero', label: 'FINANCIERO' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-lora text-tinta/40 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">SUBCOMISIÓN · INFORMES</p>
        <h1 className="font-playfair italic text-4xl font-black text-tinta mb-6">Informes</h1>
        <select
          value={divFiltro}
          onChange={e => setDivFiltro(e.target.value)}
          className="font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 outline-none focus:border-tinta transition-colors"
        >
          <option value="all">Todas las divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="border-b border-gris-claro mb-8 flex gap-8">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`font-lora text-xs tracking-widest pb-3 transition-colors ${
              tab === t.key
                ? 'text-tinta border-b-2 border-oro -mb-px'
                : 'text-tinta/40 hover:text-tinta'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Asistencia */}
      {tab === 'asistencia' && (
        <div>
          {asistenciaRows.length === 0 ? (
            <p className="font-lora text-tinta/40 text-sm text-center py-12">Sin datos de asistencia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gris-claro">
                    <th className="font-lora text-xs tracking-widest text-tinta/40 pb-3 pr-6">JUGADOR</th>
                    <th className="font-lora text-xs tracking-widest text-tinta/40 pb-3 pr-6 text-right">PRESENCIAS</th>
                    <th className="font-lora text-xs tracking-widest text-tinta/40 pb-3 pr-6 text-right">TOTAL</th>
                    <th className="font-lora text-xs tracking-widest text-tinta/40 pb-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {asistenciaRows.map(({ jugador, presentes, total, pct, cuatroConsec }) => (
                    <tr key={jugador.id} className="border-b border-gris-claro/50 hover:bg-papel/50">
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-3">
                          <span className="font-lora text-sm text-tinta">{jugador.nombre_completo}</span>
                          {cuatroConsec && (
                            <span className="font-lora text-xs bg-rojo text-papel px-2 py-0.5 tracking-widest">4 AUS.</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-6 text-right font-lora text-sm text-tinta">{presentes}</td>
                      <td className="py-3 pr-6 text-right font-lora text-sm text-tinta/60">{total}</td>
                      <td className="py-3 text-right">
                        {pct !== null ? (
                          <span className={`font-playfair text-lg font-black ${pct < 50 ? 'text-rojo' : 'text-tinta'}`}>
                            {pct}%
                          </span>
                        ) : (
                          <span className="font-lora text-sm text-tinta/30">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Resultados */}
      {tab === 'resultados' && (
        <div>
          {resultadoRows.length === 0 ? (
            <p className="font-lora text-tinta/40 text-sm text-center py-12">Sin resultados registrados.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {resultadoRows.map((r, i) => (
                <div key={i} className="bg-card border border-gris-claro px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-playfair text-lg font-bold text-tinta">vs {r.eventos?.rival ?? '—'}</p>
                    <p className="font-lora text-xs text-tinta/40 mt-0.5">{r.divNombre} · {r.eventos?.fecha ? new Date(r.eventos.fecha).toLocaleDateString('es-AR') : '—'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-playfair text-3xl font-black text-tinta">
                      {r.puntos_propios} – {r.puntos_rival}
                    </span>
                    <span className={`font-lora text-xs tracking-widest px-3 py-1 ${
                      r.gano ? 'bg-oro text-papel' : r.empato ? 'bg-gris-claro text-tinta' : 'border border-rojo text-rojo'
                    }`}>
                      {r.gano ? 'V' : r.empato ? 'E' : 'D'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fichajes */}
      {tab === 'fichajes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <p className="font-lora text-xs tracking-widest text-tinta/40 mb-3">POR DIVISIÓN</p>
            <div className="flex flex-col gap-1">
              {divisiones
                .filter(d => divFiltro === 'all' || d.id === divFiltro)
                .map(d => (
                  <div key={d.id} className="bg-card border border-gris-claro px-5 py-3 flex items-center justify-between">
                    <span className="font-lora text-sm text-tinta">{d.nombre}</span>
                    <span className="font-playfair text-2xl font-black text-tinta">{fichajesRows.countByDiv[d.id] ?? 0}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="lg:col-span-2">
            <p className="font-lora text-xs tracking-widest text-tinta/40 mb-3">ÚLTIMOS 20 FICHAJES</p>
            {fichajesRows.recientes.length === 0 ? (
              <p className="font-lora text-tinta/40 text-sm py-4">Sin fichajes.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {fichajesRows.recientes.map((f, i) => {
                  const div = divisiones.find(d => d.id === f.jugadores?.division_id)
                  return (
                    <div key={f.id} className="bg-card border border-gris-claro px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="font-lora text-xs text-tinta/30 w-6">{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <p className="font-lora text-sm text-tinta">{f.jugadores?.nombre_completo ?? '—'}</p>
                          <p className="font-lora text-xs text-tinta/40">{div?.nombre ?? '—'}</p>
                        </div>
                      </div>
                      <span className="font-lora text-xs text-tinta/40">
                        {f.fecha_fichaje ? new Date(f.fecha_fichaje).toLocaleDateString('es-AR') : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Financiero */}
      {tab === 'financiero' && (
        <div className="flex flex-col gap-6">
          {financieroRows.length === 0 ? (
            <p className="font-lora text-tinta/40 text-sm text-center py-12">Sin eventos financieros activos.</p>
          ) : (
            financieroRows.map(ev => (
              <div key={ev.id} className="bg-card border border-gris-claro">
                <div className="px-6 py-4 border-b border-gris-claro flex items-center justify-between">
                  <div>
                    <p className="font-playfair text-lg font-bold text-tinta">{ev.nombre}</p>
                    <p className="font-lora text-xs text-tinta/40 mt-0.5">{ev.divNombre} · {ev.tipo}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-playfair text-2xl font-black text-tinta">${ev.montoCobrado.toLocaleString('es-AR')}</p>
                    <p className="font-lora text-xs text-tinta/40">{ev.pagados}/{ev.total} pagados</p>
                  </div>
                </div>
                <div className="px-6 py-4 grid grid-cols-3 gap-4">
                  {['efectivo', 'transferencia', 'otro'].map(forma => (
                    <div key={forma}>
                      <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">{forma.toUpperCase()}</p>
                      <p className="font-playfair text-2xl font-black text-tinta">{ev.formas[forma] ?? 0}</p>
                    </div>
                  ))}
                </div>
                {ev.total > 0 && (
                  <div className="px-6 pb-4">
                    <div className="h-1 bg-gris-claro">
                      <div
                        className="h-1 bg-oro"
                        style={{ width: `${Math.round((ev.pagados / ev.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
