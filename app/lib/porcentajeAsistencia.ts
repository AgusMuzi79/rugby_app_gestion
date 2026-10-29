// % de asistencia del coordinador (auditoría coordinador T9).
//
// Antes se dividía por todos los eventos de los últimos 30 días, se hubiera
// tomado lista o no, incluido el de hoy: si el entrenador no tomaba lista en
// la mitad, todo el plantel quedaba en rojo. Ahora, por jugador:
//   - cuentan los eventos ya pasados (no hoy) que no son actividades;
//   - denominador = eventos donde ese jugador tiene fila;
//   - `justificado` no suma ni resta (decisión 2026-10-26: fuera del
//     numerador y del denominador);
//   - numerador = filas `presente`.
// Lógica pura (porcentajeAsistencia.check.ts).

export interface EventoParaPorcentaje {
  id:    string
  fecha: string // YYYY-MM-DD
  tipo:  string
}

export interface FilaParaPorcentaje {
  jugador_id: string
  evento_id:  string
  estado:     string
}

export interface EstadisticaAsistencia {
  presentes:  number
  total:      number
  porcentaje: number | null // null = no hay nada que contar
}

export function eventosQueCuentan(eventos: EventoParaPorcentaje[], hoy: string): Set<string> {
  return new Set(eventos.filter(e => e.fecha < hoy && e.tipo !== 'actividad').map(e => e.id))
}

function contar(filas: FilaParaPorcentaje[]): EstadisticaAsistencia {
  const validas = filas.filter(f => f.estado !== 'justificado')
  const presentes = validas.filter(f => f.estado === 'presente').length
  const total = validas.length
  return { presentes, total, porcentaje: total > 0 ? Math.round((presentes / total) * 100) : null }
}

export function estadisticaJugador(
  jugadorId: string,
  filas: FilaParaPorcentaje[],
  cuentan: Set<string>,
): EstadisticaAsistencia {
  return contar(filas.filter(f => f.jugador_id === jugadorId && cuentan.has(f.evento_id)))
}

// Barra por división del Inicio del coordinador: mismo criterio, todas las filas.
export function porcentajeDivision(filas: FilaParaPorcentaje[], cuentan: Set<string>): number | null {
  return contar(filas.filter(f => cuentan.has(f.evento_id))).porcentaje
}
