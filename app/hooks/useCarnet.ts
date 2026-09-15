import { useState, useEffect, useCallback, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { generateTOTP, secondsUntilRefresh } from '@/lib/totp-client'

const TOTP_STEP = 60

// Namespaceada por usuario — un dispositivo compartido entre familia (588 grupos
// familiares) no puede pisar el secreto TOTP de la sesión anterior con una clave global.
export function totpSecretKey(userId: string): string {
  return `totp_secret_${userId}`
}

export interface CarnetData {
  numero_socio: string
  nombre:       string
  qrContent:    string
  code:         string
  estado:       string
  semaforo:     string | null
  categoria:    string
  secondsLeft:  number
  fotoUrl:      string | null
  roles:        string[]
  division:     string | null
  deporte:      string | null
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
      const { data } = await db
        .from('socios')
        .select('id, profiles!socios_profile_id_fkey ( nombre )')
        .eq('cabecera_id', propio.id)
      if (cancelado) return
      const lista: DependienteMenor[] = (data ?? []).map((d: { id: string; profiles: { nombre: string } | null }) => ({
        id:     d.id,
        nombre: d.profiles?.nombre ?? '—',
      }))
      setDependientes(lista)
    })()
    return () => { cancelado = true }
  }, [userId])

  return { dependientes }
}

// socioIdObjetivo: sin valor = mi propio carnet (comportamiento de siempre).
// Con valor = el carnet de un dependiente menor de 13 a mi cargo (titular de
// grupo familiar) — validado server-side en socios-qr/get-secret, no acá.
export function useCarnet(socioIdObjetivo?: string) {
  const { session }  = useAuthStore()
  const userId       = session?.user.id
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [data, setData]       = useState<CarnetData | null>(null)
  const lastStepRef           = useRef(-1)
  const fotoUrlRef            = useRef<string | null | undefined>(undefined)

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

  const buildCarnet = useCallback(async () => {
    if (!userId) return

    // Actualizar acá (no solo al final) evita que un intento fallido deje
    // lastStepRef en -1 para siempre, lo que haría reintentar cada segundo
    // sin límite en vez de esperar al próximo ciclo de 60s.
    lastStepRef.current = Math.floor(Date.now() / 1000 / TOTP_STEP)

    const secret = await getSecret(userId, socioIdObjetivo)
    if (!secret) {
      setError('Carnet no disponible. Contactá a Secretaría.')
      setLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const socioQuery = socioIdObjetivo
      ? db
          .from('socios')
          .select('id, numero_socio, estado, semaforo, foto_path, categorias_socio ( nombre ), profiles!socios_profile_id_fkey ( nombre, roles )')
          .eq('id', socioIdObjetivo)
          .single()
      : db
          .from('socios')
          .select('id, numero_socio, estado, semaforo, foto_path, categorias_socio ( nombre )')
          .eq('profile_id', userId)
          .single()

    const [{ data: socio }, profileResult] = await Promise.all([
      socioQuery,
      socioIdObjetivo
        ? Promise.resolve({ data: null })
        : supabase.from('profiles').select('nombre, roles').eq('id', userId).single(),
    ])

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

    const code      = generateTOTP(secret)
    const sLeft     = secondsUntilRefresh()
    const categoria = (socio.categorias_socio as { nombre: string } | null)?.nombre ?? '—'
    const nombre    = profile?.nombre ?? '—'
    const roles     = (profile?.roles as string[] | null) ?? ['socio']
    const divData   = jugador?.divisiones as { nombre: string; deporte: string } | null

    setData({
      numero_socio: socio.numero_socio,
      nombre,
      qrContent:    `${socio.numero_socio}:${code}`,
      code,
      estado:       socio.estado,
      semaforo:     socio.semaforo,
      categoria,
      secondsLeft:  sLeft,
      fotoUrl:      fotoUrlRef.current,
      roles,
      division:     divData?.nombre ?? null,
      deporte:      divData?.deporte ?? null,
    })
    setError(null)
    setLoading(false)
  }, [userId, getSecret, socioIdObjetivo])

  // Cambio de objetivo (mi carnet ↔ el de un dependiente) — la foto cacheada
  // es de otra persona, no sirve; forzar loading evita mostrar por un
  // instante los datos del carnet anterior mientras llega el nuevo.
  useEffect(() => {
    fotoUrlRef.current = undefined
    setLoading(true)
    setData(null)
  }, [socioIdObjetivo])

  useEffect(() => { buildCarnet() }, [buildCarnet])

  // Tick every second: update countdown and regenerate code when step changes
  useEffect(() => {
    const timer = setInterval(async () => {
      const sLeft   = secondsUntilRefresh()
      const nowStep = Math.floor(Date.now() / 1000 / TOTP_STEP)

      if (nowStep !== lastStepRef.current) {
        await buildCarnet()
      } else {
        setData(prev => prev ? { ...prev, secondsLeft: sLeft } : null)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [buildCarnet])

  const refresh = useCallback(async () => {
    fotoUrlRef.current = undefined  // fuerza re-fetch de la foto
    await buildCarnet()
  }, [buildCarnet])

  return { loading, error, data, refresh }
}
