// Nombre + foto del usuario logueado para el avatar del Header (T7). El Header
// se monta en cada pantalla, así que se carga una sola vez por usuario (y se
// renueva cuando vence la URL firmada); useSobre lo actualiza al cargar el
// perfil y al cambiar nombre o foto, sin pedidos extra.

import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { avatarVencido } from './perfilAvatar'

interface PerfilAvatarState {
  userId:    string | null
  nombre:    string
  fotoUrl:   string | null
  cargadoAt: number | null
  cargando:  boolean
  setAvatar: (userId: string, datos: { nombre?: string; fotoUrl?: string | null }) => void
}

export const usePerfilAvatarStore = create<PerfilAvatarState>((set, get) => ({
  userId:    null,
  nombre:    '',
  fotoUrl:   null,
  cargadoAt: null,
  cargando:  false,
  setAvatar: (userId, datos) => {
    const mismoUsuario = get().userId === userId
    set({
      userId,
      nombre:    datos.nombre ?? (mismoUsuario ? get().nombre : ''),
      fotoUrl:   datos.fotoUrl !== undefined ? datos.fotoUrl : (mismoUsuario ? get().fotoUrl : null),
      cargadoAt: Date.now(),
    })
  },
}))

async function cargarAvatar(userId: string) {
  const store = usePerfilAvatarStore.getState()
  if (store.cargando) return
  usePerfilAvatarStore.setState({ cargando: true })
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('nombre')
      .eq('id', userId)
      .maybeSingle()

    // Misma fuente de foto que useSobre: bucket del socio, si no la local.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: socio } = await (supabase as any)
      .from('socios')
      .select('foto_path')
      .eq('profile_id', userId)
      .maybeSingle()

    let fotoUrl: string | null = null
    if (socio?.foto_path) {
      const { data: signed } = await supabase.storage
        .from('socios-fotos')
        .createSignedUrl(socio.foto_path as string, 3600)
      fotoUrl = signed?.signedUrl ?? null
    } else {
      fotoUrl = await AsyncStorage.getItem(`@perfil_foto_${userId}`)
    }

    usePerfilAvatarStore.getState().setAvatar(userId, { nombre: profile?.nombre ?? '', fotoUrl })
  } catch {
    // Sin red: el avatar queda con iniciales (o vacío); se reintenta al montar otro Header.
  } finally {
    usePerfilAvatarStore.setState({ cargando: false })
  }
}

export function usePerfilAvatar(): { nombre: string; fotoUrl: string | null } {
  const userId    = useAuthStore(s => s.session?.user?.id ?? null)
  const storeUser = usePerfilAvatarStore(s => s.userId)
  const nombre    = usePerfilAvatarStore(s => s.nombre)
  const fotoUrl   = usePerfilAvatarStore(s => s.fotoUrl)
  const cargadoAt = usePerfilAvatarStore(s => s.cargadoAt)

  useEffect(() => {
    if (!userId) return
    if (storeUser !== userId || avatarVencido(cargadoAt, Date.now())) void cargarAvatar(userId)
  }, [userId, storeUser, cargadoAt])

  if (!userId || storeUser !== userId) return { nombre: '', fotoUrl: null }
  return { nombre, fotoUrl }
}
