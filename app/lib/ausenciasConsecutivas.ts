// Alerta de 4 ausencias seguidas al guardar asistencia (auditoría entrenador T18).
//
// Antes se hacía una consulta por jugador (N+1) y el push salía en cada
// guardado mientras la racha siguiera en 4 o más. Ahora se lee una vez el
// historial reciente de la división y se avisa sólo cuando ESTA carga hace
// cruzar el tope (antes < 4, ahora >= 4). Lo usan el guardado online
// (useAsistencia) y la sync offline (useSincronizacionOffline).
// Lógica pura (ausenciasConsecutivas.check.ts).

export const TOPE_AUSENCIAS = 4

// Eventos con asistencia que se miran hacia atrás (los más recientes de la
// división). Con 40 jugadores son ≤ 480 filas: entra en una sola lectura.
export const VENTANA_EVENTOS = 12

export interface FilaHistorial {
  jugador_id: string
  evento_id:  string
  estado:     string
}

// Lo que se acaba de guardar para un jugador y lo que había antes en ese
// evento (null = no tenía fila).
export interface MarcaGuardada {
  jugador_id:   string
  estado:       string
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
    // El historial como estaba antes de esta carga.
    const antes = filas
      .filter(f => !(f.jugador_id === m.jugador_id && f.evento_id === eventoId))
      .concat(m.estadoPrevio ? [{ jugador_id: m.jugador_id, evento_id: eventoId, estado: m.estadoPrevio }] : [])
    if (rachaDeAusencias(eventos, antes, m.jugador_id) < TOPE_AUSENCIAS) resultado.push(m.jugador_id)
  }
  return resultado
}
