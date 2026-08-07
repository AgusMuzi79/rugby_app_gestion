'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ComprobantePendiente {
  id: string
  periodo: string
  monto: number
  comprobante_path: string | null
  created_at: string
  socio_id: string
  numero_socio: string
  nombre: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodoLabel(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${meses[parseInt(mes)]} ${anio}`
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

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
  return res.json()
}

// ─── Foto del comprobante ─────────────────────────────────────────────────────

function FotoComprobante({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) { setUrl(null); return }
    supabase.storage.from('comprobantes').createSignedUrl(path, 300).then(({ data }) => {
      if (data) setUrl(data.signedUrl)
    })
  }, [path])

  if (!path) {
    return (
      <div className="w-40 h-40 border border-gris-claro flex items-center justify-center flex-shrink-0">
        <p className="font-lora text-xs text-tinta/30 italic text-center px-2">Sin comprobante</p>
      </div>
    )
  }
  if (!url) {
    return (
      <div className="w-40 h-40 border border-gris-claro flex items-center justify-center flex-shrink-0">
        <p className="font-lora text-xs text-tinta/30">Cargando…</p>
      </div>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Comprobante" className="w-40 h-40 border border-gris-claro object-cover hover:opacity-80 transition-opacity" />
    </a>
  )
}

// ─── Modal rechazo ────────────────────────────────────────────────────────────

function ModalRechazar({
  cuotaId, socioNombre, onClose, onSuccess,
}: {
  cuotaId: string
  socioNombre: string
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [motivo,   setMotivo]   = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error,    setError]    = useState('')

  const handleConfirm = async () => {
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return }
    setEnviando(true); setError('')
    const json = await callEdgeFunction('socios-pagos', {
      action: 'rechazar-comprobante', cuota_id: cuotaId, motivo: motivo.trim(),
    })
    setEnviando(false)
    if (json.error) { setError(String(json.error)); return }
    onSuccess('Comprobante rechazado — se le avisó al socio por email.')
  }

  return (
    <div className="fixed inset-0 bg-dark/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card w-full max-w-lg p-8">
        <div className="flex justify-between items-center mb-6">
          <p className="font-lora text-xs tracking-widest text-tinta/60">RECHAZAR COMPROBANTE</p>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta text-xl leading-none">×</button>
        </div>
        <p className="font-lora text-sm text-tinta/50 italic mb-5">{socioNombre}</p>
        <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">
          MOTIVO (se le manda al socio por email)
        </label>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={4}
          placeholder="Ej: no se distingue el monto transferido en la foto"
          className="w-full font-lora text-sm text-tinta bg-transparent border border-tinta/30 p-3 outline-none focus:border-oro transition-colors resize-none"
        />
        {error && <p className="font-lora text-rojo text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleConfirm}
            disabled={enviando}
            className="font-lora text-xs tracking-widest px-5 py-3 border border-rojo text-rojo hover:bg-rojo/5 transition-colors disabled:opacity-50 flex-1"
          >
            {enviando ? 'PROCESANDO…' : 'CONFIRMAR RECHAZO'}
          </button>
          <button
            onClick={onClose}
            className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors"
          >
            CANCELAR
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ComprobantesPage() {
  const [items,      setItems]      = useState<ComprobantePendiente[]>([])
  const [loading,    setLoading]    = useState(true)
  const [msg,        setMsg]        = useState('')
  const [aprobando,  setAprobando]  = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<ComprobantePendiente | null>(null)

  const setStatus = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const fetchPendientes = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('cuotas')
        .select('id, periodo, monto, comprobante_path, created_at, socios(id, numero_socio, profiles!socios_profile_id_fkey(nombre))')
        .eq('estado', 'en_revision')
        .order('created_at', { ascending: true })

      const normalized: ComprobantePendiente[] = (data ?? []).map((c: Record<string, unknown>) => {
        const socio = c.socios as { id: string; numero_socio: string; profiles: { nombre: string } | null } | null
        return {
          id:               c.id as string,
          periodo:          c.periodo as string,
          monto:            c.monto as number,
          comprobante_path: c.comprobante_path as string | null,
          created_at:       c.created_at as string,
          socio_id:         socio?.id ?? '',
          numero_socio:     socio?.numero_socio ?? '—',
          nombre:           socio?.profiles?.nombre ?? '—',
        }
      })

      setItems(normalized)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPendientes() }, [fetchPendientes])

  const handleAprobar = async (item: ComprobantePendiente) => {
    if (!confirm(`¿Aprobar el comprobante de ${item.nombre} — ${periodoLabel(item.periodo)} — ${formatMoney(item.monto)}?`)) return
    setAprobando(item.id)
    const json = await callEdgeFunction('socios-pagos', { action: 'aprobar-comprobante', cuota_id: item.id })
    setAprobando(null)
    if (json.error) { setStatus(`Error: ${json.error}`); return }
    setStatus('Comprobante aprobado ✓')
    fetchPendientes()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Comprobantes</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Comprobantes de transferencia subidos por socios, pendientes de revisión
        </p>
      </div>

      {msg && (
        <div className="mb-4 p-3 border border-gris-claro bg-card font-lora text-sm text-tinta">{msg}</div>
      )}

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : items.length === 0 ? (
        <div className="border border-gris-claro p-6 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">NO HAY COMPROBANTES PENDIENTES DE REVISIÓN</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map(item => (
            <div key={item.id} className="border border-gris-claro bg-card p-6 flex gap-6">
              <FotoComprobante path={item.comprobante_path} />

              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <p className="font-playfair italic text-xl text-tinta">{item.nombre}</p>
                  <p className="font-lora text-xs tracking-widest text-oro-hondo mb-3">Nº {item.numero_socio}</p>
                  <table className="border-collapse">
                    <tbody>
                      <tr>
                        <td className="font-lora text-xs tracking-widest text-tinta/50 pr-4 py-1">PERÍODO</td>
                        <td className="font-lora text-sm text-tinta py-1">{periodoLabel(item.periodo)}</td>
                      </tr>
                      <tr>
                        <td className="font-lora text-xs tracking-widest text-tinta/50 pr-4 py-1">MONTO</td>
                        <td className="font-lora text-sm text-tinta py-1">{formatMoney(item.monto)}</td>
                      </tr>
                      <tr>
                        <td className="font-lora text-xs tracking-widest text-tinta/50 pr-4 py-1">SUBIDO</td>
                        <td className="font-lora text-sm text-tinta/60 py-1">{formatFechaHora(item.created_at)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleAprobar(item)}
                    disabled={aprobando === item.id}
                    className="font-lora text-xs tracking-widest px-5 py-3 border border-[#2ECC71] text-[#2ECC71] hover:bg-[#2ECC71]/5 transition-colors disabled:opacity-50"
                  >
                    {aprobando === item.id ? 'APROBANDO…' : 'APROBAR'}
                  </button>
                  <button
                    onClick={() => setRechazando(item)}
                    className="font-lora text-xs tracking-widest px-5 py-3 border border-rojo text-rojo hover:bg-rojo/5 transition-colors"
                  >
                    RECHAZAR
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rechazando && (
        <ModalRechazar
          cuotaId={rechazando.id}
          socioNombre={rechazando.nombre}
          onClose={() => setRechazando(null)}
          onSuccess={(m) => { setRechazando(null); setStatus(m); fetchPendientes() }}
        />
      )}
    </div>
  )
}
