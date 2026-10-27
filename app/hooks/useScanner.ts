import { useState, useCallback, useRef } from 'react'
import { useCameraPermissions } from 'expo-camera'
import { supabase } from '@/lib/supabase'
import { mensajeErrorFunction } from '@/lib/errorFunction'
import { cortadoTrasResultado, resolverReintento, resultadoErrorRed, type EscaneoCortado, type ScanResult } from '@/lib/veredictoScan'

export type { ScanResult, TurnoActual } from '@/lib/veredictoScan'

// Respuesta de la acción `registrar-invitado` de socios-qr. `ok: false` trae
// el motivo (DNI inválido, el DNI es de un socio, etc.); `veces` cuenta los
// ingresos de ese DNI como invitado en los últimos 30 días, incluido éste
// (null si el registro salió bien pero no se pudo calcular la cuenta).
export interface InvitadoResult {
  ok:      boolean
  motivo?: string
  dni?:    string
  nombre?: string | null
  veces?:  number | null
}

// Desde cuántas visitas en 30 días se sugiere derivar al invitado a Secretaría.
export const UMBRAL_INVITADO_REPETIDO = 3

// Sin respuesta en este tiempo, el escáner deja de esperar y lo dice (antes el
// spinner quedaba colgado hasta que el sistema operativo se rendía).
const TIMEOUT_MS = 6000

export function useScanner() {
  const [permission, requestPermission] = useCameraPermissions()
  const [result, setResult]             = useState<ScanResult | null>(null)
  const [scanning, setScanning]         = useState(true)
  const [validando, setValidando]       = useState(false)
  // Validación en curso: se aborta con CANCELAR o por timeout.
  const enCurso = useRef<AbortController | null>(null)
  // Último QR que se cortó (timeout o CANCELAR) sin respuesta.
  const escaneoCortado = useRef<EscaneoCortado | null>(null)
  const rawEnCurso = useRef<string | null>(null)

  // Llama a socios-qr y arma el resultado. Un error de red / timeout / 401 no
  // es un "QR inválido": vuelve como `errorRed` con un mensaje en castellano.
  const validar = useCallback(async (body: Record<string, unknown>, raw?: string) => {
    const ctrl = new AbortController()
    enCurso.current = ctrl
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    setValidando(true)
    setScanning(false)

    let sr: ScanResult
    try {
      const res = await supabase.functions.invoke('socios-qr', { body, signal: ctrl.signal })
      if (res.error) {
        const status = (res.error as { context?: { status?: number } }).context?.status
        sr = resultadoErrorRed(typeof status === 'number' ? status : undefined)
      } else {
        sr = res.data as ScanResult
        // Foto para portería, dentro del mismo límite de tiempo: si la firma
        // no llega a tiempo se muestra el resultado sin foto.
        if (sr.valido && sr.foto_path) {
          const signed = await Promise.race([
            supabase.storage.from('socios-fotos').createSignedUrl(sr.foto_path, 60),
            new Promise<null>(resolve => ctrl.signal.addEventListener('abort', () => resolve(null))),
          ])
          sr = { ...sr, foto_url: signed?.data?.signedUrl ?? null }
        }
      }
    } catch {
      sr = resultadoErrorRed(undefined)
    } finally {
      clearTimeout(timer)
    }

    // Un QR que no tuvo respuesta pudo quedar registrado (y su código
    // consumido) en el server: se recuerda para reconocer el reintento.
    if (raw && sr.errorRed) escaneoCortado.current = { raw, en: Date.now() }
    if (raw) {
      sr = resolverReintento(sr, raw, escaneoCortado.current, Date.now())
      escaneoCortado.current = cortadoTrasResultado(sr, escaneoCortado.current)
    }

    // Cancelado (o reemplazado por otra validación): no pisar la pantalla.
    if (enCurso.current !== ctrl) return
    enCurso.current = null
    setResult(sr)
    setValidando(false)
  }, [])

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
    rawEnCurso.current = rawData
    await validar({ action: 'validate', numero_socio, code }, rawData)
    rawEnCurso.current = null
  }, [scanning, validando, validar])

  // Fallback sin QR — socio sin el celular encima. Mismo resultado, sin TOTP.
  const handleDNI = useCallback(async (dni: string) => {
    if (validando) return
    await validar({ action: 'validate-dni', dni })
  }, [validando, validar])

  // Invitado (no-socio): DNI obligatorio, nombre opcional. No toca `result` —
  // la pantalla muestra su propia confirmación.
  const registrarInvitado = useCallback(async (dni: string, nombre: string): Promise<InvitadoResult> => {
    const res = await supabase.functions.invoke('socios-qr', {
      body: { action: 'registrar-invitado', dni, nombre: nombre.trim() || undefined },
    })
    if (res.error) return { ok: false, motivo: await mensajeErrorFunction(res.error, 'No se pudo registrar al invitado. Probá de nuevo.') }
    return res.data as InvitadoResult
  }, [])

  // CANCELAR mientras se valida: vuelve a la cámara sin esperar al server.
  const cancelar = useCallback(() => {
    // El server pudo haber registrado el ingreso igual: recordar el QR.
    if (rawEnCurso.current) escaneoCortado.current = { raw: rawEnCurso.current, en: Date.now() }
    enCurso.current?.abort()
    enCurso.current = null
    setValidando(false)
    setResult(null)
    setScanning(true)
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
    cancelar,
    reset,
  }
}
