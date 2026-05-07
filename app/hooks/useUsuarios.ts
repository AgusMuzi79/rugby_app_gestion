import { useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'

export type RolCreable = 'coordinador' | 'entrenador' | 'manager'
export type PasoUsuarios = 'lista' | 'detalle'

export interface Usuario {
  id:         string
  nombre:     string
  rol:        string
  activo:     boolean
  divisiones: string[] | null
}

export interface DivisionOpcion {
  id:     string
  nombre: string
}

const ROL_LABEL: Record<string, string> = {
  subcomision: 'Subcomisión',
  coordinador: 'Coordinador',
  entrenador:  'Entrenador',
  manager:     'Manager',
  admin:       'Admin',
}

export function rolLabel(rol: string): string {
  return ROL_LABEL[rol] ?? rol
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUsuarios() {
  // Lista
  const [loading, setLoading]   = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [divisiones, setDivisiones] = useState<DivisionOpcion[]>([])

  // Detalle
  const [paso, setPaso]                             = useState<PasoUsuarios>('lista')
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<Usuario | null>(null)
  const [cambiandoEstado, setCambiandoEstado]       = useState(false)
  const [estadoCambiadoOk, setEstadoCambiadoOk]     = useState(false)
  const [errorEstado, setErrorEstado]               = useState<string | null>(null)

  // Modal nuevo usuario
  const [modalVisible, setModalVisible]                 = useState(false)
  const [nombre, setNombre]                             = useState('')
  const [email, setEmail]                               = useState('')
  const [rolSeleccionado, setRolSeleccionado]           = useState<RolCreable | null>(null)
  const [divisionesSeleccionadas, setDivisionesSeleccionadas] = useState<string[]>([])
  const [creando, setCreando]                           = useState(false)
  const [creadoOk, setCreadoOk]                         = useState(false)
  const [errorForm, setErrorForm]                       = useState<string | null>(null)

  useEffect(() => {
    fetchTodo()
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchUsuarios()
    }, []),
  )

  // ─── Carga ───────────────────────────────────────────────────────────────

  async function fetchTodo() {
    setLoading(true)
    await Promise.all([fetchUsuarios(), fetchDivisiones()])
    setLoading(false)
  }

  async function fetchUsuarios() {
    const { data } = await supabase
      .from('profiles')
      .select('id, nombre, rol, activo, divisiones')
      .order('nombre')
    setUsuarios(data ?? [])
  }

  async function fetchDivisiones() {
    const { data } = await supabase
      .from('divisiones')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre')
    setDivisiones(data ?? [])
  }

  // ─── Navegación ──────────────────────────────────────────────────────────

  function seleccionarUsuario(u: Usuario) {
    setUsuarioSeleccionado(u)
    setEstadoCambiadoOk(false)
    setErrorEstado(null)
    setPaso('detalle')
  }

  function volverALista() {
    setPaso('lista')
    setUsuarioSeleccionado(null)
  }

  // ─── Modal ───────────────────────────────────────────────────────────────

  function abrirModal() {
    setNombre('')
    setEmail('')
    setRolSeleccionado(null)
    setDivisionesSeleccionadas([])
    setErrorForm(null)
    setCreadoOk(false)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
    setCreadoOk(false)
    setErrorForm(null)
  }

  function toggleDivision(divId: string) {
    setDivisionesSeleccionadas(prev =>
      prev.includes(divId) ? prev.filter(id => id !== divId) : [...prev, divId],
    )
  }

  // ─── Crear usuario ────────────────────────────────────────────────────────

  async function crearUsuario() {
    const nombreTrim = nombre.trim()
    const emailTrim  = email.trim().toLowerCase()

    if (!nombreTrim)                                  { setErrorForm('Ingresá el nombre completo.'); return }
    if (!emailTrim)                                   { setErrorForm('Ingresá el email.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErrorForm('El email no es válido.'); return }
    if (!rolSeleccionado)                             { setErrorForm('Seleccioná un rol.'); return }

    setCreando(true)
    setErrorForm(null)

    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: {
        action:     'create',
        nombre:     nombreTrim,
        email:      emailTrim,
        rol:        rolSeleccionado,
        divisiones: divisionesSeleccionadas,
      },
    })

    if (error || data?.error) {
      setErrorForm(data?.error ?? error?.message ?? 'Error al crear el usuario.')
      setCreando(false)
      return
    }

    await fetchUsuarios()
    setCreadoOk(true)
    setCreando(false)
  }

  // ─── Cambiar estado ───────────────────────────────────────────────────────

  async function cambiarEstado(accion: 'deactivate' | 'reactivate') {
    if (!usuarioSeleccionado) return
    setCambiandoEstado(true)
    setErrorEstado(null)
    setEstadoCambiadoOk(false)

    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { action: accion, userId: usuarioSeleccionado.id },
    })

    if (error || data?.error) {
      setErrorEstado(data?.error ?? error?.message ?? 'Error al cambiar estado.')
      setCambiandoEstado(false)
      return
    }

    const activoNuevo = accion === 'reactivate'
    setUsuarioSeleccionado(prev => prev ? { ...prev, activo: activoNuevo } : prev)
    setUsuarios(prev =>
      prev.map(u => u.id === usuarioSeleccionado.id ? { ...u, activo: activoNuevo } : u),
    )
    setEstadoCambiadoOk(true)
    setCambiandoEstado(false)
  }

  return {
    loading,
    usuarios,
    divisiones,
    paso,
    usuarioSeleccionado,
    cambiandoEstado,
    estadoCambiadoOk,
    errorEstado,
    seleccionarUsuario,
    volverALista,
    cambiarEstado,
    modalVisible,
    abrirModal,
    cerrarModal,
    nombre,             setNombre,
    email,              setEmail,
    rolSeleccionado,    setRolSeleccionado,
    divisionesSeleccionadas,
    toggleDivision,
    creando,
    creadoOk,
    errorForm,
    crearUsuario,
  }
}
