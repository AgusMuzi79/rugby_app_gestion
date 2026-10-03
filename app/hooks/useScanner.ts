import { useState, useCallback } from 'react'
import { useCameraPermissions } from 'expo-camera'
import { supabase } from '@/lib/supabase'

export interface ScanResult {
  valido:        boolean
  motivo?:       string
  nombre?:       string
  numero_socio?: string
  estado?:       string
  semaforo?:     string | null
  categoria?:    string
  foto_path?:    string | null
  foto_validada?: boolean
  foto_url?:     string | null   // signed URL, resolved after validate
}

// Respuesta de la acción `registrar-invitado` de socios-qr. `ok: false` trae
// el motivo (DNI inválido, el DNI es de un socio, etc.); `veces` cuenta los
// ingresos de ese DNI como invitado en los últimos 30 días, incluido éste.
export interface InvitadoResult {
  ok:      boolean
  motivo?: string
  dni?:    string
  nombre?: string | null
  veces?:  number
}

// Desde cuántas visitas en 30 días se sugiere derivar al invitado a Secretaría.
export const UMBRAL_INVITADO_REPETIDO = 3

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

  // Fallback sin QR — socio sin el celular encima. Mismo resultado, sin TOTP.
  const handleDNI = useCallback(async (dni: string) => {
    if (validando) return

    setValidando(true)
    setScanning(false)

    const res = await supabase.functions.invoke('socios-qr', {
      body: { action: 'validate-dni', dni },
    })

    let sr: ScanResult
    if (res.error) {
      sr = { valido: false, motivo: res.error.message }
    } else {
      sr = res.data as ScanResult
      if (sr.valido && sr.foto_path) {
        const { data: signed } = await supabase.storage
          .from('socios-fotos')
          .createSignedUrl(sr.foto_path, 60)
        sr = { ...sr, foto_url: signed?.signedUrl ?? null }
      }
    }

    setResult(sr)
    setValidando(false)
  }, [validando])

  // Invitado (no-socio): DNI obligatorio, nombre opcional. No toca `result` —
  // la pantalla muestra su propia confirmación.
  const registrarInvitado = useCallback(async (dni: string, nombre: string): Promise<InvitadoResult> => {
    const res = await supabase.functions.invoke('socios-qr', {
      body: { action: 'registrar-invitado', dni, nombre: nombre.trim() || undefined },
    })
    if (res.error) return { ok: false, motivo: res.error.message }
    return res.data as InvitadoResult
  }, [])

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
    handleDNI,
    registrarInvitado,
    reset,
  }
}
