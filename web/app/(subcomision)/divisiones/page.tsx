'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Division {
  id: string
  nombre: string
  activa: boolean
}

export default function DivisionesPage() {
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevaNombre, setNuevaNombre] = useState('')
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')

  const fetchDivisiones = async () => {
    const { data } = await supabase
      .from('divisiones')
      .select('id, nombre, activa')
      .order('nombre')
    setDivisiones(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDivisiones() }, [])

  const toggleActivo = async (div: Division) => {
    const { error: err } = await supabase
      .from('divisiones')
      .update({ activa: !div.activa })
      .eq('id', div.id)

    if (!err) {
      setDivisiones(ds => ds.map(d => d.id === div.id ? { ...d, activa: !d.activa } : d))
    }
  }

  const handleCrear = async () => {
    setError('')
    if (!nuevaNombre.trim() || !nuevaCategoria) return
    setCreando(true)

    const { error: err } = await supabase
      .from('divisiones')
      .insert({ nombre: nuevaNombre.trim(), categoria: nuevaCategoria, activa: true })

    if (err) {
      setError(`Error al crear la división: ${err.message}`)
    } else {
      setNuevaNombre('')
      setNuevaCategoria('')
      await fetchDivisiones()
    }
    setCreando(false)
  }

  const crearDivision = (e: React.FormEvent) => {
    e.preventDefault()
    handleCrear()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-lora text-tinta/40 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  const activas = divisiones.filter(d => d.activa)
  const inactivas = divisiones.filter(d => !d.activa)

  return (
    <div>
      <div className="mb-8">
        <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">SUBCOMISIÓN · DIVISIONES</p>
        <h1 className="font-playfair italic text-4xl font-black text-tinta">Divisiones</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div>
            <p className="font-lora text-xs tracking-widest text-tinta/40 mb-3">ACTIVAS ({activas.length})</p>
            <div className="flex flex-col gap-1">
              {activas.map(div => (
                <div key={div.id} className="bg-card border border-gris-claro flex items-center justify-between px-5 py-4">
                  <span className="font-lora text-sm text-tinta">{div.nombre}</span>
                  <button
                    onClick={() => toggleActivo(div)}
                    className="font-lora text-xs tracking-widest text-rojo border border-rojo px-3 py-1 hover:bg-rojo hover:text-papel transition-colors"
                  >
                    DESACTIVAR
                  </button>
                </div>
              ))}
              {activas.length === 0 && (
                <p className="font-lora text-tinta/40 text-sm py-4">Sin divisiones activas.</p>
              )}
            </div>
          </div>

          {inactivas.length > 0 && (
            <div>
              <p className="font-lora text-xs tracking-widest text-tinta/40 mb-3">INACTIVAS ({inactivas.length})</p>
              <div className="flex flex-col gap-1">
                {inactivas.map(div => (
                  <div key={div.id} className="bg-card border border-gris-claro/50 flex items-center justify-between px-5 py-4 opacity-60">
                    <span className="font-lora text-sm text-tinta line-through">{div.nombre}</span>
                    <button
                      onClick={() => toggleActivo(div)}
                      className="font-lora text-xs tracking-widest text-tinta/60 border border-gris-claro px-3 py-1 hover:border-tinta hover:text-tinta transition-colors"
                    >
                      REACTIVAR
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-gris-claro p-6">
          <p className="font-lora text-xs tracking-widest text-tinta/40 mb-4">NUEVA DIVISIÓN</p>
          <form onSubmit={crearDivision} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-lora text-xs tracking-widest text-tinta/60">NOMBRE</label>
              <input
                type="text"
                value={nuevaNombre}
                onChange={e => setNuevaNombre(e.target.value)}
                placeholder="Ej: M15 Los Tiburones"
                className="font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-lora text-xs tracking-widest text-tinta/60">CATEGORÍA</label>
              <select
                value={nuevaCategoria}
                onChange={e => setNuevaCategoria(e.target.value)}
                className="font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors appearance-none"
              >
                <option value="">Seleccioná una categoría</option>
                <option value="infantil">Infantil</option>
                <option value="juvenil">Juvenil</option>
                <option value="plantel_superior">Plantel Superior</option>
                <option value="femenino">Femenino</option>
                <option value="rugby_mixed">Rugby Mixed</option>
              </select>
            </div>

            {error && <p className="font-lora text-rojo text-xs">{error}</p>}

            <button
              type="button"
              onClick={handleCrear}
              disabled={creando || !nuevaNombre.trim() || !nuevaCategoria}
              className="bg-oro text-papel font-lora text-xs tracking-widest py-3 hover:bg-oro/90 transition-colors disabled:opacity-50 mt-2"
            >
              {creando ? 'CREANDO…' : 'CREAR DIVISIÓN'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
