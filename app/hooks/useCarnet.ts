import { useState, useEffect, useCallback, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { generateTOTP, secondsUntilRefresh } from '@/lib/totp-client'

const TOTP_SECRET_KEY = 'totp_secret'

export interface CarnetData {
  numero_socio: string
  nombre:       string
  qrContent:    string   // "{numero_socio}:{totp_code}"
  code:         string   // 6-digit TOTP
  estado:       string
  categoria:    string
  secondsLeft:  number
}

export function useCarnet() {
  const { session } = useAuthStore()
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [data, setData]           = useState<CarnetData | null>(null)
  const lastStepRef               = useRef(-1)

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
    if (!session?.user.id) return

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
        .select('numero_socio, estado, categorias_socio ( nombre )')
        .eq('profile_id', session.user.id)
        .single(),
      supabase
        .from('profiles')
        .select('nombre')
        .eq('id', session.user.id)
        .single(),
    ])

    if (!socio) {
      setError('No se encontró tu registro de socio.')
      setLoading(false)
      return
    }

    const code      = await generateTOTP(secret)
    const sLeft     = secondsUntilRefresh()
    const categoria = (socio.categorias_socio as { nombre: string } | null)?.nombre ?? '—'
    const nombre    = profile?.nombre ?? '—'

    lastStepRef.current = Math.floor(Date.now() / 1000 / 30)

    setData({
      numero_socio: socio.numero_socio,
      nombre,
      qrContent:    `${socio.numero_socio}:${code}`,
      code,
      estado:       socio.estado,
      categoria,
      secondsLeft:  sLeft,
    })
    setError(null)
    setLoading(false)
  }, [session, getSecret])

  useEffect(() => { buildCarnet() }, [buildCarnet])

  // Tick every second: update countdown and regenerate code when step changes
  useEffect(() => {
    const timer = setInterval(async () => {
      const sLeft    = secondsUntilRefresh()
      const nowStep  = Math.floor(Date.now() / 1000 / 30)

      if (nowStep !== lastStepRef.current) {
        // New 30-second window — regenerate code
        await buildCarnet()
      } else {
        setData(prev => prev ? { ...prev, secondsLeft: sLeft } : null)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [buildCarnet])

  return { loading, error, data }
}
