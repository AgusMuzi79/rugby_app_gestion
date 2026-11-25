// Módulos que se pueden apagar sin borrar código ni datos.
//
// lesiones: el módulo de lesiones / protocolos está oculto (decisión del club
// 2026-10-26: datos de salud que el club no quiere tener). Pantallas, hooks,
// tablas, protocolos y la operación 'lesion' de la cola offline siguen en el
// código; volver a `true` lo restaura sin otros cambios. Su par en la web es
// web/lib/features.ts y en las Edge Functions el secreto FEATURE_LESIONES.
//
// tenis: reservas de canchas de tenis (odd/tasks/reservas-tenis.md). Prendido
// desde el lanzamiento (2026-11-25, tras el comunicado a los socios): opción
// Tenis del botón RESERVAR de la Agenda, pestaña Canchas de la gestora y
// pestaña Tenis del Canchero. Su par en la web es web/lib/features.ts.
//
// turneroGimnasio: reservas de turno del gimnasio. Apagado (2026-11-24): el
// botón RESERVAR de la Agenda abre un aviso ("Podés ir al gimnasio con
// normalidad"); con `true` el mismo sheet muestra TurnosGimnasio. Sólo app
// (la web no tiene turnero).
export const FEATURES = {
  lesiones:        false,
  tenis:           true,
  turneroGimnasio: false,
} as const
