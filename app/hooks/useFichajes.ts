import { useState, useEffect, useCallback } from 'react'
import { Linking } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export type TipoDocumento = 'dni' | 'ficha_medica' | 'otro'
export type PasoFichajes  = 'lista' | 'detalle'

export interface JugadorFichado {
  id:              string
  nombre_completo: string
  dni:             string
  fecha_nacimiento: string
  posicion:        string | null
  fecha_fichaje:   string
  fichajeId:       string
}

export interface DocumentoFichaje {
  id:             string
  tipo:           string
  storage_path:   string
  nombre_archivo: string | null
  created_at:     string
}

export interface JugadorDetalle extends JugadorFichado {
  documentos: DocumentoFichaje[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decode(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function fechaHoy(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFichajes() {
  const { session } = useAuthStore()

  // División
  const [loading, setLoading]               = useState(true)
  const [divisionId, setDivisionId]         = useState<string | null>(null)
  const [divisionNombre, setDivisionNombre] = useState('')
  const [sinDivision, setSinDivision]       = useState(false)

  // Lista
  const [jugadores, setJugadores] = useState<JugadorFichado[]>([])

  // Detalle
  const [paso, setPaso]                     = useState<PasoFichajes>('lista')
  const [jugadorDetalle, setJugadorDetalle] = useState<JugadorDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  // Modal nuevo fichaje
  const [modalVisible, setModalVisible]           = useState(false)
  const [nombre, setNombre]                       = useState('')
  const [dni, setDni]                             = useState('')
  const [fechaNacimiento, setFechaNacimiento]     = useState('')
  const [posicion, setPosicion]                   = useState('')
  const [guardandoFichaje, setGuardandoFichaje]   = useState(false)
  const [guardadoFichajeOk, setGuardadoFichajeOk] = useState(false)
  const [errorForm, setErrorForm]                 = useState<string | null>(null)

  // Upload documentos
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoDocumento | null>(null)
  const [subiendo, setSubiendo]                 = useState(false)
  const [subiendoOk, setSubiendoOk]             = useState(false)
  const [errorUpload, setErrorUpload]           = useState<string | null>(null)

  // Apertura de documentos
  const [abriendoDoc, setAbriendoDoc] = useState<string | null>(null)

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  useFocusEffect(
    useCallback(() => {
      if (session && divisionId) cargarJugadores(divisionId)
    }, [session, divisionId]),
  )

  // ─── Carga ───────────────────────────────────────────────────────────────

  async function fetchDatos() {
    if (!session) return
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    const divId = (profile?.divisiones as string[] | null)?.[0] ?? null
    if (!divId) { setSinDivision(true); setLoading(false); return }
    setDivisionId(divId)

    const [divRes] = await Promise.all([
      supabase.from('divisiones').select('nombre').eq('id', divId).single(),
      cargarJugadores(divId),
    ])
    setDivisionNombre(divRes.data?.nombre ?? '')
    setLoading(false)
  }

  async function cargarJugadores(divId: string) {
    const { data } = await supabase
      .from('jugadores')
      .select('id, nombre_completo, dni, fecha_nacimiento, posicion, fichajes(id, fecha_fichaje)')
      .eq('division_id', divId)
      .eq('activo', true)
      .order('nombre_completo')

    type FichajeRow = { id: string; fecha_fichaje: string }

    setJugadores(
      (data ?? [])
        .map(j => {
          const fichs = j.fichajes as FichajeRow[]
          if (fichs.length === 0) return null
          return {
            id:               j.id,
            nombre_completo:  j.nombre_completo,
            dni:              j.dni,
            fecha_nacimiento: j.fecha_nacimiento,
            posicion:         j.posicion,
            fecha_fichaje:    fichs[0].fecha_fichaje,
            fichajeId:        fichs[0].id,
          }
        })
        .filter((j): j is JugadorFichado => j !== null),
    )
  }

  async function cargarDocumentos(fichajeId: string) {
    const { data } = await supabase
      .from('documentos_fichaje')
      .select('id, tipo, storage_path, nombre_archivo, created_at')
      .eq('fichaje_id', fichajeId)
      .order('created_at', { ascending: false })

    setJugadorDetalle(prev =>
      prev ? { ...prev, documentos: (data ?? []) as DocumentoFichaje[] } : prev,
    )
  }

  // ─── Navegación ──────────────────────────────────────────────────────────

  async function seleccionarJugador(j: JugadorFichado) {
    setJugadorDetalle({ ...j, documentos: [] })
    setTipoSeleccionado(null)
    setSubiendoOk(false)
    setErrorUpload(null)
    setPaso('detalle')
    setCargandoDetalle(true)
    await cargarDocumentos(j.fichajeId)
    setCargandoDetalle(false)
  }

  function volverALista() {
    setPaso('lista')
    setJugadorDetalle(null)
  }

  // ─── Modal nuevo fichaje ─────────────────────────────────────────────────

  function abrirModal() {
    setNombre('')
    setDni('')
    setFechaNacimiento('')
    setPosicion('')
    setErrorForm(null)
    setGuardadoFichajeOk(false)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
    setGuardadoFichajeOk(false)
    setErrorForm(null)
  }

  async function guardarFichaje() {
    if (!session || !divisionId) return

    const nombreTrim = nombre.trim()
    const dniTrim    = dni.trim()

    if (!nombreTrim)       { setErrorForm('Ingresá el nombre completo.'); return }
    if (!dniTrim)          { setErrorForm('Ingresá el DNI.'); return }
    if (!fechaNacimiento)  { setErrorForm('Seleccioná la fecha de nacimiento.'); return }

    setGuardandoFichaje(true)
    setErrorForm(null)

    const { data: jugData, error: jugErr } = await supabase
      .from('jugadores')
      .insert({
        nombre_completo:  nombreTrim,
        dni:              dniTrim,
        fecha_nacimiento: fechaNacimiento,
        division_id:      divisionId,
        posicion:         posicion.trim() || null,
      })
      .select('id')
      .single()

    if (jugErr || !jugData) {
      const msg = jugErr?.message ?? 'Error al crear jugador.'
      setErrorForm(
        msg.includes('unique') || msg.includes('duplicate')
          ? 'Ya existe un jugador con ese DNI en esta división.'
          : msg,
      )
      setGuardandoFichaje(false)
      return
    }

    const { error: fichErr } = await supabase
      .from('fichajes')
      .insert({ jugador_id: jugData.id, registrado_por: session.user.id })

    if (fichErr) {
      setErrorForm('Jugador creado, pero error al registrar fichaje: ' + fichErr.message)
      setGuardandoFichaje(false)
      return
    }

    await cargarJugadores(divisionId)
    setGuardadoFichajeOk(true)
    setGuardandoFichaje(false)
    void supabase.functions.invoke('notifications', {
      body: {
        type: 'fichaje',
        payload: {
          jugadorNombre:  nombreTrim,
          divisionNombre,
          jugadorId:      jugData.id,
          divisionId,
        },
      },
    })
  }

  // ─── Upload de documentos ─────────────────────────────────────────────────

  async function subirDocumento(tipo: TipoDocumento) {
    if (!session || !jugadorDetalle) return

    let result: DocumentPicker.DocumentPickerResult
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })
    } catch {
      setErrorUpload('No se pudo abrir el selector de archivos.')
      return
    }

    if (result.canceled || !result.assets?.[0]) return

    const file = result.assets[0]
    const ext  = file.name.split('.').pop() ?? 'pdf'
    const path = `${jugadorDetalle.id}/${Date.now()}.${ext}`

    setSubiendo(true)
    setSubiendoOk(false)
    setErrorUpload(null)

    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'base64',
      })

      const { error: uploadErr } = await supabase.storage
        .from('fichajes')
        .upload(path, decode(base64), {
          contentType: file.mimeType ?? 'application/octet-stream',
        })

      if (uploadErr) {
        setErrorUpload('Error al subir el archivo: ' + uploadErr.message)
        setSubiendo(false)
        return
      }

      const { error: docErr } = await supabase
        .from('documentos_fichaje')
        .insert({
          fichaje_id:     jugadorDetalle.fichajeId,
          tipo,
          storage_path:   path,
          nombre_archivo: file.name,
        })

      if (docErr) {
        setErrorUpload('Archivo subido pero error al registrar: ' + docErr.message)
        setSubiendo(false)
        return
      }

      await cargarDocumentos(jugadorDetalle.fichajeId)
      setTipoSeleccionado(null)
      setSubiendoOk(true)
    } catch {
      setErrorUpload('Error inesperado. Verificá tu conexión.')
    }

    setSubiendo(false)
  }

  async function abrirDocumento(storagePath: string) {
    setAbriendoDoc(storagePath)
    const { data } = await supabase.storage
      .from('fichajes')
      .createSignedUrl(storagePath, 60)
    if (data?.signedUrl) await Linking.openURL(data.signedUrl)
    setAbriendoDoc(null)
  }

  return {
    loading,
    divisionNombre,
    sinDivision,
    jugadores,
    paso,
    jugadorDetalle,
    cargandoDetalle,
    seleccionarJugador,
    volverALista,
    modalVisible,
    abrirModal,
    cerrarModal,
    nombre,        setNombre,
    dni,           setDni,
    fechaNacimiento, setFechaNacimiento,
    posicion,      setPosicion,
    guardandoFichaje,
    guardadoFichajeOk,
    errorForm,
    guardarFichaje,
    tipoSeleccionado, setTipoSeleccionado,
    subiendo,
    subiendoOk,
    errorUpload,
    subirDocumento,
    abriendoDoc,
    abrirDocumento,
  }
}
