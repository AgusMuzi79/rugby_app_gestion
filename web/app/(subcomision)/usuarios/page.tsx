'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { callEdgeFunction } from '@/lib/edgeFunction'
import { mensajeErrorCarga, primerError } from '@/lib/errorCarga'
import { rolStaffDe, reemplazarRolStaff, rolesParaEditar, rolesParaCrear, esRolSoloWeb } from '@/lib/rolesStaff'
import ErrorCarga from '@/components/ErrorCarga'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const ROLES_SUBCO  = ['coordinador', 'entrenador', 'manager', 'subcomision']
// Colaborador (auditoría entrenador T23): sólo toma asistencia; divisiones
// como un entrenador. Desde 2026-11-10 lo designa el entrenador desde la app;
// acá sólo admin lo pone o lo quita (guard_profile_role_update,
// 20261112000000). EDITAR ROL de subcomisión reemplaza sólo el rol de staff que
// gestiona (reemplazarRolStaff), así que un colaborador que la cuenta ya tenga
// queda en roles[].
// beneficios: rol solo web (panel del club de beneficios), sólo lo da admin.
// Se asigna a un socio existente y se suma a sus roles (no reemplaza otro).
const ROLES_ADMIN  = [...ROLES_SUBCO, 'colaborador', 'secretaria', 'porteria', 'canchero', 'buffet', 'beneficios']
const ROL_LABEL: Record<string, string> = {
  subcomision: 'Subcomisión', coordinador: 'Coordinador',
  entrenador: 'Entrenador', colaborador: 'Colaborador', manager: 'Manager',
  secretaria: 'Secretaría', porteria: 'Gimnasio', canchero: 'Canchero', buffet: 'Buffet',
  beneficios: 'Beneficios',
}

interface Division { id: string; nombre: string; deporte: string }

const DEPORTE_LABEL: Record<string, string> = {
  rugby:  'Rugby',
  hockey: 'Hockey',
  tenis:  'Tenis',
}
const DEPORTE_ORDEN = ['rugby', 'hockey', 'tenis']

// Disciplina de una cuenta de subcomisión — null = general (ve todo el
// club, comportamiento de siempre). Sólo admin puede asignarla/cambiarla
// (ver guard_profile_role_update, migración 20260914000000).
const DEPORTE_SUBCO_OPCIONES: { value: string | null; label: string }[] = [
  { value: null,     label: 'Todas (general)' },
  { value: 'rugby',  label: 'Rugby' },
  { value: 'hockey', label: 'Hockey' },
  { value: 'tenis',  label: 'Tenis' },
]

function agruparPorDeporte(divisiones: Division[]) {
  const grupos = new Map<string, Division[]>()
  for (const d of divisiones) {
    const lista = grupos.get(d.deporte) ?? []
    lista.push(d)
    grupos.set(d.deporte, lista)
  }
  return [...grupos.entries()].sort(([a], [b]) => {
    const ia = DEPORTE_ORDEN.indexOf(a)
    const ib = DEPORTE_ORDEN.indexOf(b)
    return (ia === -1 ? DEPORTE_ORDEN.length : ia) - (ib === -1 ? DEPORTE_ORDEN.length : ib)
  })
}

function DivisionesPillSelector({
  divisiones, seleccionadas, onToggle,
}: {
  divisiones: Division[]
  seleccionadas: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {agruparPorDeporte(divisiones).map(([deporte, items]) => (
        <div key={deporte}>
          <p className="font-lora text-[11px] tracking-widest text-texto-2 uppercase mb-1.5">{DEPORTE_LABEL[deporte] ?? deporte}</p>
          <div className="flex flex-wrap gap-2">
            {items.map(d => {
              const sel = seleccionadas.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => onToggle(d.id)}
                  className={`font-lora text-xs tracking-widest px-3 py-1.5 border transition-colors ${
                    sel ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-texto-2 hover:border-tinta/30'
                  }`}
                >
                  {d.nombre}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

interface ProfileRow {
  id: string; nombre: string; rol: string; roles?: string[] | null
  divisiones: string[]; activo?: boolean; deporte?: string | null
  email?: string; loadingEmail?: boolean
  expanded?: boolean; editingRol?: boolean; editingDiv?: boolean
  tempRol?: string; tempDiv?: string[]
}

type ModoModal = 'asignar' | 'crear'

// ─── Página ───────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const [profiles, setProfiles]     = useState<ProfileRow[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  // Resultado de la última acción: los errores se anuncian (role="alert").
  const [aviso, setAviso]           = useState<{ tipo: 'error' | 'ok'; texto: string } | null>(null)

  const rolesDisponibles = isAdmin ? ROLES_ADMIN : ROLES_SUBCO
  const avisarError = (texto: string) => setAviso({ tipo: 'error', texto })

  // Se lista por roles[] (no por el rol activo): un staff que está en
  // "vista socio" (rol = 'socio') sigue apareciendo. Las cuentas admin no.
  // También por rol, por si quedó un perfil viejo con roles[] sin el rol activo.
  const fetchData = useCallback(async (admin: boolean) => {
    setErrorCarga(null)
    const staff = (admin ? ROLES_ADMIN : ROLES_SUBCO).join(',')
    const [profsRes, divsRes] = await Promise.all([
      supabase.from('profiles').select('id, nombre, rol, roles, divisiones, deporte, activo')
        .or(`roles.ov.{${staff}},rol.in.(${staff})`)
        .not('roles', 'cs', '{admin}')
        .order('nombre'),
      supabase.from('divisiones').select('id, nombre, deporte').order('nombre'),
    ])
    const error = primerError(profsRes.error, divsRes.error)
    if (error) setErrorCarga(mensajeErrorCarga('los usuarios', error))
    else {
      setProfiles(profsRes.data ?? [])
      setDivisiones(divsRes.data ?? [])
    }
    setLoading(false)
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { await fetchData(false); return }
    // Si falla el propio perfil se muestra el error: un admin no tiene que
    // caer en silencio a la vista de subcomisión (lista y roles recortados).
    const { data: prof, error } = await supabase.from('profiles').select('rol').eq('id', session.user.id).maybeSingle()
    if (error) {
      setErrorCarga(mensajeErrorCarga('tu perfil', error))
      setLoading(false)
      return
    }
    const admin = prof?.rol === 'admin'
    setIsAdmin(admin)
    await fetchData(admin)
  }, [fetchData])

  useEffect(() => { void cargar() }, [cargar])

  const getEmail = async (id: string) => {
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, loadingEmail: true } : p))
    try {
      const json = await callEdgeFunction<{ email?: string }>('admin-usuarios', { action: 'getUser', userId: id })
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

  // UPDATE de profiles que avisa si falló o si la RLS no dejó tocar la fila.
  const actualizarPerfil = async (id: string, cambios: Record<string, unknown>, que: string): Promise<boolean> => {
    setAviso(null)
    const { data, error } = await supabase.from('profiles').update(cambios).eq('id', id).select('id')
    if (error) { avisarError(`No se pudo guardar ${que}: ${error.message}`); return false }
    if (!data || data.length === 0) { avisarError(`No se guardó ${que}: no tenés permiso sobre esta cuenta.`); return false }
    return true
  }

  const saveRol = async (p: ProfileRow) => {
    const viejo = rolStaffDe(p.rol, p.roles, rolesDisponibles)
    const cerrar = () => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingRol: false } : r))
    if (!p.tempRol || !viejo || p.tempRol === viejo) { cerrar(); return }
    const cambio = reemplazarRolStaff({ rol: p.rol, roles: p.roles }, viejo, p.tempRol)
    if (!await actualizarPerfil(p.id, cambio, 'el rol')) return
    setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, ...cambio, editingRol: false } : r))
  }

  const saveDeporte = async (p: ProfileRow, deporte: string | null) => {
    if (!await actualizarPerfil(p.id, { deporte }, 'la disciplina')) return
    setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, deporte } : r))
  }

  const saveDiv = async (p: ProfileRow) => {
    if (!await actualizarPerfil(p.id, { divisiones: p.tempDiv ?? [] }, 'las divisiones')) return
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
    setAviso(null)
    const json = await callEdgeFunction('admin-usuarios', { action: 'delete', userId: id })
    if (json.error) { avisarError(`No se pudo eliminar a ${nombre}: ${json.error}`); return }
    setProfiles(ps => ps.filter(p => p.id !== id))
    setAviso({ tipo: 'ok', texto: `${nombre} fue eliminado.` })
  }

  // Cuenta de socio con rol de staff: se le saca el rol y vuelve a su vista de
  // socio. La cuenta no se elimina (arrastraría su socio, cuotas y pagos).
  const quitarRol = async (id: string, nombre: string) => {
    if (!confirm(`¿Quitarle el rol de staff a ${nombre}? Su cuenta de socio sigue igual.`)) return
    setAviso(null)
    const json = await callEdgeFunction('admin-usuarios', { action: 'remove-role', userId: id })
    if (json.error) { avisarError(`No se pudo quitar el rol a ${nombre}: ${json.error}`); return }
    setProfiles(ps => ps.filter(p => p.id !== id))
    setAviso({ tipo: 'ok', texto: `${nombre} ya no tiene rol de staff.` })
  }

  // Un solo botón: DESACTIVAR si la cuenta está activa, REACTIVAR si no.
  const alternarActivo = async (p: ProfileRow) => {
    const desactivando = p.activo !== false
    if (desactivando && !confirm(`¿Desactivar a ${p.nombre}?`)) return
    setAviso(null)
    const json = await callEdgeFunction('admin-usuarios', { action: desactivando ? 'deactivate' : 'reactivate', userId: p.id })
    if (json.error) { avisarError(`No se pudo ${desactivando ? 'desactivar' : 'reactivar'} a ${p.nombre}: ${json.error}`); return }
    setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, activo: !desactivando } : r))
    setAviso({ tipo: 'ok', texto: `${p.nombre} fue ${desactivando ? 'desactivado' : 'reactivado'}.` })
  }

  const getNombreDivision = (id: string) => divisiones.find(d => d.id === id)?.nombre ?? id

  const rolDe = (p: ProfileRow) => rolStaffDe(p.rol, p.roles, rolesDisponibles) ?? p.rol

  const q = busqueda.toLowerCase()
  const filtrados = profiles.filter(p => {
    const rol = rolDe(p)
    return p.nombre?.toLowerCase().includes(q) ||
      rol.toLowerCase().includes(q) ||
      (ROL_LABEL[rol] ?? '').toLowerCase().includes(q)
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="font-lora text-texto-2 tracking-widest text-sm">CARGANDO…</p>
    </div>
  )

  if (errorCarga) return (
    <div>
      <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">SUBCOMISIÓN · USUARIOS</p>
      <h1 className="font-playfair italic text-4xl text-tinta mb-8">Gestión de Usuarios</h1>
      <ErrorCarga mensaje={errorCarga} onReintentar={() => void cargar()} />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">SUBCOMISIÓN · USUARIOS</p>
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
        aria-label="Buscar usuarios por nombre o rol"
        placeholder="Buscar por nombre o rol…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="font-lora text-sm text-tinta bg-card border border-borde-control px-4 py-2 w-full max-w-sm outline-none focus:border-tinta transition-colors mb-6"
      />

      {aviso && (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={`font-lora text-sm mb-4 ${aviso.tipo === 'error' ? 'text-rojo-texto' : 'text-tinta'}`}
        >
          {aviso.texto}
        </p>
      )}

      {/* Lista */}
      <div className="flex flex-col gap-2">
        {filtrados.map(p => (
          <div key={p.id} className="bg-card border border-gris-claro">
            <button
              type="button"
              aria-expanded={!!p.expanded}
              onClick={() => toggleExpand(p.id)}
              className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-papel/50 transition-colors"
            >
              <div className="flex items-center gap-6">
                <span className="font-playfair text-lg font-bold text-tinta">{p.nombre}</span>
                <span className="font-lora text-xs tracking-widest text-tinta/50 bg-gris-claro px-2 py-1 uppercase">
                  {ROL_LABEL[rolDe(p)] ?? rolDe(p)}
                </span>
                {p.activo === false && (
                  <span className="font-lora text-xs tracking-widest text-rojo-texto border border-rojo px-2 py-1">
                    DESACTIVADO
                  </span>
                )}
              </div>
              <span className="font-lora text-xs text-texto-2">{p.expanded ? '▲' : '▼'}</span>
            </button>

            {p.expanded && (
              <div className="px-6 pb-6 border-t border-gris-claro">
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <p className="font-lora text-xs tracking-widest text-texto-2 mb-1">EMAIL</p>
                    <p className="font-lora text-sm text-tinta">{p.loadingEmail ? 'Cargando…' : (p.email ?? '—')}</p>
                  </div>
                  <div>
                    {p.editingRol ? (
                      <label htmlFor={`rol-${p.id}`} className="block font-lora text-xs tracking-widest text-texto-2 mb-2">ROL</label>
                    ) : (
                      <p className="font-lora text-xs tracking-widest text-texto-2 mb-2">ROL</p>
                    )}
                    {p.editingRol ? (
                      <div className="flex items-center gap-2">
                        {/* Sin outline-none: el foco usa el :focus-visible global. */}
                        <select
                          id={`rol-${p.id}`}
                          value={p.tempRol ?? rolDe(p)}
                          onChange={e => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, tempRol: e.target.value } : r))}
                          className="font-lora text-sm text-tinta bg-papel border border-borde-control px-2 py-1 focus:border-oro"
                        >
                          {rolesParaEditar(rolesDisponibles, rolDe(p)).map(r => <option key={r} value={r}>{ROL_LABEL[r] ?? r}</option>)}
                        </select>
                        <button onClick={() => saveRol(p)} className="font-lora text-xs bg-oro text-papel px-3 py-1 tracking-widest">GUARDAR</button>
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingRol: false } : r))} className="font-lora text-xs text-texto-2 px-2 py-1">CANCELAR</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-lora text-sm text-tinta">{ROL_LABEL[rolDe(p)] ?? rolDe(p)}</span>
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingRol: true, tempRol: rolDe(r) } : r))} className="font-lora text-xs text-oro tracking-widest hover:underline">EDITAR</button>
                      </div>
                    )}
                  </div>
                  {isAdmin && rolDe(p) === 'subcomision' && (
                    <div className="col-span-2">
                      <p className="font-lora text-xs tracking-widest text-texto-2 mb-2">DISCIPLINA</p>
                      <div className="flex flex-wrap gap-2">
                        {DEPORTE_SUBCO_OPCIONES.map(o => (
                          <button
                            key={o.label}
                            type="button"
                            aria-pressed={(p.deporte ?? null) === o.value}
                            onClick={() => saveDeporte(p, o.value)}
                            className={`font-lora text-xs tracking-widest px-3 py-1.5 border transition-colors ${
                              (p.deporte ?? null) === o.value ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-texto-2 hover:border-tinta/30'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="font-lora text-xs tracking-widest text-texto-2 mb-2">DIVISIONES</p>
                    {p.editingDiv ? (
                      <div>
                        <div className="flex flex-col gap-3 mb-3">
                          {agruparPorDeporte(divisiones).map(([deporte, items]) => (
                            <div key={deporte}>
                              <p className="font-lora text-[11px] tracking-widest text-texto-2 uppercase mb-1.5">{DEPORTE_LABEL[deporte] ?? deporte}</p>
                              <div className="grid grid-cols-3 gap-2">
                                {items.map(d => {
                                  const selected = (p.tempDiv ?? p.divisiones ?? []).includes(d.id)
                                  return (
                                    <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                                      <input type="checkbox" checked={selected} onChange={() => toggleDivision(p.id, d.id)} className="accent-oro" />
                                      <span className="font-lora text-xs text-tinta">{d.nombre}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveDiv(p)} className="font-lora text-xs bg-oro text-papel px-3 py-1 tracking-widest">GUARDAR</button>
                          <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingDiv: false } : r))} className="font-lora text-xs text-texto-2 px-2 py-1">CANCELAR</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-wrap">
                        {(p.divisiones ?? []).length === 0
                          ? <span className="font-lora text-sm text-texto-2">Sin divisiones</span>
                          : (p.divisiones ?? []).map(id => (
                              <span key={id} className="font-lora text-xs bg-gris-claro text-tinta px-2 py-1">{getNombreDivision(id)}</span>
                            ))
                        }
                        <button onClick={() => setProfiles(ps => ps.map(r => r.id === p.id ? { ...r, editingDiv: true, tempDiv: [...(r.divisiones ?? [])] } : r))} className="font-lora text-xs text-oro tracking-widest hover:underline">EDITAR</button>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 flex gap-3 pt-2 border-t border-gris-claro">
                    {p.activo === false ? (
                      <button onClick={() => alternarActivo(p)} className="font-lora text-xs tracking-widest text-tinta border border-gris-claro px-4 py-2 hover:border-tinta transition-colors">REACTIVAR</button>
                    ) : (
                      <button onClick={() => alternarActivo(p)} className="font-lora text-xs tracking-widest text-rojo-texto border border-rojo px-4 py-2 hover:bg-rojo hover:text-white transition-colors">DESACTIVAR</button>
                    )}
                    {(p.roles ?? []).includes('socio') ? (
                      <button onClick={() => quitarRol(p.id, p.nombre)} className="ml-auto font-lora text-xs tracking-widest text-tinta/60 border border-gris-claro px-4 py-2 hover:border-tinta transition-colors">QUITAR ROL DE STAFF</button>
                    ) : isAdmin && (
                      <button onClick={() => eliminar(p.id, p.nombre)} className="ml-auto font-lora text-xs tracking-widest text-rojo-texto border border-rojo px-4 py-2 hover:bg-rojo hover:text-white transition-colors">ELIMINAR</button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="font-lora text-texto-2 text-sm text-center py-12">Sin resultados.</p>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalNuevoUsuario
          divisiones={divisiones}
          isAdmin={isAdmin}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); void fetchData(isAdmin) }}
        />
      )}
    </div>
  )
}

// ─── Modal nuevo usuario ──────────────────────────────────────────────────────

function ModalNuevoUsuario({
  divisiones, isAdmin, onClose, onSuccess,
}: {
  divisiones: Division[]
  isAdmin: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const rolesDisponibles = isAdmin ? ROLES_ADMIN : ROLES_SUBCO

  const [modo, setModo] = useState<ModoModal>('asignar')

  // Asignar rol a socio existente
  const [busqueda, setBusqueda]               = useState('')
  const [buscando, setBuscando]               = useState(false)
  const [resultados, setResultados]           = useState<{ id: string; nombre: string }[]>([])
  const [socioElegido, setSocioElegido]       = useState<{ id: string; nombre: string } | null>(null)
  const [errorBusqueda, setErrorBusqueda]     = useState('')
  const [rolAsignacion, setRolAsignacion]     = useState('')
  const [divsAsignacion, setDivsAsignacion]   = useState<string[]>([])
  const [deporteAsignacion, setDeporteAsignacion] = useState<string | null>(null)
  const [asignando, setAsignando]             = useState(false)
  const [asignadoOk, setAsignadoOk]           = useState(false)
  const [errorAsignacion, setErrorAsignacion] = useState('')

  // Crear nuevo usuario
  const [nombre, setNombre]           = useState('')
  const [email, setEmail]             = useState('')
  const [dni, setDni]                 = useState('')
  const [rolNuevo, setRolNuevo]       = useState('')
  const [divsNuevo, setDivsNuevo]     = useState<string[]>([])
  const [deporteNuevo, setDeporteNuevo] = useState<string | null>(null)
  const [creando, setCreando]         = useState(false)
  const [creadoOk, setCreadoOk]       = useState(false)
  const [errorCrear, setErrorCrear]   = useState('')

  const buscarSocio = async () => {
    const q = busqueda.trim()
    if (!q) { setErrorBusqueda('Ingresá un DNI o nombre.'); return }
    setBuscando(true); setErrorBusqueda(''); setSocioElegido(null); setResultados([])
    const esDni = /^\d+$/.test(q)

    if (esDni) {
      const { data, error } = await supabase
        .from('socios')
        .select('id, profiles!socios_profile_id_fkey(nombre)')
        .eq('dni', q)
        .maybeSingle()
      const nombre = (data?.profiles as { nombre?: string } | null)?.nombre
      if (!data || !nombre) {
        setErrorBusqueda('No se encontró ningún socio con ese DNI.')
      } else {
        setSocioElegido({ id: data.id, nombre })
      }
    } else {
      // buscar_socios_por_nombre — RPC que matchea cada palabra en cualquier
      // orden e ignora tildes (unaccent), a diferencia del ILIKE simple que
      // esto reemplaza (ver project-bug-busqueda-socio-usuarios en memoria).
      const { data } = await supabase.rpc('buscar_socios_por_nombre', { q })
      if (!data || data.length === 0) {
        setErrorBusqueda('No se encontraron socios con ese nombre.')
      } else {
        const results = data.map((r: { id: string; nombre: string }) => ({ id: r.id, nombre: r.nombre }))
        if (results.length === 1) setSocioElegido(results[0])
        else setResultados(results)
      }
    }
    setBuscando(false)
  }

  const asignarRol = async () => {
    if (!socioElegido) { setErrorAsignacion('Buscá el socio primero.'); return }
    if (!rolAsignacion) { setErrorAsignacion('Seleccioná un rol.'); return }
    setAsignando(true); setErrorAsignacion('')
    const json = await callEdgeFunction('admin-usuarios', {
      action: 'assign-role', socioId: socioElegido.id,
      nuevoRol: rolAsignacion, divisiones: esRolSoloWeb(rolAsignacion) ? [] : divsAsignacion, deporte: deporteAsignacion,
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
      dni: dni.trim(), rol: rolNuevo, divisiones: divsNuevo, deporte: deporteNuevo,
    })
    setCreando(false)
    if (json.error) { setErrorCrear(json.error); return }
    setCreadoOk(true)
  }

  const toggleDiv = (id: string, sel: string[], set: (v: string[]) => void) =>
    set(sel.includes(id) ? sel.filter(d => d !== id) : [...sel, id])

  return (
    <Modal
      titulo="NUEVO USUARIO STAFF"
      onClose={onClose}
      ancho="max-w-lg"
      relleno="p-0"
      encabezado="flex justify-between items-center px-8 py-6 border-b border-gris-claro"
    >
      {/* Tabs — solo admin puede crear usuarios nuevos */}
      {isAdmin && (
        <div role="tablist" aria-label="Cómo dar de alta" className="flex border-b border-gris-claro">
          {(['asignar', 'crear'] as ModoModal[]).map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`flex-1 font-lora text-xs tracking-widest py-3 transition-colors ${
                modo === m
                  ? 'text-oro border-b-2 border-oro'
                  : 'text-texto-2 hover:text-tinta/60'
              }`}
            >
              {m === 'asignar' ? 'DESDE SOCIO EXISTENTE' : 'NUEVO USUARIO'}
            </button>
          ))}
        </div>
      )}

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
                <label htmlFor="asignar-busqueda" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DNI O NOMBRE DEL SOCIO</label>
                <div className="flex gap-2">
                  <input
                    id="asignar-busqueda"
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarSocio()}
                    placeholder="12345678 o Juan Pérez"
                    className="flex-1 font-lora text-sm text-tinta bg-transparent border-b border-borde-control py-2 outline-none focus:border-oro transition-colors"
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

              {errorBusqueda && <p role="alert" className="font-lora text-rojo-texto text-sm">{errorBusqueda}</p>}

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
                      <span className="text-texto-2">›</span>
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

                  <div role="group" aria-labelledby="asignar-rol">
                    <p id="asignar-rol" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">ROL A ASIGNAR</p>
                    <div className="flex flex-wrap gap-2">
                      {rolesDisponibles.map(r => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={rolAsignacion === r}
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

                  {isAdmin && rolAsignacion === 'subcomision' && (
                    <div role="group" aria-labelledby="asignar-disciplina">
                      <p id="asignar-disciplina" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DISCIPLINA</p>
                      <div className="flex flex-wrap gap-2">
                        {DEPORTE_SUBCO_OPCIONES.map(o => (
                          <button
                            key={o.label}
                            type="button"
                            aria-pressed={deporteAsignacion === o.value}
                            onClick={() => setDeporteAsignacion(o.value)}
                            className={`font-lora text-xs tracking-widest px-3 py-1.5 border transition-colors ${
                              deporteAsignacion === o.value ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-texto-2 hover:border-tinta/30'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {esRolSoloWeb(rolAsignacion) ? (
                    <p className="font-lora text-xs text-texto-2 italic">
                      Se suma a los roles de la cuenta: sigue usando la app como socio y entra al panel web de Beneficios.
                    </p>
                  ) : (
                    <div role="group" aria-labelledby="asignar-divisiones">
                      <p id="asignar-divisiones" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DIVISIONES</p>
                      <DivisionesPillSelector
                        divisiones={divisiones}
                        seleccionadas={divsAsignacion}
                        onToggle={id => toggleDiv(id, divsAsignacion, setDivsAsignacion)}
                      />
                    </div>
                  )}

                  {errorAsignacion && <p role="alert" className="font-lora text-rojo-texto text-sm">{errorAsignacion}</p>}

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
                { id: 'nuevo-nombre', label: 'NOMBRE COMPLETO', value: nombre, set: setNombre, placeholder: 'Juan Pérez' },
                { id: 'nuevo-email', label: 'EMAIL', value: email, set: setEmail, placeholder: 'juan@ejemplo.com', type: 'email' },
                { id: 'nuevo-dni', label: 'DNI', value: dni, set: setDni, placeholder: '12345678' },
              ].map(f => (
                <div key={f.label}>
                  <label htmlFor={f.id} className="font-lora text-xs tracking-widest text-tinta/50 block mb-1">{f.label}</label>
                  <input
                    id={f.id}
                    type={f.type ?? 'text'}
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full font-lora text-sm text-tinta bg-transparent border-b border-borde-control py-2 outline-none focus:border-oro transition-colors"
                  />
                </div>
              ))}

              <div role="group" aria-labelledby="nuevo-rol">
                <p id="nuevo-rol" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">ROL</p>
                <div className="flex flex-wrap gap-2">
                  {rolesParaCrear(rolesDisponibles).map(r => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={rolNuevo === r}
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

              {isAdmin && rolNuevo === 'subcomision' && (
                <div role="group" aria-labelledby="nuevo-disciplina">
                  <p id="nuevo-disciplina" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DISCIPLINA</p>
                  <div className="flex flex-wrap gap-2">
                    {DEPORTE_SUBCO_OPCIONES.map(o => (
                      <button
                        key={o.label}
                        type="button"
                        aria-pressed={deporteNuevo === o.value}
                        onClick={() => setDeporteNuevo(o.value)}
                        className={`font-lora text-xs tracking-widest px-3 py-1.5 border transition-colors ${
                          deporteNuevo === o.value ? 'bg-oro/20 border-oro text-tinta' : 'border-gris-claro text-texto-2 hover:border-tinta/30'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div role="group" aria-labelledby="nuevo-divisiones">
                <p id="nuevo-divisiones" className="font-lora text-xs tracking-widest text-tinta/50 block mb-2">DIVISIONES</p>
                <DivisionesPillSelector
                  divisiones={divisiones}
                  seleccionadas={divsNuevo}
                  onToggle={id => toggleDiv(id, divsNuevo, setDivsNuevo)}
                />
              </div>

              {errorCrear && <p role="alert" className="font-lora text-rojo-texto text-sm">{errorCrear}</p>}

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
    </Modal>
  )
}
