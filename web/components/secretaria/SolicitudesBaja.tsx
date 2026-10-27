'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Solicitudes de baja de cuenta pedidas desde la app (Mi perfil › CUENTA,
// auditoría UX socio T11 / App Store 5.1.1(v)). La app no borra nada:
// Secretaría contacta a la persona, hace la baja a mano y marca la solicitud
// como procesada (o rechazada si la persona se arrepiente).

interface SolicitudPendiente {
  id: string
  created_at: string
  nombre: string
  numero_socio: string | null
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SolicitudesBaja() {
  const [items,      setItems]      = useState<SolicitudPendiente[]>([])
  const [error,      setError]      = useState('')
  const [procesando, setProcesando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('solicitudes_baja')
      .select('id, created_at, profiles!solicitudes_baja_profile_id_fkey(nombre), socios(numero_socio)')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true })

    if (err) { setError('No se pudieron cargar las solicitudes de baja.'); return }
    setError('')
    setItems((data ?? []).map((r: Record<string, unknown>) => {
      const perfil = r.profiles as { nombre: string | null } | null
      const socio  = r.socios as { numero_socio: string | null } | null
      return {
        id:           r.id as string,
        created_at:   r.created_at as string,
        nombre:       perfil?.nombre ?? '—',
        numero_socio: socio?.numero_socio ?? null,
      }
    }))
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const resolver = async (item: SolicitudPendiente, estado: 'procesada' | 'rechazada') => {
    const pregunta = estado === 'procesada'
      ? `¿Marcar como procesada la baja de ${item.nombre}? Hacelo después de dar de baja a la persona.`
      : `¿Rechazar la solicitud de baja de ${item.nombre}? (por ejemplo, si se arrepintió)`
    if (!confirm(pregunta)) return

    setProcesando(item.id)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase
      .from('solicitudes_baja')
      .update({ estado, procesada_at: new Date().toISOString(), procesada_por: user?.id ?? null })
      .eq('id', item.id)
      .eq('estado', 'pendiente')
    setProcesando(null)

    if (err) { setError('No se pudo actualizar la solicitud. Probá de nuevo.'); return }
    void cargar()
  }

  if (!error && items.length === 0) return null

  return (
    <div className="mb-6 border border-rojo/40 bg-card p-5">
      <p className="font-lora text-xs tracking-widest text-rojo-texto mb-1">
        SOLICITUDES DE BAJA PENDIENTES ({items.length})
      </p>
      <p className="font-lora text-tinta/50 text-sm mb-4">
        Pedidas desde la app. Contactá a la persona para confirmar antes de darla de baja.
      </p>

      {error && <p className="font-lora text-rojo-texto text-sm mb-3">{error}</p>}

      <div className="flex flex-col gap-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-4 border-t border-gris-claro pt-3">
            <div className="flex-1">
              <p className="font-playfair italic text-lg text-tinta">{item.nombre}</p>
              <p className="font-lora text-xs tracking-widest text-oro-hondo">
                {item.numero_socio ? `Nº ${item.numero_socio}` : 'SIN Nº DE SOCIO (FAMILIAR / CUENTA SIN SOCIO)'}
                <span className="text-tinta/50"> · PEDIDA EL {formatFecha(item.created_at)}</span>
              </p>
            </div>
            <button
              onClick={() => resolver(item, 'procesada')}
              disabled={procesando === item.id}
              className="font-lora text-xs tracking-widest px-4 py-2 border border-tinta/40 text-tinta hover:bg-tinta/5 transition-colors disabled:opacity-50"
            >
              MARCAR PROCESADA
            </button>
            <button
              onClick={() => resolver(item, 'rechazada')}
              disabled={procesando === item.id}
              className="font-lora text-xs tracking-widest px-4 py-2 border border-gris-claro text-tinta/60 hover:text-tinta transition-colors disabled:opacity-50"
            >
              RECHAZAR
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
