'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'exento'

interface Acceso {
  creado_en: string
  punto: string
  semaforo: Semaforo | null
  numero_socio: string
  nombre: string
}

const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', exento: 'Exento',
}

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: 'text-[#2ECC71] border-[#2ECC71]',
  amarillo: 'text-[#E67E22] border-[#E67E22]',
  rojo: 'text-rojo border-rojo',
  exento: 'text-tinta/30 border-gris-claro',
}

function hoyISO(): string {
  // Fecha local del navegador (Argentina), no UTC — new Date().toISOString()
  // se corre al día siguiente pasadas las 21hs por la diferencia de huso horario.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
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
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: text } }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AccesosPage() {
  const [fecha, setFecha]     = useState(hoyISO())
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const fetchAccesos = useCallback(async (f: string) => {
    setLoading(true)
    setError('')
    const json = await callEdgeFunction('socios-qr', { action: 'listar-accesos', fecha: f })
    if (json.error) {
      setError(typeof json.error === 'string' ? json.error : 'No se pudo cargar el historial.')
      setAccesos([])
    } else {
      setAccesos(json.accesos ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAccesos(fecha) }, [fecha, fetchAccesos])

  const handleExportar = () => {
    const columnas = ['Hora', 'Nº Socio', 'Nombre', 'Estado de cuota']
    const filas = accesos.map(a => [
      formatHora(a.creado_en),
      a.numero_socio,
      a.nombre,
      a.semaforo ? SEMAFORO_LABEL[a.semaforo] : '',
    ])

    // Delimitador ";" (no ",") — mismo criterio que /secretaria/deudas.
    const csvEscape = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lineas = [columnas, ...filas].map(fila => fila.map(csvEscape).join(';'))
    const bom = '﻿' // fuerza UTF-8 en Excel
    const csv = bom + lineas.join('\r\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `accesos-gimnasio-${fecha}.csv`
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

      <div className="flex gap-4 mb-6 items-center justify-between">
        <div className="flex flex-col gap-1">
          <label className="font-lora text-xs tracking-widest text-tinta/50">FECHA</label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            max={hoyISO()}
            className="font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 outline-none focus:border-oro transition-colors"
          />
        </div>
        <button
          onClick={handleExportar}
          disabled={accesos.length === 0}
          className="font-lora text-xs tracking-widest px-5 py-2 border border-oro text-oro hover:bg-oro/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          EXPORTAR CSV ({accesos.length})
        </button>
      </div>

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : error ? (
        <div className="border border-rojo p-8 text-center">
          <p className="font-lora text-rojo text-sm tracking-widest">{error}</p>
        </div>
      ) : accesos.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN INGRESOS ESTE DÍA</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left w-20">HORA</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left w-16">Nº</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pr-4 text-left">NOMBRE</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 py-3 pl-4 text-center">ESTADO DE CUOTA</th>
            </tr>
          </thead>
          <tbody>
            {accesos.map((a, i) => (
              <tr key={i} className="border-b border-gris-claro">
                <td className="font-lora text-sm text-tinta/60 py-4 pr-4">{formatHora(a.creado_en)}</td>
                <td className="font-playfair text-sm text-oro-hondo py-4 pr-4">{a.numero_socio}</td>
                <td className="font-lora text-sm text-tinta py-4 pr-4">{a.nombre}</td>
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
      )}
    </div>
  )
}
