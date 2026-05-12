import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export type RolDestinatario = 'coordinador' | 'entrenador' | 'manager' | 'todos'

export interface NotifForm {
  titulo:          string
  mensaje:         string
  rolDestinatario: RolDestinatario
}

export interface NotifEnviada {
  id:                  string
  titulo:              string
  mensaje:             string
  created_at:          string
  totalDestinatarios:  number
}

const FORM_INICIAL: NotifForm = {
  titulo:          '',
  mensaje:         '',
  rolDestinatario: 'todos',
}

export function useNotificaciones() {
  const session = useAuthStore(s => s.session)

  const [loading,       setLoading]       = useState(true)
  const [historial,     setHistorial]     = useState<NotifEnviada[]>([])
  const [modalVisible,  setModalVisible]  = useState(false)
  const [form,          setForm]          = useState<NotifForm>(FORM_INICIAL)
  const [enviando,      setEnviando]      = useState(false)
  const [errorEnvio,    setErrorEnvio]    = useState<string | null>(null)

  const cargarHistorial = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notificaciones')
      .select('id, titulo, mensaje, created_at, notificaciones_destinatarios(id)')
      .eq('tipo', 'manual')
      .order('created_at', { ascending: false })
      .limit(30)

    setHistorial(
      (data ?? []).map(n => ({
        id:                 n.id,
        titulo:             n.titulo,
        mensaje:            n.mensaje,
        created_at:         n.created_at,
        totalDestinatarios: Array.isArray(n.notificaciones_destinatarios)
          ? n.notificaciones_destinatarios.length
          : 0,
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarHistorial()
  }, [cargarHistorial])

  function abrirModal()  { setForm(FORM_INICIAL); setErrorEnvio(null); setModalVisible(true) }
  function cerrarModal() { setModalVisible(false) }

  async function enviarNotificacion(): Promise<boolean> {
    if (!form.titulo.trim()) { setErrorEnvio('El título es requerido'); return false }
    if (!form.mensaje.trim()) { setErrorEnvio('El mensaje es requerido'); return false }

    setEnviando(true)
    setErrorEnvio(null)

    try {
      const userId = session!.user.id

      // 1. Insertar notificación en DB
      const { data: notif, error: notifErr } = await supabase
        .from('notificaciones')
        .insert({
          tipo:             'manual',
          origen_usuario_id: userId,
          titulo:           form.titulo.trim(),
          mensaje:          form.mensaje.trim(),
        })
        .select('id')
        .single()

      if (notifErr || !notif) throw notifErr ?? new Error('Error al crear notificación')

      // 2. Obtener IDs de destinatarios por rol
      const roles = form.rolDestinatario === 'todos'
        ? ['coordinador', 'entrenador', 'manager']
        : [form.rolDestinatario]

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .in('rol', roles)
        .eq('activo', true)

      const recipientIds = (profiles ?? []).map(p => p.id)

      // 3. Insertar destinatarios
      if (recipientIds.length > 0) {
        await supabase
          .from('notificaciones_destinatarios')
          .insert(recipientIds.map(usuario_id => ({
            notificacion_id: notif.id,
            usuario_id,
          })))
      }

      // 4. Push notification (fire-and-forget)
      void supabase.functions.invoke('notifications', {
        body: {
          type:    'manual',
          payload: {
            titulo:          form.titulo.trim(),
            mensaje:         form.mensaje.trim(),
            rolDestinatario: form.rolDestinatario,
          },
        },
      })

      // 5. Actualizar historial localmente
      setHistorial(prev => [
        {
          id:                notif.id,
          titulo:            form.titulo.trim(),
          mensaje:           form.mensaje.trim(),
          created_at:        new Date().toISOString(),
          totalDestinatarios: recipientIds.length,
        },
        ...prev,
      ])

      return true
    } catch (e) {
      setErrorEnvio((e as Error).message)
      return false
    } finally {
      setEnviando(false)
    }
  }

  return {
    loading,
    historial,
    modalVisible,
    abrirModal,
    cerrarModal,
    form,
    setForm,
    enviando,
    errorEnvio,
    enviarNotificacion,
  }
}
