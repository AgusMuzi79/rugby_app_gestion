// Primera carga vs. relectura de una pantalla.
//
// Los hooks que refrescan al volver a la pestaña (useRefreshOnFocus) ponían
// `loading: true` en cada foco: la pantalla se reemplazaba por un spinner, la
// lista parpadeaba y un detalle abierto se desmontaba (se perdía lo tipeado).
// Ahora sólo la primera carga es `loading`; las siguientes son `refrescando`
// (silencioso, para un RefreshControl). Lógica pura (estadoCarga.check.ts);
// el hook está en hooks/useEstadoCarga.ts.

export interface EstadoCarga {
  loading:     boolean // primera carga: spinner de pantalla completa
  refrescando: boolean // relectura: sin tapar la pantalla
  cargado:     boolean // ya terminó al menos una carga
}

export const ESTADO_CARGA_INICIAL: EstadoCarga = { loading: true, refrescando: false, cargado: false }

export function transicionCarga(e: EstadoCarga, evento: 'empezar' | 'terminar'): EstadoCarga {
  if (evento === 'terminar') return { loading: false, refrescando: false, cargado: true }
  return e.cargado
    ? { loading: false, refrescando: true, cargado: true }
    : { loading: true, refrescando: false, cargado: false }
}
