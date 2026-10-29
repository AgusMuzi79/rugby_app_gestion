// Tomar asistencia en pocos toques (auditoría entrenador T5).
//
// Antes eran 30 toques + GUARDAR arriba a la derecha para 30 jugadores. Ahora:
// TODOS PRESENTES, marcar los pocos ausentes y GUARDAR abajo con marcados/total;
// si queda alguien sin marcar, se avisa quiénes antes de guardar.
// Lógica pura (marcadoAsistencia.check.ts).

interface ConEstado {
  nombre_completo: string
  estado: string | null
}

// Sólo completa a los que no tienen marca: no pisa ausentes ni justificados.
export function marcarTodosPresentes<T extends ConEstado>(jugadores: T[]): T[] {
  return jugadores.map(j => (j.estado === null ? { ...j, estado: 'presente' } : j))
}

export function conteoMarcados(jugadores: ConEstado[]): { marcados: number; total: number } {
  return { marcados: jugadores.filter(j => j.estado !== null).length, total: jugadores.length }
}

export function nombresSinMarcar(jugadores: ConEstado[]): string[] {
  return jugadores.filter(j => j.estado === null).map(j => j.nombre_completo)
}

const MAX_NOMBRES = 5

export function textoSinMarcar(nombres: string[]): string {
  const n = nombres.length
  const visibles = nombres.slice(0, MAX_NOMBRES)
  const resto = n - visibles.length
  const lista = resto > 0
    ? `${visibles.join(', ')} y ${resto} más`
    : visibles.length > 1
      ? `${visibles.slice(0, -1).join(', ')} y ${visibles[visibles.length - 1]}`
      : visibles[0] ?? ''
  const falta = n === 1 ? 'Falta 1 sin marcar' : `Faltan ${n} sin marcar`
  const quienes = n === 1 ? 'ese jugador' : 'esos jugadores'
  return `${falta}: ${lista}. No se guarda nada para ${quienes}.`
}
