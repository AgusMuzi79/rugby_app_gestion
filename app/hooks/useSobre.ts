import { useState, useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { ROL_LABELS, Rol } from '@/constants/roles'

export interface PerfilData {
  nombre:     string
  email:      string
  rolLabel:   string
  divisiones: string[]
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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
  const [cambiandoFoto, setCambiandoFoto]     = useState(false)

  const rolRef    = useRef<string>('')
  const socioIdRef = useRef<string | null>(null)

  useEffect(() => {
    void cargarPerfil()
  }, [])

  async function cargarPerfil() {
    if (!session?.user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('nombre, rol, divisiones')
      .eq('id', session.user.id)
      .single()

    if (!profile) { setLoading(false); return }

    rolRef.current = profile.rol

    // Siempre buscar registro en socios (todo staff es socio como base)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: socio } = await (supabase as any)
      .from('socios')
      .select('id, foto_path')
      .eq('profile_id', session.user.id)
      .maybeSingle()

    socioIdRef.current = socio?.id ?? null

    if (socio?.foto_path) {
      // Tiene registro de socio con foto → usar bucket (misma foto que el carnet)
      const { data: signed } = await supabase.storage
        .from('socios-fotos')
        .createSignedUrl(socio.foto_path as string, 3600)
      if (signed?.signedUrl) setFoto(signed.signedUrl)
    } else {
      // Sin socio o sin foto en bucket → fallback a AsyncStorage
      const fotoGuardada = await AsyncStorage.getItem(`@perfil_foto_${session.user.id}`)
      if (fotoGuardada) setFoto(fotoGuardada)
    }

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
    try {
      const timeout = new Promise<{ error: Error }>(resolve =>
        setTimeout(() => resolve({ error: new Error('timeout') }), 15000)
      )
      const { error } = await Promise.race([
        supabase.auth.resetPasswordForEmail(perfil.email, {
          redirectTo: 'uncasrugby://reset-password',
        }),
        timeout,
      ])
      if (error) {
        Alert.alert('Error', 'No se pudo enviar el email. Verificá la conexión.')
      } else {
        setResetEnviado(true)
        setTimeout(() => setResetEnviado(false), 3000)
      }
    } catch {
      Alert.alert('Error', 'No se pudo enviar el email.')
    } finally {
      setEnviandoReset(false)
    }
  }

  async function cambiarFoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitás permitir acceso a la galería.')
      return
    }

    const tieneSocio = socioIdRef.current !== null
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: tieneSocio ? [3, 4] as [number, number] : [1, 1] as [number, number],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return

    if (tieneSocio) {
      // Tiene socio: subir al bucket socios-fotos (misma foto que el carnet)
      const socioId = socioIdRef.current
      if (!socioId) { Alert.alert('Error', 'No se encontró tu registro de socio.'); return }

      setCambiandoFoto(true)
      try {
        const asset    = result.assets[0]
        const base64   = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' })
        const filePath = `${socioId}/foto.jpg`

        const { error: uploadErr } = await supabase.storage
          .from('socios-fotos')
          .upload(filePath, decodeBase64(base64), { contentType: 'image/jpeg', upsert: true })

        if (uploadErr) { Alert.alert('Error', 'No se pudo subir la foto.'); return }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('socios')
          .update({ foto_path: filePath, foto_validada: false })
          .eq('id', socioId)

        const { data: signed } = await supabase.storage
          .from('socios-fotos')
          .createSignedUrl(filePath, 3600)
        setFoto(signed?.signedUrl ?? null)
      } catch {
        Alert.alert('Error', 'Ocurrió un error al subir la foto.')
      } finally {
        setCambiandoFoto(false)
      }
    } else {
      // Otros roles: guardar URI local en AsyncStorage
      if (!session?.user) return
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
    cambiandoFoto,
    cambiarFoto,
  }
}
