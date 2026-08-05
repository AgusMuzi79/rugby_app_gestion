'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

const SEMAFORO_LABEL = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', exento: 'Exento' } as const

const SEMAFORO_COLOR = {
  verde: 'text-[#2ECC71] border-[#2ECC71]',
  amarillo: 'text-[#E67E22] border-[#E67E22]',
  rojo: 'text-rojo border-rojo',
  exento: 'text-tinta/30 border-gris-claro',
} as const

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
          <p className="font-lora text-xs text-tinta/30 italic mt-3">
            Vé el detalle por socio en la sección "Deudas" del menú.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Sección: historial de importaciones ────────────────────────────────────

function SeccionHistorial({ historial }: { historial: ImportacionDeuda[] }) {
  return (
    <div>
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

export default function ImportarDeudaPage() {
  const [historial, setHistorial] = useState<ImportacionDeuda[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHistorial = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('importaciones_deuda')
        .select('id, fecha_corte, archivo_nombre, total_vencido, total_a_vencer, total_general, comprobantes, personas, socios_matcheados, sin_match, reconcilia, created_at, profiles!importaciones_deuda_importado_por_fkey(nombre)')
        .order('fecha_corte', { ascending: false })

      const normalized: ImportacionDeuda[] = (data ?? []).map((h: Record<string, unknown>) => ({
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

      setHistorial(normalized)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistorial() }, [fetchHistorial])

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Importar</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Reporte de deuda NUVIX — recalcula el semáforo de morosidad de todos los socios
        </p>
      </div>

      <SeccionImportar onImportado={fetchHistorial} />

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : (
        <SeccionHistorial historial={historial} />
      )}
    </div>
  )
}
