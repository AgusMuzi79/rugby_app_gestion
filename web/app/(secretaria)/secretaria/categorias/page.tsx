'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Categoria {
  id: string
  nombre: string
  descripcion: string | null
  monto_mensual: number
  activa: boolean
}

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [nombre, setNombre]         = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto]           = useState('')
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')

  const fetchCategorias = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('categorias_socio')
      .select('id, nombre, descripcion, monto_mensual, activa')
      .order('nombre')
    setCategorias(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCategorias() }, [])

  const resetForm = () => {
    setNombre(''); setDescripcion(''); setMonto('')
    setEditingId(null); setShowForm(false); setError('')
  }

  const handleEdit = (c: Categoria) => {
    setNombre(c.nombre)
    setDescripcion(c.descripcion ?? '')
    setMonto(String(c.monto_mensual))
    setEditingId(c.id)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = editingId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (supabase as any).from('categorias_socio').update(payload).eq('id', editingId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : await (supabase as any).from('categorias_socio').insert(payload)

    if (err) { setError(err.message); setGuardando(false); return }
    await fetchCategorias()
    setGuardando(false)
    resetForm()
  }

  const handleToggleActiva = async (id: string, activa: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any)
      .from('categorias_socio').update({ activa }).eq('id', id)
    if (!err) setCategorias(cs => cs.map(c => c.id === id ? { ...c, activa } : c))
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-playfair italic text-4xl text-tinta mb-1">Categorías</h1>
          <p className="font-lora text-tinta/50 text-sm tracking-wide">
            Categorías de socios y sus montos de cuota mensual.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
          >
            + NUEVA CATEGORÍA
          </button>
        )}
      </div>

      {showForm && (
        <div className="border border-gris-claro p-6 mb-8 bg-card">
          <p className="font-lora text-xs tracking-widest text-tinta/50 mb-5">
            {editingId ? 'EDITAR CATEGORÍA' : 'NUEVA CATEGORÍA'}
          </p>
          <div className="grid grid-cols-3 gap-6 mb-5">
            <div>
              <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">NOMBRE</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                placeholder="Activo"
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
                placeholder="5000"
              />
            </div>
          </div>
          {error && <p className="font-lora text-rojo text-sm mb-4">{error}</p>}
          <p className="font-lora text-xs text-tinta/30 italic mb-5">
            Los cambios de monto aplican al próximo período, no retroactivamente.
          </p>
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
      ) : categorias.length === 0 ? (
        <div className="border border-gris-claro p-8 text-center">
          <p className="font-lora text-tinta/40 text-sm tracking-widest">SIN CATEGORÍAS REGISTRADAS</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gris-claro">
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-6">CATEGORÍA</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-left py-3 pr-6">DESCRIPCIÓN</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-right py-3 pr-6">MONTO / MES</th>
              <th className="font-lora text-xs tracking-widest text-tinta/50 text-center py-3 pr-6">ESTADO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categorias.map(c => (
              <tr key={c.id} className="border-b border-gris-claro hover:bg-gris-claro/30 transition-colors">
                <td className="font-lora text-sm text-tinta py-4 pr-6">{c.nombre}</td>
                <td className="font-lora text-sm text-tinta/50 italic py-4 pr-6">{c.descripcion ?? '—'}</td>
                <td className="font-playfair text-base text-tinta text-right py-4 pr-6">
                  ${c.monto_mensual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td className="text-center py-4 pr-6">
                  <button
                    onClick={() => handleToggleActiva(c.id, !c.activa)}
                    className={`font-lora text-xs tracking-widest px-3 py-1 border transition-colors ${
                      c.activa
                        ? 'border-oro text-oro hover:bg-oro/10'
                        : 'border-gris-claro text-tinta/40 hover:border-gris'
                    }`}
                  >
                    {c.activa ? 'ACTIVA' : 'INACTIVA'}
                  </button>
                </td>
                <td className="py-4">
                  <button
                    onClick={() => handleEdit(c)}
                    className="font-lora text-xs tracking-widest text-tinta/40 hover:text-tinta transition-colors"
                  >
                    EDITAR
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
