// Alerta de 4 ausencias seguidas al guardar una asistencia (panel web).
//
// Copia de la parte pura de app/lib/ausenciasConsecutivas.ts: se lee una vez
// el historial reciente de la división (VENTANA_EVENTOS eventos) y se avisa
// sólo a quien ESTA carga le hace cruzar el tope (antes < 4, ahora >= 4). La
// lectura y el push (función `notifications`, tipo `ausencias_consecutivas`)
// siguen a verificarCuartaAusencia de app/hooks/useSincronizacionOffline.ts.
// El panel no puede importar de app/: mantener los dos en sync. Lógica pura
// (ausenciasConsecutivasWeb.check.ts).

export const TOPE_AUSENCIAS = 4

// Eventos con asistencia que se miran hacia atrás (los más recientes de la división).
export const VENTANA_EVENTOS = 12

export interface FilaHistorial {
  jugador_id: string
  evento_id: string
  estado: string
}

// Lo que se acaba de guardar para un jugador y lo que había antes en ese
// evento (null = no tenía fila).
export interface MarcaGuardada {
  jugador_id: string
  estado: string
  estadoPrevio: string | null
}

// Ausencias seguidas desde el evento más reciente. `eventos` va del más
// reciente al más viejo; un evento sin fila del jugador no corta ni suma.
export function rachaDeAusencias(eventos: string[], filas: FilaHistorial[], jugadorId: string): number {
  const porEvento = new Map<string, string>()
  for (const f of filas) if (f.jugador_id === jugadorId) porEvento.set(f.evento_id, f.estado)
  let racha = 0
  for (const ev of eventos) {
    const estado = porEvento.get(ev)
    if (estado === undefined) continue
    if (estado !== 'ausente') break
    racha++
  }
  return racha
}

// Jugadores a los que esta carga (de `eventoId`) les completa el tope.
// `filas` es el historial ya con lo guardado.
export function jugadoresQueLleganAlTope(
  eventos: string[],
  filas: FilaHistorial[],
  eventoId: string,
  marcas: MarcaGuardada[],
): string[] {
  const resultado: string[] = []
  for (const m of marcas) {
    if (m.estado !== 'ausente') continue
    const despues = rachaDeAusencias(eventos, filas, m.jugador_id)
    if (despues < TOPE_AUSENCIAS) continue
    const antes = filas
      .filter(f => !(f.jugador_id === m.jugador_id && f.evento_id === eventoId))
      .concat(m.estadoPrevio ? [{ jugador_id: m.jugador_id, evento_id: eventoId, estado: m.estadoPrevio }] : [])
    if (rachaDeAusencias(eventos, antes, m.jugador_id) < TOPE_AUSENCIAS) resultado.push(m.jugador_id)
  }
  return resultado
}

/** Marcas de un guardado del partido: presente/ausente y el estado que tenía antes. */
export function marcasDelGuardado(
  jugadores: { id: string; presente: boolean }[],
  estadosPrevios: Record<string, string>,
): MarcaGuardada[] {
  return jugadores.map(j => ({
    jugador_id: j.id,
    estado: j.presente ? 'presente' : 'ausente',
    estadoPrevio: estadosPrevios[j.id] ?? null,
  }))
}
