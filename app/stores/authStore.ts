import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { Rol } from '@/constants/roles'

interface AuthState {
  session: Session | null
  rol: Rol | null
  loading: boolean
  setSession: (session: Session | null) => void
  setRol: (rol: Rol | null) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  rol: null,
  loading: true,
  setSession: (session) => set({ session, loading: false }),
  setRol: (rol) => set({ rol }),
  clearAuth: () => set({ session: null, rol: null, loading: false }),
}))
