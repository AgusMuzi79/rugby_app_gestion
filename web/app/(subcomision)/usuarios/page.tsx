'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const ROLES_STAFF = ['coordinador', 'entrenador', 'manager', 'subcomision']
const ROL_LABEL: Record<string, string> = {
  subcomision: 'Subcomisión', coordinador: 'Coordinador',
  entrenador: 'Entrenador', manager: 'Manager',
}

interface Division { id: string; nombre: string }

interface ProfileRow {
  id: string; nombre: string; rol: string
  divisiones: string[]; activo?: boolean
  email?: string; loadingEmail?: boolean
  expanded?: boolean; editingRol?: boolean; editingDiv?: boolean
  tempRol?: string; tempDiv?: string[]
}

type ModoModal = 'asignar' | 'crear'

async function callEdgeFunction(name: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    }
  )
  return res.json()
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const [profiles, setProfiles]     = useState<ProfileRow[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [modalOpen, setModalOpen]   = useState(false)

  const fetchData = useCallback(async () => {
    const [{ data: profs }, { data: divs }] = await Promise.all([
      supabase.from('profiles').select('id, nombre, rol, divisiones').neq('rol', 'socio').neq('rol', 'admin').order('nombre'),
      supabase.from('divisiones').select('id, nombre').order('nombre'),
    ])
    setProfiles(profs ?? [])
    setDivisiones(divs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const getEmail = async (id: string) => {
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, loadingEmail: true } : p))
    try {
      const json = await callEdgeFunction('admin-usuarios', { action: 'getUser', userId: id })
      setProfiles(ps => ps.map(p => p.id === id ? { ...p, email: json.email ?? '—', loadingEmail: false } : p))
    } catch {
      setProfiles(ps => ps.map(p => p.id === id ? { ...p, email: '—', loadingEmail: false } : p))
    }
  }

  const toggleExpand = (id: string) => {
    const current = profiles.find(p => p.id === id)
    const expanding = !current?.expanded
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, expanded: !p.expanded, editingRol: false, editingDiv: false } : p))
    if (expanding && !current?.email && !current?.loadingEmail) getEmail(id)
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
      const cur = p.tempDiv ?? p.divisiones ?? []
      return { ...p, tempDiv: cur.includes(divId) ? cur.filter(d => d !== divId) : [...cur, divId] }
    }))
  }

  const eliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return
    const json = await callEdgeFunction('admin-usuarios', { action: 'delete', userId: id })
    if (json.error) { alert(json.error); return }
    setProfiles(ps => ps.filter(p => p.id !== id))
  }

  const desactivar = async (id: string) => {
    if (!confirm('¿Desactivar este usuario?')) return
    const json = await callEdgeFunction('admin-usuarios', { action: 'deactivate', userId: id })
    if (json.error) { alert(json.error); return }
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, activo: false } : p))
  }

  const reactivar = async (id: string) => {
    const json = await callEdgeFunction('admin-usuarios', { action: 'reactivate', userId: id })
    if (json.error) { alert(json.error); return }
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, activo: true } : p))
  }

  const getNombreDivision = (id: string) => divisiones.find(d => d.id === id)?.nombre ?? id

  const filtrados = profiles.filter(p =>
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.rol?.toLowerCase().includes(busqueda.toLowerCase())
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="font-lora text-tinta/40 tracking-widest text-sm">CARGANDO…</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">SUBCOMISIÓN · USUARIOS</p>
          <h1 className="font-playfair italic text-4xl text-tinta">Gestión de Usuarios</h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel hover:bg-oro/90 transition-colors"
        >
          + NUEVO USUARIO
        </button>
      </div>

      {/* Búsqueda */}
      <input
        type="text"
        placeholder="Buscar por nombre o rol…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="font-lora text-sm text-tinta bg-card border border-gris-claro px-4 py-2 w-full max-w-sm outline-none focus:border-tinta transition-colors mb-6"
      />

      {/* Lista */}
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
                  {ROL_LABEL[p.rol] ?? p.rol}
                </span>
              </div>
              <span className="font-lora text-xs text-tinta/30">{p.expanded ? '▲' : '▼'}</span>
            </button>

            {p.expanded && (
              <div className="px-6 pb-6 border-t border-gris-claro">
                <div className="pt-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="font-lora text-xs tracking-widest text-tinta/40 mb-1">EMAIL</p>
                    <p className="font-lora text-sm text-tinta">{p.loadingEmail ? 'Cargando…' : (p.email ?? '—')}</p>
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
                          {ROLES_STAFF.map(r => <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>)}
                        </select>
                        <button onClick={() => saveRol(p)} className="font-lora text-xs bg-oro text-papel px-3 py-1 tracking-widest">GUARDAR</button>
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingRol: false } : r))} className="font-lora text-xs text-tinta/40 px-2 py-1">CANCELAR</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-lora text-sm text-tinta">{ROL_LABEL[p.rol] ?? p.rol}</span>
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
                                <input type="checkbox" checked={selected} onChange={() => toggleDivision(p.id, d.id)} className="accent-oro" />
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
                        {(p.divisiones ?? []).length === 0
                          ? <span className="font-lora text-sm text-tinta/40">Sin divisiones</span>
                          : (p.divisiones ?? []).map(id => (
                              <span key={id} className="font-lora text-xs bg-gris-claro text-tinta px-2 py-1">{getNombreDivision(id)}</span>
                            ))
                        }
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

      {/* Modal */}
      {modalOpen && (
        <ModalNuevoUsuario
          divisiones={divisiones}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); void fetchData() }}
        />
      )}
    </div>
  )
}

// ─── Modal nuevo usuario ──────────────────────────────────────────────────────

function ModalNuevoUsuario({
  divisiones, onClose, onSuccess,
}: {
  divisiones: Division[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [modo, setModo] = useState<ModoModal>('asignar')

  // Asignar rol a socio existente
  const [busqueda, setBusqueda]               = useState('')
  const [buscando, setBuscando]               = useState(false)
  const [resultados, setResultados]           = useState<{ id: string; nombre: string }[]>([])
  const [socioElegido, setSocioElegido]       = useState<{ id: string; nombre: string } | null>(null)
  const [errorBusqueda, setErrorBusqueda]     = useState('')
  const [rolAsignacion, setRolAsignacion]     = useState('')
  const [divsAsignacion, setDivsAsignacion]   = useState<string[]>([])
  const [asignando, setAsignando]             = useState(false)
  const [asignadoOk, setAsignadoOk]           = useState(false)
  const [errorAsignacion, setErrorAsignacion] = useState('')

  // Crear nuevo usuario
  const [nombre, setNombre]           = useState('')
  const [email, setEmail]             = useState('')
  const [dni, setDni]                 = useState('')
  const [rolNuevo, setRolNuevo]       = useState('')
  const [divsNuevo, setDivsNuevo]     = useState<string[]>([])
  const [creando, setCreando]         = useState(false)
  const [creadoOk, setCreadoOk]       = useState(false)
  const [errorCrear, setErrorCrear]   = useState('')

  const buscarSocio = async () => {
    const q = busqueda.trim()
    if (!q) { setErrorBusqueda('Ingresá un DNI o nombre.'); return }
    setBuscando(true); setErrorBusqueda(''); setSocioElegido(null); setResultados([])
    const esDni = /^\d+$/.test(q)
    let query = supabase.from('socios').select('id, nombre')
    query = esDni ? query.eq('dni', q) : query.ilike('nombre', `%${q}%`).limit(5)
    const { data } = await query
    if (!data || data.length === 0) {
      setErrorBusqueda(esDni ? 'No se encontró ningún socio con ese DNI.' : 'No se encontraron socios con ese nombre.')
    } else if (data.length === 1) {
      setSocioElegido(data[0] as { id: string; nombre: string })
    } else {
      setResultados(data as { id: string; nombre: string }[])
    }
    setBuscando(false)
  }

  const asignarRol = async () => {
    if (!socioElegido) { setErrorAsignacion('Buscá el socio primero.'); return }
    if (!rolAsignacion) { setErrorAsignacion('Seleccioná un rol.'); return }
    setAsignando(true); setErrorAsignacion('')
    const json = await callEdgeFunction('admin-usuarios', {
      action: 'assign-role', socioId: socioElegido.id,
      nuevoRol: rolAsignacion, divisiones: divsAsignacion,
    })
    setAsignando(false)
    if (json.error) { setErrorAsignacion(json.error); return }
    setAsignadoOk(true)
  }

  const crearUsuario = async () => {
    if (!nombre.trim()) { setErrorCrear('Nombre obligatorio.'); return }
    if (!email.trim())  { setErrorCrear('Email obligatorio.'); return }
    if (!dni.trim())    { setErrorCrear('DNI obligatorio.'); return }
    if (!rolNuevo)      { setErrorCrear('Seleccioná un rol.'); return }
    setCreando(true); setErrorCrear('')
    const json = await callEdgeFunction('admin-usuarios', {
      action: 'create', nombre: nombre.trim(), email: email.trim().toLowerCase(),
      dni: dni.trim(), rol: rolNuevo, divisiones: divsNuevo,
    })
    setCreando(false)
    if (json.error) { setErrorCrear(json.error); return }
    setCreadoOk(true)
  }

  const toggleDiv = (id: string, sel: string[], set: (v: string[]) => void) =>
    set(sel.includes(id) ? sel.filter(d => d !== id) : [...sel, id])

  return (
    <div className="fixed inset-0 bg-dark/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header modal */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-gris-claro">
          <p className="font-lora text-xs tracking-widest text-tinta/60">NUEVO USUARIO STAFF</p>
          <button onClick={onClose} className="text-tinta/40 hover:text-tinta text-xl">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gris-claro">
          {(['asignar', 'crear'] as ModoModal[]).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`flex-1 font-lora text-xs tracking-widest py-3 transition-colors ${
                modo === m
                  ? 'text-oro border-b-2 border-oro'
                  : 'text-tinta/40 hover:text-tinta/60'
              }`}
            >
              {m === 'asignar' ? 'DESDE SOCIO EXISTENTE' : 'NUEVO USUARIO'}
            </button>
          ))}
        </div>

        <div className="p-8 flex flex-col gap-4">
          {modo === 'asignar' ? (
            asignadoOk ? (
              <div className="text-center py-6">
                <p className="font-lora text-sm text-tinta mb-4">
                  ✓ Rol asignado a <strong>{socioElegido?.nombre}</strong>. Ya puede ingresar con su email y DNI.
                </p>
                <button onClick={onSuccess} className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel">CERRAR</button>
              </div>
            ) : (
              <>
                {/* Búsqueda */}
                <div>
                  <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DNI O NOMBRE DEL SOCIO</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && buscarSocio()}
                      placeholder="12345678 o Juan Pérez"
                      className="flex-1 font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                    />
                    <button
                      onClick={buscarSocio}
                      disabled={buscando}
                      className="font-lora text-xs tracking-widest px-4 py-2 bg-oro text-papel disabled:opacity-50"
                    >
                      {buscando ? '…' : 'BUSCAR'}
                    </button>
                  </div>
                </div>

                {errorBusqueda && <p className="font-lora text-rojo text-sm">{errorBusqueda}</p>}

                {/* Lista de resultados */}
                {resultados.length > 0 && (
                  <div className="border border-gris-claro divide-y divide-gris-claro">
                    {resultados.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSocioElegido(r); setResultados([]) }}
                        className="w-full text-left px-4 py-3 font-lora text-sm text-tinta hover:bg-gris-claro/30 transition-colors flex justify-between items-center"
                      >
                        {r.nombre}
                        <span className="text-tinta/30">›</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Socio encontrado */}
                {socioElegido && (
                  <>
                    <div className="border border-oro/40 bg-oro/5 px-4 py-3">
                      <p className="font-lora text-sm text-tinta">✓ {socioElegido.nombre}</p>
                    </div>

                    <div>
                      <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">ROL A ASIGNAR</label>
                      <div className="flex flex-wrap gap-2">
                        {ROLES_STAFF.map(r => (
                          <button
                            key={r}
                            onClick={() => setRolAsignacion(r)}
                            className={`font-lora text-xs tracking-widest px-4 py-2 border transition-colors ${
                              rolAsignacion === r ? 'bg-oro border-oro text-papel' : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
                            }`}
                          >
                            {ROL_LABEL[r]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DIVISIONES</label>
                      <div className="flex flex-wrap gap-2">
                        {divisiones.map(d => {
                          const sel = divsAsignacion.includes(d.id)
                          return (
                            <button
                              key={d.id}
                              onClick={() => toggleDiv(d.id, divsAsignacion, setDivsAsignacion)}
                              className={`font-lora text-xs tracking-widest px-3 py-1.5 border transition-colors ${
                                sel ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-tinta/40 hover:border-tinta/30'
                              }`}
                            >
                              {d.nombre}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {errorAsignacion && <p className="font-lora text-rojo text-sm">{errorAsignacion}</p>}

                    <button
                      onClick={asignarRol}
                      disabled={asignando}
                      className="font-lora text-xs tracking-widest py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
                    >
                      {asignando ? 'PROCESANDO…' : 'ASIGNAR ROL DE STAFF'}
                    </button>
                  </>
                )}
              </>
            )
          ) : (
            creadoOk ? (
              <div className="text-center py-6">
                <p className="font-lora text-sm text-tinta mb-4">✓ Usuario creado. Puede ingresar con su email y DNI como contraseña.</p>
                <button onClick={onSuccess} className="font-lora text-xs tracking-widest px-5 py-3 bg-oro text-papel">CERRAR</button>
              </div>
            ) : (
              <>
                {[
                  { label: 'NOMBRE COMPLETO', value: nombre, set: setNombre, placeholder: 'Juan Pérez' },
                  { label: 'EMAIL', value: email, set: setEmail, placeholder: 'juan@ejemplo.com', type: 'email' },
                  { label: 'DNI', value: dni, set: setDni, placeholder: '12345678' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">{f.label}</label>
                    <input
                      type={f.type ?? 'text'}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full font-lora text-sm text-tinta bg-transparent border-b border-tinta/30 py-2 outline-none focus:border-oro transition-colors"
                    />
                  </div>
                ))}

                <div>
                  <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">ROL</label>
                  <div className="flex flex-wrap gap-2">
                    {ROLES_STAFF.map(r => (
                      <button
                        key={r}
                        onClick={() => setRolNuevo(r)}
                        className={`font-lora text-xs tracking-widest px-4 py-2 border transition-colors ${
                          rolNuevo === r ? 'bg-oro border-oro text-papel' : 'border-gris-claro text-tinta/50 hover:border-tinta/40'
                        }`}
                      >
                        {ROL_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DIVISIONES</label>
                  <div className="flex flex-wrap gap-2">
                    {divisiones.map(d => {
                      const sel = divsNuevo.includes(d.id)
                      return (
                        <button
                          key={d.id}
                          onClick={() => toggleDiv(d.id, divsNuevo, setDivsNuevo)}
                          className={`font-lora text-xs tracking-widest px-3 py-1.5 border transition-colors ${
                            sel ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-tinta/40 hover:border-tinta/30'
                          }`}
                        >
                          {d.nombre}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {errorCrear && <p className="font-lora text-rojo text-sm">{errorCrear}</p>}

                <button
                  onClick={crearUsuario}
                  disabled={creando}
                  className="font-lora text-xs tracking-widest py-3 bg-oro text-papel hover:bg-oro/90 transition-colors disabled:opacity-50"
                >
                  {creando ? 'PROCESANDO…' : 'CREAR USUARIO'}
                </button>
              </>
            )
          )}
        </div>
      </div>
    </div>
  )
}
