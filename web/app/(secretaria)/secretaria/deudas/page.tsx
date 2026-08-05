'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase, selectAllRows } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'exento'

interface SocioSemaforo {
  id: string
  numero_socio: string
  nombre: string
  semaforo: Semaforo | null
  deuda_vencida: number
  meses_impagos: number
  mora_max_dias: number
}

type FiltroSemaforo = 'todos' | Semaforo

const FILTROS: FiltroSemaforo[] = ['todos', 'rojo', 'amarillo', 'verde', 'exento']

const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', exento: 'Exento',
}

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: 'text-[#2ECC71] border-[#2ECC71]',
  amarillo: 'text-[#E67E22] border-[#E67E22]',
  rojo: 'text-rojo border-rojo',
  exento: 'text-tinta/30 border-gris-claro',
}

// Prioridad de urgencia — a quién llamar primero.
const SEMAFORO_ORDEN: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, exento: 3 }

function formatMoney(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function DeudasPage() {
  const [socios, setSocios] = useState<SocioSemaforo[]>([])
  const [fechaCorte, setFechaCorte] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroSemaforo>('rojo')
  const [busqueda, setBusqueda] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [sociosData, { data: ultimaImportacion }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectAllRows<Record<string, unknown>>((from, to) =>
          (supabase as any)
            .from('socios')
            .select('id, numero_socio, semaforo, deuda_vencida, meses_impagos, mora_max_dias, profiles!socios_profile_id_fkey(nombre)')
            .in('estado', ['activo', 'pendiente'])
            .not('semaforo', 'is', null)
            .range(from, to)
        ),
        supabase
          .from('importaciones_deuda')
          .select('fecha_corte')
          .order('fecha_corte', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const normalizedSocios: SocioSemaforo[] = (sociosData ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        numero_socio: s.numero_socio as string,
        semaforo: s.semaforo as Semaforo | null,
        deuda_vencida: Number(s.deuda_vencida ?? 0),
        meses_impagos: Number(s.meses_impagos ?? 0),
        mora_max_dias: Number(s.mora_max_dias ?? 0),
        nombre: (s.profiles as { nombre: string } | null)?.nombre ?? '—',
      })).sort((a, b) => {
        const orden = (SEMAFORO_ORDEN[a.semaforo ?? ''] ?? 9) - (SEMAFORO_ORDEN[b.semaforo ?? ''] ?? 9)
        return orden !== 0 ? orden : b.deuda_vencida - a.deuda_vencida
      })

      setSocios(normalizedSocios)
      setFechaCorte((ultimaImportacion as { fecha_corte: string } | null)?.fecha_corte ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sociosFiltrados = socios
    .filter(s => filtro === 'todos' || s.semaforo === filtro)
    .filter(s => {
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      return s.nombre.toLowerCase().includes(q) || s.numero_socio.includes(q)
    })

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Deudas</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Semáforo de morosidad — deuda real de NUVIX, no se cobra desde la app
          {fechaCorte && <> · datos al {formatFecha(fechaCorte)}</>}
        </p>
      </div>

      <div className="flex gap-4 mb-6 items-center">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o Nº socio…"
          className="flex-1 font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 outline-none focus:border-oro transition-colors"
        />
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`font-lora text-xs tracking-widest px-3 py-2 border transition-colors ${
                filtro === f
                  ? 'bg-oro border-oro text-papel'
                  : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
              }`}
            >
              {f === 'todos' ? 'TODOS' : SEMAFORO_LABEL[f].toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : sociosFiltrados.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">
            {busqueda ? 'SIN RESULTADOS' : 'NO HAY SOCIOS EN ESTA VISTA'}
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-4 w-16">Nº</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-4">NOMBRE</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3 pr-4">SEMÁFORO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-3 pr-4">DEUDA VENCIDA</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3 pr-4">MESES IMPAGOS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3">MORA MÁX (DÍAS)</th>
            </tr>
          </thead>
          <tbody>
            {sociosFiltrados.map(s => (
              <tr key={s.id} className="border-b border-gris-claro">
                <td className="font-playfair text-sm text-oro-hondo py-4 pr-4">{s.numero_socio}</td>
                <td className="font-lora text-sm text-tinta py-4 pr-4">{s.nombre}</td>
                <td className="text-center py-4 pr-4">
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 border ${
                    s.semaforo ? SEMAFORO_COLOR[s.semaforo] : 'border-gris-claro text-tinta/40'
                  }`}>
                    {s.semaforo ? SEMAFORO_LABEL[s.semaforo].toUpperCase() : '—'}
                  </span>
                </td>
                <td className="font-lora text-sm text-tinta text-right py-4 pr-4">{formatMoney(s.deuda_vencida)}</td>
                <td className="font-lora text-sm text-tinta/60 text-center py-4 pr-4">{s.meses_impagos}</td>
                <td className="font-lora text-sm text-tinta/60 text-center py-4">{s.mora_max_dias}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
