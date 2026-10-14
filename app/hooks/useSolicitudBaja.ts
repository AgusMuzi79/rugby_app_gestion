import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  esSolicitudDuplicada,
  vistaSolicitudBaja,
  type EstadoSolicitudBaja,
  type SolicitudBaja,
} from '@/lib/solicitudBaja'

// "Solicitar baja de la cuenta" en Mi perfil (auditoría UX, T11). Lee la
// última solicitud propia y crea una nueva. La baja real la hace Secretaría
// (panel web); la app nunca borra el profile ni el usuario.
export function useSolicitudBaja() {
  const { session } = useAuthStore()
  const userId = session?.user?.id ?? null

  const [ultima, setUltima]       = useState<SolicitudBaja | null>(null)
  const [cargando, setCargando]   = useState(true)
  const [enviando, setEnviando]   = useState(false)

  const cargar = useCallback(async () => {
    if (!userId) { setCargando(false); return }
    const { data, error } = await supabase
      .from('solicitudes_baja')
      .select('estado, created_at, procesada_at')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Con error de lectura no se sabe si ya pidió la baja: se muestra el botón
    // igual y, si ya había una pendiente, el insert lo detecta (índice único).
    if (!error) {
      setUltima(data ? { ...data, estado: data.estado as EstadoSolicitudBaja } : null)
    }
    setCargando(false)
  }, [userId])

  useEffect(() => { void cargar() }, [cargar])

  // Devuelve un mensaje de error para mostrar, o null si quedó registrada.
  async function solicitar(socioId: string | null): Promise<string | null> {
    if (!userId) return 'No hay una sesión activa.'
    setEnviando(true)
    try {
      const { data, error } = await supabase
        .from('solicitudes_baja')
        .insert({ profile_id: userId, socio_id: socioId })
        .select('estado, created_at, procesada_at')
        .single()
      if (error) {
        if (esSolicitudDuplicada(error)) { await cargar(); return null }
        return 'No se pudo enviar la solicitud. Revisá tu conexión y probá de nuevo.'
      }
      setUltima({ ...data, estado: data.estado as EstadoSolicitudBaja })
      return null
    } catch {
      return 'No se pudo enviar la solicitud. Revisá tu conexión y probá de nuevo.'
    } finally {
      setEnviando(false)
    }
  }

  return {
    cargando,
    enviando,
    vista: vistaSolicitudBaja(ultima),
    solicitar,
  }
}
