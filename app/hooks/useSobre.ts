import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { ROL_LABELS, Rol } from '@/constants/roles'

const EMAIL_KEY    = 'biometria_email'
const PASSWORD_KEY = 'biometria_password'

export interface PerfilData {
  nombre: string
  rolLabel: string
  divisiones: string[]
}

export function useSobre() {
  const { session } = useAuthStore()
  const [perfil, setPerfil]                           = useState<PerfilData | null>(null)
  const [loading, setLoading]                         = useState(true)
  const [biometriaActiva, setBiometriaActiva]         = useState(false)
  const [biometriaDisponible, setBiometriaDisponible] = useState(false)
  const [notificacionesActivas, setNotificaciones]    = useState(true)

  useEffect(() => {
    void cargarPerfil()
    void verificarBiometria()
  }, [])

  async function cargarPerfil() {
    if (!session?.user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('nombre, rol, divisiones')
      .eq('id', session.user.id)
      .single()

    if (!profile) { setLoading(false); return }

    let divisionNombres: string[] = []
    if (profile.divisiones && profile.divisiones.length > 0) {
      const { data: divs } = await supabase
        .from('divisiones')
        .select('nombre')
        .in('id', profile.divisiones)
      divisionNombres = divs?.map(d => d.nombre) ?? []
    }

    setPerfil({
      nombre:    profile.nombre,
      rolLabel:  ROL_LABELS[profile.rol as Rol] ?? profile.rol,
      divisiones: divisionNombres,
    })
    setLoading(false)
  }

  async function verificarBiometria() {
    const hardware = await LocalAuthentication.hasHardwareAsync()
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    setBiometriaDisponible(hardware && enrolled)
    const saved = await SecureStore.getItemAsync(EMAIL_KEY)
    setBiometriaActiva(!!saved)
  }

  async function toggleBiometria() {
    if (biometriaActiva) {
      await SecureStore.deleteItemAsync(EMAIL_KEY)
      await SecureStore.deleteItemAsync(PASSWORD_KEY)
      setBiometriaActiva(false)
    } else {
      Alert.alert(
        'Activar biometría',
        'Para activar el acceso biométrico, cerrá sesión e ingresá nuevamente con tu contraseña.',
        [{ text: 'Entendido' }],
      )
    }
  }

  function toggleNotificaciones() {
    setNotificaciones(prev => !prev)
  }

  return {
    perfil,
    loading,
    biometriaActiva,
    biometriaDisponible,
    notificacionesActivas,
    toggleBiometria,
    toggleNotificaciones,
  }
}
