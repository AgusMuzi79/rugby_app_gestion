'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface FechaDebito {
  id: string
  fecha: string
  aviso_enviado: boolean
  aviso_enviado_at: string | null
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DebitoAutomaticoPage() {
  const [fechas, setFechas]         = useState<FechaDebito[]>([])
  const [loading, setLoading]       = useState(true)
  const [nuevaFecha, setNuevaFecha] = useState('')
  const [pendientes, setPendientes] = useState<string[]>([])
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')

  const fetchFechas = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('fechas_debito_automatico')
      .select('id, fecha, aviso_enviado, aviso_enviado_at')
      .order('fecha', { ascending: true })
    setFechas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchFechas() }, [fetchFechas])

  const yaCargadas = new Set([...fechas.map(f => f.fecha), ...pendientes])

  const handleAgregar = () => {
    setError('')
    if (!nuevaFecha) return
    if (yaCargadas.has(nuevaFecha)) { setError('Esa fecha ya está cargada.'); return }
    setPendientes(ps => [...ps, nuevaFecha].sort())
    setNuevaFecha('')
  }

  const handleQuitarPendiente = (fecha: string) => {
    setPendientes(ps => ps.filter(f => f !== fecha))
  }

  const handleGuardar = async () => {
    if (pendientes.length === 0) return
    setGuardando(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from('fechas_debito_automatico')
      .upsert(
        pendientes.map(fecha => ({ fecha, creado_por: user?.id ?? null })),
        { onConflict: 'fecha', ignoreDuplicates: true }
      )

    setGuardando(false)
    if (err) { setError(err.message); return }
    setPendientes([])
    await fetchFechas()
  }

  const handleEliminar = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('fechas_debito_automatico').delete().eq('id', id)
    if (!err) setFechas(fs => fs.filter(f => f.id !== id))
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-playfair italic text-4xl text-tinta mb-1">Débito Automático</h1>
        <p className="font-lora text-tinta/50 text-sm tracking-wide">
          Fechas en las que el banco debita la cuota — un día antes, se avisa por push y mail
          a los socios que pagan con tarjeta.
        </p>
      </div>

      <div className="border border-gris-claro bg-card p-6 mb-8">
        <p className="font-lora text-xs tracking-widest text-tinta/50 mb-4">CARGAR FECHAS</p>

        <div className="flex gap-3 items-end mb-4">
          <div>
            <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">FECHA DE DÉBITO</label>
            <input
              type="date"
              value={nuevaFecha}
              min={hoyISO()}
              onChange={e => setNuevaFecha(e.target.value)}
              className="font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
            />
          </div>
          <button
            onClick={handleAgregar}
            disabled={!nuevaFecha}
            className="font-lora text-xs tracking-widest px-5 py-3 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-50"
          >
            + AGREGAR
          </button>
        </div>

        {pendientes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {pendientes.map(fecha => (
              <span
                key={fecha}
                className="font-lora text-xs tracking-widest px-3 py-1.5 border border-oro/50 text-oro flex items-center gap-2"
              >
                {formatFecha(fecha)}
                <button onClick={() => handleQuitarPendiente(fecha)} className="text-oro/60 hover:text-rojo transition-colors">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="font-lora text-rojo text-sm mb-4">{error}</p>}

        {pendientes.length > 0 && (
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
          >
            {guardando ? 'GUARDANDO…' : `GUARDAR ${pendientes.length} FECHA${pendientes.length === 1 ? '' : 'S'}`}
          </button>
        )}

        <p className="font-lora text-xs text-tinta/30 italic mt-5">
          Agregá todas las fechas que tengas (hasta 6 meses de una) y guardalas juntas al final —
          no hace falta guardar una por una.
        </p>
      </div>

      <div>
        <p className="font-lora text-xs tracking-widest text-tinta/50 mb-3">FECHAS CARGADAS</p>
        {loading ? (
          <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
        ) : fechas.length === 0 ? (
          <div className="border border-gris-claro p-8 text-center">
            <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN FECHAS CARGADAS TODAVÍA</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gris-claro">
                <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-6">FECHA DE DÉBITO</th>
                <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3 pr-6">AVISO</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fechas.map(f => (
                <tr key={f.id} className="border-b border-gris-claro hover:bg-gris-claro/30 transition-colors">
                  <td className="font-playfair text-base text-tinta py-4 pr-6">{formatFecha(f.fecha)}</td>
                  <td className="text-center py-4 pr-6">
                    <span className={`font-lora text-xs tracking-widest px-3 py-1 border ${
                      f.aviso_enviado ? 'border-oro text-oro' : 'border-gris-claro text-tinta/40'
                    }`}>
                      {f.aviso_enviado ? 'AVISADO' : 'PENDIENTE'}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <button
                      onClick={() => handleEliminar(f.id)}
                      className="font-lora text-xs tracking-widest text-tinta/40 hover:text-rojo transition-colors"
                    >
                      ELIMINAR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
