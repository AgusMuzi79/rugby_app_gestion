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
  categoria:    string
  secondsLeft:  number
  fotoUrl:      string | null
  roles:        string[]
  division:     string | null
  deporte:      string | null
}

export function useCarnet() {
  const { session }  = useAuthStore()
  const userId       = session?.user.id
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [data, setData]       = useState<CarnetData | null>(null)
  const lastStepRef           = useRef(-1)
  const fotoUrlRef            = useRef<string | null | undefined>(undefined)

  const getSecret = useCallback(async (uid: string): Promise<string | null> => {
    const key    = totpSecretKey(uid)
    const cached = await SecureStore.getItemAsync(key)
    if (cached) return cached

    const res = await supabase.functions.invoke('socios-qr', {
      body: { action: 'get-secret' },
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

    const secret = await getSecret(userId)
    if (!secret) {
      setError('Carnet no disponible. Contactá a Secretaría.')
      setLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const [{ data: socio }, { data: profile }] = await Promise.all([
      db
        .from('socios')
        .select('id, numero_socio, estado, foto_path, categorias_socio ( nombre )')
        .eq('profile_id', userId)
        .single(),
      supabase
        .from('profiles')
        .select('nombre, roles')
        .eq('id', userId)
        .single(),
    ])

    if (!socio) {
      setError('No se encontró tu registro de socio.')
      setLoading(false)
      return
    }

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
      categoria,
      secondsLeft:  sLeft,
      fotoUrl:      fotoUrlRef.current,
      roles,
      division:     divData?.nombre ?? null,
      deporte:      divData?.deporte ?? null,
    })
    setError(null)
    setLoading(false)
  }, [userId, getSecret])

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
