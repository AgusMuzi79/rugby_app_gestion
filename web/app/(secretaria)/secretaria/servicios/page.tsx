'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Servicio {
  id: string
  nombre: string
  descripcion: string | null
  monto_mensual: number
  activo: boolean
}

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nombre, setNombre]       = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto]         = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  const fetchServicios = async () => {
    const { data } = await supabase
      .from('servicios_opcionales')
      .select('id, nombre, descripcion, monto_mensual, activo')
      .order('nombre')
    setServicios(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchServicios() }, [])

  const resetForm = () => {
    setNombre(''); setDescripcion(''); setMonto('')
    setEditingId(null); setShowForm(false); setError('')
  }

  const handleEdit = (s: Servicio) => {
    setNombre(s.nombre)
    setDescripcion(s.descripcion ?? '')
    setMonto(String(s.monto_mensual))
    setEditingId(s.id)
    setShowForm(true)
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return }
    const montoNum = parseFloat(monto.replace(',', '.'))
    if (isNaN(montoNum) || montoNum < 0) { setError('Monto inválido.'); return }
    setGuardando(true); setError('')

    const payload = {
      nombre:        nombre.trim(),
      descripcion:   descripcion.trim() || null,
      monto_mensual: montoNum,
    }
    const { error: err } = editingId
      ? await supabase.from('servicios_opcionales').update(payload).eq('id', editingId)
      : await supabase.from('servicios_opcionales').insert(payload)

    if (err) { setError(err.message); setGuardando(false); return }
    await fetchServicios()
    setGuardando(false)
    resetForm()
  }

  const handleToggleActivo = async (id: string, activo: boolean) => {
    const { error: err } = await supabase
      .from('servicios_opcionales').update({ activo }).eq('id', id)
    if (!err) setServicios(ss => ss.map(s => s.id === id ? { ...s, activo } : s))
  }

  const handleEliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el servicio "${nombre}"? Esta acción no se puede deshacer.`)) return
    const { error: err } = await supabase.from('servicios_opcionales').delete().eq('id', id)
    if (!err) setServicios(ss => ss.filter(s => s.id !== id))
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Servicios</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            Catálogo de servicios opcionales del club.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
          >
            + NUEVO SERVICIO
          </button>
        )}
      </div>

      {showForm && (
        <div className="border border-gris-claro p-6 mb-8 bg-card">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-5">
            {editingId ? 'EDITAR SERVICIO' : 'NUEVO SERVICIO'}
          </p>
          <div className="grid grid-cols-3 gap-6 mb-5">
            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">NOMBRE</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                placeholder="Gimnasio"
              />
            </div>
            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">DESCRIPCIÓN</label>
              <input
                type="text"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">MONTO MENSUAL ($)</label>
              <input
                type="text"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                placeholder="2000"
              />
            </div>
          </div>
          {error && <p className="font-lora text-rojo text-sm mb-4">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
            >
              {guardando ? 'GUARDANDO…' : 'GUARDAR'}
            </button>
            <button
              onClick={resetForm}
              className="font-lora text-xs tracking-widest px-5 py-3 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors"
            >
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="font-lora text-tinta/40 text-sm tracking-widest text-center py-12">CARGANDO…</p>
      ) : servicios.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN SERVICIOS REGISTRADOS</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-6">SERVICIO</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-6">DESCRIPCIÓN</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-3 pr-6">MONTO / MES</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3 pr-6">ESTADO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {servicios.map(s => (
              <tr key={s.id} className="border-b border-gris-claro hover:bg-gris-claro/30 transition-colors">
                <td className="font-lora text-sm text-tinta py-4 pr-6">{s.nombre}</td>
                <td className="font-lora text-sm text-tinta/50 italic py-4 pr-6">{s.descripcion ?? '—'}</td>
                <td className="font-playfair text-base text-tinta text-right py-4 pr-6">
                  ${s.monto_mensual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="text-center py-4 pr-6">
                  <button
                    onClick={() => handleToggleActivo(s.id, !s.activo)}
                    className={`font-lora text-xs tracking-widest px-3 py-1 border transition-colors ${
                      s.activo
                        ? 'border-oro text-oro hover:bg-oro/10'
                        : 'border-gris-claro text-tinta/40 hover:border-gris'
                    }`}
                  >
                    {s.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </td>
                <td className="py-4">
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleEdit(s)}
                      className="font-lora text-xs tracking-widest text-tinta/40 hover:text-tinta transition-colors"
                    >
                      EDITAR
                    </button>
                    <button
                      onClick={() => handleEliminar(s.id, s.nombre)}
                      className="font-lora text-xs tracking-widest text-rojo/40 hover:text-rojo transition-colors"
                    >
                      ELIMINAR
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
