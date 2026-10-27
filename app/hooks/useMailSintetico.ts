import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// Gate post-login: si el mail de la cuenta es el sintético que asigna la
// carga masiva (socio-{numero}@uncas.local, para quien no tenía mail propio
// en NUVIX) y todavía no eligió "ahora no", se lo manda a registrar un mail
// real antes de entrar a la app — ver app/(auth)/registrar-mail.tsx.
//
// Estado compartido: la pantalla de registrar-mail lo destraba al guardar u
// omitir (marcarMailResuelto). Con una copia local por hook, el guard del
// layout seguía viendo "pendiente" y la devolvía a la pantalla.
const useMailSinteticoStore = create<{ loading: boolean; pendiente: boolean }>(() => ({
  loading: true,
  pendiente: false,
}))

let cargadoPara: string | null = null

export function marcarMailResuelto() {
  useMailSinteticoStore.setState({ loading: false, pendiente: false })
}

export function useMailSintetico() {
  const session = useAuthStore(s => s.session)
  const { loading, pendiente } = useMailSinteticoStore()

  const fetchEstado = useCallback(async () => {
    if (!session) { useMailSinteticoStore.setState({ loading: false }); return }

    const email = session.user.email ?? ''
    if (!email.endsWith('@uncas.local')) {
      useMailSinteticoStore.setState({ loading: false, pendiente: false })
      return
    }

    const userId = session.user.id
    // `loading` sólo en la primera lectura de la cuenta: el refresh del token
    // re-corre esto y no tiene que volver a "cargando" al gate del layout.
    if (cargadoPara !== userId) useMailSinteticoStore.setState({ loading: true, pendiente: false })
    const { data, error } = await supabase
      .from('profiles')
      .select('mail_sintetico_omitido')
      .eq('id', userId)
      .maybeSingle()

    // La sesión ya es de otra cuenta: el resultado no es de esta.
    if (useAuthStore.getState().session?.user.id !== userId) return
    // Sin poder leer el perfil (sin red) no se cierra el paso a la app: el
    // gate es opcional ("ahora no") y vuelve a preguntar en la próxima lectura.
    if (error) { useMailSinteticoStore.setState({ loading: false }); return }
    cargadoPara = userId
    useMailSinteticoStore.setState({ loading: false, pendiente: !data?.mail_sintetico_omitido })
  }, [session])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  return { loading, pendiente, refetch: fetchEstado }
}
