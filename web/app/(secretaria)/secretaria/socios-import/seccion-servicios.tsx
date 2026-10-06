'use client'

// Sección "Padrón de Servicios" de la página de importación de socios.
// Llama a la Edge Function importar-servicios (preview/confirmar), que deja
// socio_servicios como espejo del archivo para Gimnasio, Rugby, Hockey,
// Carnet Tenis, Rugby Inclusivo y Hockey Inclusivo. Las bajas se pueden
// destildar una por una antes de confirmar; al confirmar se mandan las que
// quedaron tildadas (`bajas_aprobadas`) y sólo esas se aplican. Si el archivo
// no trae ninguna fila de un servicio (`servicios_ausentes`, p. ej. un export
// parcial), sus bajas arrancan destildadas y se muestra un aviso.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ItemServicio {
  numero_socio: string
  nombre: string
  servicio: string
  variante: string | null
  importe: number | null
}

interface ItemActualizado extends ItemServicio {
  variante_anterior: string | null
  importe_anterior: number | null
}

interface ItemEliminado extends ItemServicio {
  clave: string
  manual: boolean
  servicio_ausente: boolean
}

interface ItemConflicto {
  numero_socio: string
  nombre: string
  servicio: string
  conceptos: string[]
}

interface ItemSinMatch {
  numero_socio: string
  nombre: string
  conceptos: string[]
}

interface ItemError {
  numero_socio: string
  nombre: string
  servicio: string
  motivo: string
}

interface PreviewServicios {
  agregados: number
  actualizados: number
  eliminados: number
  sin_cambio: number
  conflictos: number
  sin_match: number
  conceptos_desconocidos: number
  errores: number
  servicios_ausentes: string[]
  detalle: {
    agregados: ItemServicio[]
    actualizados: ItemActualizado[]
    eliminados: ItemEliminado[]
    conflictos: ItemConflicto[]
    sin_match: ItemSinMatch[]
    conceptos_desconocidos: { concepto: string; casos: number }[]
    errores: ItemError[]
  }
}

interface ResultadoServicios {
  aplicado: true
  importacion_id: string | null
  agregados: number
  actualizados: number
  eliminados: number
  omitidos: number
  sin_cambio: number
  conflictos: number
  sin_match: number
  errores: number
  detalle: { errores: ItemError[] }
}

interface ImportacionServicios {
  id: string
  archivo_nombre: string | null
  agregados: number
  actualizados: number
  eliminados: number
  omitidos: number
  sin_cambio: number
  errores: number
  created_at: string
  importado_por_nombre: string | null
}

async function callImportarServicios<T>(
  archivo: File,
  modo: 'preview' | 'confirmar',
  bajasAprobadas: string[] = [],
): Promise<T & { error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const formData = new FormData()
  formData.append('archivo', archivo)
  formData.append('modo', modo)
  if (modo === 'confirmar') formData.append('bajas_aprobadas', JSON.stringify(bajasAprobadas))
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/importar-servicios`,
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

function formatImporte(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `$${n.toLocaleString('es-AR')}`
}

// ─── Listas de detalle ────────────────────────────────────────────────────────

function Lista({ titulo, colorClase, cantidad, children }: {
  titulo: string
  colorClase: string
  cantidad: number
  children: ReactNode
}) {
  if (cantidad === 0) return null
  return (
    <div className="mt-3">
      <p className={`font-lora text-xs tracking-widest mb-2 ${colorClase}`}>{titulo} ({cantidad})</p>
      <div className="max-h-56 overflow-y-auto border border-gris-claro">
        <table className="w-full border-collapse">
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

const tdNumero = 'font-lora text-xs text-tinta/50 py-1.5 px-3 w-20'
const tdNombre = 'font-lora text-sm text-tinta py-1.5 px-3'
const tdDato = 'font-lora text-xs text-tinta/60 py-1.5 px-3'
const tdDerecha = 'font-lora text-xs text-tinta/50 py-1.5 px-3 text-right'

// ─── Sección: subir archivo + preview + confirmar ──────────────────────────────

function SeccionImportarServicios({ onAplicado }: { onAplicado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [preview, setPreview] = useState<PreviewServicios | null>(null)
  const [resultado, setResultado] = useState<ResultadoServicios | null>(null)
  const [omitidas, setOmitidas] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const resetResultados = () => { setPreview(null); setResultado(null); setOmitidas(new Set()); setError(null) }

  const handleCalcular = async () => {
    if (!archivo) return
    setCalculando(true)
    resetResultados()
    try {
      const json = await callImportarServicios<PreviewServicios>(archivo, 'preview')
      if (json.error) { setError(json.error); return }
      setPreview(json)
      // Las bajas de servicios que el archivo no trae arrancan destildadas.
      setOmitidas(new Set(json.detalle.eliminados.filter(e => e.servicio_ausente).map(e => e.clave)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCalculando(false)
    }
  }

  const handleConfirmar = async () => {
    if (!archivo) return
    setAplicando(true)
    setError(null)
    try {
      const aprobadas = (preview?.detalle.eliminados ?? []).map(e => e.clave).filter(c => !omitidas.has(c))
      const json = await callImportarServicios<ResultadoServicios>(archivo, 'confirmar', aprobadas)
      if (json.error) { setError(json.error); return }
      setResultado(json)
      setPreview(null)
      setArchivo(null)
      onAplicado()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAplicando(false)
    }
  }

  const toggleBaja = (clave: string) => {
    setOmitidas(prev => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      return next
    })
  }

  const bajasAAplicar = preview ? preview.detalle.eliminados.filter(e => !omitidas.has(e.clave)).length : 0

  return (
    <div className="border border-gris-claro bg-card p-6 mb-8">
      <p className="font-lora text-xs tracking-widest text-tinta/50 mb-2">IMPORTAR PADRÓN DE SERVICIOS (NUVIX)</p>
      <p className="font-lora text-xs text-tinta/50 mb-4">
        Correlo después del Padrón Extendido, así los socios nuevos ya existen. Deja los servicios Gimnasio,
        Rugby, Hockey, Carnet Tenis, Rugby Inclusivo y Hockey Inclusivo exactamente como en el archivo: agrega,
        actualiza y quita (también los cargados a mano). Los demás servicios no se tocan.
      </p>
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

      {resultado && (
        <div className="mt-4 p-4 border border-gris-claro">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">RESULTADO APLICADO</p>
          <div className="grid grid-cols-5 gap-3 mb-2">
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Agregados</span>{resultado.agregados}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Actualizados</span>{resultado.actualizados}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Eliminados</span>{resultado.eliminados}</p>
            <p className="font-lora text-sm text-tinta/50"><span className="text-tinta/50 block text-xs">Bajas omitidas</span>{resultado.omitidos}</p>
            <p className="font-lora text-sm text-tinta/50"><span className="text-tinta/50 block text-xs">Sin cambio</span>{resultado.sin_cambio}</p>
          </div>
          {resultado.errores > 0 && (
            <p className="font-lora text-xs text-rojo mt-1">
              {resultado.errores} fila{resultado.errores === 1 ? '' : 's'} con error — no se aplicaron
            </p>
          )}
          <Lista titulo="ERRORES — SIN APLICAR" colorClase="text-rojo" cantidad={resultado.detalle.errores.length}>
            {resultado.detalle.errores.map(e => (
              <tr key={`${e.numero_socio}|${e.servicio}`} className="border-b border-gris-claro last:border-0">
                <td className={tdNumero}>{e.numero_socio}</td>
                <td className={tdNombre}>{e.nombre || '—'}</td>
                <td className={tdDato}>{e.servicio}</td>
                <td className={tdDerecha}>{e.motivo}</td>
              </tr>
            ))}
          </Lista>
        </div>
      )}

      {preview && (
        <div className="mt-4 p-4 border border-gris-claro">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">PREVIEW — TODAVÍA NO SE APLICÓ NADA</p>
          <div className="grid grid-cols-4 gap-3 mb-2">
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Agregados</span>{preview.agregados}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Actualizados</span>{preview.actualizados}</p>
            <p className="font-lora text-sm text-tinta"><span className="text-tinta/50 block text-xs">Eliminados</span>{preview.eliminados}</p>
            <p className="font-lora text-sm text-tinta/50"><span className="text-tinta/50 block text-xs">Sin cambio</span>{preview.sin_cambio}</p>
          </div>
          {(preview.conflictos > 0 || preview.sin_match > 0 || preview.conceptos_desconocidos > 0 || preview.errores > 0) && (
            <p className="font-lora text-xs text-rojo mt-1">
              Avisos: {preview.conflictos} conflicto{preview.conflictos === 1 ? '' : 's'}, {preview.sin_match} sin socio en la base,{' '}
              {preview.conceptos_desconocidos} concepto{preview.conceptos_desconocidos === 1 ? '' : 's'} desconocido{preview.conceptos_desconocidos === 1 ? '' : 's'},{' '}
              {preview.errores} error{preview.errores === 1 ? '' : 'es'} — no se aplican (ver detalle abajo)
            </p>
          )}

          <Lista titulo="AGREGADOS" colorClase="text-[#2ECC71]" cantidad={preview.detalle.agregados.length}>
            {preview.detalle.agregados.map(a => (
              <tr key={`${a.numero_socio}|${a.servicio}`} className="border-b border-gris-claro last:border-0">
                <td className={tdNumero}>{a.numero_socio}</td>
                <td className={tdNombre}>{a.nombre || '—'}</td>
                <td className={tdDato}>{a.variante}</td>
                <td className={tdDerecha}>{formatImporte(a.importe)}</td>
              </tr>
            ))}
          </Lista>

          <Lista titulo="ACTUALIZADOS" colorClase="text-tinta/60" cantidad={preview.detalle.actualizados.length}>
            {preview.detalle.actualizados.map(a => (
              <tr key={`${a.numero_socio}|${a.servicio}`} className="border-b border-gris-claro last:border-0">
                <td className={tdNumero}>{a.numero_socio}</td>
                <td className={tdNombre}>{a.nombre || '—'}</td>
                <td className={tdDato}>{a.variante_anterior ?? 'manual'} → {a.variante}</td>
                <td className={tdDerecha}>{formatImporte(a.importe_anterior)} → {formatImporte(a.importe)}</td>
              </tr>
            ))}
          </Lista>

          {preview.servicios_ausentes.length > 0 && (
            <div className="mt-3 p-4 border-2 border-rojo bg-rojo/10">
              <p className="font-lora text-xs tracking-widest text-rojo mb-1">ATENCIÓN — POSIBLE EXPORT PARCIAL</p>
              <p className="font-lora text-sm text-tinta">
                El archivo no trae ninguna fila de: {preview.servicios_ausentes.join(', ')}. Si es un export parcial,
                no conviene confirmar. Las bajas de esos servicios quedan destildadas; tildarlas sólo si el servicio
                realmente dejó de existir.
              </p>
            </div>
          )}

          {preview.detalle.eliminados.length > 0 && (
            <div className="mt-3">
              <p className="font-lora text-xs tracking-widest mb-1 text-rojo">
                ELIMINADOS ({bajasAAplicar} de {preview.detalle.eliminados.length})
              </p>
              <p className="font-lora text-xs text-tinta/50 mb-2">
                Destildá los que no quieras quitar en esta corrida.
              </p>
              <div className="max-h-56 overflow-y-auto border border-gris-claro">
                <table className="w-full border-collapse">
                  <tbody>
                    {preview.detalle.eliminados.map(e => (
                      <tr key={e.clave} className={`border-b border-gris-claro last:border-0 ${e.servicio_ausente ? 'bg-rojo/5' : ''}`}>
                        <td className="py-1.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={!omitidas.has(e.clave)}
                            onChange={() => toggleBaja(e.clave)}
                            aria-label={`Quitar ${e.servicio} a ${e.nombre || e.numero_socio}`}
                          />
                        </td>
                        <td className={tdNumero}>{e.numero_socio}</td>
                        <td className={tdNombre}>{e.nombre || '—'}</td>
                        <td className={tdDato}>
                          {e.servicio}{e.manual ? ' (cargado a mano)' : ` — ${e.variante}`}
                          {e.servicio_ausente && <span className="text-rojo"> · servicio ausente del archivo</span>}
                        </td>
                        <td className={tdDerecha}>{formatImporte(e.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Lista titulo="CONFLICTOS — SE DEJAN COMO ESTÁN" colorClase="text-oro" cantidad={preview.detalle.conflictos.length}>
            {preview.detalle.conflictos.map(c => (
              <tr key={`${c.numero_socio}|${c.servicio}`} className="border-b border-gris-claro last:border-0">
                <td className={tdNumero}>{c.numero_socio}</td>
                <td className={tdNombre}>{c.nombre || '—'}</td>
                <td className={tdDerecha}>{c.conceptos.join(' + ')}</td>
              </tr>
            ))}
          </Lista>

          <Lista titulo="SIN SOCIO EN LA BASE" colorClase="text-oro" cantidad={preview.detalle.sin_match.length}>
            {preview.detalle.sin_match.map(s => (
              <tr key={s.numero_socio} className="border-b border-gris-claro last:border-0">
                <td className={tdNumero}>{s.numero_socio}</td>
                <td className={tdNombre}>{s.nombre || '—'}</td>
                <td className={tdDerecha}>{s.conceptos.join(', ')}</td>
              </tr>
            ))}
          </Lista>

          <Lista titulo="CONCEPTOS DESCONOCIDOS — NO SE IMPORTAN" colorClase="text-rojo" cantidad={preview.detalle.conceptos_desconocidos.length}>
            {preview.detalle.conceptos_desconocidos.map(c => (
              <tr key={c.concepto} className="border-b border-gris-claro last:border-0">
                <td className={tdNombre}>{c.concepto}</td>
                <td className={tdDerecha}>{c.casos} socio{c.casos === 1 ? '' : 's'}</td>
              </tr>
            ))}
          </Lista>

          <Lista titulo="ERRORES — SIN APLICAR" colorClase="text-rojo" cantidad={preview.detalle.errores.length}>
            {preview.detalle.errores.map(e => (
              <tr key={`${e.numero_socio}|${e.servicio}`} className="border-b border-gris-claro last:border-0">
                <td className={tdNumero}>{e.numero_socio}</td>
                <td className={tdNombre}>{e.nombre || '—'}</td>
                <td className={tdDato}>{e.servicio}</td>
                <td className={tdDerecha}>{e.motivo}</td>
              </tr>
            ))}
          </Lista>

          <div className="mt-5 pt-4 border-t border-gris-claro flex items-center gap-4">
            <button
              onClick={handleConfirmar}
              disabled={aplicando}
              className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
            >
              {aplicando
                ? 'APLICANDO…'
                : `CONFIRMAR Y APLICAR (${preview.agregados} agregados, ${preview.actualizados} cambios, ${bajasAAplicar} eliminados)`}
            </button>
            <p className="font-lora text-xs text-tinta/40 italic">
              Quitar Gimnasio a un socio hace que el lector del gimnasio lo rechace — revisá los eliminados antes de confirmar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sección: historial ──────────────────────────────────────────────────────

function HistorialServicios({ historial }: { historial: ImportacionServicios[] }) {
  return (
    <div>
      <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">HISTORIAL DE IMPORTACIONES DE SERVICIOS</p>
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
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">AGREGADOS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">ACTUALIZADOS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">ELIMINADOS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">OMITIDOS</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2 pr-4">SIN CAMBIO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-2">ERRORES</th>
            </tr>
          </thead>
          <tbody>
            {historial.map(imp => (
              <tr key={imp.id} className="border-b border-gris-claro">
                <td className="font-playfair text-sm text-oro-hondo py-3 pr-4">{formatFecha(imp.created_at)}</td>
                <td className="font-lora text-sm text-tinta/60 py-3 pr-4">{imp.importado_por_nombre ?? '—'}</td>
                <td className="font-lora text-sm text-tinta text-right py-3 pr-4">{imp.agregados}</td>
                <td className="font-lora text-sm text-tinta/60 text-right py-3 pr-4">{imp.actualizados}</td>
                <td className="font-lora text-sm text-tinta text-right py-3 pr-4">{imp.eliminados}</td>
                <td className="font-lora text-sm text-tinta/60 text-right py-3 pr-4">{imp.omitidos}</td>
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

// ─── Sección completa ────────────────────────────────────────────────────────

export default function SeccionServicios() {
  const [historial, setHistorial] = useState<ImportacionServicios[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHistorial = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('importaciones_servicios')
        .select('id, archivo_nombre, agregados, actualizados, eliminados, omitidos, sin_cambio, errores, created_at, profiles!importaciones_servicios_importado_por_fkey(nombre)')
        .order('created_at', { ascending: false })

      setHistorial((data ?? []).map((h: Record<string, unknown>) => ({
        id: h.id as string,
        archivo_nombre: h.archivo_nombre as string | null,
        agregados: h.agregados as number,
        actualizados: h.actualizados as number,
        eliminados: h.eliminados as number,
        omitidos: h.omitidos as number,
        sin_cambio: h.sin_cambio as number,
        errores: h.errores as number,
        created_at: h.created_at as string,
        importado_por_nombre: (h.profiles as { nombre: string } | null)?.nombre ?? null,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistorial() }, [fetchHistorial])

  return (
    <section className="mt-12 pt-8 border-t-2 border-gris-claro">
      <div className="mb-6">
        <h2 className="font-playfair italic text-3xl text-tinta mb-1">Padrón de Servicios</h2>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Servicios contratados por socio (NUVIX) — gimnasio, deportes y carnet de tenis
        </p>
      </div>
      <SeccionImportarServicios onAplicado={fetchHistorial} />
      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : (
        <HistorialServicios historial={historial} />
      )}
    </section>
  )
}
