import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { Rol } from '@/constants/roles'

interface AuthState {
  session: Session | null
  rol: Rol | null
  roles: Rol[]
  loading: boolean
  isPasswordRecovery: boolean
  isNuevoUsuario: boolean
  setSession: (session: Session | null) => void
  setRol: (rol: Rol | null) => void
  setRoles: (roles: Rol[]) => void
  setRolActivo: (rol: Rol) => void
  clearAuth: () => void
  setPasswordRecovery: (v: boolean) => void
  setNuevoUsuario: (v: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  rol: null,
  roles: [],
  loading: true,
  isPasswordRecovery: false,
  isNuevoUsuario: false,
  setSession: (session) => set({ session, loading: false }),
  setRol: (rol) => set({ rol }),
  setRoles: (roles) => set({ roles }),
  // setRolActivo actualiza rol activo localmente; la llamada a DB se hace desde SobreScreen
  setRolActivo: (rol) => set({ rol }),
  clearAuth: () => set({ session: null, rol: null, roles: [], loading: false, isPasswordRecovery: false, isNuevoUsuario: false }),
  setPasswordRecovery: (v) => set({ isPasswordRecovery: v }),
  setNuevoUsuario: (v) => set({ isNuevoUsuario: v }),
}))
