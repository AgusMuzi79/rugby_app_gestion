import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { ROL_LABELS, Rol } from '@/constants/roles'

export interface PerfilData {
  nombre:     string
  email:      string
  rolLabel:   string
  divisiones: string[]
}

export function useSobre() {
  const { session } = useAuthStore()
  const [perfil, setPerfil]                   = useState<PerfilData | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [nombre, setNombre]                   = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [nombreGuardado, setNombreGuardado]   = useState(false)
  const [enviandoReset, setEnviandoReset]     = useState(false)
  const [resetEnviado, setResetEnviado]       = useState(false)
  const [foto, setFoto]                       = useState<string | null>(null)

  useEffect(() => {
    void cargarPerfil()
  }, [])

  async function cargarPerfil() {
    if (!session?.user) { setLoading(false); return }

    const fotoGuardada = await AsyncStorage.getItem(`@perfil_foto_${session.user.id}`)
    if (fotoGuardada) setFoto(fotoGuardada)

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
      nombre:     profile.nombre,
      email:      session.user.email ?? '',
      rolLabel:   ROL_LABELS[profile.rol as Rol] ?? profile.rol,
      divisiones: divisionNombres,
    })
    setNombre(profile.nombre)
    setLoading(false)
  }

  async function guardarNombre() {
    if (!session?.user || !nombre.trim()) return
    setGuardandoNombre(true)
    const { error } = await supabase
      .from('profiles')
      .update({ nombre: nombre.trim() })
      .eq('id', session.user.id)
    if (error) {
      Alert.alert('Error', 'No se pudo guardar el nombre.')
    } else {
      setPerfil(prev => prev ? { ...prev, nombre: nombre.trim() } : prev)
      setNombreGuardado(true)
      setTimeout(() => setNombreGuardado(false), 2000)
    }
    setGuardandoNombre(false)
  }

  async function enviarResetPassword() {
    if (!perfil?.email) return
    setEnviandoReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, {
      redirectTo: 'uncasrugby://reset-password',
    })
    if (error) {
      Alert.alert('Error', 'No se pudo enviar el email.')
    } else {
      setResetEnviado(true)
      setTimeout(() => setResetEnviado(false), 3000)
    }
    setEnviandoReset(false)
  }

  async function cambiarFoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitás permitir acceso a la galería.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect:       [1, 1] as [number, number],
      quality:      0.7,
    })
    if (!result.canceled && result.assets[0]?.uri && session?.user) {
      const uri = result.assets[0].uri
      setFoto(uri)
      await AsyncStorage.setItem(`@perfil_foto_${session.user.id}`, uri)
    }
  }

  return {
    perfil,
    loading,
    nombre,      setNombre,
    guardandoNombre,
    nombreGuardado,
    guardarNombre,
    enviandoReset,
    resetEnviado,
    enviarResetPassword,
    foto,
    cambiarFoto,
  }
}
