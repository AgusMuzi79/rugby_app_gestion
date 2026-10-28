import { useState, useEffect, useCallback } from 'react'
import { Linking } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  divisionInicial,
  filtrarPorDivision,
  mensajeErrorFichaje,
  validarFichaje,
  type DivisionOpcion,
} from '@/lib/fichajes'

export type TipoDocumento = 'dni' | 'ficha_medica' | 'otro'
export type PasoFichajes  = 'lista' | 'detalle'

export interface JugadorFichado {
  id:              string
  divisionId:      string
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

const ERROR_CARGA = 'No se pudieron cargar los fichajes. Revisá la conexión y reintentá.'

function compararNombre(a: DivisionOpcion, b: DivisionOpcion): number {
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFichajes() {
  const { session } = useAuthStore()

  // Divisiones: todas las asignadas al manager (profiles.divisiones)
  const [loading, setLoading]               = useState(true)
  const [misDivisiones, setMisDivisiones]   = useState<DivisionOpcion[]>([])
  const [sinDivision, setSinDivision]       = useState(false)
  // Error de red / RLS al cargar: distinto de "sin división" o "sin fichajes"
  const [errorCarga, setErrorCarga]         = useState<string | null>(null)

  // Lista (de todas sus divisiones) y filtro: null = todas
  const [todos, setTodos]                   = useState<JugadorFichado[]>([])
  const [filtroDivision, setFiltroDivision] = useState<string | null>(null)

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
  const [divisionForm, setDivisionForm]           = useState<string | null>(null)
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

  const misIdsKey = misDivisiones.map(d => d.id).join(',')

  useEffect(() => {
    if (session) fetchDatos()
  }, [session])

  useFocusEffect(
    useCallback(() => {
      if (session && misIdsKey) void cargarJugadores(misIdsKey.split(','))
    }, [session, misIdsKey]),
  )

  // ─── Carga ───────────────────────────────────────────────────────────────

  async function fetchDatos() {
    if (!session) return
    setLoading(true)
    setErrorCarga(null)

    const { data: profile, error: errorProfile } = await supabase
      .from('profiles')
      .select('divisiones')
      .eq('id', session.user.id)
      .single()

    // Un error al leer el perfil no es "sin división": se informa con reintento.
    if (errorProfile) { setErrorCarga(ERROR_CARGA); setLoading(false); return }

    const ids = (profile?.divisiones as string[] | null) ?? []
    if (ids.length === 0) { setSinDivision(true); setLoading(false); return }
    setSinDivision(false)

    const [divRes] = await Promise.all([
      supabase.from('divisiones').select('id, nombre').in('id', ids),
      cargarJugadores(ids),
    ])
    if (divRes.error) {
      setErrorCarga(ERROR_CARGA)
    } else {
      const divs = (divRes.data ?? []).map(d => ({ id: d.id, nombre: d.nombre })).sort(compararNombre)
      setMisDivisiones(divs)
      // Un filtro que ya no es una división suya vuelve a "todas".
      setFiltroDivision(prev => (prev && divs.some(d => d.id === prev) ? prev : null))
    }
    setLoading(false)
  }

  async function cargarJugadores(divIds: string[]) {
    const { data, error } = await supabase
      .from('jugadores')
      .select('id, division_id, nombre_completo, dni, fecha_nacimiento, posicion, fichajes(id, fecha_fichaje)')
      .in('division_id', divIds)
      .eq('activo', true)
      .order('nombre_completo')

    if (error) { setErrorCarga(ERROR_CARGA); return }

    type FichajeRow = { id: string; fecha_fichaje: string }

    setTodos(
      (data ?? [])
        .map(j => {
          const fichs = j.fichajes as FichajeRow[]
          if (fichs.length === 0) return null
          return {
            id:               j.id,
            divisionId:       j.division_id,
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
    setDivisionForm(divisionInicial(misDivisiones, filtroDivision))
    setErrorForm(null)
    setGuardadoFichajeOk(false)
    setModalVisible(true)
  }

  function cerrarModal() {
    setModalVisible(false)
    setGuardadoFichajeOk(false)
    setErrorForm(null)
  }

  // Alta atómica (RPC fichar_jugador): jugador + vínculo con socio + fichaje en
  // una transacción. Si algo falla no queda un jugador a medias, así que el
  // reintento no choca con "ya existe ese DNI".
  async function guardarFichaje() {
    if (!session) return

    const invalido = validarFichaje({ nombre, dni, fechaNacimiento, divisionId: divisionForm })
    if (invalido || !divisionForm) { setErrorForm(invalido ?? 'Elegí la división.'); return }

    const nombreTrim = nombre.trim()
    const divId      = divisionForm

    setGuardandoFichaje(true)
    setErrorForm(null)

    const { data, error } = await supabase.rpc('fichar_jugador', {
      p_nombre:           nombreTrim,
      p_dni:              dni.trim(),
      p_fecha_nacimiento: fechaNacimiento,
      p_division_id:      divId,
      p_posicion:         posicion.trim() || null,
    })

    const nuevo = data?.[0]
    if (error || !nuevo) {
      setErrorForm(mensajeErrorFichaje(error))
      setGuardandoFichaje(false)
      return
    }

    await cargarJugadores(misDivisiones.map(d => d.id))
    setGuardadoFichajeOk(true)
    setGuardandoFichaje(false)
    void supabase.functions.invoke('notifications', {
      body: {
        type: 'fichaje',
        payload: {
          jugadorNombre:  nombreTrim,
          divisionNombre: misDivisiones.find(d => d.id === divId)?.nombre ?? '',
          jugadorId:      nuevo.nuevo_jugador_id,
          divisionId:     divId,
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

  const divisionNombre = misDivisiones.map(d => d.nombre).join(' · ')
  const jugadores      = filtrarPorDivision(todos, filtroDivision)

  return {
    loading,
    divisionNombre,
    misDivisiones,
    sinDivision,
    errorCarga,
    recargar:       fetchDatos,
    filtroDivision, setFiltroDivision,
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
    divisionForm,  setDivisionForm,
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
