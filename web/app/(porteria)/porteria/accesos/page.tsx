'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  type Acceso,
  type FiltrosAccesos,
  type Semaforo,
  FILTROS_VACIOS,
  SEMAFORO_LABEL,
  accesosACsv,
  filtrarAccesos,
  formatFecha,
  formatHora,
  respuestaCubreRango,
  validarRango,
} from '@/lib/accesosFiltro'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: 'text-[#2ECC71] border-[#2ECC71]',
  amarillo: 'text-[#E67E22] border-[#E67E22]',
  rojo: 'text-rojo border-rojo',
  exento: 'text-tinta/30 border-gris-claro',
}

// Desde cuántas visitas en 30 días se le sugiere al invitado hacerse socio.
const UMBRAL_INVITADO_REPETIDO = 3

function isoLocal(d: Date): string {
  // Fecha local del navegador (Argentina), no UTC — new Date().toISOString()
  // se corre al día siguiente pasadas las 21hs por la diferencia de huso horario.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hoyISO(): string {
  return isoLocal(new Date())
}

function haceDiasISO(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return isoLocal(d)
}

function inicioDeMesISO(): string {
  const d = new Date()
  return isoLocal(new Date(d.getFullYear(), d.getMonth(), 1))
}

const ATAJOS: { label: string; desde: () => string }[] = [
  { label: 'HOY',          desde: hoyISO },
  { label: 'ÚLTIMOS 7 DÍAS', desde: () => haceDiasISO(6) },
  { label: 'ESTE MES',     desde: inicioDeMesISO },
  { label: 'ÚLTIMOS 30 DÍAS', desde: () => haceDiasISO(29) },
]

async function callEdgeFunction(name: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    }
  )
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text } }
}

const inputClass = 'font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 outline-none focus:border-oro transition-colors'
const labelClass = 'font-lora text-xs tracking-widest text-tinta/50'

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AccesosPage() {
  const [desde, setDesde]     = useState(hoyISO())
  const [hasta, setHasta]     = useState(hoyISO())
  const [filtros, setFiltros] = useState<FiltrosAccesos>(FILTROS_VACIOS)
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const errorRango = validarRango(desde, hasta)
  const esUnDia = desde === hasta

  // Un rango largo tarda más que uno corto: si el usuario cambia el rango antes
  // de que vuelva la respuesta anterior, esa respuesta vieja se descarta para
  // que la tabla y el CSV no muestren otro rango que el elegido.
  const ultimoPedido = useRef(0)

  const fetchAccesos = useCallback(async (d: string, h: string) => {
    const pedido = ++ultimoPedido.current
    setLoading(true)
    setError('')
    const json = await callEdgeFunction('socios-qr', { action: 'listar-accesos', desde: d, hasta: h })
    if (pedido !== ultimoPedido.current) return
    if (json.error) {
      setError(typeof json.error === 'string' ? json.error : 'No se pudo cargar el historial.')
      setAccesos([])
    } else if (!respuestaCubreRango(json, d, h)) {
      // Una versión vieja de la Edge Function ignora desde/hasta y devuelve
      // sólo el día de hoy: mejor un error que un historial incompleto.
      setError('El servidor no devolvió el rango pedido. Avisá al administrador.')
      setAccesos([])
    } else {
      setAccesos(json.accesos ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (errorRango) return
    fetchAccesos(desde, hasta)
  }, [desde, hasta, errorRango, fetchAccesos])

  const visibles = useMemo(() => filtrarAccesos(accesos, filtros), [accesos, filtros])
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS)

  const setFiltro = <K extends keyof FiltrosAccesos>(clave: K, valor: FiltrosAccesos[K]) =>
    setFiltros(f => ({ ...f, [clave]: valor }))

  const handleExportar = () => {
    const blob = new Blob([accesosACsv(visibles)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = esUnDia ? `accesos-gimnasio-${desde}.csv` : `accesos-gimnasio-${desde}_a_${hasta}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Accesos al Gimnasio</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Ingresos escaneados con el carnet QR o DNI
        </p>
      </div>

      {/* Rango de fechas */}
      <div className="flex flex-wrap gap-4 mb-4 items-end justify-between">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>DESDE</label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              max={hoyISO()}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>HASTA</label>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              min={desde}
              max={hoyISO()}
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ATAJOS.map(atajo => {
              const activo = desde === atajo.desde() && hasta === hoyISO()
              return (
                <button
                  key={atajo.label}
                  onClick={() => { setDesde(atajo.desde()); setHasta(hoyISO()) }}
                  className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
                    activo ? 'border-oro text-oro bg-oro/10' : 'border-gris-claro text-tinta/50 hover:border-oro'
                  }`}
                >
                  {atajo.label}
                </button>
              )
            })}
          </div>
        </div>
        <button
          onClick={handleExportar}
          disabled={visibles.length === 0 || loading || !!errorRango}
          className="font-lora text-xs tracking-widest px-5 py-2 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          EXPORTAR CSV ({visibles.length})
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <label className={labelClass}>BUSCAR</label>
          <input
            type="search"
            value={filtros.busqueda}
            onChange={e => setFiltro('busqueda', e.target.value)}
            placeholder="Nombre, Nº de socio o DNI"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>ESTADO DE CUOTA</label>
          <select
            value={filtros.estado}
            onChange={e => setFiltro('estado', e.target.value as FiltrosAccesos['estado'])}
            className={inputClass}
          >
            <option value="todos">Todos</option>
            {(Object.keys(SEMAFORO_LABEL) as Semaforo[]).map(s => (
              <option key={s} value={s}>{SEMAFORO_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>TIPO</label>
          <select
            value={filtros.tipo}
            onChange={e => setFiltro('tipo', e.target.value as FiltrosAccesos['tipo'])}
            className={inputClass}
          >
            <option value="todos">Todos</option>
            <option value="socios">Socios</option>
            <option value="invitados">Invitados</option>
          </select>
        </div>
        <label className="flex items-center gap-2 font-lora text-xs tracking-widest text-tinta/60 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filtros.soloSinServicio}
            onChange={e => setFiltro('soloSinServicio', e.target.checked)}
            className="accent-oro"
          />
          SIN SERVICIO
        </label>
        <label className="flex items-center gap-2 font-lora text-xs tracking-widest text-tinta/60 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filtros.soloSinReserva}
            onChange={e => setFiltro('soloSinReserva', e.target.checked)}
            className="accent-oro"
          />
          SIN RESERVA
        </label>
        {hayFiltros && (
          <button
            onClick={() => setFiltros(FILTROS_VACIOS)}
            className="font-lora text-xs tracking-widest text-tinta/50 hover:text-oro py-2 underline underline-offset-4"
          >
            LIMPIAR FILTROS
          </button>
        )}
      </div>

      {errorRango ? (
        <div className="border border-rojo p-8 text-center">
          <p className="font-lora text-rojo text-sm tracking-widest">{errorRango}</p>
        </div>
      ) : loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : error ? (
        <div className="border border-rojo p-8 text-center">
          <p className="font-lora text-rojo text-sm tracking-widest">{error}</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">
            {accesos.length > 0
              ? 'NINGÚN INGRESO COINCIDE CON LOS FILTROS'
              : esUnDia ? 'SIN INGRESOS ESTE DÍA' : 'SIN INGRESOS EN ESTE RANGO'}
          </p>
        </div>
      ) : (
        <>
          <p className="font-lora text-xs tracking-widest text-tinta/40 mb-2">
            {hayFiltros ? `${visibles.length} DE ${accesos.length} INGRESOS` : `${accesos.length} INGRESOS`}
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gris-claro">
                {!esUnDia && (
                  <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left w-28">FECHA</th>
                )}
                <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left w-20">HORA</th>
                <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left w-16">Nº</th>
                <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left">NOMBRE</th>
                <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pl-4 text-center">ESTADO DE CUOTA</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a, i) => (
                <tr key={i} className="border-b border-gris-claro">
                  {!esUnDia && (
                    <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{formatFecha(a.creado_en)}</td>
                  )}
                  <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{formatHora(a.creado_en)}</td>
                  <td className="font-playfair text-sm text-oro-hondo py-4 pr-4">{a.numero_socio}</td>
                  <td className="font-lora text-sm text-tinta py-4 pr-4">
                    {a.nombre}
                    {a.sin_servicio && (
                      <span className="ml-2 font-lora text-xs tracking-widest px-2 py-0.5 border text-rojo border-rojo">
                        SIN SERVICIO
                      </span>
                    )}
                    {a.sin_reserva && (
                      <span className="ml-2 font-lora text-xs tracking-widest px-2 py-0.5 border text-sky-400 border-sky-400">
                        SIN RESERVA
                      </span>
                    )}
                    {a.es_invitado && (
                      <>
                        <span className="ml-2 font-lora text-xs tracking-widest px-2 py-0.5 border text-oro border-oro">
                          INVITADO
                        </span>
                        {a.invitado_dni && (
                          <span className="ml-2 font-lora text-xs text-tinta/50">DNI {a.invitado_dni}</span>
                        )}
                        {a.veces_invitado != null && a.veces_invitado >= UMBRAL_INVITADO_REPETIDO && (
                          <span className="ml-2 font-lora text-xs tracking-widest px-2 py-0.5 border text-rojo border-rojo bg-rojo/10">
                            {a.veces_invitado} VECES · DERIVAR A SECRETARÍA
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="text-center py-4 pl-4">
                    <span className={`font-lora text-xs tracking-widest px-2 py-0.5 border ${
                      a.semaforo ? SEMAFORO_COLOR[a.semaforo] : 'border-gris-claro text-tinta/40'
                    }`}>
                      {a.semaforo ? SEMAFORO_LABEL[a.semaforo].toUpperCase() : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
