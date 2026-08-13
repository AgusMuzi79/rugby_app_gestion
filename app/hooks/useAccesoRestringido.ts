import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// Google Play declara la app para 13+ (Target audience) — pero hasta ahora
// cualquier socio, sin importar la edad real, tenía cuenta con acceso pleno
// (incluidos los de divisiones M6-M12 de la carga masiva). Decisión de Agus
// (2026-08-13): un socio menor de 13 no opera la app — la cuenta sigue
// existiendo (carnet/QR/registros la necesitan), pero queda bloqueada al
// intentar usarla. Retroactivo: aplica también a cuentas ya creadas.
const EDAD_MINIMA = 13

function tieneMenosDe(fechaNacimiento: string, anios: number): boolean {
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - anios)
  return new Date(fechaNacimiento) > limite
}

export function useAccesoRestringido() {
  const session = useAuthStore(s => s.session)
  const [loading, setLoading]         = useState(true)
  const [restringido, setRestringido] = useState(false)

  const fetchEstado = useCallback(async () => {
    if (!session) { setLoading(false); return }
    setLoading(true)

    const { data: socio } = await supabase
      .from('socios')
      .select('fecha_nacimiento')
      .eq('profile_id', session.user.id)
      .maybeSingle()

    setRestringido(!!socio?.fecha_nacimiento && tieneMenosDe(socio.fecha_nacimiento, EDAD_MINIMA))
    setLoading(false)
  }, [session])

  useEffect(() => { fetchEstado() }, [fetchEstado])

  return { loading, restringido }
}
