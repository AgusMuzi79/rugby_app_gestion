import { useState, useEffect, useCallback, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { generateTOTP, secondsUntilRefresh } from '@/lib/totp-client'

const TOTP_SECRET_KEY = 'totp_secret'
const TOTP_STEP       = 60

export interface CarnetData {
  numero_socio: string
  nombre:       string
  qrContent:    string
  code:         string
  estado:       string
  categoria:    string
  secondsLeft:  number
  fotoUrl:      string | null
}

export function useCarnet() {
  const { session }  = useAuthStore()
  const userId       = session?.user.id
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [data, setData]       = useState<CarnetData | null>(null)
  const lastStepRef           = useRef(-1)
  const fotoUrlRef            = useRef<string | null | undefined>(undefined)

  const getSecret = useCallback(async (): Promise<string | null> => {
    const cached = await SecureStore.getItemAsync(TOTP_SECRET_KEY)
    if (cached) return cached

    const res = await supabase.functions.invoke('socios-qr', {
      body: { action: 'get-secret' },
    })
    if (res.error || !res.data?.secret) return null

    await SecureStore.setItemAsync(TOTP_SECRET_KEY, res.data.secret)
    return res.data.secret as string
  }, [])

  const buildCarnet = useCallback(async () => {
    if (!userId) return

    const secret = await getSecret()
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
        .select('nombre')
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

    const code      = generateTOTP(secret)
    const sLeft     = secondsUntilRefresh()
    const categoria = (socio.categorias_socio as { nombre: string } | null)?.nombre ?? '—'
    const nombre    = profile?.nombre ?? '—'

    lastStepRef.current = Math.floor(Date.now() / 1000 / TOTP_STEP)

    setData({
      numero_socio: socio.numero_socio,
      nombre,
      qrContent:    `${socio.numero_socio}:${code}`,
      code,
      estado:       socio.estado,
      categoria,
      secondsLeft:  sLeft,
      fotoUrl:      fotoUrlRef.current,
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
