import { useState, useEffect, useCallback, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { esColumnaInexistente, nombreCarnet } from '@/lib/nombrePadron'
import {
  carnetLocal, claveCacheCarnet, etiquetaSinConexion, parsearCache, serializarCache, trasFalloDeRed,
  type CarnetBase, type CarnetData,
} from '@/lib/carnetOffline'

export type { CarnetData } from '@/lib/carnetOffline'

const TOTP_STEP = 60

// Namespaceada por usuario — un dispositivo compartido entre familia (588 grupos
// familiares) no puede pisar el secreto TOTP de la sesión anterior con una clave global.
export function totpSecretKey(userId: string): string {
  return `totp_secret_${userId}`
}

export interface DependienteMenor {
  id:     string
  nombre: string
}

// Titular de grupo familiar viendo el carnet de un hijo menor de 13 (sin
// acceso propio a la app, ver useAccesoRestringido) — lista sus dependientes
// menores para el selector de carnet.tsx. RLS (socios_select_titular_de_menor13,
// migración 20260915000000) ya filtra por edad: cualquier fila que vuelva acá
// es un menor de 13 real, no hace falta repetir el cálculo en el cliente.
export function useDependientesMenores() {
  const { session } = useAuthStore()
  const userId = session?.user.id
  const [dependientes, setDependientes] = useState<DependienteMenor[]>([])

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    ;(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const { data: propio } = await db.from('socios').select('id').eq('profile_id', userId).single()
      if (!propio || cancelado) return
      const dependientesQuery = (conPadron: boolean) => db
        .from('socios')
        .select(conPadron
          ? 'id, nombre_padron, profiles!socios_profile_id_fkey ( nombre )'
          : 'id, profiles!socios_profile_id_fkey ( nombre )')
        .eq('cabecera_id', propio.id)
      let { data, error } = await dependientesQuery(true)
      // Migración de nombre_padron todavía sin aplicar: se repite sin la columna.
      if (esColumnaInexistente(error)) ({ data } = await dependientesQuery(false))
      if (cancelado) return
      const lista: DependienteMenor[] = (data ?? []).map((d: { id: string; nombre_padron?: string | null; profiles: { nombre: string } | null }) => ({
        id:     d.id,
        nombre: nombreCarnet(d.nombre_padron, d.profiles?.nombre),
      }))
      setDependientes(lista)
    })()
    return () => { cancelado = true }
  }, [userId])

  return { dependientes }
}

// Última lectura buena del carnet, para mostrarlo sin red. Nunca rompe el
// carnet: si el almacenamiento falla, es como no tener caché.
async function leerCache(clave: string) {
  try {
    return parsearCache(await AsyncStorage.getItem(clave))
  } catch {
    return null
  }
}

async function guardarCache(clave: string, base: CarnetBase, guardadoEn: number) {
  try {
    await AsyncStorage.setItem(clave, serializarCache(base, guardadoEn))
  } catch {
    // sin caché: el carnet sigue andando con red
  }
}

// socioIdObjetivo: sin valor = mi propio carnet (comportamiento de siempre).
// Con valor = el carnet de un dependiente menor de 13 a mi cargo (titular de
// grupo familiar) — validado server-side en socios-qr/get-secret, no acá.
// data sólo cambia cuando cambia el código TOTP: la cuenta regresiva la lleva
// un componente aparte (components/socio/CarnetQR.tsx), así la pantalla no se
// vuelve a renderizar cada segundo.
//
// Sin conexión (T5): el código se genera en el teléfono con el secreto
// guardado, así que el QR sigue rotando; los datos de la base son los de la
// última lectura buena (también guardados) y `avisoSinConexion` dice de qué
// hora son. Una falla de red nunca reemplaza el carnet en pantalla por un error.
export function useCarnet(socioIdObjetivo?: string) {
  const { session }  = useAuthStore()
  const userId       = session?.user.id
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [data, setData]               = useState<CarnetData | null>(null)
  const [guardadoEn, setGuardadoEn]   = useState<number | null>(null)
  const [sinConexion, setSinConexion] = useState(false)
  const lastStepRef           = useRef(-1)
  const fotoUrlRef            = useRef<string | null | undefined>(undefined)
  // Datos de la base y secreto del carnet que se está mirando.
  const baseRef               = useRef<CarnetBase | null>(null)
  const secretRef             = useRef<string | null>(null)
  // Carnet que se está mirando: una lectura que vuelve tarde, de otro
  // carnet (cambio de dependiente), no pisa el actual.
  const claveRef              = useRef<string | null>(null)

  const getSecret = useCallback(async (uid: string, socioId?: string): Promise<string | null> => {
    const key    = totpSecretKey(socioId ?? uid)
    const cached = await SecureStore.getItemAsync(key)
    if (cached) return cached

    const res = await supabase.functions.invoke('socios-qr', {
      body: socioId ? { action: 'get-secret', socio_id: socioId } : { action: 'get-secret' },
    })
    if (res.error || !res.data?.secret) return null

    await SecureStore.setItemAsync(key, res.data.secret)
    return res.data.secret as string
  }, [])

  // Código del minuto actual a partir del secreto guardado: sin red.
  const regenerarCodigo = useCallback(() => {
    const carnet = carnetLocal(baseRef.current, secretRef.current, Date.now())
    if (carnet) setData(carnet)
    return carnet !== null
  }, [])

  // Falla de red leyendo la base: con un carnet en pantalla se queda y se
  // avisa; sin carnet, se muestra el error.
  const falloDeRed = useCallback((mensaje: string) => {
    if (trasFalloDeRed(baseRef.current !== null && secretRef.current !== null) === 'aviso') {
      setSinConexion(true)
      setError(null)
    } else {
      setError(mensaje)
    }
    setLoading(false)
  }, [])

  const buildCarnet = useCallback(async () => {
    if (!userId) return
    const clave = claveCacheCarnet(userId, socioIdObjetivo)
    const vigente = () => claveRef.current === clave

    // Actualizar acá (no solo al final) evita que un intento fallido deje
    // lastStepRef en -1 para siempre, lo que haría reintentar cada segundo
    // sin límite en vez de esperar al próximo ciclo de 60s.
    lastStepRef.current = Math.floor(Date.now() / 1000 / TOTP_STEP)

    const secret = await getSecret(userId, socioIdObjetivo)
    if (!vigente()) return
    if (!secret) {
      setError('Carnet no disponible. Contactá a Secretaría.')
      setLoading(false)
      return
    }
    secretRef.current = secret

    // Primera vez en este carnet: lo último guardado, para mostrarlo ya
    // (y sin red) mientras llega la lectura de la base.
    if (!baseRef.current) {
      const cache = await leerCache(clave)
      if (!vigente()) return
      if (cache && !baseRef.current) {
        baseRef.current = cache.base
        setGuardadoEn(cache.guardadoEn)
      }
    }

    // El QR rota aunque la red tarde o no esté.
    if (regenerarCodigo()) setLoading(false)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // nombre_padron (T12): el carnet muestra el nombre del padrón, no el que
      // el socio edita en Mi perfil (profiles.nombre, de respaldo).
      const socioQuery = (conPadron: boolean) => {
        const padron = conPadron ? ', nombre_padron' : ''
        return socioIdObjetivo
          ? db
              .from('socios')
              .select(`id, numero_socio, estado, semaforo, foto_path${padron}, categorias_socio ( nombre ), profiles!socios_profile_id_fkey ( nombre, roles )`)
              .eq('id', socioIdObjetivo)
              .single()
          : db
              .from('socios')
              .select(`id, numero_socio, estado, semaforo, foto_path${padron}, categorias_socio ( nombre )`)
              .eq('profile_id', userId)
              .single()
      }

      const [primerIntento, profileResult] = await Promise.all([
        socioQuery(true),
        socioIdObjetivo
          ? Promise.resolve({ data: null })
          : supabase.from('profiles').select('nombre, roles').eq('id', userId).single(),
      ])
      let { data: socio, error: errSocio } = primerIntento
      // Si la app (OTA) llega antes que la migración de nombre_padron, la
      // columna no existe y el select entero falla: se repite sin ella.
      if (esColumnaInexistente(errSocio)) {
        ;({ data: socio, error: errSocio } = await socioQuery(false))
      }
      if (!vigente()) return

      // PGRST116 = .single() sin filas (de verdad no hay socio); cualquier otro
      // error es de red/servidor y no tiene que leerse como "no existe tu registro".
      if (errSocio && errSocio.code !== 'PGRST116') {
        falloDeRed('No se pudo cargar el carnet. Revisá tu conexión.')
        return
      }

      if (!socio) {
        setError(socioIdObjetivo ? 'No se encontró el carnet de este dependiente.' : 'No se encontró tu registro de socio.')
        setLoading(false)
        return
      }

      // Viendo el carnet de un dependiente: nombre/roles vienen del join de
      // arriba (profiles del dependiente, no del titular logueado).
      const profile = socioIdObjetivo
        ? (socio.profiles as { nombre: string; roles: string[] } | null)
        : profileResult.data

      // Generar signed URL de foto solo una vez por sesión (expira en 1h)
      if (fotoUrlRef.current === undefined) {
        if (socio.foto_path) {
          const { data: urlData } = await supabase.storage
            .from('socios-fotos')
            .createSignedUrl(socio.foto_path, 3600)
          fotoUrlRef.current = urlData?.signedUrl ?? null
        } else {
          fotoUrlRef.current = null
        }
      }

      // Buscar división del jugador si el socio está linkeado a un jugador
      const { data: jugador } = await db
        .from('jugadores')
        .select('divisiones ( nombre, deporte )')
        .eq('socio_id', socio.id)
        .maybeSingle()
      if (!vigente()) return

      const categoria = (socio.categorias_socio as { nombre: string } | null)?.nombre ?? '—'
      const nombre    = nombreCarnet(socio.nombre_padron as string | null | undefined, profile?.nombre)
      const roles     = (profile?.roles as string[] | null) ?? ['socio']
      const divData   = jugador?.divisiones as { nombre: string; deporte: string } | null

      const base: CarnetBase = {
        numero_socio: socio.numero_socio,
        nombre,
        estado:       socio.estado,
        semaforo:     socio.semaforo,
        categoria,
        fotoUrl:      fotoUrlRef.current ?? null,
        roles,
        division:     divData?.nombre ?? null,
        deporte:      divData?.deporte ?? null,
      }
      const ahora = Date.now()
      baseRef.current = base
      setGuardadoEn(ahora)
      setSinConexion(false)
      regenerarCodigo()
      setError(null)
      setLoading(false)
      void guardarCache(clave, base, ahora)
    } catch {
      // fetch que tira (sin red): mismo criterio que un error de la consulta.
      if (vigente()) falloDeRed('No se pudo cargar el carnet. Revisá tu conexión.')
    }
  }, [userId, getSecret, socioIdObjetivo, regenerarCodigo, falloDeRed])

  // Cambio de objetivo (mi carnet ↔ el de un dependiente) — la foto cacheada
  // es de otra persona, no sirve; forzar loading evita mostrar por un
  // instante los datos del carnet anterior mientras llega el nuevo.
  useEffect(() => {
    claveRef.current   = userId ? claveCacheCarnet(userId, socioIdObjetivo) : null
    baseRef.current    = null
    secretRef.current  = null
    fotoUrlRef.current = undefined
    setLoading(true)
    setData(null)
    setError(null)
    setGuardadoEn(null)
    setSinConexion(false)
  }, [userId, socioIdObjetivo])

  useEffect(() => { buildCarnet() }, [buildCarnet])

  // Cada segundo: al cambiar el paso TOTP, código nuevo al instante (sin red)
  // y una relectura de la base para tener el estado al día.
  useEffect(() => {
    const timer = setInterval(async () => {
      const nowStep = Math.floor(Date.now() / 1000 / TOTP_STEP)
      if (nowStep === lastStepRef.current) return
      regenerarCodigo()
      await buildCarnet()
    }, 1000)
    return () => clearInterval(timer)
  }, [buildCarnet, regenerarCodigo])

  const refresh = useCallback(async () => {
    fotoUrlRef.current = undefined  // fuerza re-fetch de la foto
    await buildCarnet()
  }, [buildCarnet])

  const avisoSinConexion = sinConexion && guardadoEn !== null ? etiquetaSinConexion(guardadoEn) : null

  return { loading, error, data, refresh, avisoSinConexion }
}
