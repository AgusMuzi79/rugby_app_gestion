'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, selectAllRows } from '@/lib/supabase'
import { mensajeErrorCarga } from '@/lib/errorCarga'
import ErrorCarga from '@/components/ErrorCarga'
import { informeAsistencia, fechaLocal } from '@/lib/informesAsistencia'
import {
  asistenciasPorFecha, restarDias,
  type EventoFecha, type FilaFecha, type JugadorFecha, type ResumenFecha,
} from '@/lib/asistenciasPorFecha'

type Vista = 'jugador' | 'fecha'
type Rango = '30' | '90' | 'todo'

interface Division { id: string; nombre: string }

const RANGOS: { key: Rango; label: string }[] = [
  { key: '30', label: 'Últimos 30 días' },
  { key: '90', label: 'Últimos 90 días' },
  { key: 'todo', label: 'Todo' },
]

// YYYY-MM-DD como fecha local (new Date('YYYY-MM-DD') es UTC y en Argentina muestra el día anterior).
function fechaLarga(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function tituloEvento(e: EventoFecha): string {
  if (e.tipo === 'partido') return e.rival ? `Partido vs ${e.rival}` : 'Partido'
  return 'Entrenamiento'
}

export default function AsistenciasEntrenadorPage() {
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [divSel, setDivSel] = useState('')
  const [jugadores, setJugadores] = useState<JugadorFecha[]>([])
  const [eventos, setEventos] = useState<EventoFecha[]>([])
  const [asistencias, setAsistencias] = useState<FilaFecha[]>([])
  const [vista, setVista] = useState<Vista>('jugador')
  const [rango, setRango] = useState<Rango>('30')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  // Sólo las divisiones del entrenador (profiles.divisiones), filtradas en el
  // servidor; la RLS además limita las filas a sus divisiones.
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErrorCarga(null)
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw userError ?? new Error('Sin sesión')
      const { data: perfil, error: perfilError } = await supabase
        .from('profiles').select('divisiones').eq('id', user.id).single()
      if (perfilError) throw perfilError
      const ids = ((perfil?.divisiones as string[] | null) ?? []).filter(Boolean)

      if (ids.length === 0) {
        setDivisiones([]); setJugadores([]); setEventos([]); setAsistencias([])
        setLoading(false)
        return
      }

      const [divsRes, jugs, evts, asis] = await Promise.all([
        supabase.from('divisiones').select('id, nombre').in('id', ids).order('nombre'),
        // Activos y de baja: los de baja sólo dan el nombre de filas ya guardadas.
        selectAllRows<JugadorFecha>((from, to) =>
          supabase.from('jugadores').select('id, nombre_completo, division_id, activo').in('division_id', ids).order('id').range(from, to)),
        // Las actividades no toman asistencia: fuera del % y de la alerta de 4 faltas.
        selectAllRows<EventoFecha>((from, to) =>
          supabase.from('eventos').select('id, tipo, division_id, fecha, hora, rival, created_at').in('division_id', ids).eq('cancelado', false).neq('tipo', 'actividad').order('id').range(from, to)),
        selectAllRows<FilaFecha>((from, to) =>
          supabase.from('asistencias').select('evento_id, jugador_id, estado').in('division_id', ids).order('id').range(from, to)),
      ])
      if (divsRes.error) throw divsRes.error

      const divs = (divsRes.data ?? []) as Division[]
      setDivisiones(divs)
      setDivSel(actual => divs.some(d => d.id === actual) ? actual : (divs[0]?.id ?? ''))
      setJugadores(jugs)
      setEventos(evts)
      setAsistencias(asis)
    } catch (err) {
      setErrorCarga(mensajeErrorCarga('las asistencias', err))
    }
    setLoading(false)
  }, [])

  useEffect(() => { void fetchAll() }, [fetchAll])

  const hoy = fechaLocal()

  const jugadoresDiv = useMemo(() => jugadores.filter(j => j.division_id === divSel), [jugadores, divSel])
  const eventosDiv = useMemo(() => eventos.filter(e => e.division_id === divSel), [eventos, divSel])

  // Mismas reglas que Informes de subcomisión (lib/informesAsistencia.ts).
  const filasJugador = useMemo(() => {
    const activos = jugadoresDiv.filter(j => j.activo)
    const informe = informeAsistencia(activos, eventosDiv, asistencias, hoy)
    return activos
      .map(j => ({ jugador: j, ...(informe.get(j.id) ?? { presentes: 0, total: 0, pct: null, cuatroConsec: false }) }))
      .sort((a, b) => a.jugador.nombre_completo.localeCompare(b.jugador.nombre_completo, 'es'))
  }, [jugadoresDiv, eventosDiv, asistencias, hoy])

  const filasFecha = useMemo(
    () => asistenciasPorFecha(jugadoresDiv, eventosDiv, asistencias, hoy, rango === 'todo' ? undefined : restarDias(hoy, Number(rango))),
    [jugadoresDiv, eventosDiv, asistencias, hoy, rango],
  )

  const alternar = (id: string) => setAbiertos(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const encabezado = (
    <>
      <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">ENTRENADOR · ASISTENCIAS</p>
      <h1 className="font-playfair italic text-4xl font-black text-tinta mb-6">Asistencias</h1>
    </>
  )

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
        {encabezado}
        <ErrorCarga mensaje={errorCarga} onReintentar={() => void fetchAll()} />
      </div>
    )
  }

  if (divisiones.length === 0) {
    return (
      <div>
        {encabezado}
        <p className="font-lora text-texto-2 text-sm text-center py-12">
          No tenés divisiones asignadas. Pedile a tu coordinador o a la subcomisión que te asigne una.
        </p>
      </div>
    )
  }

  const nombreDiv = divisiones.find(d => d.id === divSel)?.nombre ?? ''

  return (
    <div>
      <div className="mb-8">
        {encabezado}
        <div className="flex flex-wrap items-center gap-4">
          {divisiones.length > 1 ? (
            <select
              aria-label="División"
              value={divSel}
              onChange={e => { setDivSel(e.target.value); setAbiertos(new Set()) }}
              className="font-lora text-sm text-tinta bg-card border border-borde-control px-4 py-2 outline-none focus:border-tinta transition-colors"
            >
              {divisiones.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          ) : (
            <p className="font-lora text-sm text-tinta">{nombreDiv}</p>
          )}
          {vista === 'fecha' && (
            <select
              aria-label="Período"
              value={rango}
              onChange={e => setRango(e.target.value as Rango)}
              className="font-lora text-sm text-tinta bg-card border border-borde-control px-4 py-2 outline-none focus:border-tinta transition-colors"
            >
              {RANGOS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Vista de asistencias" className="border-b border-gris-claro mb-8 flex gap-8">
        {([['jugador', 'POR JUGADOR'], ['fecha', 'POR FECHA']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={vista === key}
            onClick={() => setVista(key)}
            className={`font-lora text-xs tracking-widest pb-3 transition-colors ${
              vista === key ? 'text-tinta border-b-2 border-oro -mb-px' : 'text-texto-2 hover:text-tinta'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === 'jugador' && (
        filasJugador.length === 0 ? (
          <p className="font-lora text-texto-2 text-sm text-center py-12">No hay jugadores activos en {nombreDiv}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gris-claro">
                  <th className="font-lora text-xs tracking-widest text-texto-2 pb-3 pr-6">JUGADOR</th>
                  <th className="font-lora text-xs tracking-widest text-texto-2 pb-3 pr-6 text-right">PRESENCIAS</th>
                  <th className="font-lora text-xs tracking-widest text-texto-2 pb-3 pr-6 text-right">TOTAL</th>
                  <th className="font-lora text-xs tracking-widest text-texto-2 pb-3 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {filasJugador.map(({ jugador, presentes, total, pct, cuatroConsec }) => (
                  <tr key={jugador.id} className="border-b border-gris-claro/50 hover:bg-papel/50">
                    <td className="py-3 pr-6">
                      <div className="flex items-center gap-3">
                        <span className="font-lora text-sm text-tinta">{jugador.nombre_completo}</span>
                        {cuatroConsec && (
                          <span className="font-lora text-xs bg-rojo text-white px-2 py-0.5 tracking-widest">4 AUS.</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-6 text-right font-lora text-sm text-tinta">{presentes}</td>
                    <td className="py-3 pr-6 text-right font-lora text-sm text-tinta/60">{total}</td>
                    <td className="py-3 text-right">
                      {pct !== null ? (
                        <span className={`font-playfair text-lg font-black ${pct < 50 ? 'text-rojo-texto' : 'text-tinta'}`}>{pct}%</span>
                      ) : (
                        <span className="font-lora text-sm text-texto-2">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {vista === 'fecha' && (
        filasFecha.length === 0 ? (
          <p className="font-lora text-texto-2 text-sm text-center py-12">No hay entrenamientos ni partidos en este período.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filasFecha.map(r => (
              <FilaEvento key={r.evento.id} resumen={r} abierto={abiertos.has(r.evento.id)} onAlternar={() => alternar(r.evento.id)} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function FilaEvento({ resumen, abierto, onAlternar }: { resumen: ResumenFecha; abierto: boolean; onAlternar: () => void }) {
  const { evento, presentes, ausentes, justificados, sinMarcar } = resumen
  const detalleId = `detalle-${evento.id}`
  const grupos: { label: string; jugadores: JugadorFecha[] }[] = [
    { label: 'PRESENTES', jugadores: presentes },
    { label: 'AUSENTES', jugadores: ausentes },
    { label: 'JUSTIFICADOS', jugadores: justificados },
    { label: 'SIN MARCAR', jugadores: sinMarcar },
  ]
  return (
    <div className="bg-card border border-gris-claro">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={detalleId}
        onClick={onAlternar}
        className="w-full px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-left hover:bg-papel/50 transition-colors"
      >
        <div>
          <p className="font-playfair text-lg font-bold text-tinta">{tituloEvento(evento)}</p>
          <p className="font-lora text-xs text-texto-2 mt-0.5">
            {fechaLarga(evento.fecha)}{evento.hora ? ` · ${evento.hora.slice(0, 5)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-lora text-xs">
          <span className="text-tinta">{presentes.length} presentes</span>
          <span className="text-rojo-texto">{ausentes.length} ausentes</span>
          <span className="text-texto-2">{justificados.length} justificados</span>
          <span className="text-texto-2">{sinMarcar.length} sin marcar</span>
          <span aria-hidden="true" className="text-texto-2">{abierto ? '▲' : '▼'}</span>
        </div>
      </button>
      {abierto && (
        <div id={detalleId} className="px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gris-claro pt-4">
          {grupos.map(g => (
            <div key={g.label}>
              <p className="font-lora text-xs tracking-widest text-texto-2 mb-2">{g.label} ({g.jugadores.length})</p>
              {g.jugadores.length === 0 ? (
                <p className="font-lora text-sm text-texto-2">—</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {g.jugadores.map(j => <li key={j.id} className="font-lora text-sm text-tinta">{j.nombre_completo}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
