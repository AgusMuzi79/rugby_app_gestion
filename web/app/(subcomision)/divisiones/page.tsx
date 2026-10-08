'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Division {
  id: string
  nombre: string
  activa: boolean
  deporte: string
  categoria: string
  edad_min: number | null
  edad_max: number | null
  linea: string | null
  rama: string | null
}

const DEPORTE_LABEL: Record<string, string> = {
  rugby:  'Rugby',
  hockey: 'Hockey',
  tenis:  'Tenis',
}

const RAMA_LABEL: Record<string, string> = {
  damas:      'Damas',
  caballeros: 'Caballeros',
  mixto:      'Mixto',
}

const ANIO_ACTUAL = new Date().getFullYear()

// Resumen compacto para la lista: "9–10 · A · Damas" o "—".
function resumenDivision(div: Division): string {
  const partes: string[] = []
  if (div.edad_min !== null && div.edad_max !== null) {
    partes.push(div.edad_min === div.edad_max ? `${div.edad_min}` : `${div.edad_min}–${div.edad_max}`)
  }
  if (div.linea) partes.push(div.linea)
  if (div.rama) partes.push(RAMA_LABEL[div.rama] ?? div.rama)
  return partes.length > 0 ? partes.join(' · ') : '—'
}

const inputClass = 'font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors'
const selectClass = `${inputClass} appearance-none`
const labelClass = 'font-lora text-xs tracking-widest text-tinta/60'

export default function DivisionesPage() {
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nuevaNombre, setNuevaNombre] = useState('')
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [nuevaDeporte, setNuevaDeporte] = useState('rugby')
  const [nuevaEdadMin, setNuevaEdadMin] = useState('')
  const [nuevaEdadMax, setNuevaEdadMax] = useState('')
  const [nuevaLinea, setNuevaLinea] = useState('')
  const [nuevaRama, setNuevaRama] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')

  const fetchDivisiones = async () => {
    const { data } = await supabase
      .from('divisiones')
      .select('id, nombre, activa, deporte, categoria, edad_min, edad_max, linea, rama')
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

  const resetForm = () => {
    setEditandoId(null)
    setNuevaNombre('')
    setNuevaCategoria('')
    setNuevaDeporte('rugby')
    setNuevaEdadMin('')
    setNuevaEdadMax('')
    setNuevaLinea('')
    setNuevaRama('')
    setError('')
  }

  const empezarEdicion = (div: Division) => {
    setEditandoId(div.id)
    setNuevaNombre(div.nombre)
    setNuevaCategoria(div.categoria ?? '')
    setNuevaDeporte(div.deporte ?? 'rugby')
    setNuevaEdadMin(div.edad_min !== null ? String(div.edad_min) : '')
    setNuevaEdadMax(div.edad_max !== null ? String(div.edad_max) : '')
    setNuevaLinea(div.linea ?? '')
    setNuevaRama(div.rama ?? '')
    setError('')
  }

  // Valida el rango de edad: ambos o ninguno, enteros >= 0 y desde <= hasta.
  const validarEdades = (): { edadMin: number | null; edadMax: number | null } | string => {
    const minTxt = nuevaEdadMin.trim()
    const maxTxt = nuevaEdadMax.trim()
    if (!minTxt && !maxTxt) return { edadMin: null, edadMax: null }
    if (!minTxt || !maxTxt) return 'Completá "Edad desde" y "Edad hasta", o dejá ambas vacías.'
    const edadMin = Number(minTxt)
    const edadMax = Number(maxTxt)
    if (!Number.isInteger(edadMin) || !Number.isInteger(edadMax) || edadMin < 0 || edadMax < 0) {
      return 'Las edades deben ser números enteros mayores o iguales a 0.'
    }
    if (edadMin > edadMax) return '"Edad desde" no puede ser mayor que "Edad hasta".'
    return { edadMin, edadMax }
  }

  const handleGuardar = async () => {
    setError('')
    if (!nuevaNombre.trim() || !nuevaCategoria) return

    const edades = validarEdades()
    if (typeof edades === 'string') {
      setError(edades)
      return
    }

    setCreando(true)

    const campos = {
      nombre: nuevaNombre.trim(),
      categoria: nuevaCategoria,
      deporte: nuevaDeporte,
      edad_min: edades.edadMin,
      edad_max: edades.edadMax,
      linea: nuevaLinea || null,
      rama: nuevaRama || null,
    }

    const { error: err } = editandoId
      ? await supabase.from('divisiones').update(campos).eq('id', editandoId)
      : await supabase.from('divisiones').insert({ ...campos, activa: true })

    if (err) {
      setError(`Error al ${editandoId ? 'guardar' : 'crear'} la división: ${err.message}`)
    } else {
      resetForm()
      await fetchDivisiones()
    }
    setCreando(false)
  }

  const guardarDivision = (e: React.FormEvent) => {
    e.preventDefault()
    handleGuardar()
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

  const edadMinNum = nuevaEdadMin.trim() === '' ? NaN : Number(nuevaEdadMin)
  const edadMaxNum = nuevaEdadMax.trim() === '' ? NaN : Number(nuevaEdadMax)
  const rangoValido = Number.isInteger(edadMinNum) && Number.isInteger(edadMaxNum)
    && edadMinNum >= 0 && edadMinNum <= edadMaxNum
  const nacidosTexto = rangoValido
    ? (edadMinNum === edadMaxNum
        ? `Nacidos en ${ANIO_ACTUAL - edadMaxNum} en ${ANIO_ACTUAL}`
        : `Nacidos ${ANIO_ACTUAL - edadMaxNum}–${ANIO_ACTUAL - edadMinNum} en ${ANIO_ACTUAL}`)
    : null

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
                <div
                  key={div.id}
                  className={`bg-card border flex items-center justify-between px-5 py-4 ${editandoId === div.id ? 'border-oro' : 'border-gris-claro'}`}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-lora text-sm text-tinta">{div.nombre}</span>
                    <span className="font-lora text-xs text-tinta/40 tracking-widest">{DEPORTE_LABEL[div.deporte] ?? div.deporte}</span>
                    <span className="font-lora text-xs text-tinta/60">{resumenDivision(div)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => empezarEdicion(div)}
                      className="font-lora text-xs tracking-widest text-tinta/60 border border-gris-claro px-3 py-1 hover:border-tinta hover:text-tinta transition-colors"
                    >
                      EDITAR
                    </button>
                    <button
                      onClick={() => toggleActivo(div)}
                      className="font-lora text-xs tracking-widest text-rojo border border-rojo px-3 py-1 hover:bg-rojo hover:text-papel transition-colors"
                    >
                      DESACTIVAR
                    </button>
                  </div>
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
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-lora text-sm text-tinta line-through">{div.nombre}</span>
                      <span className="font-lora text-xs text-tinta/60">{resumenDivision(div)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => empezarEdicion(div)}
                        className="font-lora text-xs tracking-widest text-tinta/60 border border-gris-claro px-3 py-1 hover:border-tinta hover:text-tinta transition-colors"
                      >
                        EDITAR
                      </button>
                      <button
                        onClick={() => toggleActivo(div)}
                        className="font-lora text-xs tracking-widest text-tinta/60 border border-gris-claro px-3 py-1 hover:border-tinta hover:text-tinta transition-colors"
                      >
                        REACTIVAR
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-gris-claro p-6 self-start">
          <p className="font-lora text-xs tracking-widest text-tinta/40 mb-4">
            {editandoId ? 'EDITAR DIVISIÓN' : 'NUEVA DIVISIÓN'}
          </p>
          <form onSubmit={guardarDivision} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>NOMBRE</label>
              <input
                type="text"
                value={nuevaNombre}
                onChange={e => setNuevaNombre(e.target.value)}
                placeholder="Ej.: Sub 14 A"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass}>CATEGORÍA</label>
              <select
                value={nuevaCategoria}
                onChange={e => setNuevaCategoria(e.target.value)}
                className={selectClass}
              >
                <option value="">Seleccioná una categoría</option>
                <option value="infantil">Infantil</option>
                <option value="juvenil">Juvenil</option>
                <option value="superior">Plantel Superior</option>
                <option value="femenino">Femenino</option>
                <option value="mixed">Mixto</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass}>DEPORTE</label>
              <select
                value={nuevaDeporte}
                onChange={e => setNuevaDeporte(e.target.value)}
                className={selectClass}
              >
                <option value="rugby">Rugby</option>
                <option value="hockey">Hockey</option>
                <option value="tenis">Tenis</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>EDAD DESDE</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={nuevaEdadMin}
                    onChange={e => setNuevaEdadMin(e.target.value)}
                    placeholder="Ej.: 9"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>EDAD HASTA</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={nuevaEdadMax}
                    onChange={e => setNuevaEdadMax(e.target.value)}
                    placeholder="Ej.: 10"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="font-lora text-xs text-tinta/40 mt-1">
                Edad que cumple el jugador en el año de la temporada. Ej.: Sub 10 = 9 a 10 (nacidos 2016/17 en 2026).
                Dejar vacío en divisiones sin corte por edad (adultos).
              </p>
              {nacidosTexto && (
                <p className="font-lora text-xs text-oro">{nacidosTexto}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>LÍNEA</label>
                <select
                  value={nuevaLinea}
                  onChange={e => setNuevaLinea(e.target.value)}
                  className={selectClass}
                >
                  <option value="">—</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>RAMA</label>
                <select
                  value={nuevaRama}
                  onChange={e => setNuevaRama(e.target.value)}
                  className={selectClass}
                >
                  <option value="">—</option>
                  <option value="damas">Damas</option>
                  <option value="caballeros">Caballeros</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>
            </div>

            {error && <p className="font-lora text-rojo text-xs">{error}</p>}

            <button
              type="button"
              onClick={handleGuardar}
              disabled={creando || !nuevaNombre.trim() || !nuevaCategoria}
              className="bg-oro text-papel font-lora text-xs tracking-widest py-3 hover:bg-oro/90 transition-colors disabled:opacity-50 mt-2"
            >
              {creando
                ? (editandoId ? 'GUARDANDO…' : 'CREANDO…')
                : (editandoId ? 'GUARDAR CAMBIOS' : 'CREAR DIVISIÓN')}
            </button>

            {editandoId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={creando}
                className="font-lora text-xs tracking-widest text-tinta/60 border border-gris-claro py-3 hover:border-tinta hover:text-tinta transition-colors disabled:opacity-50"
              >
                CANCELAR
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
