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

interface ImportacionDeuda {
  id: string
  fecha_corte: string
  archivo_nombre: string | null
  total_vencido: number | null
  total_a_vencer: number | null
  total_general: number | null
  comprobantes: number | null
  personas: number | null
  socios_matcheados: number | null
  sin_match: number | null
  reconcilia: boolean
  created_at: string
  importado_por_nombre: string | null
}

interface ResultadoImport {
  comprobantes: number
  personas: number
  socios_matcheados: number
  sin_match: number
  verde: number
  amarillo: number
  rojo: number
  exento: number
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

async function callImportarDeuda(archivo: File): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession()
  const formData = new FormData()
  formData.append('archivo', archivo)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/importar-deuda`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: formData,
    }
  )
  return res.json()
}

// ─── Sección: subir archivo ─────────────────────────────────────────────────

function SeccionImportar({
  onImportado,
}: {
  onImportado: () => void
}) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImportar = async () => {
    if (!archivo) return
    setImportando(true)
    setError(null)
    setResultado(null)
    const json = await callImportarDeuda(archivo)
    setImportando(false)
    if (json.error) {
      setError(String(json.error))
      return
    }
    setResultado(json as unknown as ResultadoImport)
    setArchivo(null)
    onImportado()
  }

  return (
    <div className="border border-gris-claro bg-card p-6 mb-8">
      <p className="font-lora text-xs tracking-widest text-tinta/50 mb-4">IMPORTAR REPORTE NUVIX</p>
      <div className="flex gap-3 items-center">
        <input
          type="file"
          accept=".xls"
          onChange={e => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); setError(null) }}
          className="flex-1 font-lora text-sm text-tinta/70 file:mr-4 file:py-2 file:px-4 file:border file:border-gris-claro file:bg-transparent file:text-tinta file:text-xs file:tracking-widest file:cursor-pointer"
        />
        <button
          onClick={handleImportar}
          disabled={!archivo || importando}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
        >
          {importando ? 'IMPORTANDO…' : 'IMPORTAR'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 border border-rojo bg-rojo/5">
          <p className="font-lora text-xs tracking-widest text-rojo mb-1">EL ARCHIVO NO SE IMPORTÓ</p>
          <p className="font-lora text-sm text-tinta/70 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {resultado && (
        <div className="mt-4 p-4 border border-gris-claro">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">RESULTADO DEL IMPORT</p>
          <div className="grid grid-cols-4 gap-4 mb-3">
            <p className="font-lora text-sm text-tinta">
              <span className="text-tinta/50">Comprobantes:</span> {resultado.comprobantes}
            </p>
            <p className="font-lora text-sm text-tinta">
              <span className="text-tinta/50">Personas:</span> {resultado.personas}
            </p>
            <p className="font-lora text-sm text-tinta">
              <span className="text-tinta/50">Matcheados:</span> {resultado.socios_matcheados}
            </p>
            <p className="font-lora text-sm text-tinta">
              <span className="text-tinta/50">Sin match:</span> {resultado.sin_match}
            </p>
          </div>
          <div className="flex gap-2">
            {(['rojo', 'amarillo', 'verde', 'exento'] as const).map(color => (
              <span key={color} className={`font-lora text-xs tracking-widest px-3 py-1 border ${SEMAFORO_COLOR[color]}`}>
                {SEMAFORO_LABEL[color]} {resultado[color]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sección: historial de importaciones ────────────────────────────────────

function SeccionHistorial({ historial }: { historial: ImportacionDeuda[] }) {
  return (
    <div className="mb-8">
      <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">HISTORIAL DE IMPORTACIONES</p>
      {historial.length === 0 ? (
        <div className="border border-gris-claro p-6 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">TODAVÍA NO SE IMPORTÓ NINGÚN ARCHIVO</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-2 pr-4">FECHA DE CORTE</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-2 pr-4">IMPORTADO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-2 pr-4">POR</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">TOTAL VENCIDO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">COMPROBANTES</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-2">RECONCILIÓ</th>
            </tr>
          </thead>
          <tbody>
            {historial.map(imp => (
              <tr key={imp.id} className="border-b border-gris-claro">
                <td className="font-playfair text-sm text-oro-hondo py-3 pr-4">{formatFecha(imp.fecha_corte)}</td>
                <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{formatFecha(imp.created_at)}</td>
                <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{imp.importado_por_nombre ?? '—'}</td>
                <td className="font-lora text-sm text-tinta text-right py-3 pr-4">{formatMoney(imp.total_vencido)}</td>
                <td className="font-lora text-sm text-tinta/60 text-right py-3 pr-4">{imp.comprobantes ?? '—'}</td>
                <td className="text-center py-3">
                  <span className={`font-lora text-xs tracking-widest px-2 py-0.5 border ${
                    imp.reconcilia ? 'text-[#2ECC71] border-[#2ECC71]' : 'text-rojo border-rojo'
                  }`}>
                    {imp.reconcilia ? 'SÍ' : 'NO'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function DeudaPage() {
  const [socios, setSocios] = useState<SocioSemaforo[]>([])
  const [historial, setHistorial] = useState<ImportacionDeuda[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<FiltroSemaforo>('rojo')
  const [busqueda, setBusqueda] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [sociosData, { data: historialData }] = await Promise.all([
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
          .select('id, fecha_corte, archivo_nombre, total_vencido, total_a_vencer, total_general, comprobantes, personas, socios_matcheados, sin_match, reconcilia, created_at, profiles!importaciones_deuda_importado_por_fkey(nombre)')
          .order('fecha_corte', { ascending: false }),
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

      const normalizedHistorial: ImportacionDeuda[] = (historialData ?? []).map((h: Record<string, unknown>) => ({
        id: h.id as string,
        fecha_corte: h.fecha_corte as string,
        archivo_nombre: h.archivo_nombre as string | null,
        total_vencido: h.total_vencido as number | null,
        total_a_vencer: h.total_a_vencer as number | null,
        total_general: h.total_general as number | null,
        comprobantes: h.comprobantes as number | null,
        personas: h.personas as number | null,
        socios_matcheados: h.socios_matcheados as number | null,
        sin_match: h.sin_match as number | null,
        reconcilia: h.reconcilia as boolean,
        created_at: h.created_at as string,
        importado_por_nombre: (h.profiles as { nombre: string } | null)?.nombre ?? null,
      }))

      setSocios(normalizedSocios)
      setHistorial(normalizedHistorial)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fechaCorteActual = historial[0]?.fecha_corte ?? null

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
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Deuda</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Semáforo de morosidad — deuda real de NUVIX, no se cobra desde la app
          {fechaCorteActual && <> · datos al {formatFecha(fechaCorteActual)}</>}
        </p>
      </div>

      <SeccionImportar onImportado={fetchAll} />
      <SeccionHistorial historial={historial} />

      <div>
        <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">SOCIOS POR SEMÁFORO</p>

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
    </div>
  )
}
