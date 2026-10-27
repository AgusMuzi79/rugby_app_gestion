import { useCallback, useState } from 'react'
import { ESTADO_CARGA_INICIAL, transicionCarga } from '@/lib/estadoCarga'

// Reemplaza el par `setLoading(true)` / `setLoading(false)` de los hooks que
// refrescan al volver a la pestaña: `empezar()` al arrancar un fetch y
// `terminar()` al final (también en los caminos de error). Sólo la primera
// carga es `loading`; las demás son `refrescando` (ver lib/estadoCarga.ts).
export function useEstadoCarga() {
  const [estado, setEstado] = useState(ESTADO_CARGA_INICIAL)
  const empezar  = useCallback(() => setEstado(e => transicionCarga(e, 'empezar')), [])
  const terminar = useCallback(() => setEstado(e => transicionCarga(e, 'terminar')), [])
  return { loading: estado.loading, refrescando: estado.refrescando, empezar, terminar }
}
