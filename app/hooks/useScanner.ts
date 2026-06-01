import { useState, useCallback } from 'react'
import { useCameraPermissions } from 'expo-camera'
import { supabase } from '@/lib/supabase'

export interface ScanResult {
  valido:        boolean
  motivo?:       string
  nombre?:       string
  numero_socio?: string
  estado?:       string
  categoria?:    string
  foto_path?:    string | null
  foto_validada?: boolean
  foto_url?:     string | null   // signed URL, resolved after validate
}

export function useScanner() {
  const [permission, requestPermission] = useCameraPermissions()
  const [result, setResult]             = useState<ScanResult | null>(null)
  const [scanning, setScanning]         = useState(true)
  const [validando, setValidando]       = useState(false)

  const handleQR = useCallback(async (rawData: string) => {
    if (!scanning || validando) return

    // Formato esperado: "{numero_socio}:{6-digit-code}"
    const parts = rawData.split(':')
    if (parts.length !== 2 || !/^\d{6}$/.test(parts[1])) {
      setResult({ valido: false, motivo: 'Formato de QR no reconocido' })
      setScanning(false)
      return
    }

    const [numero_socio, code] = parts
    setValidando(true)
    setScanning(false)

    const res = await supabase.functions.invoke('socios-qr', {
      body: { action: 'validate', numero_socio, code },
    })

    let sr: ScanResult
    if (res.error) {
      sr = { valido: false, motivo: res.error.message }
    } else {
      sr = res.data as ScanResult
      // Si hay foto_path, obtener signed URL para mostrársela a portería
      if (sr.valido && sr.foto_path) {
        const { data: signed } = await supabase.storage
          .from('socios-fotos')
          .createSignedUrl(sr.foto_path, 60)
        sr = { ...sr, foto_url: signed?.signedUrl ?? null }
      }
    }

    setResult(sr)
    setValidando(false)
  }, [scanning, validando])

  const reset = useCallback(() => {
    setResult(null)
    setScanning(true)
  }, [])

  return {
    permission,
    requestPermission,
    result,
    scanning,
    validando,
    handleQR,
    reset,
  }
}
