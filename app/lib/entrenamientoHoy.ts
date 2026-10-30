// A qué evento va la asistencia del entrenador (auditoría entrenador T6).
//
// Antes "TOMAR ASISTENCIA" salía para el próximo evento (un partido del sábado,
// un entrenamiento del jueves) y la pantalla siempre buscaba el entrenamiento de
// hoy con `.maybeSingle()`: con doble turno tiraba error y se creaba un tercero.
// Ahora el botón sale sólo para el entrenamiento de hoy, la pantalla lista los
// entrenamientos de hoy y, si hay más de uno, el entrenador elige.
// Lógica pura (entrenamientoHoy.check.ts).

export interface EntrenamientoHoy {
  id:   string
  hora: string | null // 'HH:MM:SS' de la columna time
}

export type AccionEvento = 'asistencia' | 'partido' | null

// Botón de la tarjeta "Próximo evento" del Inicio.
export function accionDelEvento(ev: { tipo: string; fecha: string }, hoy: string): AccionEvento {
  if (ev.fecha !== hoy) return null
  if (ev.tipo === 'entrenamiento') return 'asistencia'
  if (ev.tipo === 'partido') return 'partido'
  return null
}

export function minutosDeHora(hora: string | null): number | null {
  if (!hora) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hora)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

// El entrenamiento seleccionado al abrir: el pedido desde el Inicio si es de
// hoy; si no, el de hora más cercana a `ahoraMin`; sin horas, el primero.
// null = no hay entrenamiento hoy (se crea al guardar).
export function elegirEntrenamiento(
  lista: EntrenamientoHoy[],
  pedidoId: string | null | undefined,
  ahoraMin: number,
): string | null {
  if (lista.length === 0) return null
  if (pedidoId && lista.some(e => e.id === pedidoId)) return pedidoId
  let mejor: { id: string; distancia: number } | null = null
  for (const e of lista) {
    const min = minutosDeHora(e.hora)
    if (min === null) continue
    const distancia = Math.abs(min - ahoraMin)
    if (!mejor || distancia < mejor.distancia) mejor = { id: e.id, distancia }
  }
  return mejor?.id ?? lista[0].id
}

export function etiquetaEntrenamiento(e: EntrenamientoHoy, indice: number): string {
  return e.hora ? e.hora.slice(0, 5) : `Turno ${indice + 1}`
}
