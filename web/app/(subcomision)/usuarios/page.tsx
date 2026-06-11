'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ROLES = ['subcomision', 'coordinador', 'entrenador', 'manager']

interface Division {
  id: string
  nombre: string
}

interface Profile {
  id: string
  nombre: string
  rol: string
  divisiones: string[]
  activo?: boolean
}

interface ProfileRow extends Profile {
  email?: string
  loadingEmail?: boolean
  expanded?: boolean
  editingRol?: boolean
  editingDiv?: boolean
  tempRol?: string
  tempDiv?: string[]
}

export default function UsuariosPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: profs }, { data: divs }] = await Promise.all([
        supabase.from('profiles').select('id, nombre, rol, divisiones').order('nombre'),
        supabase.from('divisiones').select('id, nombre').order('nombre'),
      ])
      setProfiles(profs ?? [])
      setDivisiones(divs ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const getEmail = async (id: string) => {
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, loadingEmail: true } : p))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-usuarios`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ action: 'getUser', userId: id }),
        }
      )
      const json = await res.json()
      const email = json.email || '—'
      setProfiles(ps => ps.map(p => p.id === id ? { ...p, email, loadingEmail: false } : p))
    } catch {
      setProfiles(ps => ps.map(p => p.id === id ? { ...p, email: '—', loadingEmail: false } : p))
    }
  }

  const toggleExpand = (id: string) => {
    const current = profiles.find(p => p.id === id)
    const expanding = !current?.expanded
    setProfiles(ps => ps.map(p =>
      p.id === id ? { ...p, expanded: !p.expanded, editingRol: false, editingDiv: false } : p
    ))
    if (expanding && !current?.email && !current?.loadingEmail) {
      getEmail(id)
    }
  }

  const saveRol = async (p: ProfileRow) => {
    if (!p.tempRol) return
    await supabase.from('profiles').update({ rol: p.tempRol }).eq('id', p.id)
    setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, rol: p.tempRol!, editingRol: false } : r))
  }

  const saveDiv = async (p: ProfileRow) => {
    await supabase.from('profiles').update({ divisiones: p.tempDiv ?? [] }).eq('id', p.id)
    setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, divisiones: p.tempDiv ?? [], editingDiv: false } : r))
  }

  const toggleDivision = (profId: string, divId: string) => {
    setProfiles(ps => ps.map(p => {
      if (p.id !== profId) return p
      const current = p.tempDiv ?? p.divisiones ?? []
      const next = current.includes(divId) ? current.filter(d => d !== divId) : [...current, divId]
      return { ...p, tempDiv: next }
    }))
  }

  const eliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'delete', userId: id },
    })
    if (error) { alert('Error al eliminar el usuario.'); return }
    setProfiles(ps => ps.filter(p => p.id !== id))
  }

  const desactivar = async (id: string) => {
    if (!confirm('¿Desactivar este usuario?')) return
    await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'deactivate', userId: id },
    })
    alert('Usuario desactivado.')
  }

  const reactivar = async (id: string) => {
    await supabase.functions.invoke('admin-usuarios', {
      body: { action: 'reactivate', userId: id },
    })
    alert('Usuario reactivado.')
  }

  const getNombreDivision = (id: string) => divisiones.find(d => d.id === id)?.nombre ?? id

  const filtrados = profiles.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.rol?.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-lora text-tinta/40 tracking-widest text-sm">CARGANDO…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">SUBCOMISIÓN · USUARIOS</p>
        <h1 className="font-playfair italic text-4xl font-black text-tinta mb-6">Gestión de Usuarios</h1>
        <input
          type="text"
          placeholder="Buscar por nombre o rol…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 w-full max-w-sm outline-none focus:border-tinta transition-colors"
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtrados.map(p => (
          <div key={p.id} className="bg-card border border-gris-claro">
            <button
              onClick={() => toggleExpand(p.id)}
              className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-papel/50 transition-colors"
            >
              <div className="flex items-center gap-6">
                <span className="font-playfair text-lg font-bold text-tinta">{p.nombre}</span>
                <span className="font-lora text-xs tracking-widest text-tinta/50 bg-gris-claro px-2 py-1 uppercase">
                  {p.rol}
                </span>
              </div>
              <span className="font-lora text-xs text-tinta/30">{p.expanded ? '▲' : '▼'}</span>
            </button>

            {p.expanded && (
              <div className="px-6 pb-6 border-t border-gris-claro">
                <div className="pt-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">EMAIL</p>
                    <p className="font-lora text-sm text-tinta">
                      {p.loadingEmail ? 'Cargando…' : (p.email ?? '—')}
                    </p>
                  </div>

                  <div>
                    <p className="font-lora text-xs tracking-widest text-tinta/40 mb-2">ROL</p>
                    {p.editingRol ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={p.tempRol ?? p.rol}
                          onChange={e => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, tempRol: e.target.value } : r))}
                          className="font-lora text-sm text-tinta bg-papel border border-tinta/30 px-2 py-1 outline-none"
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => saveRol(p)} className="font-lora text-xs bg-oro text-papel px-3 py-1 tracking-widest">GUARDAR</button>
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingRol: false } : r))} className="font-lora text-xs text-tinta/40 px-2 py-1">CANCELAR</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-lora text-sm text-tinta">{p.rol}</span>
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingRol: true, tempRol: r.rol } : r))} className="font-lora text-xs text-oro tracking-widest hover:underline">EDITAR</button>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <p className="font-lora text-xs tracking-widest text-tinta/40 mb-2">DIVISIONES</p>
                    {p.editingDiv ? (
                      <div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {divisiones.map(d => {
                            const selected = (p.tempDiv ?? p.divisiones ?? []).includes(d.id)
                            return (
                              <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleDivision(p.id, d.id)}
                                  className="accent-oro"
                                />
                                <span className="font-lora text-xs text-tinta">{d.nombre}</span>
                              </label>
                            )
                          })}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveDiv(p)} className="font-lora text-xs bg-oro text-papel px-3 py-1 tracking-widest">GUARDAR</button>
                          <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingDiv: false } : r))} className="font-lora text-xs text-tinta/40 px-2 py-1">CANCELAR</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-wrap">
                        {(p.divisiones ?? []).length === 0 ? (
                          <span className="font-lora text-sm text-tinta/40">Sin divisiones</span>
                        ) : (
                          (p.divisiones ?? []).map(id => (
                            <span key={id} className="font-lora text-xs bg-gris-claro text-tinta px-2 py-1">{getNombreDivision(id)}</span>
                          ))
                        )}
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingDiv: true, tempDiv: [...(r.divisiones ?? [])] } : r))} className="font-lora text-xs text-oro tracking-widest hover:underline">EDITAR</button>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 flex gap-3 pt-2 border-t border-gris-claro">
                    <button onClick={() => desactivar(p.id)} className="font-lora text-xs tracking-widest text-rojo border border-rojo px-4 py-2 hover:bg-rojo hover:text-papel transition-colors">DESACTIVAR</button>
                    <button onClick={() => reactivar(p.id)} className="font-lora text-xs tracking-widest text-tinta/50 border border-gris-claro px-4 py-2 hover:border-tinta transition-colors">REACTIVAR</button>
                    <button onClick={() => eliminar(p.id, p.nombre)} className="font-lora text-xs tracking-widest text-rojo border border-rojo px-4 py-2 hover:bg-rojo hover:text-papel transition-colors">ELIMINAR</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {filtrados.length === 0 && (
          <p className="font-lora text-tinta/40 text-sm text-center py-12">Sin resultados.</p>
        )}
      </div>
    </div>
  )
}
