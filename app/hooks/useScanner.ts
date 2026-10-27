import { useState, useCallback, useRef } from 'react'
import { useCameraPermissions } from 'expo-camera'
import { supabase } from '@/lib/supabase'
import { mensajeErrorFunction } from '@/lib/errorFunction'
import { parsearQR } from '@/lib/qrCarnet'
import { encolar } from '@/lib/offlineQueue'
import { useAuthStore } from '@/stores/authStore'
import { actualizarPendientes } from '@/hooks/useSincronizacionOffline'
import { cortadoTrasResultado, debeEncolarOffline, resolverReintento, resultadoEncoladoOffline, resultadoErrorRed, type EscaneoCortado, type ScanResult } from '@/lib/veredictoScan'

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
  // Foto firmada por la app cuando la socios-qr deployada no la manda (ver validar).
  const [fotoTardia, setFotoTardia]     = useState<{ para: ScanResult; url: string } | null>(null)
  // Validación en curso: se aborta con CANCELAR o por timeout.
  const enCurso = useRef<AbortController | null>(null)
  // Último QR que se cortó (timeout o CANCELAR) sin respuesta.
  const escaneoCortado = useRef<EscaneoCortado | null>(null)
  const rawEnCurso = useRef<string | null>(null)
  // Candado del lector: la cámara dispara onBarcodeScanned varias veces por
  // el mismo QR antes de que React aplique `setScanning(false)`, y cada
  // disparo era un invoke (y un registro en accesos). El ref se toma al
  // instante; se suelta sólo en reset / cancelar.
  const candado = useRef(false)

  // Llama a socios-qr y arma el resultado. Un error de red / timeout / 401 no
  // es un "QR inválido": vuelve como `errorRed` con un mensaje en castellano.
  //
  // Sin red (decisión 2026-10-26, opción b): la puerta deja pasar y encola el
  // escaneo crudo (`offline`: el QR o el DNI) con su hora; al volver la red
  // socios-qr lo valida a posteriori (useSincronizacionOffline). La pantalla
  // dice "SIN CONEXIÓN · INGRESO REGISTRADO SIN VALIDAR" para que el personal
  // mire a la persona. Si no se pudo guardar en la cola, sigue el SIN CONEXIÓN
  // que no deja pasar.
  const validar = useCallback(async (body: Record<string, unknown>, raw?: string, offline?: Record<string, unknown>) => {
    const escaneadoEn = new Date().toISOString()
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
        // socios-qr ya trae la foto firmada (`foto_url`): sin segundo viaje.
        sr = res.data as ScanResult
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

    // Cancelado (o reemplazado por otra validación): no pisar la pantalla (ni encolar).
    if (enCurso.current !== ctrl) return

    if (offline && debeEncolarOffline(sr)) {
      try {
        await encolar({
          tipo: 'acceso',
          payload: { ...offline, escaneado_en: escaneadoEn, rol: useAuthStore.getState().rol },
        })
        sr = resultadoEncoladoOffline()
        actualizarPendientes().catch(() => undefined)
      } catch (e) {
        console.warn('cola de accesos sin conexión:', e instanceof Error ? e.message : String(e))
      }
      if (enCurso.current !== ctrl) return
    }

    enCurso.current = null
    // La banda del veredicto sale ya; la foto llega después (la imagen carga sola).
    setResult(sr)
    setValidando(false)

    // Compatibilidad con una socios-qr anterior que no firma la foto: se firma
    // acá, sin demorar el veredicto. Va en un estado aparte (no en `result`)
    // para no volver a disparar el sonido ni el auto-reset de la pantalla.
    setFotoTardia(null)
    if (sr.valido && sr.foto_path && sr.foto_url === undefined) {
      const signed = await Promise.race([
        supabase.storage.from('socios-fotos').createSignedUrl(sr.foto_path, 60),
        new Promise<null>(resolve => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ])
      const url = signed?.data?.signedUrl
      if (url && enCurso.current === null) setFotoTardia({ para: sr, url })
    }
  }, [])

  const handleQR = useCallback(async (rawData: string) => {
    if (candado.current || !scanning || validando) return
    candado.current = true

    // Formato esperado: "{numero_socio}:{6-digit-code}" (lib/qrCarnet). Llega
    // igual desde la cámara o desde el modo "Ingresar código".
    const qr = parsearQR(rawData)
    if (!qr) {
      setResult({ valido: false, motivo: 'Formato de QR no reconocido' })
      setScanning(false)
      return
    }

    const { numero_socio, code } = qr
    rawEnCurso.current = rawData
    await validar({ action: 'validate', numero_socio, code }, rawData, { tipo: 'qr', qr: rawData })
    rawEnCurso.current = null
  }, [scanning, validando, validar])

  // Fallback sin QR — socio sin el celular encima. Mismo resultado, sin TOTP.
  const handleDNI = useCallback(async (dni: string) => {
    if (validando) return
    await validar({ action: 'validate-dni', dni }, undefined, { tipo: 'dni', dni })
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
    candado.current = false
    setValidando(false)
    setResult(null)
    setScanning(true)
  }, [])

  const reset = useCallback(() => {
    candado.current = false
    setResult(null)
    setScanning(true)
  }, [])

  // La foto del resultado en pantalla: la que trae socios-qr o la firmada después.
  const fotoUrl = result?.foto_url ?? (fotoTardia && fotoTardia.para === result ? fotoTardia.url : null)

  return {
    permission,
    requestPermission,
    result,
    fotoUrl,
    scanning,
    validando,
    handleQR,
    handleDNI,
    registrarInvitado,
    cancelar,
    reset,
  }
}
