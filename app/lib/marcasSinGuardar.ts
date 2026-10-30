// Marcas de asistencia que todavía no se guardaron (auditoría entrenador T3).
//
// Cambiar de división o de turno en Asistencia (o de partido en Partido)
// recargaba la lista y borraba las marcas sin avisar. Con esto la pantalla
// sabe si hay algo que perder y pregunta antes (Seguir / Guardar y cambiar /
// Descartar). Lógica pura (marcasSinGuardar.check.ts).

export interface MarcaConGuardado<E> {
  estado:         E | null
  estadoGuardado: E | null // lo que hay en la base (o en la cola) para ese jugador
}

export function cantidadSinGuardar<E>(jugadores: MarcaConGuardado<E>[]): number {
  return jugadores.filter(j => j.estado !== j.estadoGuardado).length
}

// Partido: todos arrancan presentes; `guardado` tiene lo último cargado o
// guardado por jugador (sin entrada = presente).
export function presenciasSinGuardar(
  jugadores: { id: string; presente: boolean }[],
  guardado: Record<string, boolean>,
): number {
  return jugadores.filter(j => j.presente !== (guardado[j.id] ?? true)).length
}

export function textoSinGuardar(cantidad: number, donde: string): string {
  const marcas = `${cantidad} marca${cantidad === 1 ? '' : 's'}`
  return `Tenés ${marcas} sin guardar${donde ? ` en ${donde}` : ''}.`
}
