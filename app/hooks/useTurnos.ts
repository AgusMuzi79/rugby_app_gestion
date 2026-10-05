import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from './useRefreshOnFocus'

// Turnero del gimnasio (Edge Function `gimnasio-turnos`). Día de semana ISO: 1 = lunes … 7 = domingo.

export interface FranjaTurno {
  franja_id:   string
  hora_desde:  string   // HH:MM
  hora_hasta:  string   // HH:MM
  capacidad:   number
  ocupados:    number
  disponibles: number
  cerrado:     boolean
  motivo_cierre: string | null   // mensaje del encargado cuando la franja está cerrada
  profesor:    string | null   // texto libre del encargado (p. ej. 'Ana / Luis'), si cargó alguno
  pasada:      boolean
  reservada:   boolean
  reserva_id:  string | null
}

export interface DiaTurnos {
  fecha:      string    // YYYY-MM-DD
  dia_semana: number
  franjas:    FranjaTurno[]
}

export interface TurnoFijo {
  turno_fijo_id:       string
  franja_id:           string
  dia_semana:          number | null
  hora_desde:          string | null
  hora_hasta:          string | null
  faltas_consecutivas: number
}

interface Disponibilidad {
  dias: DiaTurnos[]
}

export interface ResultadoAccion {
  ok:      boolean
  motivo?: string
}

const ERROR_GENERICO = 'No se pudo completar la operación. Probá de nuevo en un rato.'

// Las fallas de validación llegan como 200 { ok:false, motivo }; los errores reales como
// non-2xx, cuyo body `functions.invoke` no expone: ahí se muestra un mensaje genérico.
async function invocar<T extends { ok: boolean; motivo?: string }>(
  body: Record<string, unknown>,
): Promise<T | { ok: false; motivo: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('gimnasio-turnos', { body })
    if (error || !data) return { ok: false, motivo: ERROR_GENERICO }
    return data as T
  } catch {
    return { ok: false, motivo: ERROR_GENERICO }
  }
}

export function useTurnos() {
  const [disp,    setDisp]    = useState<Disponibilidad | null>(null)
  const [fijos,   setFijos]   = useState<TurnoFijo[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const [listado, mis] = await Promise.all([
      invocar<{ ok: boolean; motivo?: string } & Partial<Disponibilidad>>({ action: 'listar' }),
      invocar<{ ok: boolean; motivo?: string; fijos?: TurnoFijo[] }>({ action: 'mis-reservas' }),
    ])

    if (!listado.ok) {
      setError(listado.motivo ?? ERROR_GENERICO)
      setDisp(null)
      setFijos([])
    } else {
      const l = listado as Disponibilidad
      setDisp({ dias: l.dias ?? [] })
      setFijos(mis.ok ? ((mis as { fijos?: TurnoFijo[] }).fijos ?? []) : [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useRefreshOnFocus(fetch)

  // Ejecuta una acción de escritura y refresca el listado si salió bien.
  const ejecutar = useCallback(async (body: Record<string, unknown>): Promise<ResultadoAccion> => {
    const r = await invocar<{ ok: boolean; motivo?: string }>(body)
    if (r.ok) await fetch()
    return { ok: r.ok, motivo: r.ok ? undefined : r.motivo }
  }, [fetch])

  const reservar    = useCallback((franjaId: string, fecha: string) =>
    ejecutar({ action: 'reservar', franja_id: franjaId, fecha }), [ejecutar])
  const cancelar    = useCallback((reservaId: string) =>
    ejecutar({ action: 'cancelar', reserva_id: reservaId }), [ejecutar])
  const crearFijo   = useCallback((franjaId: string) =>
    ejecutar({ action: 'crear-fijo', franja_id: franjaId }), [ejecutar])
  const cancelarFijo = useCallback((turnoFijoId: string) =>
    ejecutar({ action: 'cancelar-fijo', turno_fijo_id: turnoFijoId }), [ejecutar])

  return {
    dias: disp?.dias ?? [],
    fijos,
    loading,
    error,
    refetch: fetch,
    reservar,
    cancelar,
    crearFijo,
    cancelarFijo,
  }
}
