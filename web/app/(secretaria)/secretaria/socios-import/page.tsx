'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DetalleItem {
  numero_socio: string
  nombre: string
}

interface DetalleBaja extends DetalleItem {
  motivo: 'ausencia' | 'cesante'
}

interface DetalleError extends DetalleItem {
  motivo: string
}

interface DiffResultado {
  altas: number
  bajas: number
  reingresos: number
  actualizados: number
  sin_cambio: number
  errores: number
  detalle: {
    altas: DetalleItem[]
    bajas: DetalleBaja[]
    reingresos: DetalleItem[]
    actualizados: DetalleItem[]
    errores: DetalleError[]
  }
  aplicado?: boolean
  importacion_id?: string | null
  errores_aplicacion?: number
}

interface ImportacionSocios {
  id: string
  archivo_nombre: string | null
  altas: number
  bajas: number
  actualizados: number
  sin_cambio: number
  errores: number
  created_at: string
  importado_por_nombre: string | null
}

async function callImportarSocios(archivo: File, modo: 'preview' | 'confirmar'): Promise<DiffResultado & { error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const formData = new FormData()
  formData.append('archivo', archivo)
  formData.append('modo', modo)
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/importar-socios`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: formData,
    }
  )
  return res.json()
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ─── Lista de detalle (altas/bajas/reingresos/actualizados/errores) ────────────

function ListaDetalle({ titulo, items, colorClase }: { titulo: string; items: DetalleItem[]; colorClase: string }) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <p className={`font-lora text-xs tracking-widest mb-2 ${colorClase}`}>{titulo} ({items.length})</p>
      <div className="max-h-48 overflow-y-auto border border-gris-claro">
        <table className="w-full border-collapse">
          <tbody>
            {items.map(it => (
              <tr key={it.numero_socio} className="border-b border-gris-claro last:border-0">
                <td className="font-lora text-xs text-tinta/50 py-1.5 px-3 w-20">{it.numero_socio}</td>
                <td className="font-lora text-sm text-tinta py-1.5 px-3">{it.nombre || '—'}</td>
                {'motivo' in it && (
                  <td className="font-lora text-xs text-tinta/50 py-1.5 px-3 text-right">
                    {(it as DetalleBaja | DetalleError).motivo}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sección: subir archivo + preview + confirmar ──────────────────────────────

function SeccionImportar({ onAplicado }: { onAplicado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [preview, setPreview] = useState<DiffResultado | null>(null)
  const [aplicadoResultado, setAplicadoResultado] = useState<DiffResultado | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resetResultados = () => { setPreview(null); setAplicadoResultado(null); setError(null) }

  const handleCalcular = async () => {
    if (!archivo) return
    setCalculando(true)
    resetResultados()
    const json = await callImportarSocios(archivo, 'preview')
    setCalculando(false)
    if (json.error) { setError(json.error); return }
    setPreview(json)
  }

  const handleConfirmar = async () => {
    if (!archivo) return
    setAplicando(true)
    setError(null)
    const json = await callImportarSocios(archivo, 'confirmar')
    setAplicando(false)
    if (json.error) { setError(json.error); return }
    setAplicadoResultado(json)
    setPreview(null)
    setArchivo(null)
    onAplicado()
  }

  const resultadoAMostrar = aplicadoResultado ?? preview

  return (
    <div className="border border-gris-claro bg-card p-6 mb-8">
      <p className="font-lora text-xs tracking-widest text-tinta/50 mb-4">IMPORTAR PADRÓN DE SOCIOS (NUVIX)</p>
      <div className="flex gap-3 items-center">
        <input
          type="file"
          accept=".xls,.xlsx"
          onChange={e => { setArchivo(e.target.files?.[0] ?? null); resetResultados() }}
          className="flex-1 font-lora text-sm text-tinta/70 file:mr-4 file:py-2 file:px-4 file:border file:border-gris-claro file:bg-transparent file:text-tinta file:text-xs file:tracking-widest file:cursor-pointer"
        />
        <button
          onClick={handleCalcular}
          disabled={!archivo || calculando || aplicando}
          className="font-lora text-xs tracking-widest px-5 py-3 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-50"
        >
          {calculando ? 'CALCULANDO…' : 'CALCULAR CAMBIOS'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 border border-rojo bg-rojo/5">
          <p className="font-lora text-xs tracking-widest text-rojo mb-1">NO SE PUDO CALCULAR/APLICAR</p>
          <p className="font-lora text-sm text-tinta/70 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {resultadoAMostrar && (
        <div className="mt-4 p-4 border border-gris-claro">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">
            {aplicadoResultado ? 'RESULTADO APLICADO' : 'PREVIEW — TODAVÍA NO SE APLICÓ NADA'}
          </p>
          <div className="grid grid-cols-5 gap-3 mb-2">
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Altas</span>{resultadoAMostrar.altas}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Bajas</span>{resultadoAMostrar.bajas}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Reingresos</span>{resultadoAMostrar.reingresos}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Actualizados</span>{resultadoAMostrar.actualizados}</p>
            <p className="font-lora text-sm text-tinta/50"><span className="text-tinta/50 block text-xs">Sin cambio</span>{resultadoAMostrar.sin_cambio}</p>
          </div>

          {resultadoAMostrar.errores > 0 && (
            <p className="font-lora text-xs text-rojo mt-1">
              {resultadoAMostrar.errores} fila{resultadoAMostrar.errores === 1 ? '' : 's'} con error — no se {aplicadoResultado ? 'aplicaron' : 'van a aplicar'} (ver detalle abajo)
            </p>
          )}
          {aplicadoResultado && (aplicadoResultado.errores_aplicacion ?? 0) > 0 && (
            <p className="font-lora text-xs text-rojo mt-1">
              {aplicadoResultado.errores_aplicacion} error{aplicadoResultado.errores_aplicacion === 1 ? '' : 'es'} al aplicar — revisar logs de la función
            </p>
          )}

          <ListaDetalle titulo="ALTAS" items={resultadoAMostrar.detalle.altas} colorClase="text-[#2ECC71]" />
          <ListaDetalle titulo="BAJAS" items={resultadoAMostrar.detalle.bajas} colorClase="text-rojo" />
          <ListaDetalle titulo="REINGRESOS" items={resultadoAMostrar.detalle.reingresos} colorClase="text-oro" />
          <ListaDetalle titulo="ACTUALIZADOS" items={resultadoAMostrar.detalle.actualizados} colorClase="text-tinta/60" />
          <ListaDetalle titulo="ERRORES — SIN APLICAR" items={resultadoAMostrar.detalle.errores} colorClase="text-rojo" />

          {preview && !aplicadoResultado && (
            <div className="mt-5 pt-4 border-t border-gris-claro flex items-center gap-4">
              <button
                onClick={handleConfirmar}
                disabled={aplicando}
                className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
              >
                {aplicando ? 'APLICANDO…' : `CONFIRMAR Y APLICAR (${preview.altas} altas, ${preview.bajas} bajas, ${preview.reingresos} reingresos, ${preview.actualizados} cambios)`}
              </button>
              <p className="font-lora text-xs text-tinta/40 italic">
                Las bajas bloquean el login real de esas personas — revisá la lista antes de confirmar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sección: historial de importaciones ────────────────────────────────────

function SeccionHistorial({ historial }: { historial: ImportacionSocios[] }) {
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
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-2 pr-4">FECHA</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-2 pr-4">POR</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">ALTAS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">BAJAS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">ACTUALIZADOS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">SIN CAMBIO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2">ERRORES</th>
            </tr>
          </thead>
          <tbody>
            {historial.map(imp => (
              <tr key={imp.id} className="border-b border-gris-claro">
                <td className="font-playfair text-sm text-oro-hondo py-3 pr-4">{formatFecha(imp.created_at)}</td>
                <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{imp.importado_por_nombre ?? '—'}</td>
                <td className="font-lora text-sm text-tinta text-right py-3 pr-4">{imp.altas}</td>
                <td className="font-lora text-sm text-tinta text-right py-3 pr-4">{imp.bajas}</td>
                <td className="font-lora text-sm text-tinta/60 text-right py-3 pr-4">{imp.actualizados}</td>
                <td className="font-lora text-sm text-tinta/60 text-right py-3 pr-4">{imp.sin_cambio}</td>
                <td className="font-lora text-sm text-right py-3 text-rojo">{imp.errores || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function ImportarSociosPage() {
  const [historial, setHistorial] = useState<ImportacionSocios[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHistorial = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('importaciones_socios')
        .select('id, archivo_nombre, altas, bajas, actualizados, sin_cambio, errores, created_at, profiles!importaciones_socios_importado_por_fkey(nombre)')
        .order('created_at', { ascending: false })

      const normalized: ImportacionSocios[] = (data ?? []).map((h: Record<string, unknown>) => ({
        id: h.id as string,
        archivo_nombre: h.archivo_nombre as string | null,
        altas: h.altas as number,
        bajas: h.bajas as number,
        actualizados: h.actualizados as number,
        sin_cambio: h.sin_cambio as number,
        errores: h.errores as number,
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
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Importar Socios</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Padrón general NUVIX — altas, bajas y cambios de categoría del padrón de socios
        </p>
      </div>

      <SeccionImportar onAplicado={fetchHistorial} />

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : (
        <SeccionHistorial historial={historial} />
      )}
    </div>
  )
}
