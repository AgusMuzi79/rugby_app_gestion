import { useCallback, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { aceptacionRegistrada, estadoTerminos } from '@/lib/terminos'

interface TerminosState {
  loading: boolean
  pendiente: boolean
  version: string | null
  versionId: string | null
  titulo: string | null
  pdfUrl: string | null
  aceptando: boolean
  error: string | null
}

// Un solo estado para todas las pantallas que usan el hook (el gate del
// layout raíz y la pantalla de términos): antes cada una tenía su copia y el
// REINTENTAR de la pantalla no destrababa al gate del layout.
const useTerminosStore = create<TerminosState>(() => ({
  loading: true,
  pendiente: false,
  version: null,
  versionId: null,
  titulo: null,
  pdfUrl: null,
  aceptando: false,
  error: null,
}))

// Registro local de que esta cuenta aceptó términos en este teléfono: sólo se
// usa cuando no hay red para leer la base (lib/terminos.ts).
const claveAceptada = (userId: string) => `terminos_aceptados:${userId}`

async function aceptadaEnTelefono(userId: string): Promise<boolean> {
  try { return !!(await AsyncStorage.getItem(claveAceptada(userId))) } catch { return false }
}

async function recordarAceptada(userId: string, versionId: string): Promise<void> {
  try { await AsyncStorage.setItem(claveAceptada(userId), versionId) } catch { /* sólo un atajo offline */ }
}

// Una lectura a la vez por cuenta, aunque varias pantallas pidan la misma.
let enCurso: { userId: string; promesa: Promise<void> } | null = null
let cargadoPara: string | null = null

// La sesión ya es de otra cuenta (salió y entró otra mientras se leía): el
// resultado no se escribe, para no mostrarle el estado de A a B.
const esDeOtraCuenta = (userId: string) => useAuthStore.getState().session?.user.id !== userId

function cargarEstado(userId: string): Promise<void> {
  if (enCurso?.userId === userId) return enCurso.promesa
  const promesa = (async () => {
    // `loading` sólo en la primera carga de la cuenta: una relectura (Mi
    // perfil, REINTENTAR) no tiene que volver a "cargando" al gate del layout.
    if (cargadoPara !== userId) useTerminosStore.setState({ loading: true, error: null })

    const { data: activa, error: errorActiva } = await supabase
      .from('terminos_versiones')
      .select('id, version, titulo, pdf_path')
      .eq('activo', true)
      .maybeSingle()

    // Un error de lectura deja el gate cerrado, salvo que esta cuenta ya haya
    // aceptado en este teléfono (lib/terminos.ts).
    if (errorActiva || !activa) {
      const e = estadoTerminos({
        activa: null, errorActiva, aceptacion: null, errorAceptacion: null,
        aceptadaEnTelefono: errorActiva ? await aceptadaEnTelefono(userId) : false,
      })
      if (esDeOtraCuenta(userId)) return
      useTerminosStore.setState({
        loading: false, pendiente: e.pendiente, error: e.error,
        version: null, versionId: null, titulo: null, pdfUrl: null,
      })
      return
    }

    const { data: aceptacion, error: errorAceptacion } = await supabase
      .from('terminos_aceptaciones')
      .select('id')
      .eq('version_id', activa.id)
      .eq('profile_id', userId)
      .maybeSingle()

    if (aceptacion) await recordarAceptada(userId, activa.id)
    const { data: pub } = supabase.storage.from('legales').getPublicUrl(activa.pdf_path)
    const e = estadoTerminos({
      activa, errorActiva: null, aceptacion, errorAceptacion,
      aceptadaEnTelefono: errorAceptacion ? await aceptadaEnTelefono(userId) : false,
    })

    if (esDeOtraCuenta(userId)) return
    useTerminosStore.setState({
      loading: false,
      pendiente: e.pendiente,
      version: activa.version,
      versionId: activa.id,
      titulo: activa.titulo,
      pdfUrl: pub.publicUrl,
      aceptando: false,
      error: e.error,
    })
  })().finally(() => {
    // Sólo limpia su propia lectura: la de otra cuenta puede seguir en curso.
    if (enCurso?.promesa === promesa) enCurso = null
    if (!esDeOtraCuenta(userId)) cargadoPara = userId
  })
  enCurso = { userId, promesa }
  return promesa
}

export function useTerminos() {
  const session = useAuthStore(s => s.session)
  const userId = session?.user.id ?? null
  const state = useTerminosStore()

  const fetchEstado = useCallback(async () => {
    if (!userId) {
      useTerminosStore.setState({ loading: false })
      return
    }
    await cargarEstado(userId)
  }, [userId])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  const aceptar = useCallback(async (): Promise<boolean> => {
    const versionId = useTerminosStore.getState().versionId
    if (!userId || !versionId) return false
    useTerminosStore.setState({ aceptando: true, error: null })
    const { error } = await supabase
      .from('terminos_aceptaciones')
      .insert({ profile_id: userId, version_id: versionId })
    if (!aceptacionRegistrada(error)) {
      useTerminosStore.setState({ aceptando: false, error: 'No se pudo registrar la aceptación. Probá de nuevo.' })
      return false
    }
    await recordarAceptada(userId, versionId)
    useTerminosStore.setState({ aceptando: false, pendiente: false })
    return true
  }, [userId])

  return { ...state, aceptar, refetch: fetchEstado }
}
