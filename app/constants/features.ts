// Módulos que se pueden apagar sin borrar código ni datos.
//
// lesiones: el módulo de lesiones / protocolos está oculto (decisión del club
// 2026-10-26: datos de salud que el club no quiere tener). Pantallas, hooks,
// tablas, protocolos y la operación 'lesion' de la cola offline siguen en el
// código; volver a `true` lo restaura sin otros cambios. Su par en la web es
// web/lib/features.ts y en las Edge Functions el secreto FEATURE_LESIONES.
export const FEATURES = {
  lesiones: false,
} as const
