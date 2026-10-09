import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { useRefreshOnFocus } from './useRefreshOnFocus'

type Tablas = Database['public']['Tables']

export type ImportacionSocios = Pick<
  Tablas['importaciones_socios']['Row'],
  'id' | 'created_at' | 'archivo_nombre' | 'altas' | 'bajas' | 'actualizados' | 'sin_cambio' | 'errores'
>
export type ImportacionDeuda = Pick<
  Tablas['importaciones_deuda']['Row'],
  'id' | 'created_at' | 'fecha_corte' | 'archivo_nombre' | 'personas' | 'socios_matcheados' | 'sin_match' | 'reconcilia'
>
export type ImportacionServicios = Pick<
  Tablas['importaciones_servicios']['Row'],
  'id' | 'created_at' | 'archivo_nombre' | 'agregados' | 'actualizados' | 'eliminados' | 'omitidos' | 'sin_cambio' | 'errores'
>
export type EnvioRecordatorioDeuda = Pick<
  Tablas['recordatorios_deuda_envios']['Row'],
  'id' | 'ejecutado_at' | 'mes' | 'estado' | 'motivo' | 'destinatarios' | 'enviados' | 'sin_token'
>

// `null` means the section could not be read (RLS or network error); the
// screen shows it as unavailable instead of as empty.
export interface SistemaAdmin {
  importacionesSocios:    ImportacionSocios[] | null
  importacionesDeuda:     ImportacionDeuda[] | null
  importacionesServicios: ImportacionServicios[] | null
  recordatoriosDeuda:     EnvioRecordatorioDeuda[] | null
  pushTokens:             number | null
}

const VACIO: SistemaAdmin = {
  importacionesSocios:    null,
  importacionesDeuda:     null,
  importacionesServicios: null,
  recordatoriosDeuda:     null,
  pushTokens:             null,
}

// Read-only system status for admin. RLS allows admin SELECT on every table
// used here: importaciones_socios/_deuda (secretaria_admin_all_*),
// importaciones_servicios (secretaria_admin_select_*),
// recordatorios_deuda_envios (secretaria_admin_subcomision_select_*) and
// push_tokens (push_tokens_select_admin).
export function useSistemaAdmin() {
  const [sistema, setSistema] = useState<SistemaAdmin>(VACIO)
  const [loading, setLoading] = useState(true)

  const fetchSistema = useCallback(async () => {
    setLoading(true)
    const [socios, deuda, servicios, recordatorios, tokens] = await Promise.all([
      supabase
        .from('importaciones_socios')
        .select('id, created_at, archivo_nombre, altas, bajas, actualizados, sin_cambio, errores')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('importaciones_deuda')
        .select('id, created_at, fecha_corte, archivo_nombre, personas, socios_matcheados, sin_match, reconcilia')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('importaciones_servicios')
        .select('id, created_at, archivo_nombre, agregados, actualizados, eliminados, omitidos, sin_cambio, errores')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('recordatorios_deuda_envios')
        .select('id, ejecutado_at, mes, estado, motivo, destinatarios, enviados, sin_token')
        .order('ejecutado_at', { ascending: false })
        .limit(10),
      supabase
        .from('push_tokens')
        .select('id', { count: 'exact', head: true }),
    ])

    setSistema({
      importacionesSocios:    socios.error ? null : socios.data,
      importacionesDeuda:     deuda.error ? null : deuda.data,
      importacionesServicios: servicios.error ? null : servicios.data,
      recordatoriosDeuda:     recordatorios.error ? null : recordatorios.data,
      pushTokens:             tokens.error ? null : tokens.count ?? 0,
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchSistema() }, [fetchSistema])
  useRefreshOnFocus(fetchSistema)

  return { sistema, loading, refetch: fetchSistema }
}
