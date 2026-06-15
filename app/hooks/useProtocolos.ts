import { useState, useEffect } from 'react'
import { Linking, Alert } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface Protocolo {
  id:             string
  titulo:         string
  grado_asociado: number | null
  storage_path:   string
  nombre_archivo: string | null
  created_at:     string
}

export interface FormProtocolo {
  titulo: string
  grado:  number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decode(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sortProtocolos(list: Protocolo[]): Protocolo[] {
  return [...list].sort((a, b) => {
    if (a.grado_asociado === b.grado_asociado) return 0
    if (a.grado_asociado === null) return -1
    if (b.grado_asociado === null) return 1
    return a.grado_asociado - b.grado_asociado
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProtocolos() {
  const { session } = useAuthStore()

  const [loading,      setLoading]      = useState(true)
  const [protocolos,   setProtocolos]   = useState<Protocolo[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [form,         setForm]         = useState<FormProtocolo>({ titulo: '', grado: null })
  const [subiendo,     setSubiendo]     = useState(false)
  const [errorSubida,  setErrorSubida]  = useState<string | null>(null)
  const [abriendo,     setAbriendo]     = useState<string | null>(null)

  useEffect(() => { cargarProtocolos() }, [])

  async function cargarProtocolos() {
    setLoading(true)
    const { data } = await supabase
      .from('protocolos')
      .select('id, titulo, grado_asociado, storage_path, nombre_archivo, created_at')
      .order('grado_asociado', { ascending: true, nullsFirst: true })
    setProtocolos(data ?? [])
    setLoading(false)
  }

  function abrirModal() {
    setForm({ titulo: '', grado: null })
    setErrorSubida(null)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
  }

  async function abrirProtocolo(p: Protocolo) {
    setAbriendo(p.id)
    try {
      const { data } = await supabase.storage
        .from('protocolos')
        .createSignedUrl(p.storage_path, 3600)
      if (data?.signedUrl) {
        await Linking.openURL(data.signedUrl)
      }
    } catch {
      Alert.alert('Error', 'No se pudo abrir el documento.')
    } finally {
      setAbriendo(null)
    }
  }

  async function subirProtocolo(): Promise<boolean> {
    if (!form.titulo.trim()) { setErrorSubida('El título es requerido'); return false }

    setSubiendo(true)
    setErrorSubida(null)

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return false

      const file = result.assets[0]
      const ext  = file.name.split('.').pop() ?? 'pdf'
      const path = `${Date.now()}.${ext}`

      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' })

      const { error: uploadErr } = await supabase.storage
        .from('protocolos')
        .upload(path, decode(base64), {
          contentType: file.mimeType ?? 'application/octet-stream',
        })
      if (uploadErr) throw uploadErr

      const { data: inserted, error: dbErr } = await supabase
        .from('protocolos')
        .insert({
          titulo:         form.titulo.trim(),
          grado_asociado: form.grado,
          storage_path:   path,
          nombre_archivo: file.name,
          subido_por:     session!.user.id,
        })
        .select('id, titulo, grado_asociado, storage_path, nombre_archivo, created_at')
        .single()
      if (dbErr) throw dbErr

      setProtocolos(prev => sortProtocolos([...prev, inserted]))
      return true
    } catch (e) {
      setErrorSubida((e as Error).message)
      return false
    } finally {
      setSubiendo(false)
    }
  }

  async function eliminarProtocolo(p: Protocolo): Promise<void> {
    await supabase.from('protocolos').delete().eq('id', p.id)
    void supabase.storage.from('protocolos').remove([p.storage_path])
    setProtocolos(prev => prev.filter(x => x.id !== p.id))
  }

  return {
    loading,
    protocolos,
    modalVisible,
    abrirModal,
    cerrarModal,
    form,
    setForm,
    subiendo,
    errorSubida,
    subirProtocolo,
    abriendo,
    abrirProtocolo,
    eliminarProtocolo,
  }
}
