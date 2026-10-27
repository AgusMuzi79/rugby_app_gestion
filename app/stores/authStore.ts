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
  // True while app/(auth)/registro-tutor.tsx is open: a screen that works
  // without a session, so the root guard must not redirect it to the login.
  registroSinSesion: boolean
  // Por qué la persona volvió (o quedó) en el login: el perfil no cargó, etc.
  // La pantalla de login lo muestra en su banner de error.
  avisoAuth: string | null
  setAvisoAuth: (aviso: string | null) => void
  setSession: (session: Session | null) => void
  setRol: (rol: Rol | null) => void
  setRoles: (roles: Rol[]) => void
  setRolActivo: (rol: Rol) => void
  clearAuth: () => void
  setPasswordRecovery: (v: boolean) => void
  setNuevoUsuario: (v: boolean) => void
  setRegistroSinSesion: (v: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  rol: null,
  roles: [],
  loading: true,
  isPasswordRecovery: false,
  isNuevoUsuario: false,
  registroSinSesion: false,
  avisoAuth: null,
  setAvisoAuth: (avisoAuth) => set({ avisoAuth }),
  setSession: (session) => set({ session, loading: false }),
  setRol: (rol) => set({ rol }),
  setRoles: (roles) => set({ roles }),
  // setRolActivo actualiza rol activo localmente; la llamada a DB se hace desde SobreScreen
  setRolActivo: (rol) => set({ rol }),
  clearAuth: () => set({ session: null, rol: null, roles: [], loading: false, isPasswordRecovery: false, isNuevoUsuario: false }),
  setPasswordRecovery: (v) => set({ isPasswordRecovery: v }),
  setNuevoUsuario: (v) => set({ isNuevoUsuario: v }),
  setRegistroSinSesion: (v) => set({ registroSinSesion: v }),
}))
